import type PolykeyClient from 'polykey/dist/PolykeyClient';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';
import * as binParsers from '../utils/parsers';

class CommandVersion extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('version');
    this.description('Set a Vault to a Particular Version in its History');
    this.argument(
      '<vaultName>',
      'Name of the vault to change the version of',
      binParsers.parseVaultName,
    );
    this.argument('<versionId>', 'Id of the commit that will be changed to');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (vault, versionId, options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
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
            pkClient.rpcClient.methods.vaultsVersion({
              metadata: auth,
              nameOrId: vault,
              versionId: versionId,
            }),
          meta,
        );
        /**
         * Previous status message:
         * ---
         * Note: any changes made to the contents of the vault while at this version
         * will discard all changes applied to the vault in later versions. You will
         * not be able to return to these later versions if changes are made.
         */
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandVersion;
