import CommandInbox from './inbox/index.js';
import CommandOutbox from './outbox/index.js';
import CommandSend from './CommandSend.js';
import CommandPolykey from '../CommandPolykey.js';

class CommandNotifications extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('notifications');
    this.description('Notifications Operations');
    this.addCommand(new CommandInbox(...args));
    this.addCommand(new CommandOutbox(...args));
    this.addCommand(new CommandSend(...args));
  }
}

export default CommandNotifications;
