import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { WebSocketClient } from '@matrixai/ws';
import type { GestaltId } from 'polykey/dist/gestalts/types';
import CommandPolykey from '../CommandPolykey';
import * as binOptions from '../utils/options';
import * as binUtils from '../utils';
import * as parsers from '../utils/parsers';
import * as binProcessors from '../utils/processors';

class CommandDisallow extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('disallow');
    this.description('Disallow Permission for Identity');
    this.argument(
      '<gestaltId>',
      'Node ID or `Provider Id:Identity Id`',
      parsers.parseGestaltId,
    );
    this.argument(
      '<permissions>',
      'Permission to unset',
      parsers.parseGestaltAction,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (gestaltId: GestaltId, permission, options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
      );
      const { WebSocketClient } = await import('@matrixai/ws');
      const clientUtils = await import('polykey/dist/client/utils/utils');
      const utils = await import('polykey/dist/utils');
      const nodesUtils = await import('polykey/dist/nodes/utils');
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
        const [type, id] = gestaltId;
        switch (type) {
          case 'node':
            {
              // Trusting
              await binUtils.retryAuthentication(
                (auth) =>
                  pkClient.rpcClientClient.methods.gestaltsActionsUnsetByNode({
                    metadata: auth,
                    nodeIdEncoded: nodesUtils.encodeNodeId(id),
                    action: permission,
                  }),
                auth,
              );
            }
            break;
          case 'identity':
            {
              // Trusting.
              await binUtils.retryAuthentication(
                (auth) =>
                  pkClient.rpcClientClient.methods.gestaltsActionsUnsetByIdentity(
                    {
                      metadata: auth,
                      providerId: id[0],
                      identityId: id[1],
                      action: permission,
                    },
                  ),
                auth,
              );
            }
            break;
          default:
            utils.never();
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
        if (webSocketClient! != null) await webSocketClient.destroy();
      }
    });
  }
}

export default CommandDisallow;
