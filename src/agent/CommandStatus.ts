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
      const { getUnixtime } = await import('polykey/dist/utils/utils');
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
              upTime: getUnixtime() - response.startTime,
              connectionsActive: response.connectionsActive,
              nodesTotal: response.nodesTotal,
              version: response.version,
              sourceVersion: response.sourceVersion,
              stateVersion: response.stateVersion,
              networkVersion: response.networkVersion,
              ...(options.format === 'json'
                ? { versionMetadata: response.versionMetadata }
                : response.versionMetadata),
            },
          }),
        );
      }
    });
  }
}

export default CommandStatus;
