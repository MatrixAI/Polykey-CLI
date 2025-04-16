import process from 'node:process';
import fs from 'node:fs';
import CommandPolykey from '../CommandPolykey.js';
import * as binUtils from '../utils/index.js';
import * as binOptions from '../utils/options.js';
import * as binProcessors from '../utils/processors.js';

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
      const bootstrapUtils = await import('polykey/bootstrap/utils.js');
      const keysUtils = await import('polykey/keys/utils/index.js');
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
