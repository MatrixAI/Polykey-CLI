import path from 'node:path';
import fs from 'node:fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/PolykeyAgent.js';
import { vaultOps } from 'polykey/vaults/index.js';
import * as keysUtils from 'polykey/keys/utils/index.js';
import * as testUtils from '../utils/index.js';

describe('commandStat', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  let polykeyAgent: PolykeyAgent;
  let command: Array<string>;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    polykeyAgent = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        nodePath: dataDir,
        agentServiceHost: '127.0.0.1',
        clientServiceHost: '127.0.0.1',
        keys: {
          passwordOpsLimit: keysUtils.passwordOpsLimits.min,
          passwordMemLimit: keysUtils.passwordMemLimits.min,
          strictMemoryLock: false,
        },
      },
      logger: logger,
    });
  });
  afterEach(async () => {
    await polykeyAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });

  test('should stat secrets', async () => {
    const vaultName = 'vault';
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'secret';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName, secretName);
    });
    command = [
      'secrets',
      'stat',
      '-np',
      dataDir,
      `${vaultName}:${secretName}`,
      '--format',
      'json',
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      stat: {
        nlink: 1, // Reference to itself
        blocks: 1, // Each block can store 512 bytes
        blksize: 4096, // Default unix block size
        size: secretName.length, // Each character is a byte
      },
    });
  });
  test('should stat vault root', async () => {
    const vaultName = 'vault';
    await polykeyAgent.vaultManager.createVault(vaultName);
    command = [
      'secrets',
      'stat',
      '-np',
      dataDir,
      vaultName,
      '--format',
      'json',
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      stat: {
        nlink: 2, // . and .. (itself and parent)
        size: 0, // Directories have no size
        blocks: 0, // Too small to occupy a block
      },
    });
  });
});
