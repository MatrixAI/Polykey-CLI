/**
 * There is no command call sessions
 * This is just for testing the CLI Authentication Retry Loop
 * @module
 */
import path from 'node:path';
import fs from 'node:fs';
import { jest } from '@jest/globals';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import { Session } from 'polykey/sessions/index.js';
import { sleep } from 'polykey/utils/index.js';
import config from 'polykey/config.js';
import * as clientErrors from 'polykey/client/errors.js';
import * as testUtils from './utils/index.js';

jest.unstable_mockModule('prompts', () => ({
  default: jest.fn(),
}));
const { default: prompts } = await import('prompts');

describe('sessions', () => {
  const logger = new Logger('sessions test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  let agentDir;
  let agentPassword;
  let agentClose;
  let dataDir: string;
  beforeEach(async () => {
    ({ agentDir, agentPassword, agentClose } =
      await testUtils.setupTestAgent(logger));
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
  });
  afterEach(async () => {
    await sleep(1000);
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
    await agentClose();
  });
  test('serial commands refresh the session token', async () => {
    const session = await Session.createSession({
      sessionTokenPath: path.join(agentDir, config.paths.tokenBase),
      fs,
      logger,
    });
    let exitCode;
    ({ exitCode } = await testUtils.pkStdio(['agent', 'status'], {
      env: {
        PK_NODE_PATH: agentDir,
        PK_PASSWORD: agentPassword,
      },
      cwd: agentDir,
    }));
    expect(exitCode).toBe(0);
    const token1 = await session.readToken();
    // Tokens are not nonces
    // Wait at least 1 second
    // To ensure that the next token has a new expiry
    await sleep(1100);
    ({ exitCode } = await testUtils.pkStdio(['agent', 'status'], {
      env: {
        PK_NODE_PATH: agentDir,
        PK_PASSWORD: agentPassword,
      },
      cwd: agentDir,
    }));
    expect(exitCode).toBe(0);
    const token2 = await session.readToken();
    expect(token1).not.toBe(token2);
    await session.stop();
  });
  test('unattended commands with invalid authentication should fail', async () => {
    let exitCode, stderr;
    // Password and Token set
    ({ exitCode, stderr } = await testUtils.pkStdio(
      ['agent', 'status', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: 'invalid',
          PK_TOKEN: 'token',
        },
        cwd: agentDir,
      },
    ));

    testUtils.expectProcessError(exitCode, stderr, [
      new clientErrors.ErrorClientAuthDenied(),
    ]);
    // Password set
    ({ exitCode, stderr } = await testUtils.pkStdio(
      ['agent', 'status', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: 'invalid',
          PK_TOKEN: undefined,
        },
        cwd: agentDir,
      },
    ));
    testUtils.expectProcessError(exitCode, stderr, [
      new clientErrors.ErrorClientAuthDenied(),
    ]);
    // Token set
    ({ exitCode, stderr } = await testUtils.pkStdio(
      ['agent', 'status', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: undefined,
          PK_TOKEN: 'token',
        },
        cwd: agentDir,
      },
    ));
    testUtils.expectProcessError(exitCode, stderr, [
      new clientErrors.ErrorClientAuthDenied(),
    ]);
  });
  test('prompt for password to authenticate attended commands', async () => {
    const password = agentPassword;
    await testUtils.pkStdio(['agent', 'lock'], {
      env: { PK_NODE_PATH: agentDir },
      cwd: agentDir,
    });
    prompts.mockClear();
    prompts.mockImplementation(async (_opts: any) => {
      return { password };
    });
    const { exitCode } = await testUtils.pkStdio(['agent', 'status'], {
      env: { PK_NODE_PATH: agentDir },
      cwd: agentDir,
    });
    expect(exitCode).toBe(0);
    // Prompted for password 1 time
    expect(prompts.mock.calls.length).toBe(1);
    prompts.mockClear();
  });
  test('re-prompts for password if unable to authenticate command', async () => {
    await testUtils.pkStdio(['agent', 'lock'], {
      env: { PK_NODE_PATH: agentDir },
      cwd: agentDir,
    });
    const validPassword = agentPassword;
    const invalidPassword = 'invalid';
    prompts.mockClear();
    prompts
      .mockResolvedValueOnce({ password: invalidPassword })
      .mockResolvedValue({ password: validPassword });
    const { exitCode } = await testUtils.pkStdio(['agent', 'status'], {
      env: { PK_NODE_PATH: agentDir },
      cwd: agentDir,
    });
    expect(exitCode).toBe(0);
    // Prompted for password 2 times
    expect(prompts.mock.calls.length).toBe(2);
    prompts.mockClear();
  });
});
