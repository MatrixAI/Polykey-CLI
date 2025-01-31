import type PolykeyClient from 'polykey/dist/PolykeyClient';
import path from 'path';
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
      const { never } = await import('polykey/dist/utils');
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
        await binUtils.retryAuthentication(async (auth) => {
          // Make sure the path exists
          const response =
            await pkClient.rpcClient.methods.vaultsSecretsMkdir();
          const writer = response.writable.getWriter();
          await writer.write({
            nameOrId: secretPath[0],
            dirName: path.dirname(secretPath[1] ?? '/'),
            metadata: { ...auth, options: { recursive: true } },
          });
          await writer.close();
          for await (const chunk of response.readable) {
            const type = chunk.type;
            switch (type) {
              case 'SuccessMessage':
                // No special action required if mkdir succeeds
                break;
              case 'ErrorMessage':
                // This operation can only fail if a file already exists at the
                // target location. No other error should happen.
                if (chunk.code === 'EEXIST') {
                  throw new errors.ErrorPolykeyCLIMakeDirectory(
                    `A file already exists at path ${chunk.reason}`,
                  );
                } else {
                  throw new errors.ErrorPolykeyCLIMakeDirectory(
                    `Failed to create directory ${chunk.reason} (${chunk.code})`,
                  );
                }
              default:
                never(
                  `Expected "SuccessMessage" or "ErrorMessage", got ${type}`,
                );
            }
          }
          // Write the contents
          await pkClient.rpcClient.methods.vaultsSecretsWriteFile({
            metadata: auth,
            nameOrId: secretPath[0],
            secretName: secretPath[1] ?? '/',
            secretContent: content.toString('binary'),
          });
        }, meta);
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandCreate;
