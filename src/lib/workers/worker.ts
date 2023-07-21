import { expose } from 'threads/worker';

expose({
  helloWorld() {
    return 'Hello Worker!';
  },
});
