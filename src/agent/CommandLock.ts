import path from 'path';
import config from 'polykey/dist/config';
import CommandPolykey from '../CommandPolykey';

class CommandLock extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('lock');
    this.description('Lock the Client and Clear the Existing Token');
    this.action(async (options) => {
      const { default: Session } = await import(
        'polykey/dist/sessions/Session'
      );
      const session = new Session({
        sessionTokenPath: path.join(
          options.nodePath,
          config.defaults.tokenBase,
        ),
        fs: this.fs,
        logger: this.logger.getChild(Session.name),
      });
      // Destroy local session
      await session.destroy();
    });
  }
}

export default CommandLock;
