import CommandLock from './CommandLock.js';
import CommandLockAll from './CommandLockAll.js';
import CommandStart from './CommandStart.js';
import CommandStatus from './CommandStatus.js';
import CommandStop from './CommandStop.js';
import CommandUnlock from './CommandUnlock.js';
import CommandPolykey from '../CommandPolykey.js';

class CommandAgent extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('agent');
    this.description('Agent Operations');
    this.addCommand(new CommandLock(...args));
    this.addCommand(new CommandLockAll(...args));
    this.addCommand(new CommandStart(...args));
    this.addCommand(new CommandStatus(...args));
    this.addCommand(new CommandStop(...args));
    this.addCommand(new CommandUnlock(...args));
  }
}

export default CommandAgent;
