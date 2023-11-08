import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { NodeId } from 'polykey/dist/ids/types';
import type { Host, Port } from 'polykey/dist/network/types';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';
import * as binParsers from '../utils/parsers';
import * as errors from '../errors';

class CommandFind extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('find');
    this.description('Attempt to Find a Node');
    this.argument('<nodeId>', 'Id of the node to find', binParsers.parseNodeId);
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (nodeId: NodeId, options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
      );
      const nodesUtils = await import('polykey/dist/nodes/utils');
      const networkUtils = await import('polykey/dist/network/utils');
      const nodesErrors = await import('polykey/dist/nodes/errors');
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
        const result = {
          success: false,
          message: '',
          id: '',
          host: '',
          port: 0,
        };
        try {
          const response = await binUtils.retryAuthentication(
            (auth) =>
              pkClient.rpcClient.methods.nodesFind({
                metadata: auth,
                nodeIdEncoded: nodesUtils.encodeNodeId(nodeId),
              }),
            auth,
          );
          result.success = true;
          result.id = nodesUtils.encodeNodeId(nodeId);
          result.host = response.host;
          result.port = response.port;
          result.message = `Found node at ${networkUtils.buildAddress(
            result.host as Host,
            result.port as Port,
          )}`;
        } catch (err) {
          if (
            !(err.cause instanceof nodesErrors.ErrorNodeGraphNodeIdNotFound)
          ) {
            throw err;
          }
          // Else failed to find the node.
          result.success = false;
          result.id = nodesUtils.encodeNodeId(nodeId);
          result.host = '';
          result.port = 0;
          result.message = `Failed to find node ${result.id}`;
        }
        let output: any = result;
        if (options.format === 'human') output = [result.message];
        const outputFormatted = binUtils.outputFormatter({
          type: options.format === 'json' ? 'json' : 'list',
          data: output,
        });
        process.stdout.write(outputFormatted);
        // Like ping it should error when failing to find node for automation reasons.
        if (!result.success) {
          throw new errors.ErrorPolykeyCLINodeFindFailed(result.message);
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandFind;
