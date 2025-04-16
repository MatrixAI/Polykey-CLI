import path from 'node:path';
import fs from 'node:fs';
import { jest } from '@jest/globals';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import Session from 'polykey/sessions/Session.js';
import config from 'polykey/config.js';
import * as errors from 'polykey/errors.js';
import * as testUtils from '../utils/index.js';

/**
 * Mock prompts module which is used prompt for password
 */
jest.unstable_mockModule('prompts', () => ({
  default: jest.fn(),
}));
const { default: prompts } = await import('prompts');

describe('lockall', () => {
  const logger = new Logger('lockall test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  let agentDir;
  let agentPassword;
  let agentClose;
  beforeEach(async () => {
    prompts.mockClear();
    ({ agentDir, agentPassword, agentClose } =
      await testUtils.setupTestAgent(logger));
  });
  afterEach(async () => {
    await agentClose();
  });
  test('lockall deletes the session token', async () => {
    await expect(
      testUtils.pkExec(['agent', 'unlock'], {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: agentPassword,
        },
        cwd: agentDir,
      }),
    ).resolves.toMatchObject({ exitCode: 0 });
    await expect(
      testUtils.pkExec(['agent', 'lockall'], {
        env: { PK_NODE_PATH: agentDir },
        cwd: agentDir,
      }),
    ).resolves.toMatchObject({ exitCode: 0 });
    const session = await Session.createSession({
      sessionTokenPath: path.join(agentDir, config.paths.tokenBase),
      fs,
      logger,
    });
    expect(await session.readToken()).toBeUndefined();
    await session.stop();
  });
  test('lockall ensures re-authentication is required', async () => {
    const password = agentPassword;
    await expect(
      testUtils.pkStdio(['agent', 'unlock'], {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: agentPassword,
        },
        cwd: agentDir,
      }),
    ).resolves.toMatchObject({ exitCode: 0 });
    await expect(
      testUtils.pkStdio(['agent', 'lockall'], {
        env: { PK_NODE_PATH: agentDir },
        cwd: agentDir,
      }),
    ).resolves.toMatchObject({ exitCode: 0 });
    // Token is deleted, re-authentication is required
    prompts.mockImplementation(async (_opts: any) => {
      return { password };
    });
    await expect(
      testUtils.pkStdio(['agent', 'status'], {
        env: { PK_NODE_PATH: agentDir },
        cwd: agentDir,
      }),
    ).resolves.toMatchObject({ exitCode: 0 });
    // Prompted for password 1 time
    expect(prompts.mock.calls.length).toBe(1);
  });
  test('lockall causes old session tokens to fail', async () => {
    await expect(
      testUtils.pkExec(['agent', 'unlock'], {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: agentPassword,
        },
        cwd: agentDir,
      }),
    ).resolves.toMatchObject({ exitCode: 0 });
    const session = await Session.createSession({
      sessionTokenPath: path.join(agentDir, config.paths.tokenBase),
      fs,
      logger,
    });
    const token = await session.readToken();
    await session.stop();
    await expect(
      testUtils.pkExec(['agent', 'lockall'], {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: agentPassword,
        },
        cwd: agentDir,
      }),
    ).resolves.toMatchObject({ exitCode: 0 });
    // Old token is invalid
    const { exitCode, stderr } = await testUtils.pkExec(
      ['agent', 'status', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: agentDir,
          PK_TOKEN: token,
        },
        cwd: agentDir,
      },
    );
    testUtils.expectProcessError(exitCode, stderr, [
      new errors.ErrorClientAuthDenied(),
    ]);
  });
});
