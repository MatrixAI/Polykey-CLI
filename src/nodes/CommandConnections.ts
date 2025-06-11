import type PolykeyClient from 'polykey/PolykeyClient.js';
import type { NodeConnectionMessage } from 'polykey/client/types.js';
import CommandPolykey from '../CommandPolykey.js';
import * as binUtils from '../utils/utils.js';
import * as binOptions from '../utils/options.js';
import * as binProcessors from '../utils/processors.js';

class CommandAdd extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('connections');
    this.description('list all active node connections');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (options) => {
      const { default: PolykeyClient } = await import(
        'polykey/PolykeyClient.js'
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
        const connections = await binUtils.retryAuthentication(async (auth) => {
          const connections =
            await pkClient.rpcClient.methods.nodesListConnections({
              metadata: auth,
            });
          const connectionEntries: Array<NodeConnectionMessage> = [];
          for await (const connection of connections) {
            connectionEntries.push({
              host: connection.host,
              hostname: connection.hostname,
              nodeIdEncoded: connection.nodeIdEncoded,
              port: connection.port,
              timeout: connection.timeout,
              usageCount: connection.usageCount,
              authenticated: connection.authenticated,
            });
          }
          return connectionEntries;
        }, auth);
        if (options.format === 'json') {
          // Wait for outputFormatter to complete and then write to stdout
          const outputFormatted = binUtils.outputFormatter({
            type: 'json',
            data: connections,
          });
          process.stdout.write(outputFormatted);
        } else {
          // Wait for outputFormatter to complete and then write to stdout
          const outputFormatted = binUtils.outputFormatter({
            type: 'table',
            data: connections,
            options: {
              columns: [
                'host',
                'hostname',
                'nodeIdEncoded',
                'port',
                'timeout',
                'usageCount',
                'authenticated',
              ],
              includeHeaders: true,
            },
          });
          process.stdout.write(outputFormatted);
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandAdd;
