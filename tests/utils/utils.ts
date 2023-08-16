import type PolykeyAgent from 'polykey/dist/PolykeyAgent';
import type { Host, Port } from 'polykey/dist/network/types';
import type { NodeAddress } from 'polykey/dist/nodes/types';
import { promise } from 'polykey/dist/utils/utils';

function testIf(condition: boolean) {
  return condition ? test : test.skip;
}

function describeIf(condition: boolean) {
  return condition ? describe : describe.skip;
}

function trackTimers() {
  const timerMap: Map<any, any> = new Map();
  const oldClearTimeout = globalThis.clearTimeout;
  const newClearTimeout = (...args) => {
    timerMap.delete(args[0]);
    // @ts-ignore: slight type mismatch
    oldClearTimeout(...args);
  };
  globalThis.clearTimeout = newClearTimeout;

  const oldSetTimeout = globalThis.setTimeout;
  const newSetTimeout = (handler: TimerHandler, timeout?: number) => {
    const prom = promise();
    const stack = Error();
    const newCallback = async (...args) => {
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
  await localNode.nodeManager.setNode(remoteNode.keyRing.getNodeId(), {
    host: remoteNode.quicSocket.host as unknown as Host,
    port: remoteNode.quicSocket.port as unknown as Port,
  } as NodeAddress);
  // Add local node's details to remote node
  await remoteNode.nodeManager.setNode(localNode.keyRing.getNodeId(), {
    host: localNode.quicSocket.host as unknown as Host,
    port: localNode.quicSocket.port as unknown as Port,
  } as NodeAddress);
}

export { testIf, describeIf, trackTimers, nodesConnect };
