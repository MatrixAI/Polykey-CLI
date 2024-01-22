import type { NodeId } from 'polykey/dist/ids/types';
import type { Notification } from 'polykey/dist/notifications/types';
import type { StatusLive } from 'polykey/dist/status/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import * as nodesUtils from 'polykey/dist/nodes/utils';
import * as testUtils from '../utils';

describe('send/read/claim', () => {
  const logger = new Logger('send/read/clear test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  let dataDir: string;
  let senderId: NodeId;
  let senderHost: string;
  let senderPort: number;
  let receiverId: NodeId;
  let receiverHost: string;
  let receiverPort: number;
  let senderAgentStatus: StatusLive;
  let senderAgentClose: () => Promise<void>;
  let senderAgentDir: string;
  let senderAgentPassword: string;
  let receiverAgentStatus: StatusLive;
  let receiverAgentClose: () => Promise<void>;
  let receiverAgentDir: string;
  let receiverAgentPassword: string;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    // Cannot use the shared global agent since we can't 'un-add' a node
    // which we need in order to trust it and send notifications to it
    ({
      agentStatus: senderAgentStatus,
      agentClose: senderAgentClose,
      agentDir: senderAgentDir,
      agentPassword: senderAgentPassword,
    } = await testUtils.setupTestAgent(logger));
    senderId = senderAgentStatus.data.nodeId;
    senderHost = senderAgentStatus.data.agentHost;
    senderPort = senderAgentStatus.data.agentPort;
    ({
      agentStatus: receiverAgentStatus,
      agentClose: receiverAgentClose,
      agentDir: receiverAgentDir,
      agentPassword: receiverAgentPassword,
    } = await testUtils.setupTestAgent(logger));
    receiverId = receiverAgentStatus.data.nodeId;
    receiverHost = receiverAgentStatus.data.agentHost;
    receiverPort = receiverAgentStatus.data.agentPort;
  });
  afterEach(async () => {
    await receiverAgentClose();
    await senderAgentClose();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test(
    'sends, receives, and clears notifications',
    async () => {
      let exitCode: number, stdout: string;
      let readNotifications: Array<Notification>;
      // Add receiver to sender's node graph, so it can be contacted
      ({ exitCode } = await testUtils.pkExec(
        [
          'nodes',
          'add',
          nodesUtils.encodeNodeId(receiverId),
          receiverHost,
          receiverPort.toString(),
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
      // Add sender to receiver's node graph, so it can be trusted
      ({ exitCode } = await testUtils.pkExec(
        [
          'nodes',
          'add',
          nodesUtils.encodeNodeId(senderId),
          senderHost,
          senderPort.toString(),
        ],
        {
          env: {
            PK_NODE_PATH: receiverAgentDir,
            PK_PASSWORD: receiverAgentPassword,
          },
          cwd: receiverAgentDir,
        },
      ));
      expect(exitCode).toBe(0);
      // Trust sender so notification can be received
      ({ exitCode } = await testUtils.pkExec(
        ['identities', 'trust', nodesUtils.encodeNodeId(senderId)],
        {
          env: {
            PK_NODE_PATH: receiverAgentDir,
            PK_PASSWORD: receiverAgentPassword,
          },
          cwd: receiverAgentDir,
        },
      ));
      expect(exitCode).toBe(0);
      // Send some notifications
      ({ exitCode } = await testUtils.pkExec(
        [
          'notifications',
          'send',
          nodesUtils.encodeNodeId(receiverId),
          'test message 1',
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
      ({ exitCode } = await testUtils.pkExec(
        [
          'notifications',
          'send',
          nodesUtils.encodeNodeId(receiverId),
          'test message 2',
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
      ({ exitCode } = await testUtils.pkExec(
        [
          'notifications',
          'send',
          nodesUtils.encodeNodeId(receiverId),
          'test message 3',
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
      // Read notifications
      ({ exitCode, stdout } = await testUtils.pkExec(
        ['notifications', 'read', '--format', 'json'],
        {
          env: {
            PK_NODE_PATH: receiverAgentDir,
            PK_PASSWORD: receiverAgentPassword,
          },
          cwd: receiverAgentDir,
        },
      ));
      expect(exitCode).toBe(0);
      readNotifications = stdout
        .split('\n')
        .slice(undefined, -1)
        .map((v) => JSON.parse(v));
      expect(readNotifications).toHaveLength(3);
      expect(readNotifications[0]).toMatchObject({
        data: {
          type: 'General',
          message: 'test message 3',
        },
        iss: nodesUtils.encodeNodeId(senderId),
        sub: nodesUtils.encodeNodeId(receiverId),
        isRead: true,
      });
      expect(readNotifications[1]).toMatchObject({
        data: {
          type: 'General',
          message: 'test message 2',
        },
        iss: nodesUtils.encodeNodeId(senderId),
        sub: nodesUtils.encodeNodeId(receiverId),
        isRead: true,
      });
      expect(readNotifications[2]).toMatchObject({
        data: {
          type: 'General',
          message: 'test message 1',
        },
        iss: nodesUtils.encodeNodeId(senderId),
        sub: nodesUtils.encodeNodeId(receiverId),
        isRead: true,
      });
      // Read only unread (none)
      ({ exitCode, stdout } = await testUtils.pkExec(
        ['notifications', 'read', '--unread', '--format', 'json'],
        {
          env: {
            PK_NODE_PATH: receiverAgentDir,
            PK_PASSWORD: receiverAgentPassword,
          },
          cwd: receiverAgentDir,
        },
      ));
      expect(exitCode).toBe(0);
      readNotifications = stdout
        .split('\n')
        .slice(undefined, -1)
        .map((v) => JSON.parse(v));
      expect(readNotifications).toHaveLength(0);
      // Read notifications on reverse order
      ({ exitCode, stdout } = await testUtils.pkExec(
        ['notifications', 'read', '--order=oldest', '--format', 'json'],
        {
          env: {
            PK_NODE_PATH: receiverAgentDir,
            PK_PASSWORD: receiverAgentPassword,
          },
          cwd: receiverAgentDir,
        },
      ));
      expect(exitCode).toBe(0);
      readNotifications = stdout
        .split('\n')
        .slice(undefined, -1)
        .map((v) => JSON.parse(v));
      expect(readNotifications).toHaveLength(3);
      expect(readNotifications[0]).toMatchObject({
        data: {
          type: 'General',
          message: 'test message 1',
        },
        iss: nodesUtils.encodeNodeId(senderId),
        sub: nodesUtils.encodeNodeId(receiverId),
        isRead: true,
      });
      expect(readNotifications[1]).toMatchObject({
        data: {
          type: 'General',
          message: 'test message 2',
        },
        iss: nodesUtils.encodeNodeId(senderId),
        sub: nodesUtils.encodeNodeId(receiverId),
        isRead: true,
      });
      expect(readNotifications[2]).toMatchObject({
        data: {
          type: 'General',
          message: 'test message 3',
        },
        iss: nodesUtils.encodeNodeId(senderId),
        sub: nodesUtils.encodeNodeId(receiverId),
        isRead: true,
      });
      // Read only one notification
      ({ exitCode, stdout } = await testUtils.pkExec(
        ['notifications', 'read', '--number=1', '--format', 'json'],
        {
          env: {
            PK_NODE_PATH: receiverAgentDir,
            PK_PASSWORD: receiverAgentPassword,
          },
          cwd: receiverAgentDir,
        },
      ));
      expect(exitCode).toBe(0);
      readNotifications = stdout
        .split('\n')
        .slice(undefined, -1)
        .map((v) => JSON.parse(v));
      expect(readNotifications).toHaveLength(1);
      expect(readNotifications[0]).toMatchObject({
        data: {
          type: 'General',
          message: 'test message 3',
        },
        iss: nodesUtils.encodeNodeId(senderId),
        sub: nodesUtils.encodeNodeId(receiverId),
        isRead: true,
      });
      // Clear notifications
      await testUtils.pkExec(['notifications', 'clear'], {
        env: {
          PK_NODE_PATH: receiverAgentDir,
          PK_PASSWORD: receiverAgentPassword,
        },
        cwd: receiverAgentDir,
      });
      // Check there are no more notifications
      ({ exitCode, stdout } = await testUtils.pkExec(
        ['notifications', 'read', '--format', 'json'],
        {
          env: {
            PK_NODE_PATH: receiverAgentDir,
            PK_PASSWORD: receiverAgentPassword,
          },
          cwd: receiverAgentDir,
        },
      ));
      expect(exitCode).toBe(0);
      readNotifications = stdout
        .split('\n')
        .slice(undefined, -1)
        .map((v) => JSON.parse(v));
      expect(readNotifications).toHaveLength(0);
    },
    globalThis.defaultTimeout * 3,
  );
});
