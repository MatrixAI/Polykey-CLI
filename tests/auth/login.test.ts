import type {
  TokenPayloadEncoded,
  TokenProtectedHeaderEncoded,
  TokenSignatureEncoded,
} from 'polykey/tokens/types.js';
import path from 'node:path';
import type open from 'open';
import fs from 'node:fs';
import { jest } from '@jest/globals';
import { test } from '@fast-check/jest';
import { spawn } from 'node:child_process';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/PolykeyAgent.js';
import Token from 'polykey/tokens/Token.js';
import * as keysUtils from 'polykey/keys/utils/index.js';
import * as nodesUtils from 'polykey/nodes/utils.js';
import * as testUtils from '../utils/index.js';

describe('commandAuthLogin', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  let polykeyAgent: PolykeyAgent;

  beforeEach(async () => {
    // Mock implementation which spawns a noop child process
    jest.unstable_mockModule('open', () => ({
      default: jest.fn<typeof open>().mockResolvedValue(spawn('true')),
    }));
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
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
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await polykeyAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });

  test('should return a valid, signed, and compact JWT', async () => {
    // Try and login to a mock site
    jest.useFakeTimers();
    const returnURL = 'https://testing123.com';
    const command = ['auth', 'login', '-np', dataDir, returnURL];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);

    // Check the received url
    const { default: open } = await import('open');
    const openMock = open as jest.MockedFunction<typeof open>;
    expect(openMock).toHaveBeenCalled();
    const [url] = openMock.mock.lastCall!;
    const populatedURL = new URL(url);
    expect(populatedURL.origin).toBe(returnURL);
    expect(populatedURL.searchParams.has('token'));

    // Reconstruct the token
    const receivedEncodedToken = populatedURL.searchParams.get('token')!;
    const [header, payload, signature] = receivedEncodedToken.split('.');
    const receivedToken = Token.fromEncoded({
      payload: payload as TokenPayloadEncoded,
      signatures: [
        {
          protected: header as TokenProtectedHeaderEncoded,
          signature: signature as TokenSignatureEncoded,
        },
      ],
    });

    // Verify the incoming token. The nodeId is the node's public key.
    const nodeId = nodesUtils.decodeNodeId(receivedToken.payload.iss);
    expect(nodeId).toBeDefined();
    const nodeIdPublicKey = keysUtils.publicKeyFromNodeId(nodeId!);
    expect(receivedToken.verifyWithPublicKey(nodeIdPublicKey)).toBeTrue();
    expect(receivedToken.payload.exp).toBe(Math.floor(Date.now() / 1000));
    expect(receivedToken.payload.jti).toBeDefined();
  });
});
