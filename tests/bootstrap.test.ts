import type { IChain } from 'nexpect';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import { errors as statusErrors } from 'polykey/dist/status';
import { errors as bootstrapErrors } from 'polykey/dist/bootstrap';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from './utils';

describe('bootstrap', () => {
  const logger = new Logger('bootstrap test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  let dataDir: string;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
  });
  afterEach(async () => {
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test(
    'bootstraps node state',
    async () => {
      const password = 'password';
      const passwordPath = path.join(dataDir, 'password');
      await fs.promises.writeFile(passwordPath, password);
      const { exitCode, stdout } = await testUtils.pkExec(
        ['bootstrap', '--password-file', passwordPath, '--verbose'],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
        },
      );
      expect(exitCode).toBe(0);
      const recoveryCode = stdout.trim();
      expect(
        recoveryCode.split(' ').length === 12 ||
          recoveryCode.split(' ').length === 24,
      ).toBe(true);
    },
    globalThis.defaultTimeout * 2,
  );
  test(
    'bootstraps node state from provided private key',
    async () => {
      const password = 'password';
      const passwordPath = path.join(dataDir, 'password');
      await fs.promises.writeFile(passwordPath, password);
      const keyPair = keysUtils.generateKeyPair();
      const privateKeyJWK = keysUtils.privateKeyToJWK(keyPair.privateKey);
      const privateKeyJWE = keysUtils.wrapWithPassword(
        password,
        privateKeyJWK,
        keysUtils.passwordOpsLimits.min,
        keysUtils.passwordMemLimits.min,
      );
      const privateKeyPath = path.join(dataDir, 'private.jwe');
      await fs.promises.writeFile(
        privateKeyPath,
        JSON.stringify(privateKeyJWE),
        {
          encoding: 'utf-8',
        },
      );
      const { exitCode: exitCode1 } = await testUtils.pkExec(
        [
          'bootstrap',
          '--password-file',
          passwordPath,
          '--verbose',
          '--private-key-file',
          privateKeyPath,
        ],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
        },
      );
      expect(exitCode1).toBe(0);
    },
    globalThis.defaultTimeout * 2,
  );
  test(
    'bootstrapping occupied node state',
    async () => {
      const password = 'password';
      await fs.promises.mkdir(path.join(dataDir, 'polykey'));
      await fs.promises.writeFile(path.join(dataDir, 'polykey', 'test'), '');
      const { exitCode: exitCode1, stderr: stderr1 } = await testUtils.pkExec(
        [
          'bootstrap',
          '--node-path',
          path.join(dataDir, 'polykey'),
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
        },
      );
      const errorBootstrapExistingState =
        new bootstrapErrors.ErrorBootstrapExistingState();
      testUtils.expectProcessError(exitCode1, stderr1, [
        errorBootstrapExistingState,
      ]);
      const { exitCode: exitCode2, stdout: stdout2 } = await testUtils.pkExec(
        [
          'bootstrap',
          '--node-path',
          path.join(dataDir, 'polykey'),
          '--fresh',
          '--verbose',
        ],
        {
          env: {
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
        },
      );
      expect(exitCode2).toBe(0);
      const recoveryCode = stdout2.trim();
      expect(
        recoveryCode.split(' ').length === 12 ||
          recoveryCode.split(' ').length === 24,
      ).toBe(true);
    },
    globalThis.defaultTimeout * 2,
  );
  test(
    'concurrent bootstrapping results in 1 success',
    async () => {
      const password = 'password';
      const [bootstrapProcess1, bootstrapProcess2] = await Promise.all([
        testUtils.pkSpawn(
          ['bootstrap', '--verbose', '--format', 'json'],
          {
            env: {
              PK_NODE_PATH: path.join(dataDir, 'polykey'),
              PK_PASSWORD: password,
              PK_PASSWORD_OPS_LIMIT: 'min',
              PK_PASSWORD_MEM_LIMIT: 'min',
            },
            cwd: dataDir,
          },
          logger.getChild('bootstrapProcess1'),
        ),
        testUtils.pkSpawn(
          ['bootstrap', '--verbose', '--format', 'json'],
          {
            env: {
              PK_NODE_PATH: path.join(dataDir, 'polykey'),
              PK_PASSWORD: password,
              PK_PASSWORD_OPS_LIMIT: 'min',
              PK_PASSWORD_MEM_LIMIT: 'min',
            },
            cwd: dataDir,
          },
          logger.getChild('bootstrapProcess2'),
        ),
      ]);
      // These will be the last line of STDERR
      // The readline library will automatically trim off newlines
      let stdErrLine1: string | undefined;
      let stdErrLine2: string | undefined;
      const rlErr1 = readline.createInterface(bootstrapProcess1.stderr!);
      const rlErr2 = readline.createInterface(bootstrapProcess2.stderr!);
      rlErr1.on('line', (l) => {
        stdErrLine1 = l;
      });
      rlErr2.on('line', (l) => {
        stdErrLine2 = l;
      });
      const [index, exitCode, signal] = await new Promise<
        [number, number | null, NodeJS.Signals | null]
      >((resolve) => {
        bootstrapProcess1.once('exit', (code, signal) => {
          resolve([0, code, signal]);
        });
        bootstrapProcess2.once('exit', (code, signal) => {
          resolve([1, code, signal]);
        });
      });
      const errorStatusLocked = new statusErrors.ErrorStatusLocked();
      expect(signal).toBe(null);
      // It's either the first or second process
      if (index === 0) {
        expect(stdErrLine1).toBeDefined();
        testUtils.expectProcessError(exitCode!, stdErrLine1!, [
          errorStatusLocked,
        ]);
        const [exitCode2] = await testUtils.processExit(bootstrapProcess2);
        expect(exitCode2).toBe(0);
      } else if (index === 1) {
        expect(stdErrLine2).toBeDefined();
        testUtils.expectProcessError(exitCode!, stdErrLine2!, [
          errorStatusLocked,
        ]);
        const [exitCode2] = await testUtils.processExit(bootstrapProcess1);
        expect(exitCode2).toBe(0);
      }
    },
    globalThis.defaultTimeout * 2,
  );
  test(
    'bootstrap when interrupted, requires fresh on next bootstrap',
    async () => {
      const password = 'password';
      const bootstrapProcess1 = await testUtils.pkSpawn(
        ['bootstrap', '--verbose'],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
        },
        logger.getChild('bootstrapProcess1'),
      );
      const rlErr = readline.createInterface(bootstrapProcess1.stderr!);
      // Interrupt when generating the root key pair
      await new Promise<void>((resolve, reject) => {
        rlErr.once('close', reject);
        rlErr.on('line', (l) => {
          // This line is brittle
          // It may change if the log format changes
          // Make sure to keep it updated at the exact point when the root key pair is generated
          if (
            l ===
            'INFO:polykey.KeyRing:Generating root key pair and recovery code'
          ) {
            bootstrapProcess1.kill('SIGINT');
            resolve();
          }
        });
      });
      await new Promise((res) => {
        bootstrapProcess1.once('exit', () => res(null));
      });
      // Attempting to bootstrap should fail with existing state
      const bootstrapProcess2 = await testUtils.pkExec(
        ['bootstrap', '--verbose', '--format', 'json'],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
        },
      );
      const errorBootstrapExistingState =
        new bootstrapErrors.ErrorBootstrapExistingState();
      testUtils.expectProcessError(
        bootstrapProcess2.exitCode,
        bootstrapProcess2.stderr,
        [errorBootstrapExistingState],
      );
      // Attempting to bootstrap with --fresh should succeed
      const bootstrapProcess3 = await testUtils.pkExec(
        ['bootstrap', '--fresh', '--verbose'],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
        },
      );
      expect(bootstrapProcess3.exitCode).toBe(0);
      const recoveryCode = bootstrapProcess3.stdout.trim();
      expect(
        recoveryCode.split(' ').length === 12 ||
          recoveryCode.split(' ').length === 24,
      ).toBe(true);
    },
    globalThis.defaultTimeout * 2,
  );
  test(
    'bootstraps node state prompts for password twice ',
    async () => {
      const password = 'password';
      const passwordPath = path.join(dataDir, 'password');
      await fs.promises.writeFile(passwordPath, password);
      await testUtils.pkExpect({
        args: ['bootstrap', '--verbose'],
        env: {
          PK_NODE_PATH: path.join(dataDir, 'polykey'),
          PK_PASSWORD_OPS_LIMIT: 'min',
          PK_PASSWORD_MEM_LIMIT: 'min',
        },
        cwd: dataDir,
        expect: (expectChain: IChain) => {
          expectChain.expect(/Enter new password/);
          expectChain.sendline('password');
          expectChain.wait(/Confirm new password/);
          expectChain.sendEof();
          return expectChain;
        },
      });
    },
    globalThis.defaultTimeout * 2,
  );
});
