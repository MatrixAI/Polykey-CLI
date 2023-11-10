import type PolykeyClient from 'polykey/dist/PolykeyClient';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';

class CommandScan extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('scan');
    this.description('Scans a node to reveal their shared vaults');
    this.argument('<nodeId>', 'Id of the node to scan');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (nodeId, options) => {
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
            permissions: Array<string> | string;
          }> = [];
          const stream = await pkClient.rpcClient.methods.vaultsScan({
            metadata: auth,
            nodeIdEncoded: nodeId,
          });
          for await (const vault of stream) {
            data.push({
              vaultName: vault.vaultName,
              vaultIdEncoded: vault.vaultIdEncoded,
              permissions:
                options.format === 'json'
                  ? vault.permissions
                  : vault.permissions.join(','),
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

export default CommandScan;
