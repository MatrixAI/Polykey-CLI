import type PolykeyClient from 'polykey/dist/PolykeyClient';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binParsers from '../utils/parsers';
import * as binProcessors from '../utils/processors';
import * as errors from '../errors';

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
          options: { nodePath: options.nodePath },
          logger: this.logger.getChild(PolykeyClient.name),
        });
        const hasErrored = await binUtils.retryAuthentication(async (auth) => {
          const response =
            await pkClient.rpcClient.methods.vaultsSecretsRemove();
          // Extract all unique vault names
          const uniqueVaultNames = new Set<string>();
          for (const [vaultName] of secretPaths) {
            uniqueVaultNames.add(vaultName);
          }
          const writer = response.writable.getWriter();
          // Send the header message first
          await writer.write({
            type: 'VaultNamesHeaderMessage',
            vaultNames: Array.from(uniqueVaultNames),
            recursive: options.recursive,
            metadata: auth,
          });
          // Then send all the paths in subsequent messages
          for (const [vaultName, secretPath] of secretPaths) {
            await writer.write({
              type: 'SecretIdentifierMessage',
              nameOrId: vaultName,
              secretName: secretPath ?? '/',
            });
          }
          await writer.close();
          // Check if any errors were raised
          let hasErrored = false;
          for await (const result of response.readable) {
            if (result.type === 'error') {
              hasErrored = true;
              switch (result.code) {
                case 'ENOTEMPTY':
                  // Attempt to delete the directory without recursive set
                  process.stderr.write(
                    `rm: cannot remove '${result.reason}': Is a directory\n`,
                  );
                  break;
                case 'ENOENT':
                  // Attempt to delete a non-existent path
                  process.stderr.write(
                    `rm: cannot remove '${result.reason}': No such file or directory\n`,
                  );
                  break;
                case 'EINVAL':
                  // Attempt to delete vault root
                  process.stderr.write(
                    `rm: cannot remove '${result.reason}': Permission denied\n`,
                  );
                  break;
                default:
                  // No other code should be thrown
                  throw result;
              }
            }
          }
          return hasErrored;
        }, meta);
        if (hasErrored) {
          throw new errors.ErrorPolykeyCLIRemoveSecret(
            'Failed to remove one or more secrets',
          );
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandRemove;
