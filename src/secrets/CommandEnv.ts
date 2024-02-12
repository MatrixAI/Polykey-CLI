import type PolykeyClient from 'polykey/dist/PolykeyClient';
import path from 'path';
import * as utils from 'polykey/dist/utils';
import { exec } from '@matrixai/exec';
import * as binProcessors from '../utils/processors';
import * as binUtils from '../utils';
import CommandPolykey from '../CommandPolykey';
import * as binOptions from '../utils/options';

class CommandEnv extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('env');
    this.description(
      'Run a command with the given secrets and env variables. If no command is specified then the variables are printed to stdout.',
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.addOption(binOptions.envVariables);
    this.addOption(binOptions.envFormat);
    this.argument('[cmd] [argv...]', 'command and arguments');
    this.action(async (args: Array<string>, options) => {
      const [cmd, ...argv] = args;
      const {
        env: envVariables,
        outputFormat,
      }: {
        env: Array<[string, string, string?]>;
        outputFormat: 'dotenv' | 'json' | 'prepend';
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
        const envp = await binUtils.retryAuthentication(async (auth) => {
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
          for await (const value of responseStream.readable) {
            const { secretName, secretContent } = value;
            let newName = secretRenameMap.get(secretName);
            newName = newName ?? path.basename(secretName);
            envp[newName] = secretContent;
          }
          await writeP;
          return envp;
        }, meta);
        // End connection early to avoid errors on server
        await pkClient.stop();

        // Here we want to switch between the different usages
        if (cmd != null) {
          // If a cmd is provided then we default to exec it
          exec.execvp(cmd, argv, envp);
        } else {
          // Otherwise we switch between output formats
          switch (outputFormat) {
            case 'dotenv':
              {
                // Formatting as a .env file
                let data = '';
                for (const [key, value] of Object.entries(envp)) {
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
            case 'prepend':
              {
                // Formatting as a command input
                let first = true;
                let data = '';
                for (const [key, value] of Object.entries(envp)) {
                  data += `${first ? '' : ' '}${key}="${value}"`;
                  first = false;
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
