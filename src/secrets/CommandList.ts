import type PolykeyClient from 'polykey/dist/PolykeyClient';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';
import * as binParsers from '../utils/parsers';

class CommandList extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('ls');
    this.aliases(['list']);
    this.description('List all secrets for a vault within a directory');
    this.argument(
      '<directoryPath>',
      'Directory to list files from, specified as <vaultName>[:<path>]',
      binParsers.parseSecretPathOptional,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (vaultPattern, options) => {
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
      const auth = await binProcessors.processAuthentication(
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
        const secretPaths = await binUtils.retryAuthentication(async (auth) => {
          const secretPaths: Array<string> = [];
          const stream = await pkClient.rpcClient.methods.vaultsSecretsList({
            metadata: auth,
            nameOrId: vaultPattern[0],
            secretName: vaultPattern[1] ?? '/',
          });
          for await (const secret of stream) {
            // Remove leading slashes
            if (secret.path.startsWith('/')) {
              secret.path = secret.path.substring(1);
            }
            secretPaths.push(secret.path);
          }
          return secretPaths;
        }, auth);

        if (options.format === 'json') {
          process.stdout.write(
            binUtils.outputFormatter({
              type: 'json',
              data: secretPaths,
            }),
          );
        } else {
          process.stdout.write(
            binUtils.outputFormatter({
              type: 'list',
              data: secretPaths,
            }),
          );
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandList;
