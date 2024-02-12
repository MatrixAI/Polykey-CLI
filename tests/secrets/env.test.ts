import type { VaultName } from 'polykey/dist/vaults/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { vaultOps } from 'polykey/dist/vaults';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('commandEnv', () => {
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  const password = 'password';
  const vaultName = 'vault' as VaultName;
  let dataDir: string;
  let polykeyAgent: PolykeyAgent;
  let passwordFile: string;
  let command: Array<string>;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    passwordFile = path.join(dataDir, 'passwordFile');
    await fs.promises.writeFile(passwordFile, 'password');
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
    // Authorize session
    await testUtils.pkStdio(
      ['agent', 'unlock', '-np', dataDir, '--password-file', passwordFile],
      {
        env: {},
        cwd: dataDir,
      },
    );
  });
  afterEach(async () => {
    await polykeyAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });

  test('can select 1 env variable', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'SECRET', 'this is the secret1');
    });

    command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '-e',
      `${vaultName}:SECRET`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    const jsonOut = JSON.parse(result.stdout);
    expect(jsonOut['SECRET']).toBe('this is the secret1');
  });
  test('can select multiple env variables', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'SECRET1', 'this is the secret1');
      await vaultOps.addSecret(vault, 'SECRET2', 'this is the secret2');
    });

    command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '-e',
      `${vaultName}:SECRET1`,
      `${vaultName}:SECRET2`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    const jsonOut = JSON.parse(result.stdout);
    expect(jsonOut['SECRET1']).toBe('this is the secret1');
    expect(jsonOut['SECRET2']).toBe('this is the secret2');
  });
  test('can select a directory of env variables', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'SECRET1', 'this is the secret1');
      await vaultOps.mkdir(vault, 'dir1');
      await vaultOps.addSecret(vault, 'dir1/SECRET2', 'this is the secret2');
      await vaultOps.addSecret(vault, 'dir1/SECRET3', 'this is the secret3');
    });

    command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '-e',
      `${vaultName}:dir1`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    const jsonOut = JSON.parse(result.stdout);
    expect(jsonOut['SECRET1']).toBeUndefined();
    expect(jsonOut['SECRET2']).toBe('this is the secret2');
    expect(jsonOut['SECRET3']).toBe('this is the secret3');
  });
  test('can select and rename an env variable', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'SECRET', 'this is the secret');
    });

    command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '-e',
      `${vaultName}:SECRET=SECRET_NEW`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    const jsonOut = JSON.parse(result.stdout);
    expect(jsonOut['SECRET']).toBeUndefined();
    expect(jsonOut['SECRET_NEW']).toBe('this is the secret');
  });
  test('can not rename a directory of env variables', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.mkdir(vault, 'dir');
      await vaultOps.addSecret(vault, 'dir1/SECRET1', 'this is the secret1');
      await vaultOps.addSecret(vault, 'dir1/SECRET2', 'this is the secret2');
    });

    command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '-e',
      `${vaultName}:dir1=SECRET_NEW`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    const jsonOut = JSON.parse(result.stdout);
    expect(jsonOut['SECRET_NEW']).toBeUndefined();
    expect(jsonOut['SECRET1']).toBe('this is the secret1');
    expect(jsonOut['SECRET2']).toBe('this is the secret2');
  });
  test('can mix and match env variables', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'SECRET1', 'this is the secret1');
      await vaultOps.addSecret(vault, 'SECRET2', 'this is the secret2');
      await vaultOps.mkdir(vault, 'dir1');
      await vaultOps.addSecret(vault, 'dir1/SECRET3', 'this is the secret3');
      await vaultOps.addSecret(vault, 'dir1/SECRET4', 'this is the secret4');
    });

    command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '-e',
      `${vaultName}:SECRET1`,
      `${vaultName}:SECRET2`,
      `${vaultName}:dir1`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    const jsonOut = JSON.parse(result.stdout);
    expect(jsonOut['SECRET1']).toBe('this is the secret1');
    expect(jsonOut['SECRET2']).toBe('this is the secret2');
    expect(jsonOut['SECRET3']).toBe('this is the secret3');
    expect(jsonOut['SECRET4']).toBe('this is the secret4');
  });
  test('existing env are passed through', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'SECRET1', 'this is the secret1');
    });

    command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '-e',
      `${vaultName}:SECRET1`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];

    const result = await testUtils.pkExec([...command], {
      env: {
        EXISTING: 'existing var',
      },
    });
    expect(result.exitCode).toBe(0);
    const jsonOut = JSON.parse(result.stdout);
    expect(jsonOut['SECRET1']).toBe('this is the secret1');
    expect(jsonOut['EXISTING']).toBe('existing var');
  });
  test('handles duplicate secret names', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'SECRET1', 'this is the secret1');
      await vaultOps.addSecret(vault, 'SECRET2', 'this is the secret2');
      await vaultOps.addSecret(vault, 'SECRET3', 'this is the secret3');
      await vaultOps.mkdir(vault, 'dir1');
      await vaultOps.addSecret(vault, 'dir1/SECRET4', 'this is the secret4');
    });

    command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '-e',
      `${vaultName}:SECRET1`,
      `${vaultName}:SECRET2=SECRET1`,
      `${vaultName}:SECRET3=SECRET4`,
      `${vaultName}:dir1`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    const jsonOut = JSON.parse(result.stdout);
    // Latter set envs override former ones, so secrets should be 2 and 4
    expect(jsonOut['SECRET1']).toBe('this is the secret2');
    expect(jsonOut['SECRET2']).toBeUndefined();
    expect(jsonOut['SECRET3']).toBeUndefined();
    expect(jsonOut['SECRET4']).toBe('this is the secret4');
  });
  test('should output .env format', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'SECRET1', 'this is the secret1');
      await vaultOps.addSecret(vault, 'SECRET2', 'this is the secret2');
      await vaultOps.mkdir(vault, 'dir1');
      await vaultOps.addSecret(vault, 'dir1/SECRET3', 'this is the secret3');
      await vaultOps.addSecret(vault, 'dir1/SECRET4', 'this is the secret4');
    });

    command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '-e',
      `${vaultName}:.`,
      '--output-format',
      'dotenv',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('SECRET1="this is the secret1"');
    expect(result.stdout).toContain('SECRET2="this is the secret2"');
    expect(result.stdout).toContain('SECRET3="this is the secret3"');
    expect(result.stdout).toContain('SECRET4="this is the secret4"');
  });
  test('should output json format', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'SECRET1', 'this is the secret1');
      await vaultOps.addSecret(vault, 'SECRET2', 'this is the secret2');
      await vaultOps.mkdir(vault, 'dir1');
      await vaultOps.addSecret(vault, 'dir1/SECRET3', 'this is the secret3');
      await vaultOps.addSecret(vault, 'dir1/SECRET4', 'this is the secret4');
    });

    command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '-e',
      `${vaultName}:.`,
      '--output-format',
      'json',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      SECRET1: 'this is the secret1',
      SECRET2: 'this is the secret2',
      SECRET3: 'this is the secret3',
      SECRET4: 'this is the secret4',
    });
  });
  test('should output prepend format', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'SECRET1', 'this is the secret1');
      await vaultOps.addSecret(vault, 'SECRET2', 'this is the secret2');
      await vaultOps.mkdir(vault, 'dir1');
      await vaultOps.addSecret(vault, 'dir1/SECRET3', 'this is the secret3');
      await vaultOps.addSecret(vault, 'dir1/SECRET4', 'this is the secret4');
    });

    command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '-e',
      `${vaultName}:.`,
      '--output-format',
      'prepend',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      'SECRET1="this is the secret1" SECRET2="this is the secret2" SECRET3="this is the secret3" SECRET4="this is the secret4"',
    );
  });
});
