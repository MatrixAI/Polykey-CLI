import type PolykeyClient from 'polykey/PolykeyClient.js';
import CommandPolykey from '../CommandPolykey.js';
import * as binUtils from '../utils/index.js';
import * as binOptions from '../utils/options.js';
import * as binProcessors from '../utils/processors.js';
import * as errors from '../errors.js';

class CommandJoin extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('join');
    this.description('Join a network');
    this.argument('<network>', 'Name of the network to join');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (network: string, options) => {
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
        await binUtils.retryAuthentication(
          (auth) =>
            pkClient.rpcClient.methods.nodesSyncGraph({
              network,
              metadata: auth,
            }),
          auth,
        );
        process.stdout.write(`Switched to network ${network}`);
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandJoin;
