import path from 'node:path';
import config from 'polykey/config.js';
import CommandPolykey from '../CommandPolykey.js';

class CommandLock extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('lock');
    this.description('Lock the Client and Clear the Existing Token');
    this.action(async (options) => {
      const { default: Session } = await import('polykey/sessions/Session.js');
      const session = new Session({
        sessionTokenPath: path.join(options.nodePath, config.paths.tokenBase),
        fs: this.fs,
        logger: this.logger.getChild(Session.name),
      });
      // Destroy local session
      await session.destroy();
    });
  }
}

export default CommandLock;
