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

describe('commandRenameVault', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  let passwordFile: string;
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
    command = [];
  });
  afterEach(async () => {
    await polykeyAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });

  test('should rename vault', async () => {
    command = ['vaults', 'rename', vaultName, 'RenamedVault', '-np', dataDir];
    await polykeyAgent.vaultManager.createVault(vaultName);
    const id = polykeyAgent.vaultManager.getVaultId(vaultName);
    expect(id).toBeTruthy();

    const result = await testUtils.pkStdio([...command], {
      env: {},
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);

    const list = (await polykeyAgent.vaultManager.listVaults()).keys();
    const namesList: string[] = [];
    for await (const name of list) {
      namesList.push(name);
    }
    expect(namesList).toContain('RenamedVault');
  });
  test('should fail to rename non-existent vault', async () => {
    command = [
      'vaults',
      'rename',
      'z4iAXFwgHGeyUrdC5CiCNU4', // Vault does not exist
      'RenamedVault',
      '-np',
      dataDir,
    ];
    await polykeyAgent.vaultManager.createVault(vaultName);
    const id = polykeyAgent.vaultManager.getVaultId(vaultName);
    expect(id).toBeTruthy();

    const result = await testUtils.pkStdio([...command], {
      env: {},
      cwd: dataDir,
    });
    // Exit code of the exception
    expect(result.exitCode).toBe(sysexits.USAGE);

    const list = (await polykeyAgent.vaultManager.listVaults()).keys();
    const namesList: string[] = [];
    for await (const name of list) {
      namesList.push(name);
    }
    expect(namesList).toContain(vaultName);
  });
});
