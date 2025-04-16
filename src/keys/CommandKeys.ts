import CommandCert from './CommandCert.js';
import CommandCertchain from './CommandCertchain.js';
import CommandDecrypt from './CommandDecrypt.js';
import CommandEncrypt from './CommandEncrypt.js';
import CommandPassword from './CommandPassword.js';
import CommandRenew from './CommandRenew.js';
import CommandReset from './CommandReset.js';
import CommandPublic from './CommandPublic.js';
import CommandPrivate from './CommandPrivate.js';
import CommandKeypair from './CommandPair.js';
import CommandSign from './CommandSign.js';
import CommandVerify from './CommandVerify.js';
import CommandPolykey from '../CommandPolykey.js';

class CommandKeys extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('keys');
    this.description('Keys Operations');
    this.addCommand(new CommandCert(...args));
    this.addCommand(new CommandCertchain(...args));
    this.addCommand(new CommandDecrypt(...args));
    this.addCommand(new CommandEncrypt(...args));
    this.addCommand(new CommandPassword(...args));
    this.addCommand(new CommandRenew(...args));
    this.addCommand(new CommandReset(...args));
    this.addCommand(new CommandPublic(...args));
    this.addCommand(new CommandPrivate(...args));
    this.addCommand(new CommandKeypair(...args));
    this.addCommand(new CommandSign(...args));
    this.addCommand(new CommandVerify(...args));
  }
}

export default CommandKeys;
