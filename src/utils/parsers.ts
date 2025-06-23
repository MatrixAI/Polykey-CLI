import type { Host, Hostname, Port } from 'polykey/network/types.js';
import type { SeedNodes } from 'polykey/nodes/types.js';
import type { ParsedSecretPathValue } from '../types.js';
import { InvalidArgumentError } from 'commander';
import * as validationUtils from 'polykey/validation/utils.js';
import * as validationErrors from 'polykey/validation/errors.js';
import * as ids from 'polykey/ids/index.js';
import * as gestaltsUtils from 'polykey/gestalts/utils.js';
import * as networkUtils from 'polykey/network/utils.js';
import * as nodesUtils from 'polykey/nodes/utils.js';

const vaultNameRegex = /^(?!.*[:])[ -~\t\n]*$/s;
const secretPathRegex = /^(?!.*[=])[ -~\t\n]*$/s;
const secretPathValueRegex = /^([a-zA-Z_][\w]+)?$/;
const environmentVariableRegex = /^([a-zA-Z_]+[a-zA-Z0-9_]*)?$/;
const base64UrlRegex = /^[A-Za-z0-9\-_]+$/;

/**
 * Converts a validation parser to commander argument parser
 */
function validateParserToArgParser<T>(
  validate: (data: string) => T,
): (data: string) => T {
  return (data: string) => {
    try {
      return validate(data);
    } catch (e) {
      if (e instanceof validationErrors.ErrorParse) {
        throw new InvalidArgumentError(e.message);
      } else {
        throw e;
      }
    }
  };
}

/**
 * Converts a validation parser to commander variadic argument parser.
 * Variadic options/arguments are always space-separated.
 */
function validateParserToArgListParser<T>(
  validate: (data: string) => T,
): (data: string) => Array<T> {
  return (data: string) => {
    try {
      return data.split(' ').map(validate);
    } catch (e) {
      if (e instanceof validationErrors.ErrorParse) {
        throw new InvalidArgumentError(e.message);
      } else {
        throw e;
      }
    }
  };
}

function parseCoreCount(v: string): number | undefined {
  switch (v) {
    case 'all':
      return 0;
    case 'none': // Fallthrough
    case 'no': // Fallthrough
    case 'false': // Fallthrough
    case 'null':
      return undefined;
    default:
      return parseInt(v);
  }
}

function parseVaultName(vaultName: string): string {
  if (!vaultNameRegex.test(vaultName)) {
    throw new InvalidArgumentError(`${vaultName} is not a valid vault name`);
  }
  return vaultName;
}

// E.g. If 'vault1:a/b/c', ['vault1', 'a/b/c', undefined] is returned
//      If 'vault1', ['vault1', undefined, undefined] is returned
//      If 'vault1:abc=xyz', ['vault1', 'abc', 'xyz'] is returned
//      If 'vault1:', an error is thrown
//      If 'a/b/c', an error is thrown
// Splits out everything after an `=` separator
function parseSecretPath(inputPath: string): ParsedSecretPathValue {
  // The colon character `:` is prohibited in vaultName, so it's first occurence
  // means that this is the delimiter between vaultName and secretPath.
  const colonIndex = inputPath.indexOf(':');
  // If no colon exists, treat entire string as vault name
  if (colonIndex === -1) {
    return [parseVaultName(inputPath), undefined, undefined];
  }
  // Calculate vaultName and secretPath
  const vaultNamePart = inputPath.substring(0, colonIndex);
  const secretPathPart = inputPath.substring(colonIndex + 1);
  // Calculate contents after the `=` separator (value)
  const equalIndex = secretPathPart.indexOf('=');
  // If `=` isn't found, then the entire secret path section is the actual path.
  // Otherwise, split the path section by the index of `=`. First half is the
  // actual secret part, and the second half is the value.
  const secretPath =
    equalIndex === -1
      ? secretPathPart
      : secretPathPart.substring(0, equalIndex);
  const value =
    equalIndex !== -1 ? secretPathPart.substring(equalIndex + 1) : undefined;
  // If secretPath exists but it doesn't pass the regex test, then the path is
  // malformed.
  if (secretPath != null && !secretPathRegex.test(secretPath)) {
    throw new InvalidArgumentError(
      `${inputPath} is not of the format <vaultName>[:<secretPath>][=<value>]`,
    );
  }
  // We have already tested if the secretPath is valid, and we can return it
  // as-is.
  const vaultName = parseVaultName(vaultNamePart);
  return [vaultName, secretPath, value];
}

