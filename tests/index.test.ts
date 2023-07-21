import { Library } from '@';

describe('index', () => {
  test('some arbitrary test', () => {
    const library = new Library('some param');
    expect(library?.someParam).toEqual('some param');
  });
});
