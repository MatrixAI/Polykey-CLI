import type { LogLevel } from '@matrixai/logger';
import type { POJO } from 'polykey/dist/types';
import type { RecoveryCode } from 'polykey/dist/keys/types';
import type { Host, Port } from 'polykey/dist/network/types';
import type { StatusLive } from 'polykey/dist/status/types';
import type { NodeIdEncoded } from 'polykey/dist/ids/types';
import type { PrivateKey } from 'polykey/dist/keys/types';
import type {
  PasswordOpsLimit,
  PasswordMemLimit,
} from 'polykey/dist/keys/types';
import type { QUICConfig } from '@matrixai/quic';

type AgentStatusLiveData = Omit<StatusLive['data'], 'nodeId'> & {
  nodeId: NodeIdEncoded;
};

type PolykeyQUICConfig = {
  // Optionals
  keepAliveIntervalTime?: number;
  maxIdleTimeout?: number;
  // Disabled, set internally
  ca?: never;
  key?: never;
  cert?: never;
  verifyPeer?: never;
  verifyAllowFail?: never;
} & Partial<QUICConfig>;

/**
 * PolykeyAgent Starting Input when Backgrounded
 * When using advanced serialization, rich structures like
 * Map, Set and more can be passed over IPC
 * However traditional classes cannot be
 */
type AgentChildProcessInput = {
  logLevel: LogLevel;
  format: 'human' | 'json';
  workers?: number;
  agentConfig: {
    password: string;
    nodePath?: string;
    keyRingConfig?: {
      recoveryCode?: RecoveryCode;
      privateKey?: PrivateKey;
      privateKeyPath?: string;
      passwordOpsLimit?: PasswordOpsLimit;
      passwordMemLimit?: PasswordMemLimit;
      strictMemoryLock?: boolean;
    };
    certManagerConfig?: {
      certDuration?: number;
    };
    nodeConnectionManagerConfig?: {
      connConnectTime?: number;
      connTimeoutTime?: number;
      initialClosestNodes?: number;
      pingTimeout?: number;
      holePunchTimeout?: number;
      holePunchInitialInterval?: number;
    };
    networkConfig?: {
      // Agent QUICSocket config
      agentHost?: Host;
      agentPort?: Port;
      ipv6Only?: boolean;
      // RPCServer for client service
      clientHost?: Host;
      clientPort?: Port;
      // Websocket server config
      maxReadableStreamBytes?: number;
      connectionIdleTimeoutTime?: number;
      pingIntervalTime?: number;
      pingTimeoutTime?: number;
      // RPC config
      clientParserBufferByteLimit?: number;
      handlerTimeoutTime?: number;
      handlerTimeoutGraceTime?: number;
    };
    quicServerConfig?: PolykeyQUICConfig;
    quicClientConfig?: PolykeyQUICConfig;
    fresh?: boolean;
  };
};

/**
 * PolykeyAgent starting output when backgrounded
 * The error property contains arbitrary error properties
 */
type AgentChildProcessOutput =
  | ({
      status: 'SUCCESS';
      recoveryCode?: RecoveryCode;
    } & AgentStatusLiveData)
  | {
      status: 'FAILURE';
      error: POJO;
    };

export type {
  AgentStatusLiveData,
  AgentChildProcessInput,
  AgentChildProcessOutput,
};
