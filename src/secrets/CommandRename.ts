import type PolykeyClient from 'polykey/PolykeyClient.js';
import CommandPolykey from '../CommandPolykey.js';
import * as binUtils from '../utils/index.js';
import * as binOptions from '../utils/options.js';
import * as binParsers from '../utils/parsers.js';
import * as binProcessors from '../utils/processors.js';
import * as errors from '../errors.js';

class CommandRename extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('rename');
    this.description('Rename a Secret');
    this.argument(
      '<secretPath>',
      'Path to where the secret to be renamed, specified as <vaultName>:<directoryPath>',
      binParsers.parseSecretPath,
    );
    this.argument(
      '<newSecretName>',
      'Fully-qualified new name for the secret, specified as <vaultName>:<secretPath>',
      binParsers.parseSecretPath,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (secretPath, newSecretPath, options) => {
      // Rename operation cannot work across vaults, only within a vault
      if (secretPath[0] !== newSecretPath[0]) {
        throw new errors.ErrorPolykeyCLIRenameSecret(
          'Cannot rename file into another vault',
        );
      }
      // Ensure that a valid secret path is provided
      if (secretPath[1] == null) {
        throw new errors.ErrorPolykeyCLIRenameSecret(
          'Cannot rename vault root',
        );
      }
      if (newSecretPath[1] == null) {
        throw new errors.ErrorPolykeyCLIRenameSecret(
          'Cannot rename to vault root',
        );
      }
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
        await binUtils.retryAuthentication(
          (auth) =>
            pkClient.rpcClient.methods.vaultsSecretsRename({
              metadata: auth,
              nameOrId: secretPath[0],
              secretName: secretPath[1],
              newSecretName: newSecretPath[1],
            }),
          meta,
        );
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandRename;
