import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import Session from 'polykey/dist/sessions/Session';
import config from 'polykey/dist/config';
import * as testUtils from '../utils';

describe('unlock', () => {
  const logger = new Logger('unlock test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  let agentDir: string;
  let agentPassword: string;
  let agentClose: () => Promise<void>;
  beforeEach(async () => {
    ({ agentDir, agentPassword, agentClose } =
      await testUtils.setupTestAgent(logger));
  });
  afterEach(async () => {
    await agentClose();
  });
  test('unlock acquires session token', async () => {
    // Fresh session, to delete the token
    const session = await Session.createSession({
      sessionTokenPath: path.join(agentDir, config.paths.tokenBase),
      fs,
      logger,
      fresh: true,
    });
    let exitCode: number, stdout: string;
    ({ exitCode } = await testUtils.pkExec(['agent', 'unlock'], {
      env: {
        PK_NODE_PATH: agentDir,
        PK_PASSWORD: agentPassword,
      },
      cwd: agentDir,
    }));
    expect(exitCode).toBe(0);
    // Run command without password
    ({ exitCode, stdout } = await testUtils.pkExec(
      ['agent', 'status', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: agentDir,
        },
        cwd: agentDir,
      },
    ));
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ status: 'LIVE' });
    // Run command with PK_TOKEN
    ({ exitCode, stdout } = await testUtils.pkExec(
      ['agent', 'status', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: agentDir,
          PK_TOKEN: await session.readToken(),
        },
        cwd: agentDir,
      },
    ));
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ status: 'LIVE' });
    await session.stop();
  });
});
