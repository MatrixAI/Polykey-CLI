import type { StatusLive } from 'polykey/dist/status/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as nodesUtils from 'polykey/dist/nodes/utils';
import sysexits from 'polykey/dist/utils/sysexits';
import * as testUtils from '../utils';

describe('encrypt-decrypt', () => {
  const logger = new Logger('encrypt-decrypt test', LogLevel.WARN, [
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
  test('decrypts data', async () => {
    const dataPath = path.join(agentDir, 'data');
    const publicKey = keysUtils.publicKeyFromNodeId(agentStatus.data.nodeId);
    const encrypted = keysUtils.encryptWithPublicKey(
      publicKey,
      Buffer.from('abc'),
    );
    await fs.promises.writeFile(dataPath, encrypted, {
      encoding: 'binary',
    });
    const { exitCode, stdout } = await testUtils.pkExec(
      ['keys', 'decrypt', dataPath, '--format', 'json'],
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
      data: 'abc',
    });
  });
  test('encrypts data using NodeId', async () => {
    const targetKeyPair = keysUtils.generateKeyPair();
    const targetNodeId = keysUtils.publicKeyToNodeId(targetKeyPair.publicKey);

    const dataPath = path.join(agentDir, 'data');
    await fs.promises.writeFile(dataPath, 'abc', {
      encoding: 'binary',
    });
    const { exitCode, stdout } = await testUtils.pkExec(
      [
        'keys',
        'encrypt',
        dataPath,
        nodesUtils.encodeNodeId(targetNodeId),
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
      data: expect.any(String),
    });
    const encrypted = JSON.parse(stdout).data;
    const decrypted = keysUtils.decryptWithPrivateKey(
      targetKeyPair,
      Buffer.from(encrypted, 'binary'),
    );
    expect(decrypted?.toString()).toBe('abc');
  });
  test('encrypts data using JWK file', async () => {
    const targetKeyPair = keysUtils.generateKeyPair();
    const publicJWK = keysUtils.publicKeyToJWK(targetKeyPair.publicKey);

    const dataPath = path.join(agentDir, 'data');
    const jwkPath = path.join(agentDir, 'jwk');
    await fs.promises.writeFile(jwkPath, JSON.stringify(publicJWK), 'utf-8');
    await fs.promises.writeFile(dataPath, 'abc', {
      encoding: 'binary',
    });
    const { exitCode, stdout } = await testUtils.pkExec(
      ['keys', 'encrypt', dataPath, jwkPath, '--format', 'json'],
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
      data: expect.any(String),
    });
    const encrypted = JSON.parse(stdout).data;
    const decrypted = keysUtils.decryptWithPrivateKey(
      targetKeyPair,
      Buffer.from(encrypted, 'binary'),
    );
    expect(decrypted?.toString()).toBe('abc');
  });
  test('encrypts data fails with invalid JWK file', async () => {
    const dataPath = path.join(agentDir, 'data');
    const jwkPath = path.join(agentDir, 'jwk');
    await fs.promises.writeFile(dataPath, 'abc', {
      encoding: 'binary',
    });
    const { exitCode } = await testUtils.pkExec(
      ['keys', 'encrypt', dataPath, jwkPath, '--format', 'json'],
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
