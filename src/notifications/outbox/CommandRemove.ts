import type PolykeyClient from 'polykey/dist/PolykeyClient';
import * as notificationsUtils from 'polykey/dist/notifications/utils';
import CommandPolykey from '../../CommandPolykey';
import * as binUtils from '../../utils';
import * as binOptions from '../../utils/options';
import * as binProcessors from '../../utils/processors';
import * as binParsers from '../../utils/parsers';

class CommandRemove extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('remove');
    this.description('Remove a Pending Notification to be Sent in the Outbox');
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
        await binUtils.retryAuthentication(
          (auth) =>
            pkClient.rpcClient.methods.notificationsOutboxRemove({
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
