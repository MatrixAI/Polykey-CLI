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

describe('commandShare', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  let nodePathLocal: string;
  let nodePathPeer: string;
  let polykeyAgentLocal: PolykeyAgent;
  let polykeyAgentPeer: PolykeyAgent;
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
    nodePathLocal = path.join(dataDir, 'nodeLocal');
    nodePathPeer = path.join(dataDir, 'nodePeer');
    polykeyAgentLocal = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        nodePath: nodePathLocal,
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
    polykeyAgentPeer = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        nodePath: nodePathPeer,
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
    await polykeyAgentLocal.gestaltGraph.setNode(node1);
    await polykeyAgentLocal.gestaltGraph.setNode(node2);
    await polykeyAgentLocal.gestaltGraph.setNode(node3);

    vaultNumber = 0;
    vaultName = genVaultName();
    command = [];
  });
  afterEach(async () => {
    await polykeyAgentLocal.stop();
    await polykeyAgentPeer.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });

  test('Should share a vault', async () => {
    const vaultId = await polykeyAgentLocal.vaultManager.createVault(vaultName);
    const vaultIdEncoded = vaultsUtils.encodeVaultId(vaultId);
    const targetNodeId = polykeyAgentPeer.keyRing.getNodeId();
    const targetNodeIdEncoded = nodesUtils.encodeNodeId(targetNodeId);
    await polykeyAgentLocal.gestaltGraph.setNode({
      nodeId: targetNodeId,
    });
    await polykeyAgentPeer.gestaltGraph.setNode({
      nodeId: polykeyAgentLocal.keyRing.getNodeId(),
    });
    await polykeyAgentPeer.gestaltGraph.setGestaltAction(
      ['node', polykeyAgentLocal.keyRing.getNodeId()],
      'notify',
    );
    expect(
      (await polykeyAgentLocal.acl.getNodePerm(targetNodeId))?.vaults[vaultId],
    ).toBeUndefined();

    command = [
      'vaults',
      'share',
      '-np',
      nodePathLocal,
      vaultIdEncoded,
      targetNodeIdEncoded,
    ];
    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: nodePathLocal,
    });
    expect(result.exitCode).toBe(0);

    // Check permission
    const permissions1 = (await polykeyAgentLocal.acl.getNodePerm(targetNodeId))
      ?.vaults[vaultId];
    expect(permissions1).toBeDefined();
    expect(permissions1.pull).toBeDefined();
    expect(permissions1.clone).toBeDefined();
  });
  test('sharing vault handles failure to send notification due to trust', async () => {
    const vaultId = await polykeyAgentLocal.vaultManager.createVault(vaultName);
    const vaultIdEncoded = vaultsUtils.encodeVaultId(vaultId);
    const targetNodeId = polykeyAgentPeer.keyRing.getNodeId();
    const targetNodeIdEncoded = nodesUtils.encodeNodeId(targetNodeId);
    await polykeyAgentLocal.gestaltGraph.setNode({
      nodeId: targetNodeId,
    });
    expect(
      (await polykeyAgentLocal.acl.getNodePerm(targetNodeId))?.vaults[vaultId],
    ).toBeUndefined();

    command = [
      'vaults',
      'share',
      '-np',
      nodePathLocal,
      vaultIdEncoded,
      targetNodeIdEncoded,
    ];
    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: nodePathLocal,
    });
    // While the notification should fail the sharing of a vault should still succeed
    expect(result.exitCode).toBe(0);

    // Check permission
    const permissions1 = (await polykeyAgentLocal.acl.getNodePerm(targetNodeId))
      ?.vaults[vaultId];
    expect(permissions1).toBeDefined();
    expect(permissions1.pull).toBeDefined();
    expect(permissions1.clone).toBeDefined();
  });
  test('sharing vault handles failure to send notification due connection failure', async () => {
    const vaultId = await polykeyAgentLocal.vaultManager.createVault(vaultName);
    const vaultIdEncoded = vaultsUtils.encodeVaultId(vaultId);
    const targetNodeId = nodeIdGenerator();
    const targetNodeIdEncoded = nodesUtils.encodeNodeId(targetNodeId);
    await polykeyAgentLocal.gestaltGraph.setNode({
      nodeId: targetNodeId,
    });
    expect(
      (await polykeyAgentLocal.acl.getNodePerm(targetNodeId))?.vaults[vaultId],
    ).toBeUndefined();

    command = [
      'vaults',
      'share',
      '-np',
      nodePathLocal,
      vaultIdEncoded,
      targetNodeIdEncoded,
    ];
    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: nodePathLocal,
    });
    // While the notification should fail the sharing of a vault should still succeed
    expect(result.exitCode).toBe(0);

    // Check permission
    const permissions1 = (await polykeyAgentLocal.acl.getNodePerm(targetNodeId))
      ?.vaults[vaultId];
    expect(permissions1).toBeDefined();
    expect(permissions1.pull).toBeDefined();
    expect(permissions1.clone).toBeDefined();
  });
});
