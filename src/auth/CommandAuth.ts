import CommandLogin from './CommandLogin.js';
import CommandPolykey from '../CommandPolykey.js';

class CommandAuth extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('auth');
    this.description('Authentication operations');
    this.addCommand(new CommandLogin(...args));
  }
}

export default CommandAuth;
