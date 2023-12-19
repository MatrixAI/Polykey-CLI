import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import * as testUtils from '../utils';

describe('certchain', () => {
  const logger = new Logger('certchain test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  let agentDir;
  let agentPassword;
  let agentClose;
  beforeEach(async () => {
    ({ agentDir, agentPassword, agentClose } =
      await testUtils.setupTestAgent(logger));
  });
  afterEach(async () => {
    await agentClose();
  });
  test('certchain gets the certificate chain', async () => {
    const { exitCode, stdout } = await testUtils.pkExec(
      ['keys', 'certchain', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: agentPassword,
        },
        cwd: agentDir,
      },
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      certchain: expect.any(Array),
    });
  });
});
