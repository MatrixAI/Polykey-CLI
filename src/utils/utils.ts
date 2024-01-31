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

function standardErrorReplacer(_key: string, value: any) {
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

function encodeEscapedReplacer(_key: string, value: any) {
  if (typeof value === 'string') {
    return encodeEscaped(value);
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    for (const valueKey of Object.keys(value)) {
      if (typeof valueKey === 'string') {
        const newValueKey = encodeEscaped(valueKey);
        const valueKeyValue = value[valueKey];
        delete value[valueKey];
        // This is done in case it is defined as `__proto__`
        Object.defineProperty(value, newValueKey, {
          value: valueKeyValue,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }
  }
  return value;
}

/**
 * This function:
 *
 * 1. Keeps regular spaces, only ' ', as they are.
 * 2. Converts \\n \\r \\t to escaped versions, \\\\n \\\\r and \\\\t.
 * 3. Converts other control characters to their Unicode escape sequences.
 * 4. Converts ' \` " to escaped versions, \\\\' \\\\\` and \\\\"
 * 5. Wraps the whole thing in `""` if any characters have been encoded.
 */
function encodeEscapedWrapped(str: string): string {
  if (!encodeEscapedRegex.test(str)) {
    return str;
  }
  return `"${encodeEscaped(str)}"`;
}

/**
 * This function:
 *
 * 1. Keeps regular spaces, only ' ', as they are.
 * 2. Converts \\\\n \\\\r and \\\\t to unescaped versions, \\n \\r \\t.
 * 3. Converts Unicode escape sequences to their control characters.
 * 4. Converts \\\\' \\\\\` and \\\\"  to their unescaped versions, ' \` ".
 * 5. If it is wrapped in "" double quotes, the double quotes will be trimmed.
 */
function decodeEscapedWrapped(str: string): string {
  if (!decodeEscapedRegex.test(str)) {
    return str;
  }
  return decodeEscaped(str.substring(1, str.length - 1));
}

// We want to actually match control codes here!
// eslint-disable-next-line no-control-regex
const encodeEscapedRegex = /[\x00-\x1F\x7F-\x9F"'`]/g;

/**
 * This function:
 *
 * 1. Keeps regular spaces, only ' ', as they are.
 * 2. Converts \\n \\r \\t to escaped versions, \\\\n \\\\r and \\\\t.
 * 3. Converts other control characters to their Unicode escape sequences.\
 * 4. Converts ' \` " to escaped versions, \\\\' \\\\\` and \\\\"
 *
 * Unless you're using this in a `JSON.stringify` replacer, you probably want to use {@link encodeEscapedWrapped} instead.
 */
function encodeEscaped(str: string): string {
  return str.replace(encodeEscapedRegex, (char) => {
    switch (char) {
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
      case '"':
      case "'":
      case '`':
        return '\\' + char;
      // Add cases for other whitespace characters if needed
      default:
        // Return the Unicode escape sequence for control characters
        return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
    }
  });
}

const decodeEscapedRegex = /\\([nrtvf"'`]|u[0-9a-fA-F]{4})/g;

/**
 * This function:
 *
 * 1. Keeps regular spaces, only ' ', as they are.
 * 2. Converts \\\\n \\\\r and \\\\t to unescaped versions, \\n \\r \\t.
 * 3. Converts Unicode escape sequences to their control characters.
 * 4. Converts \\\\' \\\\\` and \\\\"  to their unescaped versions, ' \` ".
 *
 * Unless you're using this in a `JSON.parse` reviver, you probably want to use {@link decodeEscapedWrapped} instead.
 */
function decodeEscaped(str: string): string {
  return str.replace(decodeEscapedRegex, (substr) => {
    // Unicode escape sequence must be characters (e.g. `\u0000`)
    if (substr.length === 6 && substr.at(1) === 'u') {
      return String.fromCharCode(parseInt(substr.substring(2), 16));
    }
    // Length of substr will always be at least 1
    const lastChar = substr.at(-1);
    if (lastChar == null) {
      utils.never();
    }
    switch (lastChar) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'v':
        return '\v';
      case 'f':
        return '\f';
      case '"':
      case "'":
      case '`':
        return lastChar;
    }
    utils.never();
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
    output += `${elem ?? ''}\n`;
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
 * The object is also mutated if any cells exceed the initial padding lengths.
 * This parameter can also be supplied to filter the columns that will be displayed.
 * @param options.includeHeaders - Defaults to `True`
 * @param options.includeRowCount - Defaults to `False`.
 * @returns
 */
function outputFormatterTable(
  rows: Array<TableRow>,
  {
    includeHeaders = true,
    includeRowCount = false,
    columns,
  }: TableOptions = {},
): string {
  let output = '';
  let rowCount = 0;
  // Default includeHeaders to true
  const maxColumnLengths: Record<string, number> = {};

  const optionColumns =
    columns != null
      ? Array.isArray(columns)
        ? columns
        : Object.keys(columns)
      : undefined;

  // Initialize maxColumnLengths with header lengths if headers with lengths are provided
  if (optionColumns != null) {
    for (const column of optionColumns) {
      maxColumnLengths[column] = columns?.[column];
    }
  }

  // Map<originalColumn, encodedColumn>
  const encodedColumns: Map<string, string> = new Map();

  // Precompute max column lengths by iterating over the rows first
  for (const row of rows) {
    for (const column of optionColumns ?? Object.keys(row)) {
      if (row[column] != null) {
        if (typeof row[column] === 'string') {
          row[column] = encodeEscapedWrapped(row[column]);
        } else {
          row[column] = JSON.stringify(row[column], encodeEscapedReplacer);
        }
      }
      // Null or '' will both cause cellLength to be 3
      const cellLength =
        row[column] == null || row[column] === '""' ? 3 : row[column].length; // 3 is length of 'N/A'
      maxColumnLengths[column] = Math.max(
        maxColumnLengths[column] || 0,
        cellLength, // Use the length of the encoded value
      );
      // If headers are included, we need to check if the column header length is bigger
      if (includeHeaders && !encodedColumns.has(column)) {
        // This only has to be done once, so if the column already exists in the map, don't bother
        const encodedColumn = encodeEscapedWrapped(column);
        encodedColumns.set(column, encodedColumn);
        maxColumnLengths[column] = Math.max(
          maxColumnLengths[column] || 0,
          encodedColumn.length,
        );
      }
    }
  }

  // After this point, maxColumnLengths will have been filled with all the necessary keys.
  // Thus, the column keys can be derived from it.
  const finalColumns = Object.keys(maxColumnLengths);
  // If headers are provided, add them to your output first
  if (optionColumns != null) {
    for (let i = 0; i < optionColumns.length; i++) {
      const column = optionColumns[i];
      const maxColumnLength = maxColumnLengths[column];
      // Options.headers is definitely defined as optionHeaders != null
      if (!Array.isArray(columns)) {
        columns![column] = maxColumnLength;
      }
      if (includeHeaders) {
        output += (encodedColumns.get(column) ?? column).padEnd(
          maxColumnLength,
        );
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
    if (includeRowCount) {
      formattedRow += `${++rowCount}\t`;
    }
    for (const column of finalColumns) {
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
  // Array<[originalKey, encodedKey]>
  const keypairs: Array<[string, string]> = [];
  for (const key in data) {
    const encodedKey = encodeEscapedWrapped(key);
    keypairs.push([key, encodedKey]);
    if (encodedKey.length > maxKeyLength) {
      maxKeyLength = encodedKey.length;
    }
  }
  for (const [originalKey, encodedKey] of keypairs) {
    let value = data[originalKey];
    if (value == null) {
      value = '';
    }

    if (typeof value === 'string') {
      value = encodeEscapedWrapped(value);
    } else {
      value = JSON.stringify(value, encodeEscapedReplacer);
    }

    value = value.replace(/(?:\r\n|\n)$/, '');
    value = value.replace(/(\r\n|\n)/g, '$1\t');

    const padding = ' '.repeat(maxKeyLength - encodedKey.length);
    output += `${encodedKey}${padding}\t${value}\n`;
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
  encodeEscapedReplacer,
  outputFormatter,
  outputFormatterList,
  outputFormatterTable,
  outputFormatterDict,
  outputFormatterJson,
  outputFormatterError,
  retryAuthentication,
  remoteErrorCause,
  encodeEscapedWrapped,
  encodeEscaped,
  encodeEscapedRegex,
  decodeEscapedWrapped,
  decodeEscaped,
  decodeEscapedRegex,
};

export type { OutputObject };
