import type PolykeyClient from 'polykey/PolykeyClient.js';
import * as binProcessors from '../utils/processors.js';
import * as binUtils from '../utils/index.js';
import CommandPolykey from '../CommandPolykey.js';
import * as binOptions from '../utils/options.js';
import * as binParsers from '../utils/parsers.js';

class CommandPermissions extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('permissions');
    this.alias('perms');
    this.description('Sets the permissions of a vault for Node Ids');
    this.argument('<vaultName', 'Name of the vault', binParsers.parseVaultName);
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (vaultName, options) => {
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
        const data: Array<{
          vaultIdEncoded: string;
          nodeIdEncoded: string;
          vaultPermissionList: Array<string>;
        }> = [];
        await binUtils.retryAuthentication(async (auth) => {
          const permissionStream =
            await pkClient.rpcClient.methods.vaultsPermissionGet({
              metadata: auth,
              nameOrId: vaultName,
            });
          for await (const permission of permissionStream) {
            data.push({
              vaultIdEncoded: permission.vaultIdEncoded,
              nodeIdEncoded: permission.nodeIdEncoded,
              vaultPermissionList: permission.vaultPermissionList,
            });
          }
          return true;
        }, meta);

        if (data.length === 0) {
          process.stderr.write('No permissions were found\n');
        }
        if (options.format === 'json') {
          process.stdout.write(
            binUtils.outputFormatter({
              type: 'json',
              data: data,
            }),
          );
        } else {
          let head = true;
          for (const permission of data) {
            permission.vaultPermissionList =
              permission.vaultPermissionList.join(',') as any;
            if (!head) process.stdout.write('\n');
            head = false;
            process.stdout.write(
              binUtils.outputFormatter({
                type: 'dict',
                data: permission,
              }),
            );
          }
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandPermissions;
