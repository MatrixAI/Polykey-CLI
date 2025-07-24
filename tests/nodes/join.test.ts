import type { NodeId } from 'polykey/ids/types.js';
import type { SeedNodes } from 'polykey/nodes/types.js';
import path from 'node:path';
import fs from 'node:fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import { encodeNodeId, decodeNodeId } from 'polykey/nodes/utils.js';
import { verifyClaimNetworkAuthority } from 'polykey/claims/payloads/claimNetworkAuthority.js';
import { jest } from '@jest/globals';
import PolykeyAgent from 'polykey/PolykeyAgent.js';
import * as keysUtils from 'polykey/keys/utils/index.js';
import * as testUtils from '../utils/index.js';

let seedNodeId: NodeId;
let seedNodeIdEncoded = '';
let seedNodeHost = '';
let seedNodePort = 0;
jest.unstable_mockModule('polykey/nodes/utils.js', () => {
  return {
    __esModule: true,
    decodeNodeId,
    resolveSeednodes: jest
      .fn<() => Promise<SeedNodes>>()
      .mockImplementation(async () => {
        const nodes: SeedNodes = {};
        nodes[seedNodeIdEncoded] = [seedNodeHost, seedNodePort];
        return nodes;
      }),
  };
});

describe('join', () => {
  const logger = new Logger('join test', LogLevel.WARN, [new StreamHandler()]);
  const password = 'helloworld';
  let dataDir: string;
  let nodePath: string;
  let polykeyAgent: PolykeyAgent;
  let seedNode: PolykeyAgent;
  let seedNodeClaimNetworkAuthority;
  let networkKeyPair;
  let networkNodeId;
  let network = 'test.network.com';
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    networkKeyPair = keysUtils.generateKeyPair();
    networkNodeId = keysUtils.publicKeyToNodeId(networkKeyPair.publicKey);
    network = 'test.network.com';
    nodePath = path.join(dataDir, 'keynode');
    polykeyAgent = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        seedNodes: {}, // Explicitly no seed nodes on startup
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
    // Setting up a remote seednode
    seedNode = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        nodePath: path.join(dataDir, 'seednode'),
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
    [, seedNodeClaimNetworkAuthority] =
      await seedNode.nodeManager.createClaimNetworkAuthority(
        networkNodeId,
        network,
        false,
        async (claim) => {
          claim.signWithPrivateKey(networkKeyPair.privateKey);
          return claim;
        },
      );
    await seedNode.nodeManager.createSelfSignedClaimNetworkAccess(
      seedNodeClaimNetworkAuthority,
    );
    await testUtils.nodesConnect(polykeyAgent, seedNode);
    seedNodeId = seedNode.keyRing.getNodeId();
    seedNodeHost = seedNode.agentServiceHost;
    seedNodePort = seedNode.agentServicePort;
    seedNodeIdEncoded = encodeNodeId(seedNodeId);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await polykeyAgent.stop();
    await seedNode.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test('should connect to a seednode', async () => {
    const command = ['nodes', 'join', '-np', nodePath, network];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);

    expect(() =>
      verifyClaimNetworkAuthority(
        networkNodeId,
        seedNodeId,
        network,
        seedNodeClaimNetworkAuthority,
      ),
    ).not.toThrow();
  });
});
