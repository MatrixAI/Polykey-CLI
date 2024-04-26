import type PolykeyClient from 'polykey/dist/PolykeyClient';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';
import * as binUtils from '../utils';
import CommandPolykey from '../CommandPolykey';

class CommandIdentities extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('audit');
    this.description('Displays audit event history');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.addOption(binOptions.seekStart);
    this.addOption(binOptions.seekEnd);
    this.addOption(binOptions.follow);
    this.addOption(binOptions.events);
    this.addOption(binOptions.limit);
    this.addOption(binOptions.order);
    this.action(async (options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
      );
      const auditUtils = await import('polykey/dist/audit/utils');
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
            const awaitFutureEvents = options.follow;
            const readableStream =
              await pkClient.rpcClient.methods.auditEventsGet({
                awaitFutureEvents,
                paths: auditUtils.filterSubPaths(options.events ?? [[]]),
                seek,
                seekEnd,
                order,
                limit,
                metadata: auth,
              });
            // Tracks vertices that are relevant to our current search
            for await (const result of readableStream) {
              const sanitizedResult = {
                id: result.id,
                path: result.path.join('.'),
                data: result.data,
              };
              if (options.format === 'json') {
                process.stdout.write(
                  binUtils.outputFormatter({
                    type: 'json',
                    data: sanitizedResult,
                  }),
                );
              } else {
                process.stdout.write(
                  binUtils.outputFormatter({
                    type: 'dict',
                    data: { '>': sanitizedResult },
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

export default CommandIdentities;
