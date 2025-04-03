import type { VaultName } from 'polykey/vaults/types.js';
import type { GestaltNodeInfo } from 'polykey/gestalts/types.js';
import path from 'node:path';
import fs from 'node:fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/PolykeyAgent.js';
import * as ids from 'polykey/ids/index.js';
import * as keysUtils from 'polykey/keys/utils/index.js';
import * as testUtils from '../utils/index.js';

describe('commandRemoveVault', () => {
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

  test('should remove vault', async () => {
    command = ['vaults', 'rm', '-np', dataDir, vaultName];
    await polykeyAgent.vaultManager.createVault(vaultName);
    let id = polykeyAgent.vaultManager.getVaultId(vaultName);
    expect(id).toBeTruthy();

    id = polykeyAgent.vaultManager.getVaultId(vaultName);
    expect(id).toBeTruthy();

    const result2 = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result2.exitCode).toBe(0);

    const list = (await polykeyAgent.vaultManager.listVaults()).keys();
    const namesList: string[] = [];
    for await (const name of list) {
      namesList.push(name);
    }
    expect(namesList).not.toContain(vaultName);
  });
});
