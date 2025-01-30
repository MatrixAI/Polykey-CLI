import type { VaultName } from 'polykey/dist/vaults/types';
import path from 'path';
import fs from 'fs';
import fc from 'fast-check';
import { test } from '@fast-check/jest';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { vaultOps } from 'polykey/dist/vaults';
import * as keysUtils from 'polykey/dist/keys/utils';
import { sysexits } from 'polykey/dist/utils';
import * as testUtils from '../utils';

describe('commandEnv', () => {
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  const password = 'password';
  const vaultName = 'vault' as VaultName;
  let dataDir: string;
  let polykeyAgent: PolykeyAgent;

  const secretContentNewlineArb = fc.stringMatching(/^[ -~]+\n$/).noShrink();

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

  test('can select 1 env variable', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'SECRET', 'this is the secret1');
    });
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}:SECRET`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
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
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}:SECRET1`,
      `${vaultName}:SECRET2`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
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
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}:dir1`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
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
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}:SECRET=SECRET_NEW`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
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
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}:dir1=SECRET_NEW`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
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
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}:SECRET1`,
      `${vaultName}:SECRET2`,
      `${vaultName}:dir1`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
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
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}:SECRET1`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];
    const result = await testUtils.pkExec(command, {
      env: {
        PK_PASSWORD: password,
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
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}:SECRET1`,
      `${vaultName}:SECRET2=SECRET1`,
      `${vaultName}:SECRET3=SECRET4`,
      `${vaultName}:dir1`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    const jsonOut = JSON.parse(result.stdout);
    // Latter set envs override former ones, so secrets should be 2 and 4
    expect(jsonOut['SECRET1']).toBe('this is the secret2');
    expect(jsonOut['SECRET2']).toBeUndefined();
    expect(jsonOut['SECRET3']).toBeUndefined();
    expect(jsonOut['SECRET4']).toBe('this is the secret4');
  });
  test('should output human format', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'SECRET1', 'this is the secret1');
      await vaultOps.addSecret(vault, 'SECRET2', 'this is the secret2');
      await vaultOps.mkdir(vault, 'dir1');
      await vaultOps.addSecret(vault, 'dir1/SECRET3', 'this is the secret3');
      await vaultOps.addSecret(vault, 'dir1/SECRET4', 'this is the secret4');
    });
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}`,
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("SECRET1='this is the secret1'");
    expect(result.stdout).toContain("SECRET2='this is the secret2'");
    expect(result.stdout).toContain("SECRET3='this is the secret3'");
    expect(result.stdout).toContain("SECRET4='this is the secret4'");
  });
  test('should output unix format', async () => {
    const vaultId1 = await polykeyAgent.vaultManager.createVault(
      `${vaultName}1`,
    );
    const vaultId2 = await polykeyAgent.vaultManager.createVault(
      `${vaultName}2`,
    );
    await polykeyAgent.vaultManager.withVaults(
      [vaultId1, vaultId2],
      async (vault1, vault2) => {
        await vaultOps.addSecret(vault1, 'SECRET1', 'this is the secret1');
        await vaultOps.addSecret(vault2, 'SECRET2', 'this is the secret2');
        await vaultOps.mkdir(vault1, 'dir1');
        await vaultOps.mkdir(vault2, 'dir1');
        await vaultOps.addSecret(vault1, 'dir1/SECRET3', 'this is the secret3');
        await vaultOps.addSecret(vault2, 'dir1/SECRET4', 'this is the secret4');
      },
    );
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}1`,
      `${vaultName}2`,
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("SECRET1='this is the secret1'");
    expect(result.stdout).toContain("SECRET2='this is the secret2'");
    expect(result.stdout).toContain("SECRET3='this is the secret3'");
    expect(result.stdout).toContain("SECRET4='this is the secret4'");
  });
  test('should output cmd format', async () => {
    const vaultId1 = await polykeyAgent.vaultManager.createVault(
      `${vaultName}1`,
    );
    const vaultId2 = await polykeyAgent.vaultManager.createVault(
      `${vaultName}2`,
    );
    await polykeyAgent.vaultManager.withVaults(
      [vaultId1, vaultId2],
      async (vault1, vault2) => {
        await vaultOps.addSecret(vault1, 'SECRET1', 'this is the secret1');
        await vaultOps.addSecret(vault2, 'SECRET2', 'this is the secret2');
        await vaultOps.mkdir(vault1, 'dir1');
        await vaultOps.mkdir(vault2, 'dir1');
        await vaultOps.addSecret(vault1, 'dir1/SECRET3', 'this is the secret3');
        await vaultOps.addSecret(vault2, 'dir1/SECRET4', 'this is the secret4');
      },
    );
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'cmd',
      `${vaultName}1`,
      `${vaultName}2`,
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('set "SECRET1=this is the secret1"');
    expect(result.stdout).toContain('set "SECRET2=this is the secret2"');
    expect(result.stdout).toContain('set "SECRET3=this is the secret3"');
    expect(result.stdout).toContain('set "SECRET4=this is the secret4"');
  });
  test('should output powershell format', async () => {
    const vaultId1 = await polykeyAgent.vaultManager.createVault(
      `${vaultName}1`,
    );
    const vaultId2 = await polykeyAgent.vaultManager.createVault(
      `${vaultName}2`,
    );
    await polykeyAgent.vaultManager.withVaults(
      [vaultId1, vaultId2],
      async (vault1, vault2) => {
        await vaultOps.addSecret(vault1, 'SECRET1', 'this is the secret1');
        await vaultOps.addSecret(vault2, 'SECRET2', 'this is the secret2');
        await vaultOps.mkdir(vault1, 'dir1');
        await vaultOps.mkdir(vault2, 'dir1');
        await vaultOps.addSecret(vault1, 'dir1/SECRET3', 'this is the secret3');
        await vaultOps.addSecret(vault2, 'dir1/SECRET4', 'this is the secret4');
      },
    );
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'powershell',
      `${vaultName}1`,
      `${vaultName}2`,
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`$SECRET1 = 'this is the secret1'`);
    expect(result.stdout).toContain(`$SECRET2 = 'this is the secret2'`);
    expect(result.stdout).toContain(`$SECRET3 = 'this is the secret3'`);
    expect(result.stdout).toContain(`$SECRET4 = 'this is the secret4'`);
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
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'json',
      `${vaultName}`,
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      SECRET1: 'this is the secret1',
      SECRET2: 'this is the secret2',
      SECRET3: 'this is the secret3',
      SECRET4: 'this is the secret4',
    });
  });
  test('testing valid and invalid rename inputs', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'SECRET', 'this is the secret');
    });
    const valid = [
      'one',
      'ONE',
      'one_two',
      'ONE_two',
      'one_TWO',
      'ONE_TWO',
      'ONE123',
      'ONE_123',
    ];
    const invalid = ['123', '123abc', '123_123', '123_abc', '123 abc', ' '];
    const validCommand = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      ...valid.map((v) => `${vaultName}:SECRET=${v}`),
    ];
    // Checking valid
    const result = await testUtils.pkExec(validCommand, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    // Checking invalid
    for (const nameNew of invalid) {
      const invalidCommand = [
        'secrets',
        'env',
        '-np',
        dataDir,
        '--env-format',
        'unix',
        '-e',
        `${vaultName}:SECRET=${nameNew}`,
      ];
      const result = await testUtils.pkExec(invalidCommand, {
        env: { PK_PASSWORD: password },
      });
      expect(result.exitCode).toBe(sysexits.USAGE);
    }
  });
  test('invalid handled with error', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, '123', 'this is an invalid secret');
    });
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      '-ei',
      'error',
      `${vaultName}`,
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(64);
  });
  test('invalid handled with warn', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, '123', 'this is an invalid secret');
    });
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      '-ei',
      'warn',
      `${vaultName}`,
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toInclude(
      'The following env variable name (123) is invalid and was dropped',
    );
  });
  test('invalid handled with ignore', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, '123', 'this is an invalid secret');
    });

    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      '-ei',
      'ignore',
      `${vaultName}`,
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toInclude(
      'The following env variable name (123) is invalid and was dropped',
    );
  });
  test('duplicate handled with error', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'secret', 'this is a secret');
      await vaultOps.mkdir(vault, 'dir');
      await vaultOps.addSecret(vault, 'dir/secret', 'this is a secret');
    });
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      '-ed',
      'error',
      `${vaultName}`,
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(64);
    expect(result.stderr).toInclude('ErrorPolykeyCLIDuplicateEnvName');
  });
  test('duplicate handled with warn', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'secret', 'this is a secret');
      await vaultOps.mkdir(vault, 'dir');
      await vaultOps.addSecret(vault, 'dir/secret', 'this is a secret');
    });
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      '-ed',
      'warn',
      `${vaultName}`,
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toInclude(
      'The env variable (secret) is duplicate, overwriting',
    );
  });
  test('duplicate handled with keep', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'secret', 'this is a secret1');
      await vaultOps.mkdir(vault, 'dir');
      await vaultOps.addSecret(vault, 'dir/secret', 'this is a secret2');
    });
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      '-ed',
      'keep',
      `${vaultName}`,
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toInclude('this is a secret1');
  });
  test('duplicate handled with overwrite', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'secret', 'this is a secret1');
      await vaultOps.mkdir(vault, 'dir');
      await vaultOps.addSecret(vault, 'dir/secret', 'this is a secret2');
    });
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      '-ed',
      'overwrite',
      `${vaultName}`,
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toInclude('this is a secret2');
  });
  test('newlines in secrets are untouched', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'SECRET';
    const secretContent =
      'this is a secret\nit has multiple lines\n\nand some more lines';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName, secretContent);
    });
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}:${secretName}`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    const jsonOut = JSON.parse(result.stdout);
    expect(jsonOut[secretName]).toBe(secretContent);
  });
  test.prop([testUtils.vaultNameArb, secretContentNewlineArb], {
    numRuns: 2,
  })(
    'single trailing newline is automatically removed',
    async (vaultName, secretContent) => {
      const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
      const secretName = 'SECRET';
      await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
        await vaultOps.addSecret(vault, secretName, secretContent);
      });
      const command = [
        'secrets',
        'env',
        '-np',
        dataDir,
        '--env-format',
        'unix',
        `${vaultName}:${secretName}`,
        '--',
        'node',
        '-e',
        'console.log(JSON.stringify(process.env))',
      ];
      const result = await testUtils.pkExec(command, {
        env: { PK_PASSWORD: password },
      });
      expect(result.exitCode).toBe(0);
      const jsonOut = JSON.parse(result.stdout);
      // Remove last character
      expect(jsonOut[secretName]).toBe(secretContent.slice(0, -1));
    },
  );
  test.prop([testUtils.vaultNameArb, secretContentNewlineArb], {
    numRuns: 2,
  })(
    'trailing newlines are preserved with option',
    async (vaultName, secretContent) => {
      const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
      const secretName = 'SECRET';
      await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
        await vaultOps.addSecret(vault, secretName, secretContent);
      });
      const command = [
        'secrets',
        'env',
        '-np',
        dataDir,
        '--env-format',
        'unix',
        '--preserve-newline',
        `${vaultName}:${secretName}`,
        `${vaultName}:${secretName}`,
        '--',
        'node',
        '-e',
        'console.log(JSON.stringify(process.env))',
      ];
      const result = await testUtils.pkExec(command, {
        env: { PK_PASSWORD: password },
      });
      expect(result.exitCode).toBe(0);
      const jsonOut = JSON.parse(result.stdout);
      expect(jsonOut[secretName]).toBe(secretContent);
      await polykeyAgent.vaultManager.destroyVault(vaultId);
    },
  );
  test('preserves only the newline when specified', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName1 = 'SECRET1';
    const secretName2 = 'SECRET2';
    const secretName3 = 'SECRET3';
    const secretContent1 = 'content1\n';
    const secretContent2 = 'content2\n';
    const secretContent3 = 'content3\n';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName1, secretContent1);
      await vaultOps.addSecret(vault, secretName2, secretContent2);
      await vaultOps.addSecret(vault, secretName3, secretContent3);
    });
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}`,
      '--preserve-newline',
      `${vaultName}:${secretName1}`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    const jsonOut = JSON.parse(result.stdout);
    expect(jsonOut[secretName1]).toBe(secretContent1);
    expect(jsonOut[secretName2]).toBe(secretContent2.slice(0, -1));
    expect(jsonOut[secretName3]).toBe(secretContent3.slice(0, -1));
  });
  test('preserves newlines of all secrets with only vault name', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName1 = 'SECRET1';
    const secretName2 = 'SECRET2';
    const secretName3 = 'SECRET3';
    const secretContent1 = 'content1\n';
    const secretContent2 = 'content2\n';
    const secretContent3 = 'content3\n';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName1, secretContent1);
      await vaultOps.addSecret(vault, secretName2, secretContent2);
      await vaultOps.addSecret(vault, secretName3, secretContent3);
    });
    // Test for exporting all the secrets via vault name
    const command1 = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}`,
      '--preserve-newline',
      `${vaultName}`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];
    const result1 = await testUtils.pkExec(command1, {
      env: { PK_PASSWORD: password },
    });
    expect(result1.exitCode).toBe(0);
    const jsonOut1 = JSON.parse(result1.stdout);
    expect(jsonOut1[secretName1]).toBe(secretContent1);
    expect(jsonOut1[secretName2]).toBe(secretContent2);
    expect(jsonOut1[secretName3]).toBe(secretContent3);
    // Test for exporting all the secrets manually one-by-one
    const command2 = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}:${secretName1}`,
      `${vaultName}:${secretName2}`,
      `${vaultName}:${secretName3}`,
      '--preserve-newline',
      `${vaultName}`,
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify(process.env))',
    ];
    const result2 = await testUtils.pkExec(command2, {
      env: { PK_PASSWORD: password },
    });
    expect(result2.exitCode).toBe(0);
    const jsonOut2 = JSON.parse(result2.stdout);
    expect(jsonOut2[secretName1]).toBe(secretContent1);
    expect(jsonOut2[secretName2]).toBe(secretContent2);
    expect(jsonOut2[secretName3]).toBe(secretContent3);
  });
  test('handles no arguments', async () => {
    const command = ['secrets', 'env', '-np', dataDir, '--env-format', 'unix'];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(64);
  });
  test('handles providing no secret paths', async () => {
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      '--',
      '--',
      'someCommand',
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(64);
  });
  test('should output all secrets without explicit secret path', async () => {
    const vaultId1 = await polykeyAgent.vaultManager.createVault(
      `${vaultName}1`,
    );
    const vaultId2 = await polykeyAgent.vaultManager.createVault(
      `${vaultName}2`,
    );
    await polykeyAgent.vaultManager.withVaults(
      [vaultId1, vaultId2],
      async (vault1, vault2) => {
        await vaultOps.addSecret(vault1, 'SECRET1', 'this is the secret1');
        await vaultOps.addSecret(vault2, 'SECRET2', 'this is the secret2');
        await vaultOps.mkdir(vault1, 'dir1');
        await vaultOps.mkdir(vault2, 'dir1');
        await vaultOps.addSecret(vault1, 'dir1/SECRET3', 'this is the secret3');
        await vaultOps.addSecret(vault2, 'dir1/SECRET4', 'this is the secret4');
      },
    );
    const command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'unix',
      `${vaultName}1`,
      `${vaultName}2`,
    ];
    const result = await testUtils.pkExec(command, {
      env: { PK_PASSWORD: password },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("SECRET1='this is the secret1'");
    expect(result.stdout).toContain("SECRET2='this is the secret2'");
    expect(result.stdout).toContain("SECRET3='this is the secret3'");
    expect(result.stdout).toContain("SECRET4='this is the secret4'");
  });
  test.each(['unix', 'cmd', 'powershell'])(
    'should export all secrets in %s format to child processes',
    async (format) => {
      const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
      await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
        await vaultOps.addSecret(vault, 'SECRET1', 'this is the secret1');
      });
      const command = [
        'secrets',
        'env',
        '-np',
        dataDir,
        '--env-format',
        format,
        '--env-export',
        `${vaultName}:SECRET1`,
      ];
      const result = await testUtils.pkExec(command, {
        env: { PK_PASSWORD: password },
      });
      expect(result.exitCode).toBe(0);
      const formatResult = {
        unix: `export SECRET1='this is the secret1'\n`,
        cmd: `set "SECRET1=this is the secret1"\n`,
        powershell: `$env:SECRET1 = 'this is the secret1'\n`,
      };
      expect(result.stdout).toEqual(formatResult[format]);
    },
  );
});
