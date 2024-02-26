import type { IdentityId, ProviderId } from 'polykey/dist/identities/types';
import type { Host, Port } from 'polykey/dist/network/types';
import type { NodeId } from 'polykey/dist/ids/types';
import type { ClaimLinkIdentity } from 'polykey/dist/claims/payloads';
import type { SignedClaim } from 'polykey/dist/claims/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { sysexits } from 'polykey/dist/utils';
import * as nodesUtils from 'polykey/dist/nodes/utils';
import * as identitiesUtils from 'polykey/dist/identities/utils';
import * as keysUtils from 'polykey/dist/keys/utils';
import { encodeProviderIdentityId } from 'polykey/dist/identities/utils';
import TestProvider from '../TestProvider';
import * as testUtils from '../utils';

// @ts-ignore: stub out method
identitiesUtils.browser = () => {};

describe('discover/get', () => {
  const logger = new Logger('discover/get test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  const password = 'helloworld';
  const testProvider = new TestProvider();
  const identityId = 'abc' as IdentityId;
  const providerString = `${testProvider.id}:${identityId}`;
  const testToken = {
    providerId: 'test-provider' as ProviderId,
    identityId: 'test_user' as IdentityId,
  };
  let dataDir: string;
  let nodePath: string;
  let pkAgent: PolykeyAgent;
  let nodeA: PolykeyAgent;
  let nodeB: PolykeyAgent;
  let nodeAId: NodeId;
  let nodeBId: NodeId;
  let nodeAHost: Host;
  let nodeAPort: Port;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    // Set up the remote gestalt state here
    // Setting up remote nodes
    nodeA = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        nodePath: path.join(dataDir, 'nodeA'),
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
    nodeAId = nodeA.keyRing.getNodeId();
    nodeAHost = nodeA.agentServiceHost;
    nodeAPort = nodeA.agentServicePort;
    nodeB = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        nodePath: path.join(dataDir, 'nodeB'),
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
    nodeBId = nodeB.keyRing.getNodeId();
    await testUtils.nodesConnect(nodeA, nodeB);
    nodePath = path.join(dataDir, 'polykey');
    // Cannot use global shared agent since we need to register a provider
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
    pkAgent.identitiesManager.registerProvider(testProvider);
    // Add node claim to gestalt
    await nodeB.acl.setNodeAction(nodeAId, 'claim');
    await nodeA.nodeManager.claimNode(nodeBId);
    // Add identity claim to gestalt
    testProvider.users[identityId] = {};
    nodeA.identitiesManager.registerProvider(testProvider);
    await nodeA.identitiesManager.putToken(testProvider.id, identityId, {
      accessToken: 'abc123',
    });
    const identityClaim = {
      typ: 'ClaimLinkIdentity',
      iss: nodesUtils.encodeNodeId(nodeAId),
      sub: encodeProviderIdentityId([testProvider.id, identityId]),
    };
    const [, claim] = await nodeA.sigchain.addClaim(identityClaim);
    await testProvider.publishClaim(
      identityId,
      claim as SignedClaim<ClaimLinkIdentity>,
    );
  });
  afterEach(async () => {
    await pkAgent.stop();
    await nodeB.stop();
    await nodeA.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test(
    'discovers and gets gestalt by node',
    async () => {
      await testUtils.pkStdio(
        [
          'identities',
          'authenticate',
          testToken.providerId,
          testToken.identityId,
        ],
        {
          env: {
            PK_NODE_PATH: nodePath,
            PK_PASSWORD: password,
          },
          cwd: dataDir,
        },
      );
      // Add one of the nodes to our gestalt graph so that we'll be able to
      // contact the gestalt during discovery
      await testUtils.pkStdio(
        [
          'nodes',
          'add',
          nodesUtils.encodeNodeId(nodeAId),
          nodeAHost,
          `${nodeAPort}`,
        ],
        {
          env: {
            PK_NODE_PATH: nodePath,
            PK_PASSWORD: password,
          },
          cwd: dataDir,
        },
      );
      // Discover gestalt by node
      const discoverResponse = await testUtils.pkStdio(
        ['identities', 'discover', nodesUtils.encodeNodeId(nodeAId)],
        {
          env: {
            PK_NODE_PATH: nodePath,
            PK_PASSWORD: password,
          },
          cwd: dataDir,
        },
      );
      expect(discoverResponse.exitCode).toBe(0);
      // Since discovery is a background process we need to wait for the
      while ((await pkAgent.discovery.waitForDiscoveryTasks()) > 0) {
        // Gestalt to be discovered
      }
      // Now we can get the gestalt
      const getResponse = await testUtils.pkStdio(
        ['identities', 'get', nodesUtils.encodeNodeId(nodeAId)],
        {
          env: {
            PK_NODE_PATH: nodePath,
            PK_PASSWORD: password,
          },
          cwd: dataDir,
        },
      );
      expect(getResponse.exitCode).toBe(0);
      expect(getResponse.stdout).toContain(nodesUtils.encodeNodeId(nodeAId));
      expect(getResponse.stdout).toContain(nodesUtils.encodeNodeId(nodeBId));
      expect(getResponse.stdout).toContain(providerString);
      // Revert side effects
      await pkAgent.gestaltGraph.unsetNode(nodeAId);
      await pkAgent.gestaltGraph.unsetNode(nodeBId);
      await pkAgent.gestaltGraph.unsetIdentity([testProvider.id, identityId]);
      await pkAgent.nodeGraph.unsetNodeContact(nodeAId);
      await pkAgent.identitiesManager.delToken(
        testToken.providerId,
        testToken.identityId,
      );
      // @ts-ignore - get protected property
      pkAgent.discovery.visitedVertices.clear();
    },
    globalThis.defaultTimeout * 3,
  );
  test('discovers and gets gestalt by identity', async () => {
    await testUtils.pkStdio(
      [
        'identities',
        'authenticate',
        testToken.providerId,
        testToken.identityId,
      ],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    // Add one of the nodes to our gestalt graph so that we'll be able to
    // contact the gestalt during discovery
    await testUtils.pkStdio(
      [
        'nodes',
        'add',
        nodesUtils.encodeNodeId(nodeAId),
        nodeAHost,
        `${nodeAPort}`,
      ],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    // Discover gestalt by node
    const discoverResponse = await testUtils.pkStdio(
      ['identities', 'discover', providerString],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    expect(discoverResponse.exitCode).toBe(0);
    // Since discovery is a background process we need to wait for the
    while ((await pkAgent.discovery.waitForDiscoveryTasks()) > 0) {
      // Gestalt to be discovered
    }
    // Now we can get the gestalt
    const getResponse = await testUtils.pkStdio(
      ['identities', 'get', providerString],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    expect(getResponse.exitCode).toBe(0);
    expect(getResponse.stdout).toContain(nodesUtils.encodeNodeId(nodeAId));
    expect(getResponse.stdout).toContain(nodesUtils.encodeNodeId(nodeBId));
    expect(getResponse.stdout).toContain(providerString);
    // Revert side effects
    await pkAgent.gestaltGraph.unsetNode(nodeAId);
    await pkAgent.gestaltGraph.unsetNode(nodeBId);
    await pkAgent.gestaltGraph.unsetIdentity([testProvider.id, identityId]);
    await pkAgent.nodeGraph.unsetNodeContact(nodeAId);
    await pkAgent.identitiesManager.delToken(
      testToken.providerId,
      testToken.identityId,
    );
    // @ts-ignore - get protected property
    pkAgent.discovery.visitedVertices.clear();
  });
  test('should fail on invalid inputs', async () => {
    // Discover
    const { exitCode } = await testUtils.pkExec(
      ['identities', 'discover', 'invalid'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    expect(exitCode).toBe(sysexits.USAGE);
    // Get
    await testUtils.pkExec(['identities', 'get', 'invalid'], {
      env: {
        PK_NODE_PATH: nodePath,
        PK_PASSWORD: password,
      },
      cwd: dataDir,
    });
  });
});
