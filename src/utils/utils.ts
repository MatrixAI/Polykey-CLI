import type { POJO } from 'polykey/dist/types';
import type { TableRow, TableOptions } from '../types';
import process from 'process';
import { LogLevel } from '@matrixai/logger';
import ErrorPolykey from 'polykey/dist/ErrorPolykey';
import * as clientUtils from 'polykey/dist/client/utils';
import * as clientErrors from 'polykey/dist/client/errors';
import * as networkErrors from 'polykey/dist/network/errors';
import * as utils from 'polykey/dist/utils';
import * as binProcessors from './processors';
import * as errors from '../errors';

/**
 * Convert verbosity to LogLevel
 */
function verboseToLogLevel(c: number = 0): LogLevel {
  let logLevel = LogLevel.WARN;
  if (c === 1) {
    logLevel = LogLevel.INFO;
  } else if (c >= 2) {
    logLevel = LogLevel.DEBUG;
  }
  return logLevel;
}

type OutputObject =
  | {
      type: 'raw';
      data: string | Uint8Array;
    }
  | {
      type: 'list';
      data: Array<string>;
    }
  | {
      type: 'table';
      data: Array<POJO>;
      options?: TableOptions;
    }
  | {
      type: 'dict';
      data: POJO;
    }
  | {
      type: 'json';
      data: any;
    }
  | {
      type: 'error';
      data: Error;
    };

function standardErrorReplacer(key: string, value: any) {
  if (value instanceof Error && !(value instanceof ErrorPolykey)) {
    return {
      type: value.name,
      data: {
        message: value.message,
        stack: value.stack,
        cause: value.cause,
      },
    };
  }
  return value;
}

/**
 * This function:
 * 1. Keeps regular spaces, only ' ', as they are.
 * 2. Converts \n \r \t to escaped versions, \\n \\r and \\t.
 * 3. Converts other control characters to their Unicode escape sequences.
 */
function encodeNonPrintable(str: string) {
  // We want to actually match control codes here!
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x1F\x7F-\x9F]/g, (char) => {
    switch (char) {
      case ' ':
        return char; // Preserve regular space
      case '\n':
        return '\\n'; // Encode newline
      case '\r':
        return '\\r'; // Encode carriage return
      case '\t':
        return '\\t'; // Encode tab
      case '\v':
        return '\\v'; // Encode tab
      case '\f':
        return '\\f'; // Encode tab
      // Add cases for other whitespace characters if needed
      default:
        // Return the Unicode escape sequence for control characters
        return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
    }
  });
}

/**
 * Formats a message suitable for output.
 *
 * @param msg - The msg that needs to be formatted.
 * @see {@link outputFormatterTable} for information regarding usage where `msg.type === 'table'`.
 * @returns
 */
function outputFormatter(msg: OutputObject): string | Uint8Array {
  switch (msg.type) {
    case 'raw':
      return msg.data;
    case 'list':
      return outputFormatterList(msg.data);
    case 'table':
      return outputFormatterTable(msg.data, msg.options);
    case 'dict':
      return outputFormatterDict(msg.data);
    case 'json':
      return outputFormatterJson(msg.data);
    case 'error':
      return outputFormatterError(msg.data);
  }
}

function outputFormatterList(items: Array<string>): string {
  let output = '';
  for (const elem of items) {
    // Convert null or undefined to empty string
    output += `${elem != null ? encodeNonPrintable(elem) : ''}\n`;
  }
  return output;
}

/**
 * Function to handle the `table` output format.
 *
 * @param rows
 * @param options
 * @param options.columns - Can either be an `Array<string>` or `Record<string, number>`.
 * If it is `Record<string, number>`, the `number` values will be used as the initial padding lengths.
 * The object is also mutated if any cells exceed the inital padding lengths.
 * This parameter can also be supplied to filter the columns that will be displayed.
 * @param options.includeHeaders - Defaults to `True`
 * @param options.includeRowCount - Defaults to `False`.
 * @returns
 */
function outputFormatterTable(
  rows: Array<TableRow>,
  options: TableOptions = {
    includeHeaders: true,
    includeRowCount: false,
  },
): string {
  let output = '';
  let rowCount = 0;
  // Default includeHeaders to true
  const includeHeaders = options.includeHeaders ?? true;
  const maxColumnLengths: Record<string, number> = {};

  const optionColumns =
    options?.columns != null
      ? Array.isArray(options.columns)
        ? options.columns
        : Object.keys(options.columns)
      : undefined;

  // Initialize maxColumnLengths with header lengths if headers are provided
  if (optionColumns != null) {
    for (const column of optionColumns) {
      maxColumnLengths[column] = Math.max(
        options?.columns?.[column] ?? 0,
        column.length,
      );
    }
  }

  // Precompute max column lengths by iterating over the rows first
  for (const row of rows) {
    for (const column in options?.columns ?? row) {
      if (row[column] != null) {
        row[column] = encodeNonPrintable(row[column].toString());
      }
      // Row[key] is definitely a string or null after this point due to encodeNonPrintable
      const cellValue: string | null = row[column];
      // Null or '' will both cause cellLength to be 3
      const cellLength =
        cellValue == null || cellValue.length === 0 ? 3 : cellValue.length; // 3 is length of 'N/A'
      maxColumnLengths[column] = Math.max(
        maxColumnLengths[column] || 0,
        cellLength, // Use the length of the encoded value
      );
    }
  }

  // After this point, maxColumnLengths will have been filled with all the necessary keys.
  // Thus, the column keys can be derived from it.
  const columns = Object.keys(maxColumnLengths);
  // If headers are provided, add them to your output first
  if (optionColumns != null) {
    for (let i = 0; i < optionColumns.length; i++) {
      const column = optionColumns[i];
      const maxColumnLength = maxColumnLengths[column];
      // Options.headers is definitely defined as optionHeaders != null
      if (!Array.isArray(options!.columns)) {
        options!.columns![column] = maxColumnLength;
      }
      if (includeHeaders) {
        output += column.padEnd(maxColumnLength);
        if (i !== optionColumns.length - 1) {
          output += '\t';
        } else {
          output += '\n';
        }
      }
    }
  }

  for (const row of rows) {
    let formattedRow = '';
    if (options.includeRowCount) {
      formattedRow += `${++rowCount}\t`;
    }
    for (const column of columns) {
      // Assume row[key] has been already encoded as a string or null
      const cellValue =
        row[column] == null || row[column].length === 0 ? 'N/A' : row[column];
      formattedRow += `${cellValue.padEnd(maxColumnLengths[column] || 0)}\t`;
    }
    output += formattedRow.trimEnd() + '\n';
  }

  return output;
}

