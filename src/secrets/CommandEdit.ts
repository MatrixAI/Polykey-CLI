import type PolykeyClient from 'polykey/dist/PolykeyClient';
import * as errors from '../errors';
import CommandPolykey from '../CommandPolykey';
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
      binParsers.parseSecretPath,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (secretPath, options) => {
      const os = await import('os');
      const { execSync } = await import('child_process');
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
        const response = await binUtils.retryAuthentication(
          (auth) =>
            pkClient.rpcClient.methods.vaultsSecretsGet({
              metadata: auth,
              nameOrId: secretPath[0],
              secretName: secretPath[1],
            }),
          meta,
        );
        const secretContent = response.secretContent;
        // Linux
        const tmpDir = `${os.tmpdir}/pksecret`;
        await this.fs.promises.mkdir(tmpDir);
        const tmpFile = `${tmpDir}/pkSecretFile`;
        await this.fs.promises.writeFile(tmpFile, secretContent);
        execSync(`$EDITOR \"${tmpFile}\"`, { stdio: 'inherit' });
        let content: Buffer;
        try {
          content = await this.fs.promises.readFile(tmpFile);
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
        await pkClient.rpcClient.methods.vaultsSecretsEdit({
          nameOrId: secretPath[0],
          secretName: secretPath[1],
          secretContent: content.toString('binary'),
        });
        await this.fs.promises.rm(tmpDir, { recursive: true, force: true });
        // Windows
        // TODO: complete windows impl
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandEdit;
