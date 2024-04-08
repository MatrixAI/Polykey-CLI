import process from 'process';
import fs from 'fs';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';

class CommandBootstrap extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('bootstrap');
    this.description('Bootstrap Keynode State');
    this.addOption(binOptions.recoveryCodeFile);
    this.addOption(binOptions.recoveryCodeOutFile);
    this.addOption(binOptions.fresh);
    this.addOption(binOptions.privateKeyFile);
    this.addOption(binOptions.passwordOpsLimit);
    this.addOption(binOptions.passwordMemLimit);
    this.action(async (options) => {
      const bootstrapUtils = await import('polykey/dist/bootstrap/utils');
      const keysUtils = await import('polykey/dist/keys/utils');
      const password = await binProcessors.processNewPassword(
        options.passwordFile,
        this.fs,
      );
      const recoveryCodeIn = await binProcessors.processRecoveryCode(
        options.recoveryCodeFile,
        this.fs,
      );
      const recoveryCodeOut = await bootstrapUtils.bootstrapState({
        password,
        nodePath: options.nodePath,
        recoveryCode: recoveryCodeIn,
        privateKeyPath: options.privateKeyFile,
        passwordOpsLimit: keysUtils.passwordOpsLimits[options.passwordOpsLimit],
        passwordMemLimit: keysUtils.passwordMemLimits[options.passwordMemLimit],
        fresh: options.fresh,
        fs: this.fs,
        logger: this.logger,
      });
      this.logger.info(`Bootstrapped ${options.nodePath}`);

      if (options.recoveryCodeOutFile == null) {
        process.stdout.write(
          binUtils.outputFormatter({
            type: options.format === 'json' ? 'json' : 'dict',
            data: {
              recoveryCode: recoveryCodeOut,
            },
          }),
        );
      } else if (recoveryCodeOut != null) {
        await fs.promises.writeFile(
          options.recoveryCodeOutFile,
          recoveryCodeOut,
        );
      }
    });
  }
}

export default CommandBootstrap;