function outputFormatterDict(data: POJO): string {
  let output = '';
  let maxKeyLength = 0;
  for (const key in data) {
    if (key.length > maxKeyLength) {
      maxKeyLength = key.length;
    }
  }
  for (const key in data) {
    let value = data[key];
    if (value == null) {
      value = '';
    }

    value = JSON.stringify(value);
    value = encodeNonPrintable(value);

    // Re-introduce value.replace logic from old code
    value = value.replace(/(?:\r\n|\n)$/, '');
    value = value.replace(/(\r\n|\n)/g, '$1\t');

    const padding = ' '.repeat(maxKeyLength - key.length);
    output += `${key}${padding}\t${value}\n`;
  }
  return output;
}

function outputFormatterJson(json: string): string {
  return `${JSON.stringify(json, standardErrorReplacer)}\n`;
}

function outputFormatterError(err: Error): string {
  let output = '';
  let indent = '  ';
  while (err != null) {
    if (err instanceof networkErrors.ErrorPolykeyRemote) {
      output += `${err.name}: ${err.description}`;
      if (err.message && err.message !== '') {
        output += ` - ${err.message}`;
      }
      if (err.metadata != null) {
        output += '\n';
        for (const [key, value] of Object.entries(err.metadata)) {
          output += `${indent}${key}\t${value}\n`;
        }
      }
      output += `${indent}timestamp\t${err.timestamp}\n`;
      output += `${indent}cause: `;
      err = err.cause;
    } else if (err instanceof ErrorPolykey) {
      output += `${err.name}: ${err.description}`;
      if (err.message && err.message !== '') {
        output += ` - ${err.message}`;
      }
      output += '\n';
      // Disabled to streamline output
      // output += `${indent}exitCode\t${currError.exitCode}\n`;
      // output += `${indent}timestamp\t${currError.timestamp}\n`;
      if (err.data && !utils.isEmptyObject(err.data)) {
        output += `${indent}data\t${JSON.stringify(err.data)}\n`;
      }
      if (err.cause) {
        output += `${indent}cause: `;
        if (err.cause instanceof ErrorPolykey) {
          err = err.cause;
        } else if (err.cause instanceof Error) {
          output += `${err.cause.name}`;
          if (err.cause.message && err.cause.message !== '') {
            output += `: ${err.cause.message}`;
          }
          output += '\n';
          break;
        } else {
          output += `${JSON.stringify(err.cause)}\n`;
          break;
        }
      } else {
        break;
      }
    } else {
      output += `${err.name}`;
      if (err.message && err.message !== '') {
        output += `: ${err.message}`;
      }
      output += '\n';
      break;
    }
    indent = indent + '  ';
  }
  return output;
}

/**
 * CLI Authentication Retry Loop
 * Retries unary calls on attended authentication errors
 * Known as "privilege elevation"
 */
async function retryAuthentication<T>(
  f: (meta: { authorization?: string }) => Promise<T>,
  meta: { authorization?: string } = {},
): Promise<T> {
  try {
    return await f(meta);
  } catch (e) {
    // If it is unattended, throw the exception.
    // Don't enter into a retry loop when unattended.
    // Unattended means that either the `PK_PASSWORD` or `PK_TOKEN` was set.
    if ('PK_PASSWORD' in process.env || 'PK_TOKEN' in process.env) {
      throw e;
    }
    // If it is exception is not missing or denied, then throw the exception
    const [cause] = remoteErrorCause(e);
    if (
      !(cause instanceof clientErrors.ErrorClientAuthMissing) &&
      !(cause instanceof clientErrors.ErrorClientAuthDenied)
    ) {
      throw e;
    }
  }
  // Now enter the retry loop
  while (true) {
    // Prompt the user for password
    const password = await binProcessors.promptPassword();
    if (password == null) {
      throw new errors.ErrorPolykeyCLIPasswordMissing();
    }
    // Augment existing metadata
    const auth = {
      authorization: clientUtils.encodeAuthFromPassword(password),
    };
    try {
      return await f(auth);
    } catch (e) {
      const [cause] = remoteErrorCause(e);
      // The auth cannot be missing, so when it is denied do we retry
      if (!(cause instanceof clientErrors.ErrorClientAuthDenied)) {
        throw e;
      }
    }
  }
}

function remoteErrorCause(e: any): [any, number] {
  let errorCause = e;
  let depth = 0;
  while (errorCause instanceof networkErrors.ErrorPolykeyRemote) {
    errorCause = errorCause.cause;
    depth++;
  }
  return [errorCause, depth];
}

export {
  verboseToLogLevel,
  standardErrorReplacer,
  outputFormatter,
  outputFormatterList,
  outputFormatterTable,
  outputFormatterDict,
  outputFormatterJson,
  outputFormatterError,
  retryAuthentication,
  remoteErrorCause,
  encodeNonPrintable,
};

export type { OutputObject };
