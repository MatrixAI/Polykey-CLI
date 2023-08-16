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

type AgentStatusLiveData = Omit<StatusLive['data'], 'nodeId'> & {
  nodeId: NodeIdEncoded;
};

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
      agentHost?: Host;
      agentPort?: Port;
      clientHost?: Host;
      clientPort?: Port;
      ipv6Only?: boolean;
      agentKeepAliveIntervalTime?: number;
      agentMaxIdleTimeout?: number;
      clientMaxIdleTimeoutTime?: number;
      clientPingIntervalTime?: number;
      clientPingTimeoutTime?: number;
      clientParserBufferByteLimit?: number;
      clientHandlerTimeoutTime?: number;
      clientHandlerTimeoutGraceTime?: number;
    };
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
