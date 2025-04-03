import type PolykeyClient from 'polykey/PolykeyClient.js';
import CommandPolykey from '../CommandPolykey.js';
import * as binProcessors from '../utils/processors.js';
import * as binParsers from '../utils/parsers.js';
import * as binUtils from '../utils/index.js';
import * as binOptions from '../utils/options.js';
import * as errors from '../errors.js';

class CommandTouch extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('touch');
    this.description('Create a secret if it does not exist');
    this.argument(
      '<secretPaths...>',
      'One or more paths, specified as <vaultName>:<secretPath>',
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (secretPaths, options) => {
      secretPaths = secretPaths.map((path: string) =>
        binParsers.parseSecretPath(path),
      );
      const { default: PolykeyClient } = await import(
        'polykey/PolykeyClient.js'
      );
      const clientOptions = await binProcessors.processClientOptions(
        options.nodePath,
        options.nodeId,
        options.clientHost,
        options.clientPort,
        this.fs,
        this.logger.getChild(binProcessors.processClientOptions.name),
      );
      const meta = await binProcessors.processAuthentication(
        options.passwordFile,
        this.fs,
      );
      let pkClient: PolykeyClient;
      this.exitHandlers.handlers.push(async () => {
        if (pkClient != null) await pkClient.stop();
      });
      try {
        pkClient = await PolykeyClient.createPolykeyClient({
          nodeId: clientOptions.nodeId,
          host: clientOptions.clientHost,
          port: clientOptions.clientPort,
          options: {
            nodePath: options.nodePath,
          },
          logger: this.logger.getChild(PolykeyClient.name),
        });
        const hasErrored = await binUtils.retryAuthentication(async (auth) => {
          const response =
            await pkClient.rpcClient.methods.vaultsSecretsTouch();
          // Extract all unique vault names
          const uniqueVaultNames = new Set<string>();
          for (const [vaultName] of secretPaths) {
            uniqueVaultNames.add(vaultName);
          }
          const writer = response.writable.getWriter();
          // Send the header message first
          await writer.write({
            type: 'VaultNamesHeaderMessage',
            vaultNames: Array.from(uniqueVaultNames),
            metadata: auth,
          });
          // Then send all the paths in subsequent messages
          for (const [vaultName, secretPath] of secretPaths) {
            await writer.write({
              type: 'SecretIdentifierMessage',
              nameOrId: vaultName,
              secretName: secretPath,
            });
          }
          await writer.close();
          // Check if any errors were raised
          let hasErrored = false;
          for await (const result of response.readable) {
            if (result.type === 'ErrorMessage') {
              hasErrored = true;
              switch (result.code) {
                case 'ENOENT':
                  // Attempt to touch a path which doesn't exist
                  process.stderr.write(
                    `touch: cannot touch '${result.reason}': No such file or directory\n`,
                  );
                  break;
                default:
                  // No other code should be thrown
                  throw result;
              }
            }
          }
          return hasErrored;
        }, meta);

        if (hasErrored) {
          throw new errors.ErrorPolykeyCLITouchSecret(
            'Failed to touch one or more secrets',
          );
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandTouch;
