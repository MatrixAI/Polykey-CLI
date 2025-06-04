import type PolykeyClient from 'polykey/PolykeyClient.js';
import CommandPolykey from '../CommandPolykey.js';
import * as binUtils from '../utils/index.js';
import * as binOptions from '../utils/options.js';
import * as binParsers from '../utils/parsers.js';
import * as binProcessors from '../utils/processors.js';
import * as errors from '../errors.js';

class CommandRename extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('rename');
    this.description('Rename a Secret');
    this.argument(
      '<secretPath>',
      'Path to where the secret to be renamed, specified as <vaultName>:<directoryPath>',
      binParsers.parseSecretPath,
    );
    this.argument('<newSecretName>', 'New name of the secret');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (secretPath, newSecretNameArg, options) => {
      // Ensure that a valid secret path is provided
      if (
        secretPath[1] == null ||
        secretPath[1].trim() === '' ||
        secretPath[1].trim() === '/'
      ) {
        throw new errors.ErrorPolykeyCLIRenameSecret(
          'EPERM: Cannot rename vault root',
        );
      }

      // Process the newSecretNameArg using the abstracted helper method.
      // secretPath[0] is the original vault name.
      const finalNewSecretName = CommandRename._processNewSecretNameArgument(
        newSecretNameArg,
        secretPath[0],
      );

      const { default: PolykeyClient } = await import(
        'polykey/PolykeyClient.js'
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
            pkClient.rpcClient.methods.vaultsSecretsRename({
              metadata: auth,
              nameOrId: secretPath[0],
              secretName: secretPath[1],
              newSecretName: finalNewSecretName,
            }),
          meta,
        );
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }

  /**
   * Processes the newSecretName argument to ensure it's a valid base name.
   */
  private static _processNewSecretNameArgument(
    newSecretNameArg: string,
    originalVaultName: string,
  ): string {
    let finalNewBaseName = newSecretNameArg;

    if (newSecretNameArg.includes(':')) {
      let parsedNewPath: Array<any>;
      try {
        parsedNewPath = binParsers.parseSecretPath(newSecretNameArg);
      } catch (e: any) {
        throw new errors.ErrorPolykeyCLIRenameSecret(
          `EINVALID: The new secret name '${newSecretNameArg}' appears to be a path but could not be parsed: ${e.message}`,
        );
      }
      const newVaultNameInArg: string = parsedNewPath[0];
      const newSecretPathPart: string = parsedNewPath[1];
      if (newVaultNameInArg !== originalVaultName) {
        throw new errors.ErrorPolykeyCLIRenameSecret(
          `ECROSSVAULT: Renaming to a different vault ('${newVaultNameInArg}') is not supported by this command. The target vault must be the same as the source vault ('${originalVaultName}').`,
        );
      }
      if (
        newSecretPathPart == null ||
        newSecretPathPart.trim() === '' ||
        newSecretPathPart.trim() === '/'
      ) {
        throw new errors.ErrorPolykeyCLIRenameSecret(
          `EINVALID: The path component of the new secret name '${newSecretNameArg}' is empty or invalid.`,
        );
      }
      const parts = newSecretPathPart.split('/').filter((p) => p.length > 0);
      if (parts.length === 0) {
        throw new errors.ErrorPolykeyCLIRenameSecret(
          `EINVALID: Could not extract a valid base name from the path component '${newSecretPathPart}' in '${newSecretNameArg}'.`,
        );
      }
      finalNewBaseName = parts[parts.length - 1];
    } else {
      if (newSecretNameArg.includes('/')) {
        throw new errors.ErrorPolykeyCLIRenameSecret(
          `EINVALIDNAME: The new secret name '${newSecretNameArg}' must be a base name and cannot contain '/'. If you intended to specify a path, include the vault name (e.g., '${originalVaultName}:/path/NewName').`,
        );
      }
    }
    if (!finalNewBaseName || finalNewBaseName.trim() === '') {
      throw new errors.ErrorPolykeyCLIRenameSecret(
        `EEMPTYNAME: The new secret name derived from '${newSecretNameArg}' is empty.`,
      );
    }
    if (finalNewBaseName.includes('/') || finalNewBaseName.includes(':')) {
      throw new errors.ErrorPolykeyCLIRenameSecret(
        `EINVALIDCHAR: The final new secret name '${finalNewBaseName}' (derived from '${newSecretNameArg}') is invalid. It cannot contain '/' or ':' characters.`,
      );
    }
    return finalNewBaseName;
  }
}

export default CommandRename;
