import type PolykeyClient from 'polykey/dist/PolykeyClient';
import CommandPolykey from '../CommandPolykey';
import * as binOptions from '../utils/options';
import * as binUtils from '../utils';
import * as binProcessors from '../utils/processors';

class CommandDiscover extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('discovery');
    this.description('Displays discovery event history');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.addOption(binOptions.seekStart);
    this.addOption(binOptions.seekEnd);
    this.addOption(binOptions.futureEvents);
    this.addOption(binOptions.discoveryEvents);
    this.addOption(binOptions.limit);
    this.addOption(binOptions.order);
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
        // Creating an infinite timer to hold the process open
        const holdOpenTimer = setTimeout(() => {}, 2 ** 30);
        // We set up the readable stream watching the discovery events here
        await binUtils
          .retryAuthentication(async (auth) => {
            const seek: number = options.seekStart;
            const seekEnd: number | undefined = options.seekEnd;
            const order: 'asc' | 'desc' = options.order;
            const limit: number | undefined = options.limit;
            const events: Array<
              'queued' | 'processed' | 'cancelled' | 'failed'
            > = options.discoveryEvents;
            const awaitFutureEvents = options.futureEvents;
            const readableStream =
              await pkClient.rpcClient.methods.auditEventsGet({
                awaitFutureEvents,
                path: ['discovery', 'vertex'],
                seek,
                seekEnd,
                order,
                limit,
                metadata: auth,
              });
            // Tracks vertices that are relevant to our current search
            for await (const result of readableStream) {
              const event = result.path[2];
              const { vertex } = result.data;
              // Don't emit events we're not filtering for
              if (events != null && !(<Array<string>>events).includes(event)) {
                continue;
              }
              const data = {
                event,
                vertex,
              };
              if (options.format === 'json') {
                process.stdout.write(
                  binUtils.outputFormatter({
                    type: 'json',
                    data,
                  }),
                );
              } else {
                process.stdout.write(
                  binUtils.outputFormatter({
                    type: 'list',
                    data: [
                      `${data.event}${' '.repeat(15 - data.event.length)}${
                        data.vertex
                      }`,
                    ],
                  }),
                );
              }
            }
          }, auth)
          .finally(() => {
            clearTimeout(holdOpenTimer);
          });
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandDiscover;
