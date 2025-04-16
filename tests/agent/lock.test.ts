import path from 'node:path';
import fs from 'node:fs';
import { jest } from '@jest/globals';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import Session from 'polykey/sessions/Session.js';
import config from 'polykey/config.js';
import * as testUtils from '../utils/index.js';

jest.unstable_mockModule('prompts', () => ({
  default: jest.fn(),
}));
const { default: prompts } = await import('prompts');

describe('lock', () => {
  const logger = new Logger('lock test', LogLevel.WARN, [new StreamHandler()]);
  let agentDir: string;
  let agentPassword: string;
  let agentClose: () => Promise<void>;
  beforeEach(async () => {
    prompts.mockClear();
    ({ agentDir, agentPassword, agentClose } =
      await testUtils.setupTestAgent(logger));
  });
  afterEach(async () => {
    await agentClose();
  });
  test('lock deletes the session token', async () => {
    await testUtils.pkExec(['agent', 'unlock'], {
      env: {
        PK_NODE_PATH: agentDir,
        PK_PASSWORD: agentPassword,
      },
      cwd: agentDir,
    });
    await expect(
      testUtils.pkExec(['agent', 'lock'], {
        env: {
          PK_NODE_PATH: agentDir,
        },
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
  test('lock ensures re-authentication is required', async () => {
    const password = agentPassword;
    prompts.mockImplementation(async (_opts: any) => {
      return { password };
    });
    await expect(
      testUtils.pkStdio(['agent', 'unlock'], {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: agentPassword,
        },
        cwd: agentDir,
      }),
    ).resolves.toMatchObject({ exitCode: 0 });
    // Session token is deleted
    await expect(
      testUtils.pkStdio(['agent', 'lock'], {
        env: { PK_NODE_PATH: agentDir },
        cwd: agentDir,
      }),
    ).resolves.toMatchObject({ exitCode: 0 });
    // Will prompt to reauthenticate
    await expect(
      testUtils.pkStdio(['agent', 'status'], {
        env: { PK_NODE_PATH: agentDir },
        cwd: agentDir,
      }),
    ).resolves.toMatchObject({ exitCode: 0 });
    // Prompted for password 1 time
    expect(prompts.mock.calls.length).toBe(1);
  });
});
