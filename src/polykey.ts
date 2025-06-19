#!/usr/bin/env node

import type {
  AgentChildProcessInput,
  AgentChildProcessOutput,
} from './types.js';
import type { PolykeyAgent } from 'polykey';
import fs from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
/**
 * Hack for wiping out the threads signal handlers
 * See: https://github.com/andywer/threads.js/issues/388
 * This is done statically during this import
 * It is essential that the threads import here is very first import of threads module
 * in the entire codebase for this hack to work
 * If the worker manager is used, it must be stopped gracefully with the PolykeyAgent
 */
import url from 'node:url';
process.removeAllListeners('SIGINT');
process.removeAllListeners('SIGTERM');

/**
 * Set the main entrypoint filepath.
 * This can be referred to globally.
 * For ESM, change to using `import.meta.url`.
 */
const filename = fileURLToPath(import.meta.url);
globalThis.PK_MAIN_EXECUTABLE = filename;

async function polykeyAgentMain(): Promise<number> {
  const {
    default: Logger,
    StreamHandler,
    formatting,
  } = await import('@matrixai/logger');
  const { default: PolykeyAgent } = await import('polykey/PolykeyAgent.js');
  const { default: ErrorPolykey } = await import('polykey/ErrorPolykey.js');
  const nodesUtils = await import('polykey/nodes/utils.js');
  const polykeyUtils = await import('polykey/utils/index.js');
  const binUtils = await import('./utils/index.js');
  const binErrors = await import('./errors.js');
  const logger = new Logger('polykey-agent', undefined, [new StreamHandler()]);
  const exitHandlers = new binUtils.ExitHandlers();
  const processSend = polykeyUtils.promisify(process.send!.bind(process));
  const { p: messageInP, resolveP: resolveMessageInP } =
    polykeyUtils.promise<AgentChildProcessInput>();
  process.once('message', (data: AgentChildProcessInput) => {
    resolveMessageInP(data);
  });
  const messageIn = await messageInP;
  const errFormat = messageIn.format === 'json' ? 'json' : 'error';
  exitHandlers.errFormat = errFormat;
  // Set the logger according to the verbosity
  logger.setLevel(messageIn.logLevel);
  // Set the logger formatter according to the format
  if (messageIn.format === 'json') {
    logger.handlers.forEach((handler) =>
      handler.setFormatter(formatting.jsonFormatter),
    );
  }
  let pkAgent: PolykeyAgent;
  exitHandlers.handlers.push(async () => {
    await pkAgent?.stop();
  });
  try {
    pkAgent = await PolykeyAgent.createPolykeyAgent({
      fs,
      logger: logger.getChild(PolykeyAgent.name),
      ...messageIn.agentConfig,
    });
  } catch (e) {
    if (e instanceof ErrorPolykey || e instanceof binErrors.ErrorPolykeyCLI) {
      process.stderr.write(
        binUtils.outputFormatter({
          type: errFormat,
          data: e,
        }),
      );
      process.exitCode = e.exitCode;
    } else {
      // Unknown error, this should not happen
      const wrappedError = new binErrors.ErrorPolykeyCLIUnexpectedError(
        binUtils.composeErrorMessage(e),
        { cause: e },
      );
      process.stderr.write(
        binUtils.outputFormatter({
          type: errFormat,
          data: wrappedError,
        }),
      );
      process.exitCode = 255;
    }
    const messageOut: AgentChildProcessOutput = {
      status: 'FAILURE',
      error: {
        name: e.name,
        description: e.description,
        message: e.message,
        exitCode: e.exitCode,
        data: e.data,
        stack: e.stack,
      },
    };
    try {
      await processSend(messageOut);
    } catch (e) {
      // If processSend itself failed here
      // There's no point attempting to propagate the error to the parent
      process.stderr.write(
        binUtils.outputFormatter({
          type: errFormat,
          data: e,
        }),
      );
      process.exitCode = 255;
    }
    return process.exitCode;
  }
  const messageOut: AgentChildProcessOutput = {
    status: 'SUCCESS',
    recoveryCode: pkAgent.keyRing.recoveryCode,
    pid: process.pid,
    nodeId: nodesUtils.encodeNodeId(pkAgent.keyRing.getNodeId()),
    clientHost: pkAgent.clientServiceHost,
    clientPort: pkAgent.clientServicePort,
    agentHost: pkAgent.agentServiceHost,
    agentPort: pkAgent.agentServicePort,
  };
  try {
    await processSend(messageOut);
  } catch (e) {
    // If processSend itself failed here
    // There's no point attempting to propagate the error to the parent
    process.stderr.write(
      binUtils.outputFormatter({
        type: errFormat,
        data: e,
      }),
    );
    process.exitCode = 255;
    return process.exitCode;
  }
  process.exitCode = 0;
  return process.exitCode;
}

