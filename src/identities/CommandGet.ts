import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { GestaltId } from 'polykey/dist/gestalts/types';
import type { GestaltMessage } from 'polykey/dist/client/types';
import CommandPolykey from '../CommandPolykey';
import * as binOptions from '../utils/options';
import * as binUtils from '../utils';
import * as binParsers from '../utils/parsers';
import * as binProcessors from '../utils/processors';

class CommandGet extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('get');
    this.description(
      'Gets a Gestalt with a Node or Identity ID from the Gestalt Graph',
    );
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
        let res: GestaltMessage | null = null;
        const [type, id] = gestaltId;
        switch (type) {
          case 'node':
            {
              // Getting from node
              res = await binUtils.retryAuthentication(
                (auth) =>
                  pkClient.rpcClient.methods.gestaltsGestaltGetByNode({
                    metadata: auth,
                    nodeIdEncoded: nodesUtils.encodeNodeId(id),
                  }),
                auth,
              );
            }
            break;
          case 'identity':
            {
              // Getting from identity.
              res = await binUtils.retryAuthentication(
                (auth) =>
                  pkClient.rpcClient.methods.gestaltsGestaltGetByIdentity({
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
        const gestalt = res!.gestalt;
        let output: any = gestalt;
        if (options.format !== 'json') {
          // Creating a list.
          output = [];
          // Listing nodes.
          for (const nodeKey of Object.keys(gestalt.nodes)) {
            const node = gestalt.nodes[nodeKey];
            output.push(`${node.nodeId}`);
          }
          // Listing identities
          for (const identityKey of Object.keys(gestalt.identities)) {
            const identity = gestalt.identities[identityKey];
            output.push(`${identity.providerId}:${identity.identityId}`);
          }
        }
        process.stdout.write(
          binUtils.outputFormatter({
            type: options.format === 'json' ? 'json' : 'list',
            data: output,
          }),
        );
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandGet;
