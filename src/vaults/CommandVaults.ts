import CommandClone from './CommandClone.js';
import CommandCreate from './CommandCreate.js';
import CommandList from './CommandList.js';
import CommandLog from './CommandLog.js';
import CommandScan from './CommandScan.js';
import CommandPermissions from './CommandPermissions.js';
import CommandPull from './CommandPull.js';
import CommandRemove from './CommandRemove.js';
import CommandRename from './CommandRename.js';
import CommandShare from './CommandShare.js';
import CommandUnshare from './CommandUnshare.js';
import CommandVersion from './CommandVersion.js';
import CommandPolykey from '../CommandPolykey.js';

class CommandVaults extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('vaults');
    this.description('Vaults Operations');
    this.addCommand(new CommandClone(...args));
    this.addCommand(new CommandCreate(...args));
    this.addCommand(new CommandList(...args));
    this.addCommand(new CommandLog(...args));
    this.addCommand(new CommandPermissions(...args));
    this.addCommand(new CommandPull(...args));
    this.addCommand(new CommandRemove(...args));
    this.addCommand(new CommandRename(...args));
    this.addCommand(new CommandShare(...args));
    this.addCommand(new CommandUnshare(...args));
    this.addCommand(new CommandVersion(...args));
    this.addCommand(new CommandScan(...args));
  }
}

export default CommandVaults;
