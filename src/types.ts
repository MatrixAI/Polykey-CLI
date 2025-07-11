import type { LogLevel } from '@matrixai/logger';
import type { PolykeyAgentOptions } from 'polykey/PolykeyAgent.js';
import type { POJO, DeepPartial } from 'polykey/types.js';
import type { RecoveryCode } from 'polykey/keys/types.js';
import type { StatusLive } from 'polykey/status/types.js';
import type { NodeIdEncoded } from 'polykey/ids/types.js';

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

type ParsedSecretPathValue = [string, string?, string?];

type JSONSchemaProps = Record<
  string,
  {
    type?: string;
    default?: unknown;
    [key: string]: unknown;
  }
>;

type JSONSchema = {
  type?: string;
  properties?: Record<string, JSONSchemaProps>;
  required?: Array<string>;
  allOf?: Array<JSONSchema>;
  anyOf?: Array<JSONSchema>;
  oneOf?: Array<JSONSchema>;
  [key: string]: unknown;
};

// Only strings are supported for the time being
type JSONSchemaInfo = {
  allKeys: Array<string>;
  requiredKeys: Array<string>;
  defaults: Record<string, string>;
};

export type {
  TableRow,
  TableOptions,
  DictOptions,
  AgentStatusLiveData,
  AgentChildProcessInput,
  AgentChildProcessOutput,
  PromiseDeconstructed,
  ParsedSecretPathValue,
  JSONSchemaProps,
  JSONSchema,
  JSONSchemaInfo,
};
