import type PolykeyClient from 'polykey/dist/PolykeyClient';
import CommandPolykey from '../CommandPolykey';
import * as binOptions from '../utils/options';
import * as binUtils from '../utils';
import * as binProcessors from '../utils/processors';

class CommandQueue extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('queue');
    this.description('Prints out vertices queued for discovery');
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
        await binUtils.retryAuthentication(async (auth) => {
          const readableStream =
            await pkClient.rpcClient.methods.gestaltsDiscoveryQueue({
              metadata: auth,
            });
          for await (const discoveryQueueInfo of readableStream) {
            const sanitizedData = {
              id: discoveryQueueInfo.id,
              status: discoveryQueueInfo.status,
              parameters: discoveryQueueInfo.parameters,
              delay: discoveryQueueInfo.delay,
              deadline: discoveryQueueInfo.deadline,
              priority: discoveryQueueInfo.priority,
              created: discoveryQueueInfo.created,
              scheduled: discoveryQueueInfo.scheduled,
            };
            if (options.format === 'json') {
              process.stdout.write(
                binUtils.outputFormatter({
                  type: 'json',
                  data: sanitizedData,
                }),
              );
            } else {
              process.stdout.write(
                binUtils.outputFormatter({
                  type: 'dict',
                  data: sanitizedData,
                }),
              );
            }
          }
        }, auth);
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandQueue;
