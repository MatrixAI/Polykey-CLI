import type { LogLevel } from '@matrixai/logger';
import type { PolykeyAgentOptions } from 'polykey/dist/PolykeyAgent';
import type { POJO, DeepPartial } from 'polykey/dist/types';
import type { RecoveryCode } from 'polykey/dist/keys/types';
import type { StatusLive } from 'polykey/dist/status/types';
import type { NodeIdEncoded } from 'polykey/dist/ids/types';

type TableRow = Record<string, any>;

interface TableOptions {
  columns?: Array<string> | Record<string, number>;
  includeHeaders?: boolean;
  includeRowCount?: boolean;
}

interface DictOptions {
  padding?: number;
}

type AgentStatusLiveData = Omit<StatusLive['data'], 'nodeId'> & {
  nodeId: NodeIdEncoded;
};

/**
 * PolykeyAgent Starting Input when backgrounded
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
    options: DeepPartial<PolykeyAgentOptions>;
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

/**
 * Deconstructed promise
 */
type PromiseDeconstructed<T> = {
  p: Promise<T>;
  resolveP: (value: T | PromiseLike<T>) => void;
  rejectP: (reason?: any) => void;
};

export type {
  TableRow,
  TableOptions,
  DictOptions,
  AgentStatusLiveData,
  AgentChildProcessInput,
  AgentChildProcessOutput,
  PromiseDeconstructed,
};
