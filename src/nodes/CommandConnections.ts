import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { NodeConnectionMessage } from 'polykey/dist/client/types';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils/utils';
import * as binProcessors from '../utils/processors';

class CommandAdd extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('connections');
    this.description('list all active node connections');
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
        // DO things here...
        // Like create the message.
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
            });
          }
          return connectionEntries;
        }, auth);
        if (options.format === 'human') {
          const output: Array<string> = [];

          // Initialize variables to hold the maximum length for each column
          let maxHostStringLength = 'NodeHost'.length;
          let maxUsageCountLength = 'UsageCount'.length;
          let maxTimeoutLength = 'Timeout'.length;

          // Loop through the connections to find the maximum length for each column
          for (const connection of connections) {
            const hostnameString =
              connection.hostname === '' ? '' : `(${connection.hostname})`;
            const hostString = `${connection.nodeIdEncoded}@${connection.host}${hostnameString}:${connection.port}`;
            const usageCount = connection.usageCount.toString();
            const timeout =
              connection.timeout === -1 ? 'NA' : `${connection.timeout}`;

            if (hostString.length > maxHostStringLength) {
              maxHostStringLength = hostString.length;
            }
            if (usageCount.length > maxUsageCountLength) {
              maxUsageCountLength = usageCount.length;
            }
            if (timeout.length > maxTimeoutLength) {
              maxTimeoutLength = timeout.length;
            }
          }

          // Create the header line with proper padding
          const headerLine =
            'NodeHost'.padEnd(maxHostStringLength) +
            '\t' +
            'UsageCount'.padEnd(maxUsageCountLength) +
            '\t' +
            'Timeout'.padEnd(maxTimeoutLength);
          output.push(headerLine);

          // Create the data lines with proper padding
          for (const connection of connections) {
            const hostnameString =
              connection.hostname === '' ? '' : `(${connection.hostname})`;
            const hostString = `${connection.nodeIdEncoded}@${connection.host}${hostnameString}:${connection.port}`;
            const usageCount = connection.usageCount.toString();
            const timeout =
              connection.timeout === -1 ? 'NA' : `${connection.timeout}`;

            const outputLine =
              hostString.padEnd(maxHostStringLength) +
              '\t' +
              usageCount.padEnd(maxUsageCountLength) +
              '\t' +
              timeout.padEnd(maxTimeoutLength);
            output.push(outputLine);
          }
          process.stdout.write(
            binUtils.outputFormatter({
              type: 'list',
              data: output,
            }),
          );
        } else {
          process.stdout.write(
            binUtils.outputFormatter({
              type: 'json',
              data: connections,
            }),
          );
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandAdd;
