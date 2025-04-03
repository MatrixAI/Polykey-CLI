import type PolykeyClient from 'polykey/PolykeyClient.js';
import * as notificationsUtils from 'polykey/notifications/utils.js';
import CommandPolykey from '../../CommandPolykey.js';
import * as binUtils from '../../utils/index.js';
import * as binOptions from '../../utils/options.js';
import * as binProcessors from '../../utils/processors.js';
import * as binParsers from '../../utils/parsers.js';

class CommandRemove extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('remove');
    this.description('Remove a Notification in the Inbox');
    this.argument(
      '<notificationId>',
      'Id of the notification to remove',
      binParsers.parseNotificationId,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (notificationId, options) => {
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
            pkClient.rpcClient.methods.notificationsInboxRemove({
              notificationIdEncoded:
                notificationsUtils.encodeNotificationId(notificationId),
              metadata: auth,
            }),
          auth,
        );
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandRemove;
