import type PolykeyClient from 'polykey/PolykeyClient.js';
import type { NodeId } from 'polykey/ids/types.js';
import type { Host, Port } from 'polykey/network/types.js';
import CommandPolykey from '../CommandPolykey.js';
import * as binUtils from '../utils/utils.js';
import * as binProcessors from '../utils/processors.js';
import * as binOptions from '../utils/options.js';
import * as binParsers from '../utils/parsers.js';

class CommandAdd extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('add');
    this.description('Add a Node to the Node Graph');
    this.argument('<nodeId>', 'Id of the node to add', binParsers.parseNodeId);
    this.argument('<host>', 'Address of the node', binParsers.parseHost);
    this.argument('<port>', 'Port of the node', binParsers.parsePort);
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.addOption(binOptions.forceNodeAdd);
    this.addOption(binOptions.noPing);
    this.action(async (nodeId: NodeId, host: Host, port: Port, options) => {
      const { default: PolykeyClient } = await import(
        'polykey/PolykeyClient.js'
      );
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
        await binUtils.retryAuthentication(
          (auth) =>
            pkClient.rpcClient.methods.nodesAdd({
              metadata: auth,
              nodeIdEncoded: nodesUtils.encodeNodeId(nodeId),
              host: host,
              port: port,
              force: options.force,
              ping: options.ping,
            }),
          auth,
        );
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandAdd;
