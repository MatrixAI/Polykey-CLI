import type { VaultName } from 'polykey/dist/vaults/types';
import type { GestaltNodeInfo } from 'polykey/dist/gestalts/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import * as ids from 'polykey/dist/ids';
import * as nodesUtils from 'polykey/dist/nodes/utils';
import * as vaultsUtils from 'polykey/dist/vaults/utils';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('commandPermissions', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  let polykeyAgent: PolykeyAgent;
  let command: Array<string>;
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
    command = [];
  });
  afterEach(async () => {
    await polykeyAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });

  test('Should get a vaults permissions', async () => {
    const vaultId1 = await polykeyAgent.vaultManager.createVault(vaultName);
    const vaultId2 = await polykeyAgent.vaultManager.createVault(
      vaultName + '1',
    );
    const vaultIdEncoded1 = vaultsUtils.encodeVaultId(vaultId1);
    const vaultIdEncoded2 = vaultsUtils.encodeVaultId(vaultId2);
    const targetNodeId = nodeIdGenerator();
    const targetNodeIdEncoded = nodesUtils.encodeNodeId(targetNodeId);
    await polykeyAgent.gestaltGraph.setNode({
      nodeId: targetNodeId,
    });

    // Creating permissions
    await polykeyAgent.gestaltGraph.setGestaltAction(
      ['node', targetNodeId],
      'scan',
    );
    await polykeyAgent.acl.setVaultAction(vaultId1, targetNodeId, 'clone');
    await polykeyAgent.acl.setVaultAction(vaultId1, targetNodeId, 'pull');
    await polykeyAgent.acl.setVaultAction(vaultId2, targetNodeId, 'pull');

    command = ['vaults', 'permissions', '-np', dataDir, vaultIdEncoded1];
    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(targetNodeIdEncoded);
    expect(result.stdout).toContain('clone');
    expect(result.stdout).toContain('pull');

    command = ['vaults', 'permissions', '-np', dataDir, vaultIdEncoded2];
    const result2 = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result2.exitCode).toBe(0);
    expect(result2.stdout).toContain(targetNodeIdEncoded);
    expect(result2.stdout).not.toContain('clone');
    expect(result2.stdout).toContain('pull');
  });
});
