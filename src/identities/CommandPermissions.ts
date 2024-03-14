import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { GestaltId } from 'polykey/dist/gestalts/types';
import CommandPolykey from '../CommandPolykey';
import * as binOptions from '../utils/options';
import * as binUtils from '../utils';
import * as binParsers from '../utils/parsers';
import * as binProcessors from '../utils/processors';

class CommandPermissions extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('permissions');
    this.description('Gets the Permissions for a Node or Identity');
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
        let actionsList: Array<string> = [];
        switch (type) {
          case 'node':
            {
              // Getting by Node
              const res = await binUtils.retryAuthentication(
                (auth) =>
                  pkClient.rpcClient.methods.gestaltsActionsGetByNode({
                    metadata: auth,
                    nodeIdEncoded: nodesUtils.encodeNodeId(id),
                  }),
                auth,
              );
              actionsList = res.actionsList;
            }
            break;
          case 'identity':
            {
              // Getting by Identity
              const res = await binUtils.retryAuthentication(
                (auth) =>
                  pkClient.rpcClient.methods.gestaltsActionsGetByIdentity({
                    metadata: auth,
                    providerId: id[0],
                    identityId: id[1],
                  }),
                auth,
              );
              actionsList = res.actionsList;
            }
            break;
          default:
            utils.never();
        }
        process.stdout.write(
          binUtils.outputFormatter({
            type: options.format === 'json' ? 'json' : 'dict',
            data: {
              actionsList,
            },
          }),
        );
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandPermissions;
