import type { Notification } from 'polykey/notifications/types.js';
import type PolykeyClient from 'polykey/PolykeyClient.js';
import CommandPolykey from '../../CommandPolykey.js';
import * as binUtils from '../../utils/index.js';
import * as binOptions from '../../utils/options.js';
import * as binProcessors from '../../utils/processors.js';

class CommandRead extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('read');
    this.description('Display Inbox Notifications');
    this.option(
      '-u, --unread',
      '(optional) Flag to only display unread notifications',
    );
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
        'polykey/PolykeyClient.js'
      );
      const notificationsUtils = await import('polykey/notifications/utils.js');
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
              await pkClient.rpcClient.methods.notificationsInboxRead({
                metadata: auth,
                unread: options.unread,
                limit: parseInt(options.limit),
                order: options.order === 'newest' ? 'desc' : 'asc',
              });
            const notificationReadMessages: Array<{
              notification: Notification;
            }> = [];
            for await (const notificationMessage of response) {
              const notification = notificationsUtils.parseNotification(
                notificationMessage.notification,
              );
              notificationReadMessages.push({ notification });
            }
            return notificationReadMessages;
          },
          meta,
        );
        if (notificationReadMessages.length === 0) {
          process.stderr.write('No notifications received\n');
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
                  notificiation: notificationReadMessage.notification,
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
