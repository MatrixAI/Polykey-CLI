import CommandCreate from './CommandCreate.js';
import CommandCat from './CommandCat.js';
import CommandDir from './CommandDir.js';
import CommandEdit from './CommandEdit.js';
import CommandEnv from './CommandEnv.js';
import CommandList from './CommandList.js';
import CommandMkdir from './CommandMkdir.js';
import CommandRename from './CommandRename.js';
import CommandRemove from './CommandRemove.js';
import CommandStat from './CommandStat.js';
import CommandTouch from './CommandTouch.js';
import CommandWrite from './CommandWrite.js';
import CommandPolykey from '../CommandPolykey.js';

class CommandSecrets extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('secrets');
    this.description('Secrets Operations');
    this.addCommand(new CommandCreate(...args));
    this.addCommand(new CommandCat(...args));
    this.addCommand(new CommandDir(...args));
    this.addCommand(new CommandEdit(...args));
    this.addCommand(new CommandEnv(...args));
    this.addCommand(new CommandList(...args));
    this.addCommand(new CommandMkdir(...args));
    this.addCommand(new CommandRename(...args));
    this.addCommand(new CommandRemove(...args));
    this.addCommand(new CommandStat(...args));
    this.addCommand(new CommandTouch(...args));
    this.addCommand(new CommandWrite(...args));
  }
}

export default CommandSecrets;
