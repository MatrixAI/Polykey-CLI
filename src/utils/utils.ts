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

// Function to handle 'table' type output
function outputTableFormatter(
  rowStream: Array<TableRow>,
  options?: TableOptions,
): string {
  let output = '';
  let rowCount = 0;
  const maxColumnLengths: Record<string, number> = {};

  // Initialize maxColumnLengths with header lengths if headers are provided
  if (options?.headers) {
    for (const header of options.headers) {
      maxColumnLengths[header] = header.length;
    }
  }

  // Precompute max column lengths by iterating over the rows first
  for (const row of rowStream) {
    for (const key in options?.headers ?? row) {
      if (row[key] != null) {
        row[key] = encodeNonPrintable(row[key].toString());
      }
      // Row[key] is definitely a string or null after this point due to encodeNonPrintable
      const cellValue: string | null = row[key];
      // Null or '' will both cause cellLength to be 3
      const cellLength =
        cellValue == null || cellValue.length === 0 ? 3 : cellValue.length; // 3 is length of 'N/A'
      maxColumnLengths[key] = Math.max(
        maxColumnLengths[key] || 0,
        cellLength, // Use the length of the encoded value
      );
    }
  }

  // After this point, maxColumnLengths will have been filled with all the necessary keys.
  // Thus, the column keys can be derived from it.
  const columnKeys = Object.keys(maxColumnLengths);
  // If headers are provided, add them to your output first
  if (options?.headers) {
    const headerRow = options.headers
      .map((header) => header.padEnd(maxColumnLengths[header]))
      .join('\t');
    output += headerRow + '\n';
  }

  for (const row of rowStream) {
    let formattedRow = '';
    if (options?.includeRowCount) {
      formattedRow += `${++rowCount}\t`;
    }
    for (const key of columnKeys) {
      // Assume row[key] has been already encoded as a string or null
      const cellValue =
        row[key] == null || row[key].length === 0 ? 'N/A' : row[key];
      formattedRow += `${cellValue.padEnd(maxColumnLengths[key] || 0)}\t`;
    }
    output += formattedRow.trimEnd() + '\n';
  }

  return output;
}

function outputFormatter(msg: OutputObject): string | Uint8Array {
  let output = '';
  if (msg.type === 'raw') {
    return msg.data;
  } else if (msg.type === 'list') {
    for (const elem of msg.data) {
      // Convert null or undefined to empty string
      output += `${elem != null ? encodeNonPrintable(elem) : ''}\n`;
    }
  } else if (msg.type === 'table') {
    return outputTableFormatter(msg.data, msg.options);
  } else if (msg.type === 'dict') {
    let maxKeyLength = 0;
    for (const key in msg.data) {
      if (key.length > maxKeyLength) {
        maxKeyLength = key.length;
      }
    }

    for (const key in msg.data) {
      let value = msg.data[key];
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
  } else if (msg.type === 'json') {
    output = JSON.stringify(msg.data, standardErrorReplacer);
    output += '\n';
  } else if (msg.type === 'error') {
    let currError = msg.data;
    let indent = '  ';
    while (currError != null) {
      if (currError instanceof networkErrors.ErrorPolykeyRemote) {
        output += `${currError.name}: ${currError.description}`;
        if (currError.message && currError.message !== '') {
          output += ` - ${currError.message}`;
        }
        if (currError.metadata != null) {
          output += '\n';
          for (const [key, value] of Object.entries(currError.metadata)) {
            output += `${indent}${key}\t${value}\n`;
          }
        }
        output += `${indent}timestamp\t${currError.timestamp}\n`;
        output += `${indent}cause: `;
        currError = currError.cause;
      } else if (currError instanceof ErrorPolykey) {
        output += `${currError.name}: ${currError.description}`;
        if (currError.message && currError.message !== '') {
          output += ` - ${currError.message}`;
        }
        output += '\n';
        // Disabled to streamline output
        // output += `${indent}exitCode\t${currError.exitCode}\n`;
        // output += `${indent}timestamp\t${currError.timestamp}\n`;
        if (currError.data && !utils.isEmptyObject(currError.data)) {
          output += `${indent}data\t${JSON.stringify(currError.data)}\n`;
        }
        if (currError.cause) {
          output += `${indent}cause: `;
          if (currError.cause instanceof ErrorPolykey) {
            currError = currError.cause;
          } else if (currError.cause instanceof Error) {
            output += `${currError.cause.name}`;
            if (currError.cause.message && currError.cause.message !== '') {
              output += `: ${currError.cause.message}`;
            }
            output += '\n';
            break;
          } else {
            output += `${JSON.stringify(currError.cause)}\n`;
            break;
          }
        } else {
          break;
        }
      } else {
        output += `${currError.name}`;
        if (currError.message && currError.message !== '') {
          output += `: ${currError.message}`;
        }
        output += '\n';
        break;
      }
      indent = indent + '  ';
    }
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
  retryAuthentication,
  remoteErrorCause,
  encodeNonPrintable,
};

export type { OutputObject };
