import type PolykeyClient from 'polykey/dist/PolykeyClient';
import * as errors from '../errors';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binParsers from '../utils/parsers';
import * as binProcessors from '../utils/processors';

class CommandCreate extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('create');
    this.description('Create a Secret within a given Vault');
    this.argument(
      '<directoryPath>',
      'On disk path to the secret file with the contents of the new secret',
    );
    this.argument(
      '<secretPath>',
      'Path to the secret to be created, specified as <vaultName>:<directoryPath>',
      binParsers.parseSecretPathValue,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (directoryPath, secretPath, options) => {
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
        let content: Buffer;
        try {
          content = await this.fs.promises.readFile(directoryPath);
        } catch (e) {
          throw new errors.ErrorPolykeyCLIFileRead(e.message, {
            data: {
              errno: e.errno,
              syscall: e.syscall,
              code: e.code,
              path: e.path,
            },
            cause: e,
          });
        }
        await binUtils.retryAuthentication(
          (auth) =>
            pkClient.rpcClient.methods.vaultsSecretsNew({
              metadata: auth,
              nameOrId: secretPath[0],
              secretName: secretPath[1],
              secretContent: content.toString('binary'),
            }),
          meta,
        );
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandCreate;
