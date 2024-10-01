import type PolykeyClient from 'polykey/dist/PolykeyClient';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binParsers from '../utils/parsers';
import * as binProcessors from '../utils/processors';

class CommandRemove extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('rm');
    this.alias('remove');
    this.description('Delete a Secret from a specified Vault');
    this.argument(
      '<secretPaths...>',
      'Path to one or more secret to be deleted, each specified as <vaultName>:<directoryPath>',
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.addOption(binOptions.recursive);
    this.action(async (secretPaths, options) => {
      secretPaths = secretPaths.map((path: string) =>
        binParsers.parseSecretPathValue(path),
      );
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
          options: { nodePath: options.nodePath },
          logger: this.logger.getChild(PolykeyClient.name),
        });
        const response = await binUtils.retryAuthentication(async (auth) => {
          const response =
            await pkClient.rpcClient.methods.vaultsSecretsRemove();
          await (async () => {
            const writer = response.writable.getWriter();
            let first = true;
            for (const [vault, path] of secretPaths) {
              await writer.write({
                nameOrId: vault,
                secretName: path,
                metadata: first
                  ? { ...auth, options: { recursive: options.recursive } }
                  : undefined,
              });
              first = false;
            }
            await writer.close();
          })();
          return response;
        }, meta);
        // Wait for the program to generate a response (complete processing).
        await response.output;
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandRemove;
