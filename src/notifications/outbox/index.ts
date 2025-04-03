import CommandClear from './CommandClear.js';
import CommandRead from './CommandRead.js';
import CommandRemove from './CommandRemove.js';
import CommandPolykey from '../../CommandPolykey.js';

class CommandOutbox extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('outbox');
    this.description('Notifications Outbox Operations');
    this.addCommand(new CommandClear(...args));
    this.addCommand(new CommandRead(...args));
    this.addCommand(new CommandRemove(...args));
  }
}

export default CommandOutbox;
