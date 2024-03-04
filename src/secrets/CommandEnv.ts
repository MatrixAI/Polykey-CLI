import type PolykeyClient from 'polykey/dist/PolykeyClient';
import path from 'path';
import os from 'os';
import * as utils from 'polykey/dist/utils';
import * as binProcessors from '../utils/processors';
import * as binUtils from '../utils';
import * as binErrors from '../errors';
import CommandPolykey from '../CommandPolykey';
import * as binOptions from '../utils/options';

const description = `
Run a command with the given secrets and env variables. If no command is specified then the variables are printed to stdout in the format specified by env-format.

When selecting secrets with --env secrets with invalid names can be selected. By default when these are encountered then the command will throw an error. This behaviour can be modified with '--env-invalid'. the invalid name can be silently dropped with 'ignore' or logged out with 'warn'

Duplicate secret names can be specified, by default with 'overwrite' the env variable will be overwritten with the latest found secret of that name. It can be specified to 'keep' the first found secret of that name, 'error' to throw if there is a duplicate and 'warn' to log a warning while overwriting.
`;

const helpText = `
This command has two main ways of functioning. Executing a provided command or outputting formatted env variables to] stdout.

Running the command with 'polykey secrets env --env vault:secret -- some command' will do process replacement to run 'some command' while providing environment variables selected by '-e' to that process. Note that process replacement is only supported on unix systems such as linux or macos. When running on windows a child process will be used.

Running the command with 'polykey secrets env --env vault:secret --env-format <format>' will output the environment variables to stdout with the given <format>. The following formats are supported, 'auto', 'json', 'unix', 'cmd' and 'powershell'.

'auto' will automatically detect the current platform and select the appropriate format. This is 'unix' for unix based systems and 'cmd' for windows.

'json' Will format the environment variables as a json object in the form {'key': 'value'}.

'unix' Will format the environment variables as a '.env' file for use on unix systems. It will include comments before each variable showing the secret path used for that variable.

'cmd' Will format the environment variables as a '.bat' file for use on windows cmd. It will include comments before each variable showing the secret path used for that variable.

'powershell' Will format the environment variables as a '.ps1' file for use on windows Powershell. It will include comments before each variable showing the secret path used for that variable.
`;

