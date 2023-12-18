import path from 'path';
import fs from 'fs';
import readline from 'readline';
import process from 'process';
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

describe('asd', () => {
  const commandFactory = (cwd: string) => {
    const dockerOptions = testUtils.generateDockerArgs(cwd).join(' ');
    // Return undefined
    return `docker run ${dockerOptions} polykey-cli:testtarget`;
  };

  const logger = new Logger('start test', LogLevel.WARN, [new StreamHandler()]);
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
  test(
    'start in foreground',
    async () => {
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
          '--seed-nodes',
          '',
          '--verbose',
          '--format',
          'json',
        ],
        {
          env: {
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
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
      });
      expect((await statusInfoProm).status).toBe('DEAD');
    },
    globalThis.defaultTimeout * 2,
  );
  test(
    'start in background',
    async () => {
      const password = 'abc123';
      const passwordPath = path.join(dataDir, 'password');
      await fs.promises.writeFile(passwordPath, password);
      const agentProcess = await testUtils.pkSpawn(
        [
          'agent',
          'start',
          '--password-file',
          passwordPath,
          '--background',
          '--background-out-file',
          path.join(dataDir, 'out.log'),
          '--background-err-file',
          path.join(dataDir, 'err.log'),
          '--workers',
          'none',
          '--seed-nodes',
          '',
          '--verbose',
          '--format',
          'json',
        ],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
          command: commandFactory(dataDir),
        },
        logger,
      );
      const agentProcessExit = new Promise<void>((resolve, reject) => {
        agentProcess.on('exit', (code, signal) => {
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(
                `Agent process exited with code: ${code} and signal: ${signal}`,
              ),
            );
          }
        });
      });

      // Setting up cleanup
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

      cleanup.push(async () => {
        const statusInfo = (await status.readStatus())!;
        if (statusInfo.data.pid != null) {
          process.kill(statusInfo.data.pid, 'SIGINT');
        }
        await status.waitFor('DEAD');
      });

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
      // The foreground process PID should nto be the background process PID
      expect(statusLiveData.pid).not.toBe(agentProcess.pid);
      expect(
        statusLiveData.recoveryCode.split(' ').length === 12 ||
          statusLiveData.recoveryCode.split(' ').length === 24,
      ).toBe(true);
      await agentProcessExit;
      // Make sure that the daemon does output the recovery code
      // The recovery code was already written out on agentProcess
      const polykeyAgentOut = await fs.promises.readFile(
        path.join(dataDir, 'out.log'),
        'utf-8',
      );
      expect(polykeyAgentOut).toHaveLength(0);
      const statusInfo1 = (await status.readStatus())!;
      expect(statusInfo1).toBeDefined();
      expect(statusInfo1.status).toBe('LIVE');
      process.kill(statusInfo1.data.pid, 'SIGINT');
      // Check for graceful exit
      const statusInfo2 = await status.waitFor('DEAD');
      expect(statusInfo2.status).toBe('DEAD');
    },
    globalThis.defaultTimeout * 2,
  );
  // TODO: this should check for the existance of our node and other nodes in the seed nodes graph
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
    await sleep(2000);
    const { stdout } = await testUtils.pkStdio(
      ['nodes', 'connections', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: path.join(dataDir, 'polykey'),
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    const connections = JSON.parse(stdout);
    // Expect at least 1 connection
    expect(connections.length).toBeGreaterThanOrEqual(1);
  });
  test.skip('connect to peer using MDNS', async () => {
    const agentA = await testUtils.setupTestAgent(logger);
    const agentB = await testUtils.setupTestAgent(logger);

    // Checking for connections
    const { exitCode } = await testUtils.pkStdio(
      [
        'nodes',
        'ping',
        '--format',
        'json',
        `${encodeNodeId(agentA.agentStatus.data.nodeId)}`,
      ],
      {
        env: {
          PK_NODE_PATH: agentA.agentDir,
          PK_PASSWORD: agentA.agentPassword,
        },
        cwd: dataDir,
      },
    );

    expect(exitCode).toBe(0);

    // Killing
    await agentA.agentClose();
    await agentB.agentClose();
  });
});