async function polykeyMain(argv: Array<string>): Promise<number> {
  const { CommanderError } = await import('commander');
  const { default: ErrorPolykey } = await import('polykey/ErrorPolykey.js');
  const { default: CommandBootstrap } = await import('./bootstrap/index.js');
  const { default: CommandAgent } = await import('./agent/index.js');
  const { default: CommandAudit } = await import('./audit/index.js');
  const { default: CommandAuth } = await import('./auth/index.js');
  const { default: CommandVaults } = await import('./vaults/index.js');
  const { default: CommandSecrets } = await import('./secrets/index.js');
  const { default: CommandKeys } = await import('./keys/index.js');
  const { default: CommandNodes } = await import('./nodes/index.js');
  const { default: CommandIdentities } = await import('./identities/index.js');
  const { default: CommandNotifications } = await import(
    './notifications/index.js'
  );
  const { default: CommandPolykey } = await import('./CommandPolykey.js');
  const binUtils = await import('./utils/index.js');
  const binErrors = await import('./errors.js');
  // Registers signal and process error handler
  // Any resource cleanup must be resolved within their try-catch block
  // Leaf commands may register exit handlers in case of signal exits
  // Process error handler should only be used by non-terminating commands
  // When testing, this entire must be mocked to be a noop
  const exitHandlers = new binUtils.ExitHandlers();
  const rootCommand = new CommandPolykey({ exitHandlers, fs });
  rootCommand.name('polykey');
  // Set the version returned by the `--version` option
  rootCommand.version(
    binUtils.generateVersionString(),
    undefined,
    'Version information formatted in the form of [ applicationVersion, libraryVersion, networkVersion, stateVersion ]',
  );
  rootCommand.description('Polykey CLI');
  rootCommand.addCommand(new CommandBootstrap({ exitHandlers, fs }));
  rootCommand.addCommand(new CommandAgent({ exitHandlers, fs }));
  rootCommand.addCommand(new CommandAudit({ exitHandlers, fs }));
  rootCommand.addCommand(new CommandAuth({ exitHandlers, fs }));
  rootCommand.addCommand(new CommandNodes({ exitHandlers, fs }));
  rootCommand.addCommand(new CommandSecrets({ exitHandlers, fs }));
  rootCommand.addCommand(new CommandKeys({ exitHandlers, fs }));
  rootCommand.addCommand(new CommandVaults({ exitHandlers, fs }));
  rootCommand.addCommand(new CommandIdentities({ exitHandlers, fs }));
  rootCommand.addCommand(new CommandNotifications({ exitHandlers, fs }));
  try {
    // `argv` will have node path and the script path as the first 2 parameters
    // navigates and executes the subcommand
    await rootCommand.parseAsync(argv);
    // Successful execution (even if the command was non-terminating)
    process.exitCode = 0;
  } catch (e) {
    const errFormat = rootCommand.opts().format === 'json' ? 'json' : 'error';
    if (e instanceof CommanderError) {
      // Commander writes help and error messages on stderr automatically
      if (
        e.code === 'commander.help' ||
        e.code === 'commander.helpDisplayed' ||
        e.code === 'commander.version'
      ) {
        process.exitCode = 0;
      } else {
        // Other commander codes:
        // commander.unknownOption
        // commander.unknownCommand
        // commander.invalidArgument
        // commander.excessArguments
        // commander.missingArgument
        // commander.missingMandatoryOptionValue
        // commander.optionMissingArgument
        // use 64 for EX_USAGE
        process.exitCode = 64;
      }
    } else if (
      e instanceof ErrorPolykey ||
      e instanceof binErrors.ErrorPolykeyCLI
    ) {
      process.stderr.write(
        binUtils.outputFormatter({
          type: errFormat,
          data: e,
        }),
      );
      process.exitCode = e.exitCode;
    } else {
      // Unknown error, this should not happen
      const wrappedError = new binErrors.ErrorPolykeyCLIUnexpectedError(
        binUtils.composeErrorMessage(e),
        { cause: e },
      );
      process.stderr.write(
        binUtils.outputFormatter({
          type: errFormat,
          data: wrappedError,
        }),
      );
      process.exitCode = 255;
    }
  }
  return process.exitCode ?? 255;
}

async function main(argv = process.argv): Promise<number> {
  if (argv[argv.length - 1] === '--agent-mode') {
    // This is an internal mode for running `PolykeyAgent` as a child process
    // This is not supposed to be used directly by the user
    process.title = 'polykey-agent';
    return polykeyAgentMain();
  } else {
    process.title = 'polykey';
    return polykeyMain(argv);
  }
}

if (import.meta.url.startsWith('file:')) {
  const modulePath = url.fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath) {
    void main();
  }
}

export default main;
