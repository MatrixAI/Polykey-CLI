import type PolykeyClient from 'polykey/PolykeyClient.js';
import type {
  JSONSchema,
  JSONSchemaInfo,
  ParsedSecretPathValue,
} from '../types.js';
import path from 'node:path';
import os from 'node:os';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { Ajv2019 as Ajv } from 'ajv/dist/2019.js';
import { InvalidArgumentError } from 'commander';
import CommandPolykey from '../CommandPolykey.js';
import * as binProcessors from '../utils/processors.js';
import * as binUtils from '../utils/index.js';
import * as binErrors from '../errors.js';
import * as binOptions from '../utils/options.js';
import * as binParsers from '../utils/parsers.js';

class CommandEnv extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('env');
    this.description(
      `Run a command with the given secrets and env variables. If no command is specified then the variables are printed to stdout in the format specified by env-format.`,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.addOption(binOptions.envFormat);
    this.addOption(binOptions.envInvalid);
    this.addOption(binOptions.envDuplicate);
    this.addOption(binOptions.envExport);
    this.addOption(binOptions.preserveNewline);
    this.addOption(binOptions.egressSchema);
    this.argument(
      '<args...>',
      'command and arguments formatted as <envPaths...> [-- cmd [cmdArgs...]]',
    );
    this.action(async (args, options) => {
      const { default: PolykeyClient } = await import(
        'polykey/PolykeyClient.js'
      );
      const utils = await import('polykey/utils/index.js');
      const {
        envInvalid,
        envDuplicate,
        envFormat,
      }: {
        envInvalid: 'error' | 'warn' | 'ignore';
        envDuplicate: 'keep' | 'overwrite' | 'warn' | 'error';
        envFormat: 'auto' | 'unix' | 'cmd' | 'powershell' | 'json';
      } = options;
      // Populate a set with all the paths we want to preserve newlines for
      const preservedSecrets = new Set<string>();
      for (const [vaultName, secretPath] of options.preserveNewline) {
        // The vault name is guaranteed to have a value.
        // If a secret path is undefined, then the newline preservation was
        // targeting the secrets of the entire vault. Otherwise, the target
        // was a single secret.
        if (secretPath == null) preservedSecrets.add(vaultName);
        else preservedSecrets.add(`${vaultName}:${secretPath}`);
      }

      // There are a few stages here
      // 1. parse the desired secrets
      // 2. obtain the desired secrets
      // 3. switching behaviour here based on parameters
      //   a. exec the command with the provided env variables from the secrets
      //   b. output the env variables in the desired format

      // Emulate commander's parsing to allow for parsing --
      const fullArgs = process.argv;
      const fullSeparatorIndex = fullArgs.indexOf('--');
      const envVariables: Array<ParsedSecretPathValue> = [];
      let cmd: string | undefined;
      let argv: Array<string> = [];
      if (fullSeparatorIndex === -1) {
        // If the separator exists, then treat all args as environment paths
        for (const arg of args) {
          envVariables.push(binParsers.parseSecretPathEnv(arg));
        }
      } else {
        // Otherwise, separate command from environment paths
        const afterSeparatorCount = fullArgs.length - fullSeparatorIndex - 1;
        const cmdIndex = args.length - afterSeparatorCount;
        const rawEnvVariables = args.slice(0, -afterSeparatorCount);
        // Parse environment variables correctly
        for (const arg of rawEnvVariables) {
          envVariables.push(binParsers.parseSecretPathEnv(arg));
        }
        cmd = args[cmdIndex];
        argv = args.slice(cmdIndex + 1);
      }
      if (envVariables.length === 0) {
        this.addHelpText('before', 'You must provide at least 1 secret path');
        this.outputHelp();
        throw new InvalidArgumentError(
          'You must provide at least 1 secret path',
        );
      }
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

        let schema: JSONSchema | undefined = undefined;
        let unwrappedSchema: JSONSchemaInfo | undefined = undefined;
        if (options.egressSchema != null) {
          schema = (await $RefParser.bundle(
            options.egressSchema,
          )) satisfies JSONSchema;
          unwrappedSchema = binUtils.loadSchema(schema!);
        }

        // Getting envs
        const [envp] = await binUtils.retryAuthentication(async (auth) => {
          const responseStream =
            await pkClient.rpcClient.methods.vaultsSecretsEnv();

          // Writing desired secrets
          const secretRenameMap = new Map<string, string | undefined>();
          const writer = responseStream.writable.getWriter();
          let first = true;
          for (const envVariable of envVariables) {
            const [nameOrId, secretName, secretNameNew] = envVariable;
            secretRenameMap.set(secretName ?? '/', secretNameNew);

            // If there is no secret name provided, then attempt to export the
            // secrets from the entire vault. Otherwise, check if the selected
            // secret exists in the schema before requesting it. This will
            // only run if a schema has been specified.
            if (schema != null && unwrappedSchema != null) {
              const { allKeys } = unwrappedSchema;
              if (nameOrId != null && secretName == null) {
                // Only vault specified
                for (const key of allKeys) {
                  // When exporting secrets from a vault, it is impossible to
                  // rename the resulting secrets.
                  await writer.write({
                    nameOrId: nameOrId,
                    secretName: key,
                    metadata: first ? auth : undefined,
                  });
                }
              } else {
                // Individual secret name specified
                const name: string =
                  secretNameNew != null ? secretNameNew : secretName!;
                if (allKeys.includes(name)) {
                  await writer.write({
                    nameOrId: nameOrId,
                    secretName: name,
                    metadata: first ? auth : undefined,
                  });
                }
              }
            } else {
              // No schema specified
              await writer.write({
                nameOrId: nameOrId,
                secretName: secretName ?? '/',
                metadata: first ? auth : undefined,
              });
            }
            first = false;
          }
          await writer.close();

          const envp: Record<string, string> = {};
          const envpPath: Record<
            string,
            {
              nameOrId: string;
              secretName: string;
            }
          > = {};
          for await (const value of responseStream.readable) {
            if (value.type === 'ErrorMessage') {
              switch (value.code) {
                case 'EINVAL':
                  // It is expected for the data to be populated with the offending
                  // vault name if the vault was not found.
                  throw new Error(
                    `TMP Vault "${value.data?.nameOrId}" does not exist`,
                  );
                case 'ENOENT':
                  // If we have a default for this key, then don't bother
                  // reporting the missing key.
                  if (
                    unwrappedSchema != null &&
                    Object.keys(unwrappedSchema.defaults).includes(
                      value.data!.secretName!.toString(),
                    )
                  ) {
                    break;
                  }

                  // It is expected for the data to be populated with the offending
                  // secret and vault name if a secret was not found.
                  throw new Error(
                    `TMP Secret "${value.data?.secretName}" does not exist in vault "${value.data?.nameOrId}"`,
                  );
                default:
                  utils.never(
                    `Expected code to be one of EINVAL, ENOENT, received ${value.code}`,
                  );
              }
              continue;
            }

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
                    utils.never(
                      `option ${envInvalid} is not valid, expected error, warn or ignore`,
                    );
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
                  utils.never(
                    `option ${envDuplicate} is not valid, expected error, keep, warn or overwrite`,
                  );
              }
            }

            // Find if we need to preserve the newline for this secret
            let preserveNewline = false;
            // If only the vault name is specified to be preserved, then
            // preserve the newlines of all secrets inside the vault.
            // Otherwise, if a full secret path has been specified, then
            // preserve that secret path.
            if (
              preservedSecrets.has(nameOrId) ||
              preservedSecrets.has(`${nameOrId}:${newName}`)
            ) {
              preserveNewline = true;
            }

            // Trim the single trailing newline if it exists
            if (!preserveNewline && secretContent.endsWith('\n')) {
              envp[newName] = secretContent.slice(0, -1);
            } else {
              envp[newName] = secretContent;
            }
            envpPath[newName] = {
              nameOrId,
              secretName,
            };
          }

          // Apply defaults using the schema
          const filteredEnvp: Record<string, string> = {};
          if (unwrappedSchema != null) {
            // Parse the schema for manual filtering
            const { requiredKeys, allKeys, defaults } = unwrappedSchema;

            // Add allowed secrets to a filtered set of secrets. This runs after
            // the duplication is processed, so all secrets here are guaranteed
            // to be unique.
            for (const key of allKeys) {
              let value = envp[key];
              if (value == null && defaults[key] != null) {
                value = defaults[key];
              }
              if (
                requiredKeys.includes(key) &&
                (value == null || value === '')
              ) {
                throw new Error('TMP missing required variable');
              }
              if (value != null) {
                filteredEnvp[key] = value.toString();
              }
            }
          }

          return [
            utils.isEmptyObject(filteredEnvp) ? envp : filteredEnvp,
            envpPath,
          ];
        }, meta);
        // End connection early to avoid errors on server
        await pkClient.stop();

        // Here we want to switch between the different usages
        const platform = os.platform();
        if (cmd != null) {
          // If a cmd is provided then we default to exec it
          switch (platform) {
            case 'linux': // Fallthrough
            case 'darwin':
              {
                const { exec } = await import('@matrixai/exec');
                try {
                  exec.execvp(cmd, argv, envp);
                } catch (e) {
                  if ('code' in e && e.code === 'GenericFailure') {
                    throw new binErrors.ErrorPolykeyCLIChildProcessFailure(
                      `Command failed with error ${e}`,
                      {
                        cause: e,
                        data: { command: [cmd, ...argv] },
                      },
                    );
                  }
                  throw e;
                }
              }
              break;
            default: {
              const { spawnSync } = await import('node:child_process');
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
                let data = '';
                for (const [key, value] of Object.entries(envp)) {
                  if (options.envExport) {
                    data += `export ${key}='${value}'\n`;
                  } else {
                    data += `${key}='${value}'\n`;
                  }
                }
                process.stdout.write(
                  binUtils.outputFormatter({
                    type: 'raw',
                    data: data,
                  }),
                );
              }
              break;
            case 'cmd':
              {
                let data = '';
                for (const [key, value] of Object.entries(envp)) {
                  data += `set "${key}=${value}"\n`;
                }
                process.stdout.write(
                  binUtils.outputFormatter({
                    type: 'raw',
                    data: data,
                  }),
                );
              }
              break;
            case 'powershell':
              {
                let data = '';
                for (const [key, value] of Object.entries(envp)) {
                  if (options.envExport) {
                    data += `$env:${key} = '${value}'\n`;
                  } else {
                    data += `$${key} = '${value}'\n`;
                  }
                }
                process.stdout.write(
                  binUtils.outputFormatter({
                    type: 'raw',
                    data: data,
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
              utils.never(
                `format '${format}' is not valid, expected unix, cmd, powershell or json`,
              );
          }
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandEnv;
