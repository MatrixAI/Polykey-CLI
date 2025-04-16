import CommandAllow from './CommandAllow.js';
import CommandAuthenticate from './CommandAuthenticate.js';
import CommandAuthenticated from './CommandAuthenticated.js';
import CommandClaim from './CommandClaim.js';
import CommandDisallow from './CommandDisallow.js';
import CommandDiscover from './CommandDiscover.js';
import CommandGet from './CommandGet.js';
import CommandList from './CommandList.js';
import CommandPermissions from './CommandPermissions.js';
import CommandQueue from './CommandQueue.js';
import CommandSearch from './CommandSearch.js';
import CommandTrust from './CommandTrust.js';
import CommandUntrust from './CommandUntrust.js';
import CommandInvite from './CommandInvite.js';
import CommandPolykey from '../CommandPolykey.js';

class CommandIdentities extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('identities');
    this.description('Identities Operations');
    this.addCommand(new CommandAllow(...args));
    this.addCommand(new CommandAuthenticate(...args));
    this.addCommand(new CommandAuthenticated(...args));
    this.addCommand(new CommandClaim(...args));
    this.addCommand(new CommandDisallow(...args));
    this.addCommand(new CommandDiscover(...args));
    this.addCommand(new CommandGet(...args));
    this.addCommand(new CommandList(...args));
    this.addCommand(new CommandPermissions(...args));
    this.addCommand(new CommandQueue(...args));
    this.addCommand(new CommandSearch(...args));
    this.addCommand(new CommandTrust(...args));
    this.addCommand(new CommandUntrust(...args));
    this.addCommand(new CommandInvite(...args));
  }
}

export default CommandIdentities;
