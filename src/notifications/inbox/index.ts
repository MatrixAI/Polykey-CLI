import CommandClear from './CommandClear.js';
import CommandRead from './CommandRead.js';
import CommandRemove from './CommandRemove.js';
import CommandPolykey from '../../CommandPolykey.js';

class CommandInbox extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('inbox');
    this.description('Notifications Inbox Operations');
    this.addCommand(new CommandClear(...args));
    this.addCommand(new CommandRead(...args));
    this.addCommand(new CommandRemove(...args));
  }
}

export default CommandInbox;
