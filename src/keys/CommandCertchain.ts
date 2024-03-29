import type PolykeyClient from 'polykey/dist/PolykeyClient';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';

class CommandsCertchain extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('certchain');
    this.description('Get the Root Certificate Chain');
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
        const data = await binUtils.retryAuthentication(async (auth) => {
          const data: Array<{ cert: string }> = [];
          const stream = await pkClient.rpcClient.methods.keysCertsChainGet({
            metadata: auth,
          });
          for await (const certchainGetMessage of stream) {
            data.push({ cert: certchainGetMessage.cert });
          }
          return data;
        }, auth);
        if (options.format === 'json') {
          process.stdout.write(
            binUtils.outputFormatter({
              type: 'json',
              data: data,
            }),
          );
        } else {
          process.stdout.write(
            binUtils.outputFormatter({
              type: 'list',
              data: data.map((certchainGetMessage) => certchainGetMessage.cert),
            }),
          );
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandsCertchain;
