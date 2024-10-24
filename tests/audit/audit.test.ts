import type { GestaltIdEncoded } from 'polykey/dist/gestalts/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import * as identitiesUtils from 'polykey/dist/identities/utils';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as discoveryEvents from 'polykey/dist/discovery/events';
import { sleep } from 'polykey/dist/utils';
import * as testUtils from '../utils';

// @ts-ignore: stub out method
identitiesUtils.browser = () => {};

describe('audit', () => {
  const logger = new Logger('audit test', LogLevel.WARN, [new StreamHandler()]);
  const password = 'password';
  let dataDir: string;
  let nodePath: string;
  let pkAgent: PolykeyAgent;
  let handleEvent: (evt) => Promise<void>;
  let processVertex: (
    parent: string | undefined,
    children: Array<string>,
  ) => Promise<void>;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    // Set up the remote gestalt state here
    // Setting up remote nodes
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

    const audit = pkAgent.audit;
    // @ts-ignore: kidnap protected
    const handlerMap = audit.eventHandlerMap;
    handleEvent = async (evt) => {
      await handlerMap.get(evt.constructor)!.handler(evt);
    };
    processVertex = async (
      parent: string | undefined,
      children: Array<string>,
    ) => {
      for (const child of children) {
        await handleEvent(
          new discoveryEvents.EventDiscoveryVertexQueued({
            detail: {
              vertex: child as GestaltIdEncoded,
              parent: parent as GestaltIdEncoded,
            },
          }),
        );
      }
      if (parent != null) {
        await handleEvent(
          new discoveryEvents.EventDiscoveryVertexProcessed({
            detail: {
              vertex: parent as GestaltIdEncoded,
            },
          }),
        );
      }
    };
  });
  afterEach(async () => {
    await pkAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test('should get all events', async () => {
    // Start of with mocking some existing discovery events
    await processVertex(undefined, ['node-A']);
    await processVertex('node-A', ['node-B', 'node-C']);
    await processVertex('node-B', ['node-D']);
    await processVertex('node-C', []);
    await processVertex('node-D', []);
    // Checking response
    const discoverResponse = await testUtils.pkExec(['audit'], {
      env: {
        PK_NODE_PATH: nodePath,
        PK_PASSWORD: password,
      },
      cwd: dataDir,
    });
    expect(discoverResponse.stdout).toIncludeMultiple([
      'discovery.vertex.queued',
      'discovery.vertex.processed',
      'node-A',
      'node-B',
      'node-C',
      'node-D',
    ]);
    expect(discoverResponse.exitCode).toBe(0);
  });
  test('should get specific events', async () => {
    // Start of with mocking some existing discovery events
    await processVertex(undefined, ['node-A']);
    await processVertex('node-A', ['node-B', 'node-C']);
    await processVertex('node-B', ['node-D']);
    await processVertex('node-C', []);
    await processVertex('node-D', []);
    // Checking response
    const discoverResponse1 = await testUtils.pkExec(
      ['audit', '--events', 'discovery.vertex.queued'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    expect(discoverResponse1.stdout).toIncludeMultiple([
      'discovery.vertex.queued',
      'node-A',
      'node-B',
      'node-C',
      'node-D',
    ]);
    expect(discoverResponse1.stdout).not.toInclude('processed');
    expect(discoverResponse1.exitCode).toBe(0);

    const discoverResponse2 = await testUtils.pkExec(
      ['audit', '--events', 'discovery.vertex.processed'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    expect(discoverResponse2.stdout).toIncludeMultiple([
      'discovery.vertex.processed',
      'node-A',
      'node-B',
      'node-C',
      'node-D',
    ]);
    expect(discoverResponse2.stdout).not.toInclude('discovery.vertex.queued');
    expect(discoverResponse2.exitCode).toBe(0);

    const discoverResponse3 = await testUtils.pkExec(
      [
        'audit',
        '--events',
        'discovery.vertex.processed',
        'discovery.vertex.queued',
      ],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    expect(discoverResponse3.stdout).toIncludeMultiple([
      'discovery.vertex.processed',
      'discovery.vertex.queued',
      'node-A',
      'node-B',
      'node-C',
      'node-D',
    ]);
    expect(discoverResponse3.exitCode).toBe(0);
  });
  test('should seek from seekStart', async () => {
    // Start of with mocking some existing discovery events
    await processVertex('node-A', ['node-AA']);
    await processVertex('node-B', ['node-BA']);
    await processVertex('node-C', ['node-CA']);
    await sleep(50);
    const date = new Date();
    await sleep(50);
    await processVertex('node-E', ['node-EA']);
    await processVertex('node-F', ['node-FA']);
    await processVertex('node-G', ['node-GA']);
    // Checking response
    const discoverResponse1 = await testUtils.pkExec(
      ['audit', '--seek-start', date.toISOString()],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    expect(discoverResponse1.stdout).not.toInclude('node-A');
    expect(discoverResponse1.stdout).not.toInclude('node-AA');
    expect(discoverResponse1.stdout).not.toInclude('node-B');
    expect(discoverResponse1.stdout).not.toInclude('node-BA');
    expect(discoverResponse1.stdout).not.toInclude('node-C');
    expect(discoverResponse1.stdout).not.toInclude('node-CA');
    expect(discoverResponse1.stdout).toIncludeMultiple([
      'queued',
      'processed',
      'node-E',
      'node-EA',
      'node-F',
      'node-FA',
      'node-G',
      'node-GA',
    ]);
    expect(discoverResponse1.exitCode).toBe(0);
  });
  test('should seek until seekEnd', async () => {
    // Start of with mocking some existing discovery events
    await processVertex('node-A', ['node-AA']);
    await processVertex('node-B', ['node-BA']);
    await processVertex('node-C', ['node-CA']);
    await sleep(50);
    const date = new Date();
    await sleep(50);
    await processVertex('node-E', ['node-EA']);
    await processVertex('node-F', ['node-FA']);
    await processVertex('node-G', ['node-GA']);
    // Checking response
    const discoverResponse1 = await testUtils.pkExec(
      ['audit', '--seek-end', date.toISOString()],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    expect(discoverResponse1.stdout).toIncludeMultiple([
      'queued',
      'processed',
      'node-A',
      'node-AA',
      'node-B',
      'node-BA',
      'node-C',
      'node-CA',
    ]);
    expect(discoverResponse1.stdout).not.toInclude('node-E');
    expect(discoverResponse1.stdout).not.toInclude('node-EA');
    expect(discoverResponse1.stdout).not.toInclude('node-F');
    expect(discoverResponse1.stdout).not.toInclude('node-FA');
    expect(discoverResponse1.stdout).not.toInclude('node-G');
    expect(discoverResponse1.stdout).not.toInclude('node-GA');
    expect(discoverResponse1.exitCode).toBe(0);
  });
  test('should seek until limit', async () => {
    // Start of with mocking some existing discovery events
    await processVertex(undefined, ['node-A']);
    await processVertex(undefined, ['node-A']);
    await processVertex(undefined, ['node-A']);
    await processVertex(undefined, ['node-A']);
    // Checking response
    const discoverResponse = await testUtils.pkExec(['audit', '--limit', '2'], {
      env: {
        PK_NODE_PATH: nodePath,
        PK_PASSWORD: password,
      },
      cwd: dataDir,
    });
    expect(discoverResponse.stdout).toIncludeRepeated('queued', 2);
    expect(discoverResponse.stdout).toIncludeRepeated('node-A', 2);
    expect(discoverResponse.exitCode).toBe(0);
  });
  test('should await future events', async () => {
    // Start of with mocking some existing discovery events
    await processVertex('node-A', ['node-AA']);
    await processVertex('node-B', ['node-BA']);
    await processVertex('node-C', ['node-CA']);
    await sleep(100);
    const discoverResponseP = testUtils.pkExec(
      ['audit', '--follow', '--limit', '12'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    await sleep(100);
    await processVertex('node-E', ['node-EA']);
    await processVertex('node-F', ['node-FA']);
    await processVertex('node-G', ['node-GA']);
    // Checking response
    const discoverResponse = await discoverResponseP;
    expect(discoverResponse.exitCode).toBe(0);
  });
});
