import type PolykeyClient from 'polykey/dist/PolykeyClient';
import path from 'path';
import config from 'polykey/dist/config';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';

class CommandLockAll extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('lockall');
    this.description('Lock all Clients and Clear the Existing Token');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
      );
      const { default: Session } = await import(
        'polykey/dist/sessions/Session'
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
      const session = new Session({
        sessionTokenPath: path.join(options.nodePath, config.paths.tokenBase),
        fs: this.fs,
        logger: this.logger.getChild(Session.name),
      });
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
            pkClient.rpcClient.methods.agentLockAll({
              metadata: auth,
            }),
          auth,
        );
        // Destroy local session
        await session.destroy();
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandLockAll;
