import type PolykeyClient from 'polykey/PolykeyClient.js';
import type { NodeId } from 'polykey/ids/types.js';
import CommandPolykey from '../CommandPolykey.js';
import * as binUtils from '../utils/index.js';
import * as binOptions from '../utils/options.js';
import * as binProcessors from '../utils/processors.js';
import * as binParsers from '../utils/parsers.js';
import * as errors from '../errors.js';

class CommandPing extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('ping');
    this.description("Ping a Node to check if it's Online");
    this.argument('<nodeId>', 'Id of the node to ping', binParsers.parseNodeId);
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (nodeId: NodeId, options) => {
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
        let error: any;
        const statusMessage = await binUtils.retryAuthentication(
          (auth) =>
            pkClient.rpcClient.methods.nodesPing({
              metadata: auth,
              nodeIdEncoded: nodesUtils.encodeNodeId(nodeId),
            }),
          auth,
        );
        if (!statusMessage.success) {
          error = new errors.ErrorPolykeyCLINodePingFailed(
            'No response received',
          );
        }
        if (statusMessage.success) process.stderr.write('Node is Active\n');
        const outputFormatted = binUtils.outputFormatter({
          type: options.format === 'json' ? 'json' : 'dict',
          data: {
            success: statusMessage.success,
          },
        });
        process.stdout.write(outputFormatted);
        if (error != null) throw error;
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandPing;
