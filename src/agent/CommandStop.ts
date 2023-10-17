import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { WebSocketClient } from '@matrixai/ws';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';
import * as errors from '../errors';

class CommandStop extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('stop');
    this.description('Stop the Polykey Agent');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
      );
      const { WebSocketClient } = await import('@matrixai/ws');
      const clientUtils = await import('polykey/dist/client/utils');
      const clientStatus = await binProcessors.processClientStatus(
        options.nodePath,
        options.nodeId,
        options.clientHost,
        options.clientPort,
        this.fs,
        this.logger.getChild(binProcessors.processClientOptions.name),
      );
      const statusInfo = clientStatus.statusInfo;
      if (statusInfo?.status === 'DEAD') {
        this.logger.info('Agent is already dead');
        return;
      } else if (statusInfo?.status === 'STOPPING') {
        this.logger.info('Agent is already stopping');
        return;
      } else if (statusInfo?.status === 'STARTING') {
        throw new errors.ErrorPolykeyCLIAgentStatus('agent is starting');
      }
      const auth = await binProcessors.processAuthentication(
        options.passwordFile,
        this.fs,
      );
      // Either the statusInfo is undefined or LIVE
      // Either way, the connection parameters now exist
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
                [clientStatus.nodeId!],
                certs,
              );
            },
          },
          host: clientStatus.clientHost!,
          port: clientStatus.clientPort!,
          logger: this.logger.getChild(WebSocketClient.name),
        });
        pkClient = await PolykeyClient.createPolykeyClient({
          streamFactory: () => webSocketClient.connection.newStream(),
          nodePath: options.nodePath,
          logger: this.logger.getChild(PolykeyClient.name),
        });
        await binUtils.retryAuthentication(
          (auth) =>
            pkClient.rpcClientClient.methods.agentStop({
              metadata: auth,
            }),
          auth,
        );
        this.logger.info('Stopping Agent');
      } finally {
        if (pkClient! != null) await pkClient.stop();
        if (webSocketClient! != null) await webSocketClient.destroy();
      }
    });
  }
}

export default CommandStop;
