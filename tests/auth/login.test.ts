import type {
  IdentityRequestData,
  IdentityResponseData,
} from 'polykey/client/types.js';
import type {
  TokenPayloadEncoded,
  TokenProtectedHeaderEncoded,
  TokenSignatureEncoded,
} from 'polykey/tokens/types.js';
import path from 'node:path';
import fs from 'node:fs';
import fc from 'fast-check';
import { jest } from '@jest/globals';
import { test } from '@fast-check/jest';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/PolykeyAgent.js';
import Token from 'polykey/tokens/Token.js';
import * as keysUtils from 'polykey/keys/utils/index.js';
import * as nodesUtils from 'polykey/nodes/utils.js';
import * as testUtils from '../utils/index.js';
import * as utils from '#utils/utils.js';

describe('commandAuthLogin', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  let polykeyAgent: PolykeyAgent;

  beforeEach(async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ result: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
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

  test('should succeed with a valid compact JWT', async () => {
    // Generate and sign token
    const keyPair = keysUtils.generateKeyPair();
    const returnURL = 'test';
    const publicKey = keyPair.publicKey.toString('base64url');
    const token = Token.fromPayload<IdentityRequestData>({
      publicKey,
      returnURL,
    });
    token.signWithPrivateKey(keyPair.privateKey);
    const encodedToken = utils.jsonToCompactJWT(token.toEncoded());

    // Use token to try and login
    const command = ['auth', 'login', '-np', dataDir, encodedToken];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);

    // Check the received token
    const fetchMock = globalThis.fetch as jest.MockedFunction<typeof fetch>;
    expect(fetchMock).toHaveBeenCalled();
    const [url, options] = fetchMock.mock.lastCall!;
    expect(url).toBe(returnURL);
    expect(options).toBeDefined();
    expect(options!.method).toBe('POST');

    // Reconstruct the token
    expect(typeof options!.body).toBe('string');
    const responseBody: { token: string } = JSON.parse(
      options!.body! as string,
    );
    const receivedEncodedToken = responseBody.token;
    const [header, payload, signature] = receivedEncodedToken.split('.');
    const receivedToken = Token.fromEncoded<IdentityResponseData>({
      payload: payload as TokenPayloadEncoded,
      signatures: [
        {
          protected: header as TokenProtectedHeaderEncoded,
          signature: signature as TokenSignatureEncoded,
        },
      ],
    });

    // Verify the incoming token. The nodeId is the node's public key.
    const nodeId = nodesUtils.decodeNodeId(receivedToken.payload.nodeId);
    expect(nodeId).toBeDefined();
    const nodeIdPublicKey = keysUtils.publicKeyFromNodeId(nodeId!);
    expect(receivedToken.verifyWithPublicKey(nodeIdPublicKey)).toBeTrue();
    const sentTokenEncoded = receivedToken.payload.requestToken;
    const sentToken = Token.fromEncoded<IdentityRequestData>(sentTokenEncoded);
    expect(sentToken.verifyWithPublicKey(keyPair.publicKey)).toBeTrue();
  });

  test.prop([fc.string()], { numRuns: 1 })(
    'should fail with an invalid JWT',
    async (compactJWT) => {
      // Use token to try and login
      const command = ['auth', 'login', '-np', dataDir, compactJWT];
      const result = await testUtils.pkStdio(command, {
        env: { PK_PASSWORD: password },
        cwd: dataDir,
      });
      expect(result.exitCode).not.toBe(0);

      // We should never even get to a point where the fetch was invoked
      const fetchMock = globalThis.fetch as jest.MockedFunction<typeof fetch>;
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test('should fail with incorrectly signed JWT', async () => {
    // Generate and sign token with different key pairs
    let keyPair = keysUtils.generateKeyPair();
    const publicKey = keyPair.publicKey.toString('base64url');
    keyPair = keysUtils.generateKeyPair();
    const returnURL = 'test';
    const token = Token.fromPayload<IdentityRequestData>({
      publicKey,
      returnURL,
    });
    token.signWithPrivateKey(keyPair.privateKey);
    const encodedToken = utils.jsonToCompactJWT(token.toEncoded());

    // Use token to try and login
    const command = ['auth', 'login', '-np', dataDir, encodedToken];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);

    // We should never even get to a point where the fetch was invoked
    const fetchMock = globalThis.fetch as jest.MockedFunction<typeof fetch>;
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
