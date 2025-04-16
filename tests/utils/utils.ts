import type PolykeyAgent from 'polykey/PolykeyAgent.js';
import { promise } from 'polykey/utils/utils.js';
import fc from 'fast-check';
import * as binParsers from '#utils/parsers.js';

function testIf(condition: boolean) {
  return condition ? test : test.skip;
}

function describeIf(condition: boolean) {
  return condition ? describe : describe.skip;
}

function trackTimers() {
  const timerMap: Map<any, any> = new Map();
  const oldClearTimeout = globalThis.clearTimeout;
  const newClearTimeout = (...args: Array<any>) => {
    timerMap.delete(args[0]);
    // @ts-ignore: slight type mismatch
    oldClearTimeout(...args);
  };
  globalThis.clearTimeout = newClearTimeout;

  const oldSetTimeout = globalThis.setTimeout;
  const newSetTimeout = (handler: TimerHandler, timeout?: number) => {
    const prom = promise();
    const stack = Error();
    const newCallback = async (...args: Array<any>) => {
      // @ts-ignore: only expecting functions
      await handler(...args);
      prom.resolveP();
    };
    const result = oldSetTimeout(newCallback, timeout);
    timerMap.set(result, { timeout, stack });
    void prom.p.finally(() => {
      timerMap.delete(result);
    });
    return result;
  };
  // @ts-ignore: slight type mismatch
  globalThis.setTimeout = newSetTimeout;

  // Setting up interval
  const oldSetInterval = globalThis.setInterval;
  const newSetInterval = (...args) => {
    // @ts-ignore: slight type mismatch
    const result = oldSetInterval(...args);
    timerMap.set(result, { timeout: args[0], error: Error() });
    return result;
  };
  // @ts-ignore: slight type mismatch
  globalThis.setInterval = newSetInterval;

  const oldClearInterval = globalThis.clearInterval;
  const newClearInterval = (timer) => {
    timerMap.delete(timer);
    return oldClearInterval(timer);
  };
  // @ts-ignore: slight type mismatch
  globalThis.clearInterval = newClearInterval();

  return timerMap;
}

/**
 * Adds each node's details to the other
 */
async function nodesConnect(localNode: PolykeyAgent, remoteNode: PolykeyAgent) {
  // Add remote node's details to local node
  await localNode.nodeManager.setNode(
    remoteNode.keyRing.getNodeId(),
    [remoteNode.agentServiceHost, remoteNode.agentServicePort],
    {
      mode: 'direct',
      connectedTime: Date.now(),
      scopes: ['global'],
    },
  );
  // Add local node's details to remote node
  await remoteNode.nodeManager.setNode(
    localNode.keyRing.getNodeId(),
    [localNode.agentServiceHost, localNode.agentServicePort],
    {
      mode: 'direct',
      connectedTime: Date.now(),
      scopes: ['global'],
    },
  );
}

const vaultNameArb = fc.noShrink(
  fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((str) => binParsers.vaultNameRegex.test(str))
    .filter((str) => !str.startsWith('-')),
);

export { testIf, describeIf, trackTimers, nodesConnect, vaultNameArb };
