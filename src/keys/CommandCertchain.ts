import type PolykeyClient from '@matrixai/polykey/dist/PolykeyClient';
import type WebSocketClient from '@matrixai/polykey/dist/websockets/WebSocketClient';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';

class CommandsCertchain extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('certchain');
    this.description('Get the Root Certificate Chain');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (options) => {
      const { default: PolykeyClient } = await import(
        '@matrixai/polykey/dist/PolykeyClient'
      );
      const { default: WebSocketClient } = await import(
        '@matrixai/polykey/dist/websockets/WebSocketClient'
      );
      const { clientManifest } = await import(
        '@matrixai/polykey/dist/client/handlers/clientManifest'
      );
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
      let pkClient: PolykeyClient<typeof clientManifest>;
      this.exitHandlers.handlers.push(async () => {
        if (pkClient != null) await pkClient.stop();
        if (webSocketClient != null) await webSocketClient.destroy(true);
      });
      try {
        webSocketClient = await WebSocketClient.createWebSocketClient({
          expectedNodeIds: [clientOptions.nodeId],
          host: clientOptions.clientHost,
          port: clientOptions.clientPort,
          logger: this.logger.getChild(WebSocketClient.name),
        });
        pkClient = await PolykeyClient.createPolykeyClient({
          streamFactory: (ctx) => webSocketClient.startConnection(ctx),
          nodePath: options.nodePath,
          manifest: clientManifest,
          logger: this.logger.getChild(PolykeyClient.name),
        });
        const data = await binUtils.retryAuthentication(async (auth) => {
          const data: Array<string> = [];
          const stream = await pkClient.rpcClient.methods.keysCertsChainGet({
            metadata: auth,
          });
          for await (const cert of stream) {
            data.push(cert.cert);
          }
          return data;
        }, auth);
        const result = {
          certchain: data,
        };
        let output: any = result;
        if (options.format === 'human') {
          output = [`Root Certificate Chain:\t\t${result.certchain}`];
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

export default CommandsCertchain;
