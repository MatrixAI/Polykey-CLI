import type PolykeyClient from 'polykey/PolykeyClient.js';
import type { GestaltId } from 'polykey/gestalts/types.js';
import type { GestaltMessage } from 'polykey/client/types.js';
import CommandPolykey from '../CommandPolykey.js';
import * as binOptions from '../utils/options.js';
import * as binUtils from '../utils/index.js';
import * as binParsers from '../utils/parsers.js';
import * as binProcessors from '../utils/processors.js';

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
        'polykey/PolykeyClient.js'
      );
      const utils = await import('polykey/utils/index.js');
      const nodesUtils = await import('polykey/nodes/utils.js');
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
            utils.never(`type ${type} is not valid, expected node or identity`);
        }
        const gestalt = res!.gestalt;
        if (options.format === 'json') {
          process.stdout.write(
            binUtils.outputFormatter({
              type: 'json',
              data: {
                gestalt,
              },
            }),
          );
        } else {
          const output: Array<string> = [];
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
          process.stdout.write(
            binUtils.outputFormatter({
              type: 'list',
              data: output,
            }),
          );
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandGet;
