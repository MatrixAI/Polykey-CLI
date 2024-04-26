import CommandDiscovery from './CommandDiscovery';
import CommandPolykey from '../CommandPolykey';

class CommandIdentities extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('audit');
    this.description('Auditing');
    this.addCommand(new CommandDiscovery(...args));
  }
}

export default CommandIdentities;