class CommandEnv extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('env');
    this.description(description);
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.addOption(binOptions.envVariables);
    this.addOption(binOptions.envFormat);
    this.addOption(binOptions.envInvalid);
    this.addOption(binOptions.envDuplicate);
    this.argument('[cmd] [argv...]', 'command and arguments');
    this.addHelpText('after', helpText);
    this.action(async (args: Array<string>, options) => {
      const [cmd, ...argv] = args;
      const {
        env: envVariables,
        envInvalid,
        envDuplicate,
        envFormat,
      }: {
        env: Array<[string, string, string?]>;
        envInvalid: 'error' | 'warn' | 'ignore';
        envDuplicate: 'keep' | 'overwrite' | 'warn' | 'error';
        envFormat: 'auto' | 'unix' | 'cmd' | 'powershell' | 'json';
      } = options;

      // There are a few stages here
      // 1. parse the desired secrets
      // 2. obtain the desired secrets
      // 3. switching behaviour here based on parameters
      //   a. exec the command with the provided env variables from the secrets
      //   b. output the env variables in the desired format

      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
      );
      const clientOptions = await binProcessors.processClientOptions(
        options.nodePath,
        options.nodeId,
        options.clientHost,
        options.clientPort,
        this.fs,
        this.logger.getChild(binProcessors.processClientOptions.name),
      );
      const meta = await binProcessors.processAuthentication(
        options.passwordFile,
        this.fs,
      );

      let pkClient: PolykeyClient;
      this.exitHandlers.handlers.push(async () => {
        if (pkClient != null) await pkClient.stop();
      });
      try {
        pkClient = await PolykeyClient.createPolykeyClient({
          nodeId: clientOptions.nodeId,
          host: clientOptions.clientHost,
          port: clientOptions.clientPort,
          options: {
            nodePath: options.nodePath,
          },
          logger: this.logger.getChild(PolykeyClient.name),
        });

        // Getting envs
        const [envp, envpPath] = await binUtils.retryAuthentication(
          async (auth) => {
            const responseStream =
              await pkClient.rpcClient.methods.vaultsSecretsEnv();
            // Writing desired secrets
            const secretRenameMap = new Map<string, string | undefined>();
            const writeP = (async () => {
              const writer = responseStream.writable.getWriter();
              let first = true;
              for (const envVariable of envVariables) {
                const [nameOrId, secretName, secretNameNew] = envVariable;
                secretRenameMap.set(secretName, secretNameNew);
                await writer.write({
                  nameOrId,
                  secretName,
                  metadata: first ? auth : undefined,
                });
                first = false;
              }
              await writer.close();
            })();

            const envp: Record<string, string> = {};
            const envpPath: Record<
              string,
              {
                nameOrId: string;
                secretName: string;
              }
            > = {};
            for await (const value of responseStream.readable) {
              const { nameOrId, secretName, secretContent } = value;
              let newName = secretRenameMap.get(secretName);
              if (newName == null) {
                const secretEnvName = path.basename(secretName);
                // Validating name
                if (!binUtils.validEnvRegex.test(secretEnvName)) {
                  switch (envInvalid) {
                    case 'error':
                      throw new binErrors.ErrorPolykeyCLIInvalidEnvName(
                        `The following env variable name (${secretEnvName}) is invalid`,
                      );
                    case 'warn':
                      this.logger.warn(
                        `The following env variable name (${secretEnvName}) is invalid and was dropped`,
                      );
                    // Fallthrough
                    case 'ignore':
                      continue;
                    default:
                      utils.never();
                  }
                }
                newName = secretEnvName;
              }
              // Handling duplicate names
              if (envp[newName] != null) {
                switch (envDuplicate) {
                  // Continue without modifying
                  case 'error':
                    throw new binErrors.ErrorPolykeyCLIDuplicateEnvName(
                      `The env variable (${newName}) is duplicate`,
                    );
                  // Fallthrough
                  case 'keep':
                    continue;
                  // Log a warning and overwrite
                  case 'warn':
                    this.logger.warn(
                      `The env variable (${newName}) is duplicate, overwriting`,
                    );
                  // Fallthrough
                  case 'overwrite':
                    break;
                  default:
                    utils.never();
                }
              }
              envp[newName] = secretContent;
              envpPath[newName] = {
                nameOrId,
                secretName,
              };
            }
            await writeP;
            return [envp, envpPath];
          },
          meta,
        );
        // End connection early to avoid errors on server
        await pkClient.stop();

        // Here we want to switch between the different usages
        const platform = os.platform();
        if (cmd != null) {
          // If a cmd is| provided then we default to exec it
          switch (platform) {
            case 'linux':
            // Fallthrough
            case 'darwin':
              {
                const { exec } = await import('@matrixai/exec');
                exec.execvp(cmd, argv, envp);
              }
              break;
            default: {
              const { spawnSync } = await import('child_process');
              const result = spawnSync(cmd, argv, {
                env: {
                  ...process.env,
                  ...envp,
                },
                shell: false,
                windowsHide: true,
                stdio: 'inherit',
              });
              process.exit(result.status ?? 255);
            }
          }
        } else {
          // Otherwise we switch between output formats
          // If set to `auto` then we need to infer the format
          let format = envFormat;
          if (envFormat === 'auto') {
            format =
              {
                darwin: 'unix',
                linux: 'unix',
                win32: 'cmd',
              }[platform] ?? 'unix';
          }
          switch (format) {
            case 'unix':
              {
                // Formatting as a .env file
                let data = '';
                for (const [key, value] of Object.entries(envp)) {
                  data += `# ${envpPath[key].nameOrId}:${envpPath[key].secretName}\n`;
                  data += `${key}="${value}"\n`;
                }
                process.stdout.write(
                  binUtils.outputFormatter({
                    type: 'raw',
                    data,
                  }),
                );
              }
              break;
            case 'cmd':
              {
                // Formatting as a .bat file for windows cmd
                let data = '';
                for (const [key, value] of Object.entries(envp)) {
                  data += `REM ${envpPath[key].nameOrId}:${envpPath[key].secretName}\n`;
                  data += `set "${key}=${value}"\n`;
                }
                process.stdout.write(
                  binUtils.outputFormatter({
                    type: 'raw',
                    data,
                  }),
                );
              }
              break;
            case 'powershell':
              {
                // Formatting as a .bat file for windows cmd
                let data = '';
                for (const [key, value] of Object.entries(envp)) {
                  data += `# ${envpPath[key].nameOrId}:${envpPath[key].secretName}\n`;
                  data += `\$env:${key} = '${value}'\n`;
                }
                process.stdout.write(
                  binUtils.outputFormatter({
                    type: 'raw',
                    data,
                  }),
                );
              }
              break;
            case 'json':
              {
                const data = {};
                for (const [key, value] of Object.entries(envp)) {
                  data[key] = value;
                }
                process.stdout.write(
                  binUtils.outputFormatter({
                    type: 'json',
                    data: data,
                  }),
                );
              }
              break;
            default:
              utils.never();
          }
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandEnv;
