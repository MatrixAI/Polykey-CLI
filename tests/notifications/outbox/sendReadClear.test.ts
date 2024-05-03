import type { NodeId } from 'polykey/dist/ids/types';
import type { Notification } from 'polykey/dist/notifications/types';
import type { StatusLive } from 'polykey/dist/status/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import * as nodesUtils from 'polykey/dist/nodes/utils';
import * as testUtils from '../../utils';

describe('send/read/claim', () => {
  const logger = new Logger('outbox send/read/clear test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  let dataDir: string;
  let senderId: NodeId;
  let senderAgentStatus: StatusLive;
  let senderAgentClose: () => Promise<void>;
  let senderAgentDir: string;
  let senderAgentPassword: string;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    ({
      agentStatus: senderAgentStatus,
      agentClose: senderAgentClose,
      agentDir: senderAgentDir,
      agentPassword: senderAgentPassword,
    } = await testUtils.setupTestAgent(logger));
    senderId = senderAgentStatus.data.nodeId;
  });
  afterEach(async () => {
    await senderAgentClose();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test(
    'sends, receives, and clears notifications',
    async () => {
      const receiverId =
        'v0000000000000000000000000000000000000000000000000000';
      let exitCode: number, stdout: string;
      let readNotificationMessages: Array<{ notification: Notification }>;
      // Send some notifications
      ({ exitCode } = await testUtils.pkExec(
        ['notifications', 'send', receiverId, 'test message 1'],
        {
          env: {
            PK_NODE_PATH: senderAgentDir,
            PK_PASSWORD: senderAgentPassword,
          },
          cwd: senderAgentDir,
        },
      ));
      expect(exitCode).toBe(0);
      ({ exitCode } = await testUtils.pkExec(
        ['notifications', 'send', receiverId, 'test message 2'],
        {
          env: {
            PK_NODE_PATH: senderAgentDir,
            PK_PASSWORD: senderAgentPassword,
          },
          cwd: senderAgentDir,
        },
      ));
      expect(exitCode).toBe(0);
      ({ exitCode } = await testUtils.pkExec(
        ['notifications', 'send', receiverId, 'test message 3'],
        {
          env: {
            PK_NODE_PATH: senderAgentDir,
            PK_PASSWORD: senderAgentPassword,
          },
          cwd: senderAgentDir,
        },
      ));
      expect(exitCode).toBe(0);
      // Read outbox notifications
      ({ exitCode, stdout } = await testUtils.pkExec(
        ['notifications', 'outbox', 'read', '--format', 'json'],
        {
          env: {
            PK_NODE_PATH: senderAgentDir,
            PK_PASSWORD: senderAgentPassword,
          },
          cwd: senderAgentDir,
        },
      ));
      expect(exitCode).toBe(0);
      readNotificationMessages = JSON.parse(stdout);
      expect(readNotificationMessages).toHaveLength(3);
      expect(readNotificationMessages[0].notification).toMatchObject({
        data: {
          type: 'General',
          message: 'test message 3',
        },
        iss: nodesUtils.encodeNodeId(senderId),
        sub: receiverId,
      });
      expect(readNotificationMessages[1].notification).toMatchObject({
        data: {
          type: 'General',
          message: 'test message 2',
        },
        iss: nodesUtils.encodeNodeId(senderId),
        sub: receiverId,
      });
      expect(readNotificationMessages[2].notification).toMatchObject({
        data: {
          type: 'General',
          message: 'test message 1',
        },
        iss: nodesUtils.encodeNodeId(senderId),
        sub: receiverId,
      });
      // Read outbox notifications on reverse order
      ({ exitCode, stdout } = await testUtils.pkExec(
        [
          'notifications',
          'outbox',
          'read',
          '--order=oldest',
          '--format',
          'json',
        ],
        {
          env: {
            PK_NODE_PATH: senderAgentDir,
            PK_PASSWORD: senderAgentPassword,
          },
          cwd: senderAgentDir,
        },
      ));
      expect(exitCode).toBe(0);
      readNotificationMessages = JSON.parse(stdout);
      expect(readNotificationMessages).toHaveLength(3);
      expect(readNotificationMessages[0].notification).toMatchObject({
        data: {
          type: 'General',
          message: 'test message 1',
        },
        iss: nodesUtils.encodeNodeId(senderId),
        sub: receiverId,
      });
      expect(readNotificationMessages[1].notification).toMatchObject({
        data: {
          type: 'General',
          message: 'test message 2',
        },
        iss: nodesUtils.encodeNodeId(senderId),
        sub: receiverId,
      });
      expect(readNotificationMessages[2].notification).toMatchObject({
        data: {
          type: 'General',
          message: 'test message 3',
        },
        iss: nodesUtils.encodeNodeId(senderId),
        sub: receiverId,
      });
      // Read only one outbox notification
      ({ exitCode, stdout } = await testUtils.pkExec(
        ['notifications', 'outbox', 'read', '--limit', '1', '--format', 'json'],
        {
          env: {
            PK_NODE_PATH: senderAgentDir,
            PK_PASSWORD: senderAgentPassword,
          },
          cwd: senderAgentDir,
        },
      ));
      expect(exitCode).toBe(0);
      readNotificationMessages = JSON.parse(stdout);
      expect(readNotificationMessages).toHaveLength(1);
      expect(readNotificationMessages[0].notification).toMatchObject({
        data: {
          type: 'General',
          message: 'test message 3',
        },
        iss: nodesUtils.encodeNodeId(senderId),
        sub: receiverId,
      });
      // Clear outbox notifications
      await testUtils.pkExec(['notifications', 'outbox', 'clear'], {
        env: {
          PK_NODE_PATH: senderAgentDir,
          PK_PASSWORD: senderAgentPassword,
        },
        cwd: senderAgentDir,
      });
      // Check there are no more outbox notifications
      ({ exitCode, stdout } = await testUtils.pkExec(
        ['notifications', 'outbox', 'read', '--format', 'json'],
        {
          env: {
            PK_NODE_PATH: senderAgentDir,
            PK_PASSWORD: senderAgentPassword,
          },
          cwd: senderAgentDir,
        },
      ));
      expect(exitCode).toBe(0);
      readNotificationMessages = JSON.parse(stdout);
      expect(readNotificationMessages).toHaveLength(0);
    },
    globalThis.defaultTimeout * 3,
  );
});
