import CommandCreate from './CommandCreate';
import CommandCat from './CommandCat';
import CommandDir from './CommandDir';
import CommandEdit from './CommandEdit';
import CommandEnv from './CommandEnv';
import CommandList from './CommandList';
import CommandMkdir from './CommandMkdir';
import CommandRename from './CommandRename';
import CommandRemove from './CommandRemove';
import CommandStat from './CommandStat';
import CommandWrite from './CommandWrite';
import CommandPolykey from '../CommandPolykey';

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
    this.addCommand(new CommandWrite(...args));
  }
}

export default CommandSecrets;
