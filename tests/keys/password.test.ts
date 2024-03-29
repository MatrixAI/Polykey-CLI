import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import * as testUtils from '../utils';

describe('password', () => {
  const logger = new Logger('password test', LogLevel.WARN, [
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
  test('password changes the root password', async () => {
    const passPath = path.join(agentDir, 'passwordChange');
    await fs.promises.writeFile(passPath, 'password-change');
    let { exitCode } = await testUtils.pkExec(
      ['keys', 'password', '--password-new-file', passPath],
      {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: agentPassword,
        },
        cwd: agentDir,
      },
    );
    expect(exitCode).toBe(0);
    // Old password should no longer work
    ({ exitCode } = await testUtils.pkExec(['keys', 'keypair'], {
      env: {
        PK_NODE_PATH: agentDir,
        PK_PASSWORD: agentPassword,
        PK_PASSWORD_NEW: 'newPassword2',
      },
      cwd: agentDir,
    }));
    expect(exitCode).toBe(77);
  }, 80000);
});
