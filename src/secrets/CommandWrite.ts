import type PolykeyClient from 'polykey/dist/PolykeyClient';
import CommandPolykey from '../CommandPolykey';
import * as binProcessors from '../utils/processors';
import * as binParsers from '../utils/parsers';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';

class CommandWrite extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('write');
    this.description('Write data into a secret from standard in');
    this.argument(
      '<secretPath>',
      'Path to the secret, specified as <vaultName>:<directoryPath>',
      binParsers.parseSecretPath,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (secretPath, options) => {
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

        let stdin: string = '';
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            process.stdin.removeListener('data', dataHandler);
            process.stdin.removeListener('error', errorHandler);
            process.stdin.removeListener('end', endHandler);
          };
          const dataHandler = (data: Buffer) => {
            stdin += data.toString();
          };
          const errorHandler = (err: Error) => {
            cleanup();
            reject(err);
          };
          const endHandler = () => {
            cleanup();
            resolve();
          };
          process.stdin.on('data', dataHandler);
          process.stdin.once('error', errorHandler);
          process.stdin.once('end', endHandler);
        });
        await binUtils.retryAuthentication(
          async (auth) =>
            await pkClient.rpcClient.methods.vaultsSecretsWriteFile({
              metadata: auth,
              nameOrId: secretPath[0],
              secretName: secretPath[1] ?? '/',
              secretContent: stdin,
            }),
          meta,
        );
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandWrite;
