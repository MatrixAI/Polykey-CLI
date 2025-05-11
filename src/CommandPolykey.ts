import type { FileSystem } from 'polykey/types.js';
import type { OptionValues } from 'commander';
import { Command } from 'commander';
import Logger, {
  StreamHandler,
  formatting,
  levelToString,
  evalLogDataValue,
  tracer,
} from '@matrixai/logger';
import * as binUtils from './utils/index.js';
import * as binOptions from './utils/options.js';
import * as errors from './errors.js';

/**
 * Singleton logger constructed once for all commands
 */
const logger = new Logger('polykey', undefined, [new StreamHandler()]);

/**
 * Base class for all commands
 */
class CommandPolykey extends Command {
  protected logger: Logger = logger;
  protected fs: FileSystem;
  protected exitHandlers: binUtils.ExitHandlers;
  protected tracerProm: Promise<void> | undefined;

  public constructor({
    exitHandlers,
    fs,
  }: {
    exitHandlers: binUtils.ExitHandlers;
    fs: FileSystem;
  }) {
    super();
    this.fs = fs;
    this.exitHandlers = exitHandlers;
    // All commands must not exit upon error
    this.exitOverride();
    // On usage error, show the help info
    this.showHelpAfterError();
    // On usage error, auto-suggest alternatives
    this.showSuggestionAfterError();
    // Add all default options
    // these options will be available across the command hierarchy
    // the values will be captured by the root command
    this.addOption(binOptions.nodePath);
    this.addOption(binOptions.passwordFile);
    this.addOption(binOptions.format);
    this.addOption(binOptions.verbose);
  }

  /**
   * Overrides opts to return all options set in the command hierarchy
   */
  public opts<T extends OptionValues>(): T {
    const opts = super.opts<T>();
    if (this.parent != null) {
      // Override the current options with parent options
      // global option values are captured by the root command
      return Object.assign(opts, this.parent.opts<T>());
    } else {
      return opts;
    }
  }

  public action(fn: (...args: any[]) => void | Promise<void>): this {
    return super.action(async (...args: any[]) => {
      const opts = this.opts();
      // Set the format for error logging for the exit handlers
      this.exitHandlers.errFormat = opts.format === 'json' ? 'json' : 'error';
      // Set the logger according to the verbosity
      this.logger.setLevel(binUtils.verboseToLogLevel(opts.verbose));
      // Set the logger formatter according to the format
      if (opts.format === 'json') {
        this.logger.handlers.forEach((handler) =>
          handler.setFormatter((record) => {
            return JSON.stringify(
              {
                level: levelToString(record.level),
                keys: record.keys,
                msg: record.msg,
                ...record.data,
              },
              evalLogDataValue,
            );
          }),
        );
      } else {
        const format = formatting.format`${formatting.level}:${formatting.keys}:${formatting.msg}`;
        this.logger.handlers.forEach((handler) => handler.setFormatter(format));
      }
      // If the node path is undefined
      // this means there is an unknown platform
      if (opts.nodePath == null) {
        throw new errors.ErrorPolykeyCLINodePath();
      }
      // If verbose level has been enabled, then we want to start tracing
      if (opts.verbose && this.tracerProm == null) {
        this.tracerProm = (async () => {
          const fs = await import('node:fs');
          const spanFile = await fs.promises.open('span.jsonl', 'w');
          const gen = tracer.streamEvents();
          for await (const event of gen) {
            await spanFile.write(JSON.stringify(event) + '\n');
          }
          await spanFile.close();
        })();
        this.exitHandlers.setTracerProm(this.tracerProm);
      } else {
        tracer.disableTracing();
      }
      await fn(...args);
    });
  }
}

export default CommandPolykey;
