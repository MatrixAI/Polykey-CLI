import Library from '@/lib/Library';
import { testUtility } from './utils';

describe('Library class', () => {
  let library: Library | null;

  beforeAll(() => {
    library = new Library('some param');
    // A noop test utility
    // demonstrates using utils inside tests
    testUtility();
  });

  afterAll(() => {
    library = null;
  });

  test('some arbitrary test', () => {
    expect(library?.someParam).toEqual('some param');
  });
});
