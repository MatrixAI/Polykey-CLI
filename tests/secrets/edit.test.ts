import type { VaultName } from 'polykey/dist/vaults/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { vaultOps } from 'polykey/dist/vaults';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('commandEditSecret', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  const editedContent = 'edited secret contents';
  let dataDir: string;
  let editorEdit: string;
  let editorExit: string;
  let editorFail: string;
  let editorView: string;
  let polykeyAgent: PolykeyAgent;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    editorEdit = path.join(dataDir, 'editorEdit.sh');
    editorExit = path.join(dataDir, 'editorExit.sh');
    editorFail = path.join(dataDir, 'editorFail.sh');
    editorView = path.join(dataDir, 'editorView.sh');
    await fs.promises.writeFile(editorExit, `#!/usr/bin/env bash\nexit`);
    await fs.promises.chmod(editorExit, '755');
    await fs.promises.writeFile(
      editorView,
      `#!/usr/bin/env bash\ncp $1 ${dataDir}/secret; echo "${editedContent}" > $1`,
    );
    await fs.promises.chmod(editorView, '755');
    await fs.promises.writeFile(
      editorEdit,
      `#!/usr/bin/env bash\necho "${editedContent}" > $1`,
    );
    await fs.promises.chmod(editorEdit, '755');
    await fs.promises.writeFile(
      editorFail,
      `#!/usr/bin/env bash\necho "${editedContent}" > $1; exit 1`,
    );
    await fs.promises.chmod(editorFail, '755');
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

  test('should edit secret', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'secret';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName, 'original secret');
    });
    const command = [
      'secrets',
      'edit',
      '-np',
      dataDir,
      `${vaultName}:${secretName}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password, EDITOR: editorEdit },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const contents = await vaultOps.getSecret(vault, secretName);
      expect(contents.toString()).toStrictEqual(`${editedContent}\n`);
    });
  });
  test('should fail to edit without a secret path specified', async () => {
    const vaultName = 'vault' as VaultName;
    const command = ['secrets', 'edit', '-np', dataDir, vaultName];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password, EDITOR: editorEdit },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
  });
  test('should create secret if it does not exist', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'secret';
    const command = [
      'secrets',
      'edit',
      '-np',
      dataDir,
      `${vaultName}:${secretName}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password, EDITOR: editorEdit },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const contents = await vaultOps.getSecret(vault, secretName);
      expect(contents.toString()).toStrictEqual(`${editedContent}\n`);
    });
  });
  test('should not create secret if editor crashes', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'secret';
    const command = [
      'secrets',
      'edit',
      '-np',
      dataDir,
      `${vaultName}:${secretName}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password, EDITOR: editorFail },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([]);
    });
  });
  test('should not create secret if editor does not write to file', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'secret';
    const command = [
      'secrets',
      'edit',
      '-np',
      dataDir,
      `${vaultName}:${secretName}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password, EDITOR: editorExit },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([]);
    });
  });
  test('file contents should be fetched correctly', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'secret';
    const secretContent = 'original secret';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName, secretContent);
    });
    const command = [
      'secrets',
      'edit',
      '-np',
      dataDir,
      `${vaultName}:${secretName}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password, EDITOR: editorView },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    const fetchedSecret = await fs.promises.readFile(
      path.join(dataDir, 'secret'),
    );
    expect(fetchedSecret.toString()).toEqual(secretContent);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const contents = await vaultOps.getSecret(vault, secretName);
      expect(contents.toString()).toStrictEqual(`${editedContent}\n`);
    });
  });
});
