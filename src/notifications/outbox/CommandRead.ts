import type { Notification } from 'polykey/dist/notifications/types';
import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { NotificationOutboxMessage } from 'polykey/dist/client/types';
import CommandPolykey from '../../CommandPolykey';
import * as binUtils from '../../utils';
import * as binOptions from '../../utils/options';
import * as binProcessors from '../../utils/processors';

class CommandRead extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('read');
    this.description('Display Outbox Notifications');
    this.option(
      '-l, --limit [number]',
      '(optional) Number of notifications to read',
    );
    this.option(
      '-o, --order [order]',
      '(optional) Order to read notifications',
      'newest',
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
      );
      const notificationsUtils = await import(
        'polykey/dist/notifications/utils'
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
        const notificationReadMessages = await binUtils.retryAuthentication(
          async (auth) => {
            const response =
              await pkClient.rpcClient.methods.notificationsOutboxRead({
                metadata: auth,
                limit: parseInt(options.limit),
                order: options.order === 'newest' ? 'desc' : 'asc',
              });
            const notificationReadMessages: Array<{
              notification: Notification;
              taskMetadata: NotificationOutboxMessage['taskMetadata'];
            }> = [];
            for await (const notificationMessage of response) {
              const notification = notificationsUtils.parseNotification(
                notificationMessage.notification,
              );
              notificationReadMessages.push({
                notification,
                taskMetadata: notificationMessage.taskMetadata,
              });
            }
            return notificationReadMessages;
          },
          meta,
        );
        if (notificationReadMessages.length === 0) {
          process.stderr.write('No notifications pending\n');
        }
        if (options.format === 'json') {
          process.stdout.write(
            binUtils.outputFormatter({
              type: 'json',
              data: notificationReadMessages,
            }),
          );
        } else {
          let head = true;
          for (const notificationReadMessage of notificationReadMessages) {
            if (!head) process.stdout.write('\n');
            head = false;
            process.stdout.write(
              binUtils.outputFormatter({
                type: 'dict',
                data: {
                  notification: notificationReadMessage.notification,
                  taskMetadata: notificationReadMessage.taskMetadata,
                },
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

export default CommandRead;
