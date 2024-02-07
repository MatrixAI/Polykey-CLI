import type { VaultId, VaultName } from 'polykey/dist/vaults/types';
import type { GestaltNodeInfo } from 'polykey/dist/gestalts/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import * as ids from 'polykey/dist/ids';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('commandVaultLog', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  const secret1 = { name: 'secret1', content: 'Secret-1-content' };
  const secret2 = { name: 'secret2', content: 'Secret-2-content' };

  let dataDir: string;
  let passwordFile: string;
  let polykeyAgent: PolykeyAgent;
  let vaultNumber: number;
  let vaultName: VaultName;
  let vaultId: VaultId;
  let writeF1Oid: string;
  let writeF2Oid: string;
  let writeF3Oid: string;

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
    await polykeyAgent.gestaltGraph.setNode(node1);
    await polykeyAgent.gestaltGraph.setNode(node2);
    await polykeyAgent.gestaltGraph.setNode(node3);

    vaultNumber = 0;

    // Authorize session
    await testUtils.pkStdio(
      ['agent', 'unlock', '-np', dataDir, '--password-file', passwordFile],
      {
        env: {},
        cwd: dataDir,
      },
    );
    vaultName = genVaultName();

    vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vault.writeF(async (efs) => {
        await efs.writeFile(secret1.name, secret1.content);
      });
      writeF1Oid = (await vault.log(undefined, 0))[0].commitId;

      await vault.writeF(async (efs) => {
        await efs.writeFile(secret2.name, secret2.content);
      });
      writeF2Oid = (await vault.log(undefined, 0))[0].commitId;

      await vault.writeF(async (efs) => {
        await efs.unlink(secret2.name);
      });
      writeF3Oid = (await vault.log(undefined, 0))[0].commitId;
    });
  });
  afterEach(async () => {
    await polykeyAgent.vaultManager.destroyVault(vaultId);

    await polykeyAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });

  test('Should get all writeFs', async () => {
    const command = ['vaults', 'log', '-np', dataDir, vaultName];

    const result = await testUtils.pkStdio([...command], {
      env: {},
      cwd: dataDir,
    });
    expect(result.exitCode).toEqual(0);
    expect(result.stdout).toContain(writeF1Oid);
    expect(result.stdout).toContain(writeF2Oid);
    expect(result.stdout).toContain(writeF3Oid);
  });
  test('should get a part of the log', async () => {
    const command = ['vaults', 'log', '-np', dataDir, '-d', '2', vaultName];

    const result = await testUtils.pkStdio([...command], {
      env: {},
      cwd: dataDir,
    });
    expect(result.exitCode).toEqual(0);
    expect(result.stdout).not.toContain(writeF1Oid);
    expect(result.stdout).toContain(writeF2Oid);
    expect(result.stdout).toContain(writeF3Oid);
  });
  test('should get a specific writeF', async () => {
    const command = [
      'vaults',
      'log',
      '-np',
      dataDir,
      '-d',
      '1',
      vaultName,
      '-ci',
      writeF2Oid,
    ];

    const result = await testUtils.pkStdio([...command], {
      env: {},
      cwd: dataDir,
    });
    expect(result.exitCode).toEqual(0);
    expect(result.stdout).not.toContain(writeF1Oid);
    expect(result.stdout).toContain(writeF2Oid);
    expect(result.stdout).not.toContain(writeF3Oid);
  });
  test.todo('test formatting of the output');
});
