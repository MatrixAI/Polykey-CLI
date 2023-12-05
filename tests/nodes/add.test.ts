import type { Host, Port } from 'polykey/dist/network/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import * as ids from 'polykey/dist/ids';
import * as nodesUtils from 'polykey/dist/nodes/utils';
import * as keysUtils from 'polykey/dist/keys/utils';
import sysexits from 'polykey/dist/utils/sysexits';
import * as testUtils from '../utils';

describe('add', () => {
  const logger = new Logger('add test', LogLevel.WARN, [new StreamHandler()]);
  const password = 'helloworld';
  const nodeIdGenerator = ids.createNodeIdGenerator();
  const validNodeId = nodeIdGenerator();
  const validHost = '127.0.0.1' as Host;
  const invalidHost = 'INVALIDHOST' as Host;
  const port = 55555 as Port;
  let dataDir: string;
  let nodePath: string;
  let pkAgent: PolykeyAgent;
  let mockedPingNode: jest.SpyInstance;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    nodePath = path.join(dataDir, 'polykey');
    // Cannot use the shared global agent since we can't 'un-add' a node
    pkAgent = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        nodePath,
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
    mockedPingNode = jest.spyOn(pkAgent.nodeManager, 'pingNodeAddress');
    await pkAgent.nodeGraph.stop();
    await pkAgent.nodeGraph.start({ fresh: true });
    mockedPingNode.mockImplementation(() => true);
  });
  afterEach(async () => {
    await pkAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
    mockedPingNode.mockRestore();
  });
  testUtils
    .testIf(testUtils.isTestPlatformEmpty)
    .only('adds a node', async () => {
      const { exitCode } = await testUtils.pkStdio(
        [
          'nodes',
          'add',
          nodesUtils.encodeNodeId(validNodeId),
          validHost,
          `${port}`,
        ],
        {
          env: {
            PK_NODE_PATH: nodePath,
            PK_PASSWORD: password,
          },
          cwd: dataDir,
        },
      );
      expect(exitCode).toBe(0);
      // Checking if node was added.
      const nodeContact = await pkAgent.nodeGraph.getNodeContact(validNodeId);
      expect(nodeContact).toBeDefined();
      expect(
        nodeContact![nodesUtils.nodeContactAddress([validHost, port])],
      ).toBeDefined();
    });
  testUtils.testIf(testUtils.isTestPlatformEmpty)(
    'fails to add a node (invalid node ID)',
    async () => {
      const { exitCode } = await testUtils.pkStdio(
        ['nodes', 'add', 'INVALIDNODEID', validHost, `${port}`],
        {
          env: {
            PK_NODE_PATH: nodePath,
            PK_PASSWORD: password,
          },
          cwd: dataDir,
        },
      );
      expect(exitCode).toBe(sysexits.USAGE);
    },
  );
  testUtils.testIf(testUtils.isTestPlatformEmpty)(
    'fails to add a node (invalid IP address)',
    async () => {
      const { exitCode } = await testUtils.pkStdio(
        [
          'nodes',
          'add',
          nodesUtils.encodeNodeId(validNodeId),
          invalidHost,
          `${port}`,
        ],
        {
          env: {
            PK_NODE_PATH: nodePath,
            PK_PASSWORD: password,
          },
          cwd: dataDir,
        },
      );
      expect(exitCode).toBe(sysexits.USAGE);
    },
  );
  testUtils.testIf(testUtils.isTestPlatformEmpty)(
    'adds a node with --force flag',
    async () => {
      const { exitCode } = await testUtils.pkStdio(
        [
          'nodes',
          'add',
          '--force',
          nodesUtils.encodeNodeId(validNodeId),
          validHost,
          `${port}`,
        ],
        {
          env: {
            PK_NODE_PATH: nodePath,
            PK_PASSWORD: password,
          },
          cwd: dataDir,
        },
      );
      expect(exitCode).toBe(0);
      // Checking if node was added.
      const nodeContact = await pkAgent.nodeGraph.getNodeContact(validNodeId);
      expect(nodeContact).toBeDefined();
      expect(
        nodeContact![nodesUtils.nodeContactAddress([validHost, port])],
      ).toBeDefined();
    },
  );
  testUtils.testIf(testUtils.isTestPlatformEmpty)(
    'fails to add node when ping fails',
    async () => {
      mockedPingNode.mockImplementation(() => false);
      const { exitCode } = await testUtils.pkStdio(
        [
          'nodes',
          'add',
          nodesUtils.encodeNodeId(validNodeId),
          validHost,
          `${port}`,
        ],
        {
          env: {
            PK_NODE_PATH: nodePath,
            PK_PASSWORD: password,
          },
          cwd: dataDir,
        },
      );
      expect(exitCode).toBe(sysexits.NOHOST);
    },
  );
  testUtils.testIf(testUtils.isTestPlatformEmpty)(
    'adds a node with --no-ping flag',
    async () => {
      mockedPingNode.mockImplementation(() => false);
      const { exitCode } = await testUtils.pkStdio(
        [
          'nodes',
          'add',
          '--no-ping',
          nodesUtils.encodeNodeId(validNodeId),
          validHost,
          `${port}`,
        ],
        {
          env: {
            PK_NODE_PATH: nodePath,
            PK_PASSWORD: password,
          },
          cwd: dataDir,
        },
      );
      expect(exitCode).toBe(0);
      // Checking if node was added.
      const nodeContact = await pkAgent.nodeGraph.getNodeContact(validNodeId);
      expect(nodeContact).toBeDefined();
      expect(
        nodeContact![nodesUtils.nodeContactAddress([validHost, port])],
      ).toBeDefined();
    },
  );
});
