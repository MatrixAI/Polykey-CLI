import type PolykeyClient from 'polykey/dist/PolykeyClient';
import path from 'path';
import os from 'os';
import * as utils from 'polykey/dist/utils';
import * as binProcessors from '../utils/processors';
import * as binUtils from '../utils';
import * as binErrors from '../errors';
import CommandPolykey from '../CommandPolykey';
import * as binOptions from '../utils/options';
import * as binParsers from '../utils/parsers';

class CommandEnv extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('env');
    this.description(
      `Run a command with the given secrets and env variables using process replacement. If no command is specified then the variables are printed to stdout in the format specified by env-format.`,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.addOption(binOptions.envFormat);
    this.addOption(binOptions.envInvalid);
    this.addOption(binOptions.envDuplicate);
    this.argument(
      '<args...>',
      'command and arguments formatted as [envPaths...][-- cmd [cmdArgs...]]',
      binParsers.parseEnvArgs,
    );
    this.passThroughOptions(); // Let -- pass through as-is to parse as delimiter for cmd
    this.action(
      async (
        args: [Array<[string, string?, string?]>, Array<string>],
        options,
      ) => {
        args[1].shift();
        const { default: PolykeyClient } = await import(
          'polykey/dist/PolykeyClient'
        );
        const {
          envInvalid,
          envDuplicate,
          envFormat,
        }: {
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

        const [envVariables, [cmd, ...argv]] = args;
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
          const [envp] = await binUtils.retryAuthentication(async (auth) => {
            const responseStream =
              await pkClient.rpcClient.methods.vaultsSecretsEnv();
            // Writing desired secrets
            const secretRenameMap = new Map<string, string | undefined>();
            const writeP = (async () => {
              const writer = responseStream.writable.getWriter();
              let first = true;
              for (const envVariable of envVariables) {
                const [nameOrId, secretName, secretNameNew] = envVariable;
                secretRenameMap.set(secretName ?? '/', secretNameNew);
                await writer.write({
                  nameOrId: nameOrId,
                  secretName: secretName ?? '/',
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
          }, meta);
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
                    data += `${key}='${value}'\n`;
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
      },
    );
  }
}

export default CommandEnv;
