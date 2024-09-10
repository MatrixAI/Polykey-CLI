import type PolykeyClient from 'polykey/dist/PolykeyClient';
import fs from 'fs';
import path from 'path';
import CommandPolykey from '../CommandPolykey';
import * as errors from '../errors';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binParsers from '../utils/parsers';
import * as binProcessors from '../utils/processors';

class CommandEdit extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('edit');
    this.description('Edit a Secret');
    this.argument(
      '<secretPath>',
      'Path to the secret to be edited, specified as <vaultName>:<directoryPath>',
      binParsers.parseSecretPathValue,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (secretPath, options) => {
      const os = await import('os');
      const { execSync } = await import('child_process');
      const vaultsErrors = await import('polykey/dist/vaults/errors');
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

      const tmpDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'polykey-'),
      );
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
        const tmpFile = path.join(tmpDir, path.basename(secretPath[1]));
        const secretExists = await binUtils.retryAuthentication(
          async (auth) => {
            let exists: boolean = true;
            try {
              const response =
                await pkClient.rpcClient.methods.vaultsSecretsGet({
                  metadata: auth,
                  nameOrId: secretPath[0],
                  secretName: secretPath[1],
                });
              await this.fs.promises.writeFile(tmpFile, response.secretContent);
            } catch (e) {
              const [cause, _] = binUtils.remoteErrorCause(e);
              if (cause instanceof vaultsErrors.ErrorSecretsSecretUndefined) {
                exists = false;
              } else {
                throw e;
              }
            }
            return exists;
          },
          meta,
        );
        // If the editor exited with a code other than zero, then execSync
        // will throw an error. So, in the case of saving the file but the
        // editor crashing, the program won't save the updated secret.
        execSync(`${process.env.EDITOR} \"${tmpFile}\"`, { stdio: 'inherit' });
        let content: string;
        try {
          content = (await this.fs.promises.readFile(tmpFile)).toString(
            'binary',
          );
        } catch (e) {
          if (e.code === 'ENOENT') {
            // If the secret exists but the file doesn't, then something went
            // wrong, and the file cannot be read anymore. This is bad.
            if (secretExists) {
              throw new errors.ErrorPolykeyCLIFileRead(e.message, {
                data: {
                  errno: e.errno,
                  syscall: e.syscall,
                  code: e.code,
                  path: e.path,
                },
                cause: e,
              });
              // If the secret didn't exist before and we can't read the file,
              // then the secret was never actually created or saved. The user
              // doesn't want to make the secret anymore, so abort mision!
            } else {
              return;
            }
          }
          throw e;
        }
        await binUtils.retryAuthentication(async (auth) => {
          // This point will never be reached if the temp file doesn't exist.
          // As such, if the secret didn't exist before, then we want to make it.
          // Otherwise, if the secret existed before, then we want to edit it.
          if (secretExists) {
            await pkClient.rpcClient.methods.vaultsSecretsEdit({
              metadata: auth,
              nameOrId: secretPath[0],
              secretName: secretPath[1],
              secretContent: content,
            });
          } else {
            await pkClient.rpcClient.methods.vaultsSecretsNew({
              metadata: auth,
              nameOrId: secretPath[0],
              secretName: secretPath[1],
              secretContent: content,
            });
          }
        }, meta);
        // Windows
        // TODO: complete windows impl
      } finally {
        await this.fs.promises.rm(tmpDir, { recursive: true, force: true });
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandEdit;
