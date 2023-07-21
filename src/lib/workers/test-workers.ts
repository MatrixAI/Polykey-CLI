import process from 'process';
import { Pool, spawn, Worker } from 'threads';

async function testWorkers() {
  process.stdout.write('Lets test workers.\n');
  const pool = Pool(() => spawn(new Worker('./worker')), 1);
  for (let i = 0; i < 1; i++) {
    void pool.queue(async (hellower) => {
      process.stdout.write((await hellower.helloWorld()) + '\n');
    });
  }
  await pool.completed();
  process.stdout.write('\n');
  await pool.terminate();
}

export default testWorkers;