function parseSecretPathValue(secretPath: string): ParsedSecretPathValue {
  const [vaultName, directoryPath, value] = parseSecretPath(secretPath);
  if (value != null && !secretPathValueRegex.test(value)) {
    throw new InvalidArgumentError(`${value} is not a valid value name`);
  }
  return [vaultName, directoryPath, value];
}

function parseSecretPathEnv(secretPath: string): ParsedSecretPathValue {
  const [vaultName, directoryPath, value] = parseSecretPath(secretPath);
  if (value != null && !environmentVariableRegex.test(value)) {
    throw new InvalidArgumentError(
      `${value} is not a valid environment variable name`,
    );
  }
  return [vaultName, directoryPath, value];
}

const parseInteger: (data: string) => number = validateParserToArgParser(
  validationUtils.parseInteger,
);

const parseNumber: (data: string) => number = validateParserToArgParser(
  validationUtils.parseNumber,
);

const parseNodeId: (data: string) => ids.NodeId = validateParserToArgParser(
  ids.parseNodeId,
);

const parseNotificationId: (data: string) => ids.NotificationId =
  validateParserToArgParser(ids.parseNotificationId);

const parseGestaltId: (data: string) => ids.GestaltId =
  validateParserToArgParser(ids.parseGestaltId);

const parseGestaltIdentityId: (data: string) => ids.GestaltId =
  validateParserToArgParser(ids.parseGestaltIdentityId);

const parseProviderId: (data: string) => ids.ProviderId =
  validateParserToArgParser(ids.parseProviderId);

const parseIdentityId: (data: string) => ids.IdentityId =
  validateParserToArgParser(ids.parseIdentityId);
const parseProviderIdList: (data: string) => Array<ids.ProviderId> =
  validateParserToArgListParser(ids.parseProviderId);

const parseGestaltAction: (data: string) => 'notify' | 'scan' | 'claim' =
  validateParserToArgParser(gestaltsUtils.parseGestaltAction);

const parseHost: (data: string) => Host = validateParserToArgParser(
  networkUtils.parseHost,
);

const parseHostname: (data: string) => Hostname = validateParserToArgParser(
  networkUtils.parseHostname,
);

const parseHostOrHostname: (data: string) => Host | Hostname =
  validateParserToArgParser(networkUtils.parseHostOrHostname);

function parseAddresses(
  value: string,
  previous: Array<string> | undefined,
): Array<string> {
  const current = previous ?? [];
  current.push(parseHostOrHostname(value));
  return current;
}

const parsePort: (data: string) => Port = validateParserToArgParser(
  networkUtils.parsePort,
);

const parseSeedNodes: (data: string) => [SeedNodes, boolean] =
  validateParserToArgParser(nodesUtils.parseSeedNodes);

export {
  vaultNameRegex,
  secretPathRegex,
  secretPathValueRegex,
  environmentVariableRegex,
  validateParserToArgParser,
  validateParserToArgListParser,
  parseCoreCount,
  parseVaultName,
  parseSecretPath,
  parseSecretPathValue,
  parseSecretPathEnv,
  parseInteger,
  parseNumber,
  parseNodeId,
  parseNotificationId,
  parseGestaltId,
  parseGestaltIdentityId,
  parseGestaltAction,
  parseHost,
  parseHostname,
  parseHostOrHostname,
  parseAddresses,
  parsePort,
  parseSeedNodes,
  parseProviderId,
  parseIdentityId,
  parseProviderIdList,
};
