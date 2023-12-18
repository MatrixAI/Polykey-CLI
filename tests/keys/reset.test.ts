import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as nodesUtils from 'polykey/dist/nodes/utils';
import { sleep } from 'polykey/dist/utils';
import * as testUtils from '../utils';

describe('reset', () => {
  const logger = new Logger('reset test', LogLevel.WARN, [new StreamHandler()]);
  const password = 'helloWorld';
  let dataDir: string;
  let nodePath: string;
  let pkAgent: PolykeyAgent;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    nodePath = path.join(dataDir, 'polykey');
    pkAgent = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        nodePath,
        agentServiceHost: '127.0.0.1',
        clientServiceHost: '127.0.0.1',
        keys: {
          passwordOpsLimit: keysUtils.passwordOpsLimits.min,
          passwordMemLimit: keysUtils.passwordMemLimits.min,
          strictMemoryLock: false,
        },
      },
      logger,
    });
  }, globalThis.defaultTimeout * 2);
  afterEach(async () => {
    await pkAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test('resets the keypair', async () => {
    // Can't test with target executable due to mocking
    // Get previous keypair and nodeId
    let { exitCode, stdout } = await testUtils.pkStdio(
      ['keys', 'keypair', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
          PK_PASSWORD_NEW: 'some-password',
        },
        cwd: dataDir,
      },
    );
    expect(exitCode).toBe(0);
    const prevPublicKey = JSON.parse(stdout).publicKey;
    const prevPrivateKey = JSON.parse(stdout).privateKey;
    ({ exitCode, stdout } = await testUtils.pkStdio(
      ['agent', 'status', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    const prevNodeId = JSON.parse(stdout).nodeId;
    // Reset keypair
    const passPath = path.join(dataDir, 'reset-password');
    await fs.promises.writeFile(passPath, 'password-new');
    ({ exitCode } = await testUtils.pkStdio(
      ['keys', 'reset', '--password-new-file', passPath],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    // Wait for keys changes to propagate to the network
    await sleep(1000);
    const nodeIdEncodedNew = nodesUtils.encodeNodeId(
      pkAgent.keyRing.getNodeId(),
    );
    // Get new keypair and nodeId and compare against old
    ({ exitCode, stdout } = await testUtils.pkStdio(
      ['keys', 'keypair', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: 'password-new',
          PK_PASSWORD_NEW: 'some-password',
          PK_NODE_ID: nodeIdEncodedNew,
          PK_CLIENT_HOST: '127.0.0.1',
          PK_CLIENT_PORT: `${pkAgent.clientServicePort}`,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    const newPublicKey = JSON.parse(stdout).publicKey;
    const newPrivateKey = JSON.parse(stdout).privateKey;
    ({ exitCode, stdout } = await testUtils.pkStdio(
      ['agent', 'status', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: 'password-new',
          PK_NODE_ID: nodeIdEncodedNew,
          PK_CLIENT_HOST: '127.0.0.1',
          PK_CLIENT_PORT: `${pkAgent.clientServicePort}`,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    const newNodeId = JSON.parse(stdout).nodeId;
    expect(newPublicKey).not.toBe(prevPublicKey);
    expect(newPrivateKey).not.toBe(prevPrivateKey);
    expect(newNodeId).not.toBe(prevNodeId);
  });
});
