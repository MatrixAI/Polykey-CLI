import type { StatusLive } from 'polykey/dist/status/types';
import type { Signature } from 'polykey/dist/keys/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as nodesUtils from 'polykey/dist/nodes/utils';
import sysexits from 'polykey/dist/utils/sysexits';
import * as testUtils from '../utils';

describe('sign-verify', () => {
  const logger = new Logger('sign-verify test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  let agentDir: string;
  let agentPassword: string;
  let agentClose: () => Promise<void>;
  let agentStatus: StatusLive;
  beforeEach(async () => {
    ({ agentDir, agentPassword, agentClose, agentStatus } =
      await testUtils.setupTestAgent(logger));
  });
  afterEach(async () => {
    await agentClose();
  });
  test('signs a file', async () => {
    const publicKey = keysUtils.publicKeyFromNodeId(agentStatus.data.nodeId);
    const dataPath = path.join(agentDir, 'data');
    await fs.promises.writeFile(dataPath, 'sign-me', {
      encoding: 'binary',
    });
    const { exitCode, stdout } = await testUtils.pkExec(
      ['keys', 'sign', dataPath, '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: agentPassword,
        },
        cwd: agentDir,
      },
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      signature: expect.any(String),
    });
    const signed = JSON.parse(stdout).signature;

    expect(
      keysUtils.verifyWithPublicKey(
        publicKey,
        Buffer.from('sign-me'),
        Buffer.from(signed, 'binary') as Signature,
      ),
    ).toBeTrue();
  });
  test('verifies a signature with NodeId', async () => {
    const sourceKeyPair = keysUtils.generateKeyPair();
    const nodeId = keysUtils.publicKeyToNodeId(sourceKeyPair.publicKey);
    const dataPath = path.join(agentDir, 'data');
    await fs.promises.writeFile(dataPath, 'sign-me', {
      encoding: 'binary',
    });
    const signed = keysUtils.signWithPrivateKey(
      sourceKeyPair,
      Buffer.from('sign-me', 'binary'),
    );
    const signaturePath = path.join(agentDir, 'signature');
    await fs.promises.writeFile(signaturePath, signed, {
      encoding: 'binary',
    });
    const { exitCode, stdout } = await testUtils.pkExec(
      [
        'keys',
        'verify',
        dataPath,
        signaturePath,
        nodesUtils.encodeNodeId(nodeId),
        '--format',
        'json',
      ],
      {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: agentPassword,
        },
        cwd: agentDir,
      },
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      success: true,
    });
  });
  test('verifies a signature with JWK', async () => {
    const sourceKeyPair = keysUtils.generateKeyPair();
    const jwk = keysUtils.publicKeyToJWK(sourceKeyPair.publicKey);
    const dataPath = path.join(agentDir, 'data');
    await fs.promises.writeFile(dataPath, 'sign-me', {
      encoding: 'binary',
    });
    const signed = keysUtils.signWithPrivateKey(
      sourceKeyPair,
      Buffer.from('sign-me', 'binary'),
    );
    const signaturePath = path.join(agentDir, 'signature');
    await fs.promises.writeFile(signaturePath, signed, {
      encoding: 'binary',
    });
    const jwkPath = path.join(agentDir, 'jwk');
    await fs.promises.writeFile(jwkPath, JSON.stringify(jwk), {
      encoding: 'utf-8',
    });
    const { exitCode, stdout } = await testUtils.pkExec(
      ['keys', 'verify', dataPath, signaturePath, jwkPath, '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: agentPassword,
        },
        cwd: agentDir,
      },
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      success: true,
    });
  });
  test('verifies a signature fails with invalid JWK', async () => {
    const dataPath = path.join(agentDir, 'data');
    await fs.promises.writeFile(dataPath, 'sign-me', {
      encoding: 'binary',
    });
    const signed = 'abc';
    const signaturePath = path.join(agentDir, 'signature');
    await fs.promises.writeFile(signaturePath, signed, {
      encoding: 'binary',
    });
    const jwkPath = path.join(agentDir, 'jwk');
    const { exitCode } = await testUtils.pkExec(
      ['keys', 'verify', dataPath, signaturePath, jwkPath, '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: agentPassword,
        },
        cwd: agentDir,
      },
    );
    expect(exitCode).toBe(sysexits.NOINPUT);
  });
});
