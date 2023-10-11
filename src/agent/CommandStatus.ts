import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { WebSocketClient } from '@matrixai/ws';
import type { StatusResultMessage } from 'polykey/dist/client/handlers/types';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';

class CommandStatus extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('status');
    this.description('Get the Status of the Polykey Agent');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
      );
      const { WebSocketClient } = await import('@matrixai/ws');
      const clientUtils = await import('polykey/dist/client/utils/utils');
      const clientStatus = await binProcessors.processClientStatus(
        options.nodePath,
        options.nodeId,
        options.clientHost,
        options.clientPort,
        this.fs,
        this.logger.getChild(binProcessors.processClientOptions.name),
      );
      const statusInfo = clientStatus.statusInfo;
      // If status is not LIVE, we return what we have in the status info
      // If status is LIVE, then we connect and acquire agent information
      if (statusInfo != null && statusInfo?.status !== 'LIVE') {
        process.stdout.write(
          binUtils.outputFormatter({
            type: options.format === 'json' ? 'json' : 'dict',
            data: {
              status: statusInfo.status,
              ...statusInfo.data,
            },
          }),
        );
      } else {
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
        let response: StatusResultMessage;
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
          response = await binUtils.retryAuthentication(
            (auth) =>
              pkClient.rpcClientClient.methods.agentStatus({
                metadata: auth,
              }),
            auth,
          );
        } finally {
          if (pkClient! != null) await pkClient.stop();
          if (webSocketClient! != null) await webSocketClient.destroy();
        }
        process.stdout.write(
          binUtils.outputFormatter({
            type: options.format === 'json' ? 'json' : 'dict',
            data: {
              status: 'LIVE',
              pid: response.pid,
              nodeId: response.nodeIdEncoded,
              clientHost: response.clientHost,
              clientPort: response.clientPort,
              agentHost: response.agentHost,
              agentPort: response.agentPort,
              publicKeyJWK: response.publicKeyJwk,
              certChainPEM: response.certChainPEM,
            },
          }),
        );
      }
    });
  }
}

export default CommandStatus;
