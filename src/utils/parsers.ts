import type { Host, Hostname, Port } from 'polykey/dist/network/types';
import type { SeedNodes } from 'polykey/dist/nodes/types';
import commander from 'commander';
import * as validationUtils from 'polykey/dist/validation/utils';
import * as validationErrors from 'polykey/dist/validation/errors';
import * as ids from 'polykey/dist/ids';
import * as gestaltsUtils from 'polykey/dist/gestalts/utils';
import * as networkUtils from 'polykey/dist/network/utils';
import * as nodesUtils from 'polykey/dist/nodes/utils';

const secretPathRegex = /^([\w-]+)(?::)([^\0\\=]+)(?:=)?([a-zA-Z_][\w]+)?$/;
const secretPathEnvRegex =
  /^([\w-]+)(?::)([^\0\\=]+)(?:=)?([a-zA-Z_]+[a-zA-Z0-9_]*)?$/;

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
        throw new commander.InvalidArgumentError(e.message);
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
        throw new commander.InvalidArgumentError(e.message);
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
    case 'none':
    case 'no':
    case 'false':
    case 'null':
      return undefined;
    default:
      return parseInt(v);
  }
}

function parseSecretPath(secretPath: string): [string, string, string?] {
  // E.g. If 'vault1:a/b/c', ['vault1', 'a/b/c'] is returned
  //      If 'vault1:a/b/c=VARIABLE', ['vault1, 'a/b/c', 'VARIABLE'] is returned
  if (!secretPathRegex.test(secretPath)) {
    throw new commander.InvalidArgumentError(
      `${secretPath} is not of the format <vaultName>:<directoryPath>`,
    );
  }
  const [, vaultName, directoryPath, value] =
    secretPath.match(secretPathRegex)!;
  return [vaultName, directoryPath, value];
}

function parseEnvPath(secretPath: string): [string, string, string?] {
  // E.g. If 'vault1:a/b/c', ['vault1', 'a/b/c'] is returned
  //      If 'vault1:a/b/c=VARIABLE', ['vault1, 'a/b/c', 'VARIABLE'] is returned
  // VARIABLE must be a valid ENV variable name
  if (!secretPathEnvRegex.test(secretPath)) {
    throw new commander.InvalidArgumentError(
      `${secretPath} is not of the format <vaultName>:<directoryPath>`,
    );
  }
  const [, vaultName, directoryPath, value] =
    secretPath.match(secretPathEnvRegex)!;
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

const parsePort: (data: string) => Port = validateParserToArgParser(
  networkUtils.parsePort,
);

const parseSeedNodes: (data: string) => [SeedNodes, boolean] =
  validateParserToArgParser(nodesUtils.parseSeedNodes);

/**
 * This parses the arguments used for the env command. It should be formatted as
 * <secretPath...> [--] [cmd] [cmdArgs...]
 * The cmd part of the list is separated in two ways, either the user explicitly uses `--` or the first non-secret path separates it.
 */
function parseEnvArgs(
  args: Array<string>,
): [Array<[string, string, string?]>, Array<string>] {
  let isEnvStage = true;
  const envPaths: Array<[string, string, string?]> = [];
  const cmdArgs: Array<string> = [];
  for (const arg of args) {
    if (isEnvStage) {
      // Parse a secret path
      try {
        envPaths.push(parseEnvPath(arg));
      } catch (e) {
        if (!(e instanceof commander.InvalidArgumentError)) throw e;
        // If we get an invalid argument error then we switch over to parsing args verbatim
        cmdArgs.push(arg);
        isEnvStage = false;
      }
    } else {
      // Otherwise we just have the cmd args
      cmdArgs.push(arg);
    }
  }
  if (envPaths.length === 0) {
    throw new commander.InvalidArgumentError(
      'You must provide at least 1 secret path',
    );
  }
  return [envPaths, cmdArgs];
}

function testParse(
  value: string,
  prev: [Array<[string, string, string?]>, Array<string>],
): [Array<[string, string, string?]>, Array<string>] {
  const current: [Array<[string, string, string?]>, Array<string>] = prev ?? [
    [],
    [],
  ];
  if (current[1].length === 0) {
    // Parse a secret path
    try {
      current[0].push(parseEnvPath(value));
    } catch (e) {
      if (!(e instanceof commander.InvalidArgumentError)) throw e;
      // If we get an invalid argument error then we switch over to parsing args verbatim
      current[1].push(value);
    }
  } else {
    // Otherwise we just have the cmd args
    current[1].push(value);
  }
  if (current[0].length === 0 && current[1].length > 0) {
    throw new commander.InvalidArgumentError(
      'You must provide at least 1 secret path',
    );
  }
  return current;
}

export {
  secretPathRegex,
  secretPathEnvRegex,
  validateParserToArgParser,
  validateParserToArgListParser,
  parseCoreCount,
  parseSecretPath,
  parseEnvPath,
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
  parsePort,
  parseSeedNodes,
  parseProviderId,
  parseIdentityId,
  parseProviderIdList,
  parseEnvArgs,
  testParse,
};
