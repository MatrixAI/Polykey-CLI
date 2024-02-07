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

// Fixme: temperamental problem with formatting the output. Fails sometimes due to an added space
describe('commandScanNode', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  let passwordFile: string;
  let polykeyAgent: PolykeyAgent;
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

  test(
    'should return the vaults names and ids of the remote vault',
    async () => {
      let remoteOnline: PolykeyAgent | undefined;
      try {
        remoteOnline = await PolykeyAgent.createPolykeyAgent({
          password,
          options: {
            nodePath: path.join(dataDir, 'remoteOnline'),
            agentServiceHost: '127.0.0.1',
            clientServiceHost: '127.0.0.1',
            keys: {
              passwordOpsLimit: keysUtils.passwordOpsLimits.min,
              passwordMemLimit: keysUtils.passwordMemLimits.min,
              strictMemoryLock: false,
            },
          },
          logger,
        });
        const remoteOnlineNodeId = remoteOnline.keyRing.getNodeId();
        const remoteOnlineNodeIdEncoded =
          nodesUtils.encodeNodeId(remoteOnlineNodeId);
        await polykeyAgent.nodeManager.setNode(
          remoteOnlineNodeId,
          [remoteOnline.agentServiceHost, remoteOnline.agentServicePort],
          {
            mode: 'direct',
            connectedTime: Date.now(),
            scopes: ['global'],
          },
        );

        await remoteOnline.gestaltGraph.setNode({
          nodeId: polykeyAgent.keyRing.getNodeId(),
        });

        const commands1 = [
          'vaults',
          'scan',
          remoteOnlineNodeIdEncoded,
          '-np',
          dataDir,
        ];
        const result1 = await testUtils.pkStdio(commands1, {
          env: { PK_PASSWORD: 'password' },
          cwd: dataDir,
        });
        expect(result1.exitCode).toEqual(sysexits.NOPERM);
        expect(result1.stderr).toContain(
          'ErrorVaultsPermissionDenied: Permission was denied - Scanning is not allowed for',
        );

        await remoteOnline.gestaltGraph.setGestaltAction(
          ['node', polykeyAgent.keyRing.getNodeId()],
          'notify',
        );

        const commands2 = [
          'vaults',
          'scan',
          remoteOnlineNodeIdEncoded,
          '-np',
          dataDir,
        ];
        const result2 = await testUtils.pkStdio(commands2, {
          env: { PK_PASSWORD: 'password' },
          cwd: dataDir,
        });
        expect(result2.exitCode).toEqual(sysexits.NOPERM);
        expect(result2.stderr).toContain(
          'ErrorVaultsPermissionDenied: Permission was denied - Scanning is not allowed for',
        );

        await remoteOnline.gestaltGraph.setGestaltAction(
          ['node', polykeyAgent.keyRing.getNodeId()],
          'scan',
        );

        const vault1Id = await remoteOnline.vaultManager.createVault(
          'Vault1' as VaultName,
        );
        const vault2Id = await remoteOnline.vaultManager.createVault(
          'Vault2' as VaultName,
        );
        const vault3Id = await remoteOnline.vaultManager.createVault(
          'Vault3' as VaultName,
        );
        const nodeId = polykeyAgent.keyRing.getNodeId();
        await remoteOnline.acl.setVaultAction(vault1Id, nodeId, 'clone');
        await remoteOnline.acl.setVaultAction(vault2Id, nodeId, 'pull');
        await remoteOnline.acl.setVaultAction(vault2Id, nodeId, 'clone');
        const commands3 = [
          'vaults',
          'scan',
          remoteOnlineNodeIdEncoded,
          '-np',
          dataDir,
        ];
        const result3 = await testUtils.pkStdio(commands3, {
          env: { PK_PASSWORD: 'password' },
          cwd: dataDir,
        });
        expect(result3.exitCode).toBe(0);
        expect(result3.stdout).toMatch(/Vault1\t.*\tclone/);
        expect(JSON.stringify(result3.stdout)).toContain(
          JSON.stringify(
            `Vault1\t${vaultsUtils.encodeVaultId(
              vault1Id,
            )}\tclone\nVault2\t${vaultsUtils.encodeVaultId(
              vault2Id,
            )}\tpull,clone\n`,
          ),
        );
        expect(result3.stdout).not.toContain(
          `Vault3\t${vaultsUtils.encodeVaultId(vault3Id)}`,
        );
      } finally {
        await remoteOnline?.stop();
      }
    },
    globalThis.defaultTimeout * 2,
  );
});
