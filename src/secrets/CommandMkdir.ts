import type PolykeyClient from 'polykey/dist/PolykeyClient';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binParsers from '../utils/parsers';
import * as binProcessors from '../utils/processors';
import { ErrorPolykeyCLIMakeDirectory } from '../errors';

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
    this.addOption(binOptions.parents);
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
        const hasErrored = await binUtils.retryAuthentication(async (auth) => {
          // Write directory paths to input stream
          const response =
            await pkClient.rpcClient.methods.vaultsSecretsMkdir();
          const writer = response.writable.getWriter();
          let first = true;
          for (const [vault, path] of secretPaths) {
            await writer.write({
              nameOrId: vault,
              dirName: path ?? '/',
              metadata: first
                ? { ...auth, options: { recursive: options.parents } }
                : undefined,
            });
            first = false;
          }
          await writer.close();
          // Print out incoming errors to standard error.
          let hasErrored = false;
          for await (const result of response.readable) {
            if (result.type === 'ErrorMessage') {
              hasErrored = true;
              switch (result.code) {
                case 'ENOENT':
                  // Attempt to create a directory without existing parents
                  process.stderr.write(
                    `mkdir: cannot create directory ${result.reason}: No such file or directory\n`,
                  );
                  break;
                case 'EEXIST':
                  // Attempt to create a directory where something already exists
                  process.stderr.write(
                    `mkdir: cannot create directory ${result.reason}: File or directory exists\n`,
                  );
                  break;
                default:
                  // No other code should be thrown
                  throw result;
              }
            }
            // No additional processing needs to be done if directory creation
            // was successful.
          }
          return hasErrored;
        }, meta);
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
