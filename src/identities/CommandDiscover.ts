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
    this.addOption(binOptions.discoveryMonitor);
    this.action(async (gestaltId: GestaltId, options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
      );
      const utils = await import('polykey/dist/utils');
      const nodesUtils = await import('polykey/dist/nodes/utils');
      const gestaltUtils = await import('polykey/dist/gestalts/utils');
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
        let eventsP: Promise<void> | undefined;
        if (options.monitor === true) {
          // Creating an infinite timer to hold the process open
          const holdOpenTimer = setTimeout(() => {}, 2 ** 30);
          // We set up the readable stream watching the discovery events here
          eventsP = binUtils
            .retryAuthentication(async (auth) => {
              const readableStream =
                await pkClient.rpcClient.methods.auditEventsGet({
                  awaitFutureEvents: true,
                  path: ['discovery', 'vertex'],
                  seek: Date.now(),
                  metadata: auth,
                });
              // Tracks vertices that are relevant to our current search
              const relevantSet: Set<string> = new Set();
              // Tracks vertices that are currently queued and waiting processing, when exhausted then the search is done
              const queuedSet: Set<string> = new Set();
              // Adding the initial vertex
              relevantSet.add(gestaltUtils.encodeGestaltId(gestaltId));
              for await (const result of readableStream) {
                const event = result.path[2];
                const { vertex, parent } = result.data;
                // Skip if the vertex and parent are not relevant
                if (
                  !relevantSet.has(vertex) &&
                  parent != null &&
                  !relevantSet.has(parent)
                ) {
                  continue;
                }
                relevantSet.add(vertex);
                if (parent != null) relevantSet.add(parent);
                switch (event) {
                  case 'queued':
                    queuedSet.add(vertex);
                    break;
                  case 'processed':
                  case 'cancelled':
                  case 'failed':
                    queuedSet.delete(vertex);
                    break;
                }
                const [type, id] = gestaltUtils.decodeGestaltId(vertex)!;
                const formattedVertex: string =
                  type === 'identity'
                    ? `${id[0]}:${id[1]}`
                    : nodesUtils.encodeNodeId(id);
                const data = {
                  event,
                  vertex: formattedVertex,
                };
                if (options.format === 'json') {
                  process.stdout.write(
                    binUtils.outputFormatter({
                      type: 'json',
                      data,
                    }),
                  );
                } else {
                  process.stdout.write(
                    binUtils.outputFormatter({
                      type: 'list',
                      data: [
                        `${data.event}${' '.repeat(15 - data.event.length)}${
                          data.vertex
                        }`,
                      ],
                    }),
                  );
                }
                if (queuedSet.size === 0) break;
              }
            }, auth)
            .finally(() => {
              clearTimeout(holdOpenTimer);
            });
        }
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
        await eventsP;
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandDiscover;
