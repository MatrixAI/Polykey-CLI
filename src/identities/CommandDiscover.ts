import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { GestaltId } from 'polykey/dist/gestalts/types';
import CommandPolykey from '../CommandPolykey';
import * as binOptions from '../utils/options';
import * as binUtils from '../utils';
import * as binParsers from '../utils/parsers';
import * as binProcessors from '../utils/processors';

class CommandDiscover extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('discover');
    this.description('Adds a Node or Identity to the Discovery Queue');
    this.argument(
      '<gestaltId>',
      'Node ID or `Provider ID:Identity ID`',
      binParsers.parseGestaltId,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (gestaltId: GestaltId, options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
      );
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
        const [type, id] = gestaltId;
        switch (type) {
          case 'node':
            {
              // Discovery by Node
              await binUtils.retryAuthentication(
                (auth) =>
                  pkClient.rpcClient.methods.gestaltsDiscoveryByNode({
                    metadata: auth,
                    nodeIdEncoded: nodesUtils.encodeNodeId(id),
                  }),
                auth,
              );
            }
            break;
          case 'identity':
            {
              //  Discovery by Identity
              await binUtils.retryAuthentication(
                (auth) =>
                  pkClient.rpcClient.methods.gestaltsDiscoveryByIdentity({
                    metadata: auth,
                    providerId: id[0],
                    identityId: id[1],
                  }),
                auth,
              );
            }
            break;
          default:
            utils.never();
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandDiscover;
