import type PolykeyClient from '@matrixai/polykey/dist/PolykeyClient';
import type WebSocketClient from '@matrixai/polykey/dist/websockets/WebSocketClient';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';

class CommandScan extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('scan');
    this.description('Scans a node to reveal their shared vaults');
    this.argument('<nodeId>', 'Id of the node to scan');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (nodeId, options) => {
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
      const meta = await binProcessors.processAuthentication(
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
          const stream = await pkClient.rpcClient.methods.vaultsScan({
            metadata: auth,
            nodeIdEncoded: nodeId,
          });
          for await (const vault of stream) {
            const vaultName = vault.vaultName;
            const vaultIdEncoded = vault.vaultIdEncoded;
            const permissions = vault.permissions.join(',');
            data.push(`${vaultName}\t\t${vaultIdEncoded}\t\t${permissions}`);
          }
          return data;
        }, meta);
        process.stdout.write(
          binUtils.outputFormatter({
            type: options.format === 'json' ? 'json' : 'list',
            data: data,
          }),
        );
      } finally {
        if (pkClient! != null) await pkClient.stop();
        if (webSocketClient! != null) await webSocketClient.destroy();
      }
    });
  }
}

export default CommandScan;
