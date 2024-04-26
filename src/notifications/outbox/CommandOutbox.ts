import CommandClear from './CommandClear';
import CommandRead from './CommandRead';
import CommandPolykey from '../../CommandPolykey';

class CommandOutbox extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('outbox');
    this.description('Notifications Outbox Operations');
    this.addCommand(new CommandClear(...args));
    this.addCommand(new CommandRead(...args));
  }
}

export default CommandOutbox;
