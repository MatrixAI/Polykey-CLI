import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { GestaltMessage } from 'polykey/dist/client/types';
import CommandPolykey from '../CommandPolykey';
import * as binOptions from '../utils/options';
import * as binUtils from '../utils';
import * as binProcessors from '../utils/processors';

class CommandList extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('list');
    this.description('List all the Gestalts in the Gestalt Graph');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
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
        const gestaltMessages = await binUtils.retryAuthentication(
          async (auth) => {
            const gestaltMessages: Array<
              GestaltMessage & { gestalt: { actionsList: Array<string> } }
            > = [];
            const stream = await pkClient.rpcClient.methods.gestaltsGestaltList(
              {
                metadata: auth,
              },
            );
            for await (const gestaltMessage of stream) {
              // Getting the permissions for the gestalt.
              const actionsMessage = await binUtils.retryAuthentication(
                (auth) =>
                  pkClient.rpcClient.methods.gestaltsActionsGetByNode({
                    metadata: auth,
                    nodeIdEncoded: Object.values(
                      gestaltMessage.gestalt.nodes,
                    )[0].nodeId,
                  }),
                auth,
              );
              const actionsList = actionsMessage.actionsList;
              gestaltMessages.push({
                gestalt: {
                  ...gestaltMessage.gestalt,
                  actionsList,
                },
              });
            }
            return gestaltMessages;
          },
          auth,
        );
        if (options.format === 'json') {
          process.stdout.write(
            binUtils.outputFormatter({
              type: 'json',
              data: gestaltMessages,
            }),
          );
        } else {
          // Convert to a human-readable list.
          let count = 1;
          for (const gestaltMessage of gestaltMessages) {
            const gestalt = gestaltMessage.gestalt;
            if (count !== 1) process.stdout.write('\n');
            process.stdout.write(
              binUtils.outputFormatter({
                type: 'dict',
                data: {
                  gestalt: count,
                  actionsList: gestalt.actionsList.join(','),
                },
              }),
            );
            // Listing nodes
            const nodeIds = Object.values(gestalt.nodes).map(
              (node) => node.nodeId as string,
            );
            // Listing identities
            const identities = Object.values(gestalt.identities).map(
              (identity) => `${identity.providerId}:${identity.identityId}`,
            );
            process.stdout.write(
              binUtils.outputFormatter({
                type: 'list',
                data: nodeIds.concat(identities),
              }),
            );
            count++;
          }
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandList;
