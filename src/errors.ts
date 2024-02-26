import type { Class } from '@matrixai/errors';
import { AbstractError } from '@matrixai/errors';
import sysexits from 'polykey/dist/utils/sysexits';

/**
 * Root error for Polykey CLI.
 * Application errors may need to be serialised over program boundaries.
 * For example presenting errors on the terminal, or sending errors over
 * the network.
 */
class ErrorPolykeyCLI<T> extends AbstractError<T> {
  static description: string = 'Polykey CLI error';
  exitCode: number = sysexits.GENERAL;

  public static fromJSON<T extends Class<any>>(
    this: T,
    json: any,
  ): InstanceType<T> {
    if (
      typeof json !== 'object' ||
      json.type !== this.name ||
      typeof json.data !== 'object' ||
      typeof json.data.message !== 'string' ||
      isNaN(Date.parse(json.data.timestamp)) ||
      typeof json.data.description !== 'string' ||
      typeof json.data.data !== 'object' ||
      typeof json.data.exitCode !== 'number' ||
      ('stack' in json.data && typeof json.data.stack !== 'string')
    ) {
      throw new TypeError(`Cannot decode JSON to ${this.name}`);
    }
    const e = new this(json.data.message, {
      timestamp: new Date(json.data.timestamp),
      data: json.data.data,
      cause: json.data.cause,
    });
    e.exitCode = json.data.exitCode;
    e.stack = json.data.stack;
    return e;
  }

  public toJSON(): any {
    const json = super.toJSON();
    json.data.description = this.description;
    json.data.exitCode = this.exitCode;
    return json;
  }
}

/**
 * Uncaught exceptions is a logic error.
 * If these exceptions occur, there is a bug.
 */
class ErrorPolykeyCLIUncaughtException<T> extends ErrorPolykeyCLI<T> {
  static description = 'Uncaught exception';
  exitCode = sysexits.SOFTWARE;
}

/**
 * Unhandled rejections is a logic error.
 * If these exceptions occur, there is a bug.
 */
class ErrorPolykeyCLIUnhandledRejection<T> extends ErrorPolykeyCLI<T> {
  static description = 'Unhandled rejection';
  exitCode = sysexits.SOFTWARE;
}

/**
 * Asynchronous deadlocks is a logic error.
 * If these exceptions occur, there is a bug.
 */
class ErrorPolykeyCLIAsynchronousDeadlock<T> extends ErrorPolykeyCLI<T> {
  static description =
    'Process exited unexpectedly, likely due to promise deadlock';
  exitCode = sysexits.SOFTWARE;
}

class ErrorPolykeyCLINodePath<T> extends ErrorPolykeyCLI<T> {
  static description = 'Cannot derive default node path from unknown platform';
  exitCode = sysexits.USAGE;
}

class ErrorPolykeyCLIClientOptions<T> extends ErrorPolykeyCLI<T> {
  static description = 'Missing required client options';
  exitCode = sysexits.USAGE;
}

class ErrorPolykeyCLIPasswordWrong<T> extends ErrorPolykeyCLI<T> {
  static description = 'Wrong password, please try again';
  exitCode = sysexits.USAGE;
}

class ErrorPolykeyCLIPasswordMissing<T> extends ErrorPolykeyCLI<T> {
  static description =
    'Password is necessary, provide it via --password-file, PK_PASSWORD or when prompted';
  exitCode = sysexits.USAGE;
}

class ErrorPolykeyCLIPasswordFileRead<T> extends ErrorPolykeyCLI<T> {
  static description = 'Failed to read password file';
  exitCode = sysexits.NOINPUT;
}

class ErrorPolykeyCLIRecoveryCodeFileRead<T> extends ErrorPolykeyCLI<T> {
  static description = 'Failed to read recovery code file';
  exitCode = sysexits.NOINPUT;
}

class ErrorPolykeyCLIPrivateKeyFileRead<T> extends ErrorPolykeyCLI<T> {
  static description = 'Failed to read private key Pem file';
  exitCode = sysexits.NOINPUT;
}

class ErrorPolykeyCLIPublicJWKFileRead<T> extends ErrorPolykeyCLI<T> {
  static description = 'Failed to read public JWK file';
  exitCode = sysexits.NOINPUT;
}

class ErrorPolykeyCLIFileRead<T> extends ErrorPolykeyCLI<T> {
  static description = 'Failed to read file';
  exitCode = sysexits.NOINPUT;
}

class ErrorPolykeyCLIAgentStatus<T> extends ErrorPolykeyCLI<T> {
  static description = 'PolykeyAgent agent status';
  exitCode = sysexits.TEMPFAIL;
}

class ErrorPolykeyCLIAgentProcess<T> extends ErrorPolykeyCLI<T> {
  static description = 'PolykeyAgent process could not be started';
  exitCode = sysexits.OSERR;
}

class ErrorPolykeyCLINodeFindFailed<T> extends ErrorPolykeyCLI<T> {
  static description = 'Failed to find the node in the DHT';
  exitCode = 1;
}

class ErrorPolykeyCLINodePingFailed<T> extends ErrorPolykeyCLI<T> {
  static description = 'Node was not online or not found.';
  exitCode = 1;
}

class ErrorPolykeyCLIInvalidEnvName<T> extends ErrorPolykeyCLI<T> {
  static description =
    'Secret retrieved has an invalid environment variable name';
  exitCode = sysexits.USAGE;
}

class ErrorPolykeyCLIDuplicateEnvName<T> extends ErrorPolykeyCLI<T> {
  static description = 'Environment variable name already retrieved';
  exitCode = sysexits.USAGE;
}

export {
  ErrorPolykeyCLI,
  ErrorPolykeyCLIUncaughtException,
  ErrorPolykeyCLIUnhandledRejection,
  ErrorPolykeyCLIAsynchronousDeadlock,
  ErrorPolykeyCLINodePath,
  ErrorPolykeyCLIClientOptions,
  ErrorPolykeyCLIPasswordWrong,
  ErrorPolykeyCLIPasswordMissing,
  ErrorPolykeyCLIPasswordFileRead,
  ErrorPolykeyCLIRecoveryCodeFileRead,
  ErrorPolykeyCLIPrivateKeyFileRead,
  ErrorPolykeyCLIPublicJWKFileRead,
  ErrorPolykeyCLIFileRead,
  ErrorPolykeyCLIAgentStatus,
  ErrorPolykeyCLIAgentProcess,
  ErrorPolykeyCLINodeFindFailed,
  ErrorPolykeyCLINodePingFailed,
  ErrorPolykeyCLIInvalidEnvName,
  ErrorPolykeyCLIDuplicateEnvName,
};
