import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type WebSocketClient from 'polykey/dist/websockets/WebSocketClient';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';

class CommandList extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('list');
    this.aliases(['ls']);
    this.description('List all Available Secrets for a Vault');
    this.argument('<vaultName>', 'Name of the vault to list secrets from');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (vaultName, options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
      );
      const { default: WebSocketClient } = await import(
        'polykey/dist/websockets/WebSocketClient'
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
      let pkClient: PolykeyClient;
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
          logger: this.logger.getChild(PolykeyClient.name),
        });
        const data = await binUtils.retryAuthentication(async (auth) => {
          const data: Array<string> = [];
          const stream =
            await pkClient.rpcClientClient.methods.vaultsSecretsList({
              metadata: auth,
              nameOrId: vaultName,
            });
          for await (const secret of stream) {
            data.push(secret.secretName);
          }
          return data;
        }, auth);
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

export default CommandList;
