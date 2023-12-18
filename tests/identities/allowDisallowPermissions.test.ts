import type { Host, Port } from 'polykey/dist/network/types';
import type { IdentityId, ProviderId } from 'polykey/dist/identities/types';
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

describe('allow/disallow/permissions', () => {
  const logger = new Logger('allow/disallow/permissions test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  const password = 'password';
  const provider = new TestProvider();
  const identity = 'abc' as IdentityId;
  const providerString = `${provider.id}:${identity}`;
  const testToken = {
    providerId: 'test-provider' as ProviderId,
    identityId: 'test_user' as IdentityId,
  };
  let dataDir: string;
  let nodePath: string;
  let pkAgent: PolykeyAgent;
  let node: PolykeyAgent;
  let nodeId: NodeId;
  let nodeHost: Host;
  let nodePort: Port;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    nodePath = path.join(dataDir, 'polykey');
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
    pkAgent.identitiesManager.registerProvider(provider);
    // Set up a gestalt to modify the permissions of
    const nodePathGestalt = path.join(dataDir, 'gestalt');
    node = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        nodePath: nodePathGestalt,
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
    nodeId = node.keyRing.getNodeId();
    nodeHost = node.agentServiceHost;
    nodePort = node.agentServicePort;
    node.identitiesManager.registerProvider(provider);
    await node.identitiesManager.putToken(provider.id, identity, {
      accessToken: 'def456',
    });
    provider.users[identity] = {};
    const identityClaim = {
      typ: 'ClaimLinkIdentity',
      iss: nodesUtils.encodeNodeId(node.keyRing.getNodeId()),
      sub: encodeProviderIdentityId([provider.id, identity]),
    };
    const [, claim] = await node.sigchain.addClaim(identityClaim);
    await provider.publishClaim(
      identity,
      claim as SignedClaim<ClaimLinkIdentity>,
    );
  });
  afterEach(async () => {
    await node.stop();
    await pkAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test('allows/disallows/gets gestalt permissions by node', async () => {
    let exitCode, stdout;
    // Add the node to our node graph, otherwise we won't be able to contact it
    await testUtils.pkStdio(
      [
        'nodes',
        'add',
        nodesUtils.encodeNodeId(nodeId),
        nodeHost,
        `${nodePort}`,
      ],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    // Must first trust node before we can set permissions
    // This is because trusting the node sets it in our gestalt graph, which
    // we need in order to set permissions
    await testUtils.pkStdio(
      ['identities', 'trust', nodesUtils.encodeNodeId(nodeId)],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    // We should now have the 'notify' permission, so we'll set the 'scan'
    // permission as well
    ({ exitCode } = await testUtils.pkStdio(
      ['identities', 'allow', nodesUtils.encodeNodeId(nodeId), 'scan'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    // Check that both permissions are set
    ({ exitCode, stdout } = await testUtils.pkStdio(
      [
        'identities',
        'permissions',
        nodesUtils.encodeNodeId(nodeId),
        '--format',
        'json',
      ],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      permissions: ['notify', 'scan'],
    });
    // Disallow both permissions
    ({ exitCode } = await testUtils.pkStdio(
      ['identities', 'disallow', nodesUtils.encodeNodeId(nodeId), 'notify'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    ({ exitCode } = await testUtils.pkStdio(
      ['identities', 'disallow', nodesUtils.encodeNodeId(nodeId), 'scan'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    // Check that both permissions were unset
    ({ exitCode, stdout } = await testUtils.pkStdio(
      [
        'identities',
        'permissions',
        nodesUtils.encodeNodeId(nodeId),
        '--format',
        'json',
      ],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      permissions: [],
    });
  });
  test('allows/disallows/gets gestalt permissions by identity', async () => {
    // Can't test with target executable due to mocking
    let exitCode, stdout;
    // Add the node to our node graph, otherwise we won't be able to contact it
    await testUtils.pkStdio(
      [
        'nodes',
        'add',
        nodesUtils.encodeNodeId(nodeId),
        nodeHost,
        `${nodePort}`,
      ],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
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
    // Must first trust identity before we can set permissions
    // This is because trusting the identity sets it in our gestalt graph,
    // which we need in order to set permissions
    // This command should fail first time since the identity won't be linked
    // to any nodes. It will trigger this process via discovery and we must
    // wait and then retry
    await testUtils.pkStdio(['identities', 'trust', providerString], {
      env: {
        PK_NODE_PATH: nodePath,
        PK_PASSWORD: password,
      },
      cwd: dataDir,
    });
    while ((await pkAgent.discovery.waitForDiscoveryTasks()) > 0) {
      // Waiting for discovery to complete
    }
    ({ exitCode } = await testUtils.pkStdio(
      ['identities', 'trust', providerString],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    // We should now have the 'notify' permission, so we'll set the 'scan'
    // permission as well
    ({ exitCode } = await testUtils.pkStdio(
      ['identities', 'allow', providerString, 'scan'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    // Check that both permissions are set
    ({ exitCode, stdout } = await testUtils.pkStdio(
      ['identities', 'permissions', providerString, '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      permissions: ['notify', 'scan'],
    });
    // Disallow both permissions
    ({ exitCode } = await testUtils.pkStdio(
      ['identities', 'disallow', providerString, 'notify'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    ({ exitCode } = await testUtils.pkStdio(
      ['identities', 'disallow', providerString, 'scan'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    // Check that both permissions were unset
    ({ exitCode, stdout } = await testUtils.pkStdio(
      ['identities', 'permissions', providerString, '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      permissions: [],
    });
  });
  test('should fail on invalid inputs', async () => {
    let exitCode;
    // Allow
    // Invalid gestalt id
    ({ exitCode } = await testUtils.pkExec(
      ['identities', 'allow', 'invalid', 'notify'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
        command: globalThis.testCmd,
      },
    ));
    expect(exitCode).toBe(sysexits.USAGE);
    // Invalid permission
    ({ exitCode } = await testUtils.pkExec(
      ['identities', 'allow', nodesUtils.encodeNodeId(nodeId), 'invalid'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
        command: globalThis.testCmd,
      },
    ));
    expect(exitCode).toBe(sysexits.USAGE);
    // Permissions
    // Invalid gestalt id
    ({ exitCode } = await testUtils.pkExec(
      ['identities', 'permissions', 'invalid'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
        command: globalThis.testCmd,
      },
    ));
    expect(exitCode).toBe(sysexits.USAGE);
    // Disallow
    // Invalid gestalt id
    ({ exitCode } = await testUtils.pkExec(
      ['identities', 'disallow', 'invalid', 'notify'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
        command: globalThis.testCmd,
      },
    ));
    expect(exitCode).toBe(sysexits.USAGE);
    // Invalid permission
    ({ exitCode } = await testUtils.pkExec(
      ['identities', 'disallow', nodesUtils.encodeNodeId(nodeId), 'invalid'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
        command: globalThis.testCmd,
      },
    ));
    expect(exitCode).toBe(sysexits.USAGE);
  });
});
