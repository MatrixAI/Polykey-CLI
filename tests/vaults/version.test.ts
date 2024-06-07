import type { VaultName } from 'polykey/dist/vaults/types';
import type { GestaltNodeInfo } from 'polykey/dist/gestalts/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import * as ids from 'polykey/dist/ids';
import sysexits from 'polykey/dist/utils/sysexits';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('commandVaultVersion', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  let polykeyAgent: PolykeyAgent;
  let vaultNumber: number;
  let vaultName: VaultName;
  const nodeIdGenerator = ids.createNodeIdGenerator();
  const nodeId1 = nodeIdGenerator();
  const nodeId2 = nodeIdGenerator();
  const nodeId3 = nodeIdGenerator();
  const node1: GestaltNodeInfo = {
    nodeId: nodeId1,
  };
  const node2: GestaltNodeInfo = {
    nodeId: nodeId2,
  };
  const node3: GestaltNodeInfo = {
    nodeId: nodeId3,
  };
  // Helper functions
  function genVaultName() {
    vaultNumber++;
    return `vault-${vaultNumber}` as VaultName;
  }
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
    await polykeyAgent.gestaltGraph.setNode(node1);
    await polykeyAgent.gestaltGraph.setNode(node2);
    await polykeyAgent.gestaltGraph.setNode(node3);

    vaultNumber = 0;
    vaultName = genVaultName();
  });
  afterEach(async () => {
    await polykeyAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });

  test('should switch the version of a vault', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const id = polykeyAgent.vaultManager.getVaultId(vaultName);
    expect(id).toBeTruthy();

    const secret1 = { name: 'Secret-1', content: 'Secret-1-content' };
    const secret2 = { name: 'Secret-1', content: 'Secret-2-content' };

    const ver1Oid = await polykeyAgent.vaultManager.withVaults(
      [vaultId],
      async (vault) => {
        await vault.writeF(async (efs) => {
          await efs.writeFile(secret1.name, secret1.content);
        });
        const ver1Oid = (await vault.log(undefined, 1))[0].commitId;

        await vault.writeF(async (efs) => {
          await efs.writeFile(secret2.name, secret2.content);
        });
        return ver1Oid;
      },
    );

    const command = ['vaults', 'version', '-np', dataDir, vaultName, ver1Oid];

    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const fileContents = await vault.readF(async (efs) => {
        return (await efs.readFile(secret1.name)).toString();
      });
      expect(fileContents).toStrictEqual(secret1.content);
    });
  });
  test('should switch the version of a vault to the latest version', async () => {
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const id = polykeyAgent.vaultManager.getVaultId(vaultName);
    expect(id).toBeTruthy();

    const secret1 = { name: 'Secret-1', content: 'Secret-1-content' };
    const secret2 = { name: 'Secret-1', content: 'Secret-2-content' };

    const ver1Oid = await polykeyAgent.vaultManager.withVaults(
      [vaultId],
      async (vault) => {
        await vault.writeF(async (efs) => {
          await efs.writeFile(secret1.name, secret1.content);
        });
        const ver1Oid = (await vault.log(undefined, 1))[0].commitId;

        await vault.writeF(async (efs) => {
          await efs.writeFile(secret2.name, secret2.content);
        });
        return ver1Oid;
      },
    );

    const command = ['vaults', 'version', '-np', dataDir, vaultName, ver1Oid];

    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);

    const command2 = ['vaults', 'version', '-np', dataDir, vaultName, 'last'];

    const result2 = await testUtils.pkStdio([...command2], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result2.exitCode).toBe(0);
  });
  test('should handle invalid version IDs', async () => {
    await polykeyAgent.vaultManager.createVault(vaultName);
    const id = polykeyAgent.vaultManager.getVaultId(vaultName);
    expect(id).toBeTruthy();

    const command = [
      'vaults',
      'version',
      '-np',
      dataDir,
      vaultName,
      'NOT_A_VALID_CHECKOUT_ID',
    ];

    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(sysexits.USAGE);

    expect(result.stderr).toContain('ErrorVaultReferenceInvalid');
  });
  test('should throw an error if the vault is not found', async () => {
    const command = [
      'vaults',
      'version',
      '-np',
      dataDir,
      'zLnM7puKobbh4YXEz66StAq',
      'NOT_A_VALID_CHECKOUT_ID',
    ];

    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(sysexits.USAGE);
    expect(result.stderr).toContain('ErrorVaultsVaultUndefined');
  });
});
