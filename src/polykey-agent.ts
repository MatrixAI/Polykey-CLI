#!/usr/bin/env node
/**
 * The is an internal script for running the PolykeyAgent as a child process
 * This is not to be exported for external execution
 * @module
 */
import type { AgentChildProcessInput, AgentChildProcessOutput } from './types';
import fs from 'fs';
import process from 'process';
/**
 * Hack for wiping out the threads signal handlers
 * See: https://github.com/andywer/threads.js/issues/388
 * This is done statically during this import
 * It is essential that the threads import here is very first import of threads module
 * in the entire codebase for this hack to work
 * If the worker manager is used, it must be stopped gracefully with the PolykeyAgent
 */
import 'threads';
process.removeAllListeners('SIGINT');
process.removeAllListeners('SIGTERM');
import Logger, { StreamHandler, formatting } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import * as nodesUtils from 'polykey/dist/nodes/utils';
import ErrorPolykey from 'polykey/dist/ErrorPolykey';
import { promisify, promise } from 'polykey/dist/utils';
import * as binUtils from './utils';

process.title = 'polykey-agent';

const logger = new Logger('polykey', undefined, [new StreamHandler()]);

/**
 * Starts the agent process
 */
async function main(_argv = process.argv): Promise<number> {
  const exitHandlers = new binUtils.ExitHandlers();
  const processSend = promisify(process.send!.bind(process));
  const { p: messageInP, resolveP: resolveMessageInP } =
    promise<AgentChildProcessInput>();
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
    if (e instanceof ErrorPolykey) {
      process.stderr.write(
        binUtils.outputFormatter({
          type: errFormat,
          data: e,
        }),
      );
      process.exitCode = e.exitCode;
    } else {
      // Unknown error, this should not happen
      process.stderr.write(
        binUtils.outputFormatter({
          type: errFormat,
          data: e,
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

if (require.main === module) {
  void main();
}

export default main;
