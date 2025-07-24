import CommandAdd from './CommandAdd.js';
import CommandClaim from './CommandClaim.js';
import CommandFind from './CommandFind.js';
import CommandJoin from './CommandJoin.js';
import CommandPing from './CommandPing.js';
import CommandGetAll from './CommandGetAll.js';
import CommandConnections from './CommandConnections.js';
import CommandPolykey from '../CommandPolykey.js';

class CommandNodes extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('nodes');
    this.description('Nodes Operations');
    this.addCommand(new CommandAdd(...args));
    this.addCommand(new CommandClaim(...args));
    this.addCommand(new CommandFind(...args));
    this.addCommand(new CommandJoin(...args));
    this.addCommand(new CommandPing(...args));
    this.addCommand(new CommandGetAll(...args));
    this.addCommand(new CommandConnections(...args));
  }
}

export default CommandNodes;
