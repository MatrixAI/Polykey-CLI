import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { StatusResultMessage } from 'polykey/dist/client/types';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';

class CommandStatus extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('status');
    this.description('Get the Status of the Polykey Agent');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
      );
      const clientStatus = await binProcessors.processClientStatus(
        options.nodePath,
        options.nodeId,
        options.clientHost,
        options.clientPort,
        this.fs,
        this.logger.getChild(binProcessors.processClientOptions.name),
      );
      const statusInfo = clientStatus.statusInfo;
      // If status is not LIVE, we return what we have in the status info
      // If status is LIVE, then we connect and acquire agent information
      if (statusInfo != null && statusInfo?.status !== 'LIVE') {
        process.stdout.write(
          binUtils.outputFormatter({
            type: options.format === 'json' ? 'json' : 'dict',
            data: {
              status: statusInfo.status,
              ...statusInfo.data,
            },
          }),
        );
      } else {
        const auth = await binProcessors.processAuthentication(
          options.passwordFile,
          this.fs,
        );
        let pkClient: PolykeyClient;
        this.exitHandlers.handlers.push(async () => {
          if (pkClient != null) await pkClient.stop();
        });
        let response: StatusResultMessage;
        let output: Array<any> = [];
        let data: Array<any> = [];
        let lenActive: number;
        let lenVaults: number;

        try {
          pkClient = await PolykeyClient.createPolykeyClient({
            nodeId: clientStatus.nodeId!,
            host: clientStatus.clientHost!,
            port: clientStatus.clientPort!,
            options: {
              nodePath: options.nodePath,
            },
            logger: this.logger.getChild(PolykeyClient.name),
          });
          response = await binUtils.retryAuthentication(
            (auth) =>
              pkClient.rpcClient.methods.agentStatus({
                metadata: auth,
              }),
            auth,
          );
          const result = await binUtils.retryAuthentication(
            (auth) =>
              pkClient.rpcClient.methods.nodesGetAll({
                metadata: auth,
              }),
            auth,
          );
          for await (const nodesGetMessage of result) {
            output.push(1);
          }
          lenActive = output.length;
          const stream = await pkClient.rpcClient.methods.vaultsList({
            metadata: auth,
          });
          for await (const vaultListMessage of stream) {
            data.push(1);
          }
          lenVaults = data.length;
        } finally {
          if (pkClient! != null) await pkClient.stop();
        }
        process.stdout.write(
          binUtils.outputFormatter({
            type: options.format === 'json' ? 'json' : 'dict',
            data: {
              status: 'LIVE',
              pid: response.pid,
              nodeId: response.nodeIdEncoded,
              clientHost: response.clientHost,
              clientPort: response.clientPort,
              agentHost: response.agentHost,
              agentPort: response.agentPort,
              numberActiveConnections: lenActive,
              vaultsMade: lenVaults,
            },
          }),
        );
      }
    });
  }
}

export default CommandStatus;
