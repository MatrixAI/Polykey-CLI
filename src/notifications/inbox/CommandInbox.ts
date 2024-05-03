import CommandClear from './CommandClear';
import CommandRead from './CommandRead';
import CommandRemove from './CommandRemove';
import CommandPolykey from '../../CommandPolykey';

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
