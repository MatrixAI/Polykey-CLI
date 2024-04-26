import CommandInbox from './inbox';
import CommandOutbox from './outbox';
import CommandSend from './CommandSend';
import CommandPolykey from '../CommandPolykey';

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
