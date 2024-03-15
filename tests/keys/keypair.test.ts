import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import * as testUtils from '../utils';

describe('keypair', () => {
  const logger = new Logger('keypair test', LogLevel.WARN, [
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
  test('keypair gets private and public key', async () => {
    const { exitCode, stdout } = await testUtils.pkExec(
      ['keys', 'keypair', 'password', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: agentPassword,
          PK_PASSWORD_NEW: 'newPassword',
        },
        cwd: agentDir,
      },
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      publicKeyJwk: {
        alg: expect.any(String),
        crv: expect.any(String),
        ext: expect.any(Boolean),
        key_ops: expect.any(Array),
        kty: expect.any(String),
        x: expect.any(String),
      },
      privateKeyJwe: {
        ciphertext: expect.any(String),
        iv: expect.any(String),
        protected: expect.any(String),
        tag: expect.any(String),
      },
    });
  }, 40000);
});
