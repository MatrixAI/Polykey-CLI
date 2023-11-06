import type { Host, Hostname, Port } from 'polykey/dist/network/types';
import type { SeedNodes } from 'polykey/dist/nodes/types';
import commander from 'commander';
import * as validationUtils from 'polykey/dist/validation/utils';
import * as validationErrors from 'polykey/dist/validation/errors';
import * as ids from 'polykey/dist/ids';
import * as gestaltsUtils from 'polykey/dist/gestalts/utils';
import * as networkUtils from 'polykey/dist/network/utils';
import * as nodesUtils from 'polykey/dist/nodes/utils';

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
  const secretPathRegex =
    /^([\w-]+)(?::)([\w\-\\\/\.\$]+)(?:=)?([a-zA-Z_][\w]+)?$/;
  if (!secretPathRegex.test(secretPath)) {
    throw new commander.InvalidArgumentError(
      `${secretPath} is not of the format <vaultName>:<directoryPath>`,
    );
  }
  const [, vaultName, directoryPath] = secretPath.match(secretPathRegex)!;
  return [vaultName, directoryPath, undefined];
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

const parseNetwork: (data: string) => SeedNodes = validateParserToArgParser(
  nodesUtils.parseNetwork,
);

const parseSeedNodes: (data: string) => [SeedNodes, boolean] =
  validateParserToArgParser(nodesUtils.parseSeedNodes);

export {
  validateParserToArgParser,
  validateParserToArgListParser,
  parseCoreCount,
  parseSecretPath,
  parseInteger,
  parseNumber,
  parseNodeId,
  parseGestaltId,
  parseGestaltIdentityId,
  parseGestaltAction,
  parseHost,
  parseHostname,
  parseHostOrHostname,
  parsePort,
  parseNetwork,
  parseSeedNodes,
  parseProviderId,
  parseIdentityId,
  parseProviderIdList,
};
