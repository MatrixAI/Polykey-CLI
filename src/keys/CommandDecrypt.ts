import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { WebSocketClient } from '@matrixai/ws';
import * as errors from '../errors';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';

class CommandDecrypt extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('decrypt');
    this.description('Decrypt a File using the Root Keypair');
    this.argument(
      '<filePath>',
      'Path to the file to decrypt, file must use binary encoding',
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (filePath, options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
      );
      const { WebSocketClient } = await import('@matrixai/ws');
      const clientUtils = await import('polykey/dist/client/utils/utils');
      const clientOptions = await binProcessors.processClientOptions(
        options.nodePath,
        options.nodeId,
        options.clientHost,
        options.clientPort,
        this.fs,
        this.logger.getChild(binProcessors.processClientOptions.name),
      );
      const auth = await binProcessors.processAuthentication(
        options.passwordFile,
        this.fs,
      );
      let webSocketClient: WebSocketClient;
      let pkClient: PolykeyClient;
      this.exitHandlers.handlers.push(async () => {
        if (pkClient != null) await pkClient.stop();
        if (webSocketClient != null) {
          await webSocketClient.destroy({ force: true });
        }
      });
      try {
        webSocketClient = await WebSocketClient.createWebSocketClient({
          config: {
            verifyPeer: true,
            verifyCallback: async (certs) => {
              await clientUtils.verifyServerCertificateChain(
                [clientOptions.nodeId],
                certs,
              );
            },
          },
          host: clientOptions.clientHost,
          port: clientOptions.clientPort,
          logger: this.logger.getChild(WebSocketClient.name),
        });
        pkClient = await PolykeyClient.createPolykeyClient({
          streamFactory: () => webSocketClient.connection.newStream(),
          nodePath: options.nodePath,
          logger: this.logger.getChild(PolykeyClient.name),
        });
        let cipherText: string;
        try {
          cipherText = await this.fs.promises.readFile(filePath, {
            encoding: 'binary',
          });
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
        const response = await binUtils.retryAuthentication(
          (auth) =>
            pkClient.rpcClientClient.methods.keysDecrypt({
              metadata: auth,
              data: cipherText,
            }),
          auth,
        );
        const result = {
          decryptedData: response.data,
        };
        let output: any = result;
        if (options.format === 'human') {
          output = [`Decrypted data:\t\t${result.decryptedData}`];
        }
        process.stdout.write(
          binUtils.outputFormatter({
            type: options.format === 'json' ? 'json' : 'list',
            data: output,
          }),
        );
      } finally {
        if (pkClient! != null) await pkClient.stop();
        if (webSocketClient! != null) await webSocketClient.destroy();
      }
    });
  }
}

export default CommandDecrypt;
