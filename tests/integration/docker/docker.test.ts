/* eslint-disable no-console */
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { sleep } from 'polykey/dist/utils';
import Status from 'polykey/dist/status/Status';
import config from 'polykey/dist/config';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import { encodeNodeId } from 'polykey/dist/ids';
import * as testUtils from '../../utils';

/**
 * These tests run against a docker image of a PolykeyAgent.
 * For these tests to run properly the image must be tagged as `polykey-cli:testtarget`
 */

describe('docker integration tests', () => {
  const commandFactory = (cwd: string) => {
    const dockerOptions = testUtils.generateDockerArgs(cwd).join(' ');
    // Return undefined
    return `docker run ${dockerOptions} polykey-cli:testtarget`;
  };

  const logger = new Logger('start test', LogLevel.INFO, [new StreamHandler()]);
  const password = 'abc123';
  let dataDir: string;
  let cleanup: Array<() => Promise<void>>;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    cleanup = [];
  });
  afterEach(async () => {
    await Promise.allSettled(cleanup.map((v) => v()));
    await fs.promises
      .rm(dataDir, {
        force: true,
        recursive: true,
      })
      // Just ignore failures here
      .catch(() => {});
  });
  test.skip(
    'start in foreground',
    async () => {
      const agentProcess = await testUtils.pkSpawn(
        [
          'agent',
          'start',
          '--node-path',
          path.join(dataDir, 'polykey'),
          '--workers',
          'none',
          '--verbose',
          '--format',
          'json',
        ],
        {
          env: {
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
            PK_SEED_NODES: '',
          },
          cwd: dataDir,
          command: commandFactory(dataDir),
        },
        logger,
      );
      const rlOut = readline.createInterface(agentProcess.stdout!);
      const stdout = await new Promise<string>((resolve, reject) => {
        rlOut.once('line', resolve);
        rlOut.once('close', () => reject(Error('closed early')));
      });
      const statusLiveData = JSON.parse(stdout);
      expect(statusLiveData).toMatchObject({
        pid: expect.any(Number),
        nodeId: expect.any(String),
        clientHost: expect.any(String),
        clientPort: expect.any(Number),
        agentHost: expect.any(String),
        agentPort: expect.any(Number),
        recoveryCode: expect.any(String),
      });
      expect(
        statusLiveData.recoveryCode.split(' ').length === 12 ||
          statusLiveData.recoveryCode.split(' ').length === 24,
      ).toBe(true);

      const status = new Status({
        statusPath: path.join(dataDir, 'polykey', config.paths.statusBase),
        statusLockPath: path.join(
          dataDir,
          'polykey',
          config.paths.statusLockBase,
        ),
        fs,
        logger,
      });
      const statusInfoProm = status.waitFor('DEAD');
      cleanup.push(async () => {
        agentProcess.kill('SIGTERM');
        await statusInfoProm;
      });
      agentProcess.kill('SIGTERM');
      expect((await statusInfoProm).status).toBe('DEAD');
    },
    globalThis.defaultTimeout * 2,
  );
  // TODO: this should check for the existence of our node and other nodes in the seed nodes graph
  //  We can't test for hole punching on the same network, but we can see that all the nodes connect.
  test('connect to testnet', async () => {
    const password = 'abc123';
    const polykeyPath = path.join(dataDir, 'polykey');
    await fs.promises.mkdir(polykeyPath);
    const agentProcess = await testUtils.pkSpawn(
      [
        'agent',
        'start',
        '--node-path',
        path.join(dataDir, 'polykey'),
        '--workers',
        'none',
        '--network',
        'testnet',
        '--verbose',
        '--format',
        'json',
      ],
      {
        env: {
          PK_NODE_PATH: path.join(dataDir, 'polykey'),
          PK_PASSWORD: password,
          PK_PASSWORD_OPS_LIMIT: 'min',
          PK_PASSWORD_MEM_LIMIT: 'min',
        },
        cwd: dataDir,
        command: commandFactory(dataDir),
      },
      logger,
    );
    const status = new Status({
      statusPath: path.join(dataDir, 'polykey', config.paths.statusBase),
      statusLockPath: path.join(
        dataDir,
        'polykey',
        config.paths.statusLockBase,
      ),
      fs,
      logger,
    });
    const waitForLiveP = status.waitFor('LIVE');

    cleanup.push(async () => {
      await waitForLiveP;
      agentProcess.kill('SIGTERM');
      await status.waitFor('DEAD');
    });

    await waitForLiveP;

    // Checking for connections
    await sleep(5000);
    const { stdout, stderr, exitCode } = await testUtils.pkStdio(
      ['nodes', 'connections', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: path.join(dataDir, 'polykey'),
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    console.log(stdout);
    console.log(stderr);
    console.log(exitCode);
    const connections = JSON.parse(stdout);
    // Expect at least 1 connection
    expect(connections.length).toBeGreaterThanOrEqual(1);
  });
  test.skip('connect to peer using MDNS', async () => {
    const path1 = path.join(dataDir, 'nodeA');
    await fs.promises.mkdir(path1);
    const agentProcess1 = await testUtils.pkSpawn(
      [
        'agent',
        'start',
        '--node-path',
        path1,
        '--workers',
        'none',
        '--verbose',
        '--format',
        'json',
      ],
      {
        env: {
          PK_PASSWORD: password,
          PK_PASSWORD_OPS_LIMIT: 'min',
          PK_PASSWORD_MEM_LIMIT: 'min',
          PK_SEED_NODES: '',
        },
        cwd: path1,
        command: commandFactory(path1),
      },
      logger,
    );
    const status1 = new Status({
      statusPath: path.join(path1, config.paths.statusBase),
      statusLockPath: path.join(path1, config.paths.statusLockBase),
      fs,
      logger,
    });

    const path2 = path.join(dataDir, 'nodeB');
    await fs.promises.mkdir(path2);
    const agentProcess2 = await testUtils.pkSpawn(
      [
        'agent',
        'start',
        '--node-path',
        path2,
        '--workers',
        'none',
        '--verbose',
        '--format',
        'json',
      ],
      {
        env: {
          PK_PASSWORD: password,
          PK_PASSWORD_OPS_LIMIT: 'min',
          PK_PASSWORD_MEM_LIMIT: 'min',
          PK_SEED_NODES: '',
        },
        cwd: path2,
        command: commandFactory(path2),
      },
      logger,
    );
    const status2 = new Status({
      statusPath: path.join(path2, config.paths.statusBase),
      statusLockPath: path.join(path2, config.paths.statusLockBase),
      fs,
      logger,
    });

    cleanup.push(async () => {
      agentProcess1.kill('SIGTERM');
      await status1.waitFor('DEAD');
    });
    cleanup.push(async () => {
      agentProcess2.kill('SIGTERM');
      await status2.waitFor('DEAD');
    });

    const status1Info = await status1.waitFor('LIVE');
    await status2.waitFor('LIVE');

    expect(status1Info.status).toBe('LIVE');
    const { exitCode } = await testUtils.pkStdio(
      [
        'nodes',
        'ping',
        '--format',
        'json',
        encodeNodeId(status1Info.data.nodeId),
      ],
      {
        env: {
          PK_NODE_PATH: path1,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    expect(exitCode).toBe(0);
  });
});
