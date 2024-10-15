import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { ErrorMessage } from 'polykey/dist/client/types';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binParsers from '../utils/parsers';
import * as binProcessors from '../utils/processors';
import {
  ErrorPolykeyCLIMakeDirectory,
  ErrorPolykeyCLIUncaughtException,
} from '../errors';

class CommandMkdir extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('mkdir');
    this.description(
      'Create a Directory within a Vault. Empty directories are not a part of the vault and will not be shared when cloning a Vault.',
    );
    this.argument(
      '<secretPath...>',
      'Path to where the directory to be created, specified as <vaultName>:<directoryPath>',
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.addOption(binOptions.recursive);
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
        const response = await binUtils.retryAuthentication(async (auth) => {
          const response =
            await pkClient.rpcClient.methods.vaultsSecretsMkdir();
          const writer = response.writable.getWriter();
          let first = true;
          for (const [vault, path] of secretPaths) {
            await writer.write({
              nameOrId: vault,
              dirName: path,
              metadata: first
                ? { ...auth, options: { recursive: options.recursive } }
                : undefined,
            });
            first = false;
          }
          await writer.close();
          return response;
        }, meta);

        let hasErrored = false;
        for await (const result of response.readable) {
          if (result.type === 'error') {
            // TS cannot properly evaluate a type this deeply nested, so we use
            // the as keyword to help it. Inside this block, the type of data is
            // ensured to be 'error'.
            const error = result as ErrorMessage;
            hasErrored = true;
            let message: string = '';
            switch (error.code) {
              case 'ENOENT':
                message = 'No such secret or directory';
                break;
              case 'EEXIST':
                message = 'Secret or directory exists';
                break;
              default:
                throw new ErrorPolykeyCLIUncaughtException(
                  `Unexpected error code: ${error.code}`,
                );
            }
            process.stderr.write(
              `${error.code}: cannot create directory ${error.reason}: ${message}\n`,
            );
          }
        }
        if (hasErrored) {
          throw new ErrorPolykeyCLIMakeDirectory(
            'Failed to create one or more directories',
          );
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandMkdir;
