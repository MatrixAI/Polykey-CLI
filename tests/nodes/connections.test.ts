import type { NodeId, NodeIdEncoded } from 'polykey/dist/ids/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import * as nodesUtils from 'polykey/dist/nodes/utils';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('connections', () => {
  const logger = new Logger('connections test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  const password = 'helloworld';
  let dataDir: string;
  let nodePath: string;
  let pkAgent: PolykeyAgent;
  let remoteNode: PolykeyAgent;
  let localId: NodeId;
  let remoteId: NodeId;
  let remoteIdEncoded: NodeIdEncoded;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    nodePath = path.join(dataDir, 'keynode');
    pkAgent = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        seedNodes: {}, // Explicitly no seed nodes on startup
        nodePath,
        agentServiceHost: '127.0.0.1',
        clientServiceHost: '127.0.0.1',
        agentServicePort: 0,
        clientServicePort: 0,
        keys: {
          passwordOpsLimit: keysUtils.passwordOpsLimits.min,
          passwordMemLimit: keysUtils.passwordMemLimits.min,
          strictMemoryLock: false,
        },
      },
      logger,
    });
    localId = pkAgent.keyRing.getNodeId();
    // Setting up a remote keynode
    remoteNode = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        seedNodes: {}, // Explicitly no seed nodes on startup
        nodePath: path.join(dataDir, 'remoteNode'),
        agentServiceHost: '127.0.0.1',
        clientServiceHost: '127.0.0.1',
        agentServicePort: 0,
        clientServicePort: 0,
        keys: {
          passwordOpsLimit: keysUtils.passwordOpsLimits.min,
          passwordMemLimit: keysUtils.passwordMemLimits.min,
          strictMemoryLock: false,
        },
      },
      logger,
    });
    remoteId = remoteNode.keyRing.getNodeId();
    remoteIdEncoded = nodesUtils.encodeNodeId(remoteId);
    await testUtils.nodesConnect(pkAgent, remoteNode);
    await pkAgent.acl.setNodePerm(remoteId, {
      gestalt: {
        notify: null,
        claim: null,
      },
      vaults: {},
    });
    await remoteNode.acl.setNodePerm(localId, {
      gestalt: {
        notify: null,
        claim: null,
      },
      vaults: {},
    });
  });
  afterEach(async () => {
    await pkAgent.stop();
    await remoteNode.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test('Correctly list connection information, and not list auth data', async () => {
    await remoteNode.notificationsManager.sendNotification(localId, {
      type: 'GestaltInvite',
    });
    const { exitCode } = await testUtils.pkStdio(
      ['nodes', 'claim', remoteIdEncoded, '--force-invite'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    const { stdout } = await testUtils.pkStdio(
      ['nodes', 'connections', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          host: remoteNode.agentServiceHost,
          hostname: '',
          nodeIdEncoded: nodesUtils.encodeNodeId(
            remoteNode.keyRing.getNodeId(),
          ),
          port: remoteNode.agentServicePort,
          timeout: expect.any(Number),
          usageCount: 0,
        }),
      ]),
    );
  });
});
