import type PolykeyClient from 'polykey/dist/PolykeyClient';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';
import * as errors from '../errors';

class CommandStop extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('stop');
    this.description('Stop the Polykey Agent');
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
      if (statusInfo?.status === 'DEAD') {
        process.stderr.write('Agent is already dead\n');
        return;
      } else if (statusInfo?.status === 'STOPPING') {
        process.stderr.write('Agent is already stopping\n');
        return;
      } else if (statusInfo?.status === 'STARTING') {
        throw new errors.ErrorPolykeyCLIAgentStatus('Agent is starting');
      }
      const auth = await binProcessors.processAuthentication(
        options.passwordFile,
        this.fs,
      );
      // Either the statusInfo is undefined or LIVE
      // Either way, the connection parameters now exist
      let pkClient: PolykeyClient;
      this.exitHandlers.handlers.push(async () => {
        if (pkClient != null) await pkClient.stop();
      });
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
        await binUtils.retryAuthentication(
          (auth) =>
            pkClient.rpcClient.methods.agentStop({
              metadata: auth,
            }),
          auth,
        );
        process.stderr.write('Stopping Agent\n');
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandStop;
