import type { VaultName } from 'polykey/dist/vaults/types';
import path from 'path';
import fs from 'fs';
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
      '--env-format',
      'human',
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
      '--env-format',
      'human',
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
      '--env-format',
      'human',
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
      '--env-format',
      'human',
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
      '--env-format',
      'human',
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
      '--env-format',
      'human',
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
      '--env-format',
      'human',
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
      '--env-format',
      'human',
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
  test('should output human format', async () => {
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
      '--env-format',
      'human',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('SECRET1="this is the secret1"');
    expect(result.stdout).toContain('SECRET2="this is the secret2"');
    expect(result.stdout).toContain('SECRET3="this is the secret3"');
    expect(result.stdout).toContain('SECRET4="this is the secret4"');
  });
  test('should output dotenv format', async () => {
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

    command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '-e',
      `${vaultName}1:.`,
      `${vaultName}2:.`,
      '--env-format',
      'dotenv',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('# vault1:SECRET1');
    expect(result.stdout).toContain('SECRET1="this is the secret1"');
    expect(result.stdout).toContain('# vault2:SECRET2');
    expect(result.stdout).toContain('SECRET2="this is the secret2"');
    expect(result.stdout).toContain('# vault1:dir1/SECRET3');
    expect(result.stdout).toContain('SECRET3="this is the secret3"');
    expect(result.stdout).toContain('# vault2:dir1/SECRET4');
    expect(result.stdout).toContain('SECRET4="this is the secret4"');
  });
  test('should output dotbat format', async () => {
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

    command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '-e',
      `${vaultName}1:.`,
      `${vaultName}2:.`,
      '--env-format',
      'dotbat',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('REM vault1:SECRET1');
    expect(result.stdout).toContain('set "SECRET1=this is the secret1"');
    expect(result.stdout).toContain('REM vault2:SECRET2');
    expect(result.stdout).toContain('set "SECRET2=this is the secret2"');
    expect(result.stdout).toContain('REM vault1:dir1/SECRET3');
    expect(result.stdout).toContain('set "SECRET3=this is the secret3"');
    expect(result.stdout).toContain('REM vault2:dir1/SECRET4');
    expect(result.stdout).toContain('set "SECRET4=this is the secret4"');
  });
  test('should output dotps format', async () => {
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

    command = [
      'secrets',
      'env',
      '-np',
      dataDir,
      '-e',
      `${vaultName}1:.`,
      `${vaultName}2:.`,
      '--env-format',
      'dotps',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('# vault1:SECRET1');
    expect(result.stdout).toContain(`$env:SECRET1 = 'this is the secret1'`);
    expect(result.stdout).toContain('# vault2:SECRET2');
    expect(result.stdout).toContain(`$env:SECRET2 = 'this is the secret2'`);
    expect(result.stdout).toContain('# vault1:dir1/SECRET3');
    expect(result.stdout).toContain(`$env:SECRET3 = 'this is the secret3'`);
    expect(result.stdout).toContain('# vault2:dir1/SECRET4');
    expect(result.stdout).toContain(`$env:SECRET4 = 'this is the secret4'`);
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
      '--env-format',
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
      '--env-format',
      'prepend',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      'SECRET1="this is the secret1" SECRET2="this is the secret2" SECRET3="this is the secret3" SECRET4="this is the secret4"',
    );
  });
  test('should output prependCmd format', async () => {
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
      '--env-format',
      'prependCmd',
    ];

    const result = await testUtils.pkExec([...command]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      'set "SECRET1=this is the secret1" & set "SECRET2=this is the secret2" & set "SECRET3=this is the secret3" & set "SECRET4=this is the secret4"',
    );
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

    // Checking valid
    const result = await testUtils.pkExec([
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'human',
      '-e',
      ...valid.map((v) => `${vaultName}:SECRET=${v}`),
    ]);
    expect(result.exitCode).toBe(0);

    // Checking invalid
    for (const nameNew of invalid) {
      const result = await testUtils.pkExec([
        'secrets',
        'env',
        '-np',
        dataDir,
        '--env-format',
        'human',
        '-e',
        `${vaultName}:SECRET=${nameNew}`,
      ]);
      expect(result.exitCode).toBe(sysexits.USAGE);
    }
  });
  test('invalid handled with error', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, '123', 'this is an invalid secret');
    });

    // Checking valid
    const result = await testUtils.pkExec([
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'human',
      '-ei',
      'error',
      '-e',
      `${vaultName}:.`,
    ]);
    expect(result.exitCode).toBe(64);
  });
  test('invalid handled with warn', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, '123', 'this is an invalid secret');
    });

    // Checking valid
    const result = await testUtils.pkExec([
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'human',
      '-ei',
      'warn',
      '-e',
      `${vaultName}:.`,
    ]);
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

    // Checking valid
    const result = await testUtils.pkExec([
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'human',
      '-ei',
      'ignore',
      '-e',
      `${vaultName}:.`,
    ]);
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

    // Checking valid
    const result = await testUtils.pkExec([
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'human',
      '-ed',
      'error',
      '-e',
      `${vaultName}:.`,
    ]);
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

    // Checking valid
    const result = await testUtils.pkExec([
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'human',
      '-ed',
      'warn',
      '-e',
      `${vaultName}:.`,
    ]);
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

    // Checking valid
    const result = await testUtils.pkExec([
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'human',
      '-ed',
      'keep',
      '-e',
      `${vaultName}:.`,
    ]);
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

    // Checking valid
    const result = await testUtils.pkExec([
      'secrets',
      'env',
      '-np',
      dataDir,
      '--env-format',
      'human',
      '-ed',
      'overwrite',
      '-e',
      `${vaultName}:.`,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toInclude('this is a secret2');
  });
});
