import type PolykeyClient from 'polykey/dist/PolykeyClient';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binParsers from '../utils/parsers';
import * as binProcessors from '../utils/processors';
import * as errors from '../errors';

class CommandGet extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('cat');
    this.description(
      'Concatenates secrets and prints them on the standard output',
    );
    this.argument(
      '[secretPaths...]',
      'Path to a secret to be retrieved, specified as <vaultName>:<directoryPath>',
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (secretPaths, options) => {
      secretPaths = secretPaths.map((path: string) =>
        binParsers.parseSecretPath(path),
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
          options: {
            nodePath: options.nodePath,
          },
          logger: this.logger.getChild(PolykeyClient.name),
        });
        if (secretPaths.length === 0) {
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              process.stdin.removeListener('data', dataHandler);
              process.stdin.removeListener('error', errorHandler);
              process.stdin.removeListener('end', endHandler);
            };
            const dataHandler = (data: Buffer) => {
              process.stdout.write(data);
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
          return;
        }
        const hasErrored = await binUtils.retryAuthentication(async (auth) => {
          // Write secret paths to input stream
          const response = await pkClient.rpcClient.methods.vaultsSecretsCat();
          const writer = response.writable.getWriter();
          let first = true;
          for (const [vaultName, secretPath] of secretPaths) {
            await writer.write({
              nameOrId: vaultName,
              secretName: secretPath ?? '/',
              metadata: first ? auth : undefined,
            });
            first = false;
          }
          await writer.close();
          // Print out incoming data to standard out
          let hasErrored = false;
          for await (const result of response.readable) {
            if (result.type === 'error') {
              hasErrored = true;
              switch (result.code) {
                case 'ENOENT':
                  // Attempt to cat a non-existent file
                  process.stderr.write(
                    `cat: ${result.reason}: No such file or directory\n`,
                  );
                  break;
                case 'EISDIR':
                  // Attempt to cat a directory
                  process.stderr.write(
                    `cat: ${result.reason}: Is a directory\n`,
                  );
                  break;
                default:
                  // No other code should be thrown
                  throw result;
              }
            } else {
              process.stdout.write(result.secretContent);
            }
          }
          return hasErrored;
        }, meta);
        if (hasErrored) {
          throw new errors.ErrorPolykeyCLICatSecret(
            'Failed to concatenate one or more secrets',
          );
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandGet;
