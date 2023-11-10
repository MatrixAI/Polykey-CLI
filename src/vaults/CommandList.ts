import type PolykeyClient from 'polykey/dist/PolykeyClient';
import process from 'process';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';

class CommandList extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('list');
    this.description('List all Available Vaults');
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
      const meta = await binProcessors.processAuthentication(
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
          const data: Array<{
            vaultName: string;
            vaultIdEncoded: string;
          }> = [];
          const stream = await pkClient.rpcClient.methods.vaultsList({
            metadata: auth,
          });
          for await (const vaultListMessage of stream) {
            data.push({
              vaultName: vaultListMessage.vaultName,
              vaultIdEncoded: vaultListMessage.vaultIdEncoded,
            });
          }
          return data;
        }, meta);
        let outputFormatted: string | Uint8Array;
        if (options.format === 'json') {
          outputFormatted = binUtils.outputFormatter({
            type: 'json',
            data: data,
          });
        } else {
          outputFormatted = binUtils.outputFormatter({
            type: 'table',
            data: data,
            options: {
              includeHeaders: false,
              includeRowCount: false,
            },
          });
        }
        process.stdout.write(outputFormatted);
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandList;
