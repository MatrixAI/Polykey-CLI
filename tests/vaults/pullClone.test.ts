import type { VaultName } from 'polykey/dist/vaults/types';
import type { GestaltNodeInfo } from 'polykey/dist/gestalts/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import * as ids from 'polykey/dist/ids';
import * as nodesUtils from 'polykey/dist/nodes/utils';
import * as vaultsUtils from 'polykey/dist/vaults/utils';
import sysexits from 'polykey/dist/utils/sysexits';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('pull and clone', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  let dataDir2: string;
  let passwordFile: string;
  let polykeyAgent: PolykeyAgent;
  let polykeyAgentTarget: PolykeyAgent;
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
    dataDir2 = await fs.promises.mkdtemp(
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

    polykeyAgentTarget = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        nodePath: dataDir2,
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
    command = [];
  });
  afterEach(async () => {
    await polykeyAgent.stop();
    await polykeyAgentTarget.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
    await fs.promises.rm(dataDir2, {
      force: true,
      recursive: true,
    });
  });

  test(
    'should clone and pull a vault',
    async () => {
      const vaultId =
        await polykeyAgentTarget.vaultManager.createVault(vaultName);
      await polykeyAgentTarget.vaultManager.withVaults(
        [vaultId],
        async (vault) => {
          await vault.writeF(async (efs) => {
            await efs.writeFile('secret 1', 'secret the first');
          });
        },
      );

      await polykeyAgentTarget.gestaltGraph.setNode({
        nodeId: polykeyAgent.keyRing.getNodeId(),
      });
      const targetNodeId = polykeyAgentTarget.keyRing.getNodeId();
      const targetNodeIdEncoded = nodesUtils.encodeNodeId(targetNodeId);
      await polykeyAgent.nodeManager.setNode(
        targetNodeId,
        [
          polykeyAgentTarget.agentServiceHost,
          polykeyAgentTarget.agentServicePort,
        ],
        {
          mode: 'direct',
          connectedTime: Date.now(),
          scopes: ['global'],
        },
      );
      await polykeyAgentTarget.nodeManager.setNode(
        polykeyAgent.keyRing.getNodeId(),
        [polykeyAgent.agentServiceHost, polykeyAgent.agentServicePort],
        {
          mode: 'direct',
          connectedTime: Date.now(),
          scopes: ['global'],
        },
      );
      await polykeyAgent.acl.setNodePerm(targetNodeId, {
        gestalt: {
          notify: null,
        },
        vaults: {},
      });

      const nodeId = polykeyAgent.keyRing.getNodeId();
      await polykeyAgentTarget.gestaltGraph.setGestaltAction(
        ['node', nodeId],
        'scan',
      );
      await polykeyAgentTarget.acl.setVaultAction(vaultId, nodeId, 'clone');
      await polykeyAgentTarget.acl.setVaultAction(vaultId, nodeId, 'pull');

      command = [
        'vaults',
        'clone',
        '-np',
        dataDir,
        vaultsUtils.encodeVaultId(vaultId),
        targetNodeIdEncoded,
      ];

      let result = await testUtils.pkStdio([...command], {
        env: {},
        cwd: dataDir,
      });
      expect(result.exitCode).toBe(0);

      const clonedVaultId =
        await polykeyAgent.vaultManager.getVaultId(vaultName);

      await polykeyAgent.vaultManager.withVaults(
        [clonedVaultId!],
        async (clonedVault) => {
          const file = await clonedVault.readF(async (efs) => {
            return await efs.readFile('secret 1', { encoding: 'utf8' });
          });
          expect(file).toBe('secret the first');
        },
      );

      await polykeyAgent.vaultManager.destroyVault(clonedVaultId!);
      command = [
        'vaults',
        'clone',
        '-np',
        dataDir,
        vaultName,
        nodesUtils.encodeNodeId(targetNodeId),
      ];
      result = await testUtils.pkStdio([...command], { env: {}, cwd: dataDir });
      expect(result.exitCode).toBe(0);

      const secondClonedVaultId =
        (await polykeyAgent.vaultManager.getVaultId(vaultName))!;
      await polykeyAgent.vaultManager.withVaults(
        [secondClonedVaultId!],
        async (secondClonedVault) => {
          const file = await secondClonedVault.readF(async (efs) => {
            return await efs.readFile('secret 1', { encoding: 'utf8' });
          });
          expect(file).toBe('secret the first');
        },
      );

      await polykeyAgentTarget.vaultManager.withVaults(
        [vaultId],
        async (vault) => {
          await vault.writeF(async (efs) => {
            await efs.writeFile('secret 2', 'secret the second');
          });
        },
      );

      command = ['vaults', 'pull', '-np', dataDir, vaultName];
      result = await testUtils.pkStdio([...command], { env: {}, cwd: dataDir });
      expect(result.exitCode).toBe(0);

      await polykeyAgent.vaultManager.withVaults(
        [secondClonedVaultId!],
        async (secondClonedVault) => {
          const file = await secondClonedVault.readF(async (efs) => {
            return await efs.readFile('secret 2', { encoding: 'utf8' });
          });
          expect(file).toBe('secret the second');
        },
      );

      command = [
        'vaults',
        'pull',
        '-np',
        dataDir,
        '-pv',
        'InvalidName',
        vaultsUtils.encodeVaultId(secondClonedVaultId),
        targetNodeIdEncoded,
      ];
      result = await testUtils.pkStdio([...command], { env: {}, cwd: dataDir });
      expect(result.exitCode).toBe(sysexits.USAGE);
      expect(result.stderr).toContain('ErrorVaultsVaultUndefined');

      command = [
        'vaults',
        'pull',
        '-np',
        dataDir,
        '-pv',
        vaultName,
        vaultsUtils.encodeVaultId(secondClonedVaultId),
        'InvalidNodeId',
      ];
      result = await testUtils.pkStdio([...command], { env: {}, cwd: dataDir });
      expect(result.exitCode).toBe(sysexits.USAGE);
    },
    globalThis.defaultTimeout * 3,
  );
  test('should handle duplicate name when cloning', async () => {
    // Create local vault
    await polykeyAgent.vaultManager.createVault(vaultName);
    const vaultIdTarget =
      await polykeyAgentTarget.vaultManager.createVault(vaultName);

    // Create connection to work from
    const nodeIdTarget = polykeyAgentTarget.keyRing.getNodeId();
    await polykeyAgent.nodeConnectionManager.createConnection(
      [nodeIdTarget],
      polykeyAgentTarget.nodeConnectionManager.host,
      polykeyAgentTarget.nodeConnectionManager.port,
    );

    // Create permission to clone
    const nodeId = polykeyAgent.keyRing.getNodeId();
    await polykeyAgentTarget.gestaltGraph.setNode({
      nodeId,
    });
    await polykeyAgentTarget.gestaltGraph.setGestaltAction(
      ['node', nodeId],
      'scan',
    );
    await polykeyAgentTarget.acl.setVaultAction(vaultIdTarget, nodeId, 'clone');
    await polykeyAgentTarget.acl.setVaultAction(vaultIdTarget, nodeId, 'pull');

    // Attempt to clone the vault
    const result = await testUtils.pkStdio(
      [
        'vaults',
        'clone',
        '-np',
        dataDir,
        vaultName,
        nodesUtils.encodeNodeId(nodeIdTarget),
      ],
      {
        env: {},
        cwd: dataDir,
      },
    );
    expect(result.exitCode).toBe(0);
    const result2 = await polykeyAgent.vaultManager.listVaults();
    // Now have two separate vaults
    expect(result2.size).toBe(2);
  });
  test('should handle failure to connect while cloning', async () => {
    // Attempt to clone the vault
    const result = await testUtils.pkStdio(
      [
        'vaults',
        'clone',
        '-np',
        dataDir,
        vaultName,
        nodesUtils.encodeNodeId(
          nodesUtils.generateRandomNodeIdForBucket(
            polykeyAgent.keyRing.getNodeId(),
            100,
          ),
        ),
      ],
      {
        env: {},
        cwd: dataDir,
      },
    );
    expect(result.exitCode).toBe(75);
    expect(result.stderr).toContain('ErrorNodeManagerConnectionFailed');
  });
});
