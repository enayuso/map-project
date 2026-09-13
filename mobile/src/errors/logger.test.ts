import { clearErrorLog, getErrorLog, logError } from './logger';

// logError is deliberately fire-and-forget (see its own header comment —
// safe to drop into any catch block without changing that block's control
// flow), so it doesn't return a promise callers can await. Its internal
// AsyncStorage read-then-write chain still needs a tick to actually land
// before a test can assert on getErrorLog() — flushing the microtask queue
// a couple of times over is enough for this file's mocked AsyncStorage.
const flush = () => new Promise<void>(resolve => setImmediate(() => resolve()));

describe('logger', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await clearErrorLog();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('starts empty', async () => {
    expect(await getErrorLog()).toEqual([]);
  });

  it('logs an Error object with its message and stack', async () => {
    logError('test:scope', new Error('boom'));
    await flush();
    const log = await getErrorLog();
    expect(log).toHaveLength(1);
    expect(log[0].scope).toBe('test:scope');
    expect(log[0].message).toBe('boom');
    expect(log[0].stack).toEqual(expect.stringContaining('boom'));
    expect(typeof log[0].timestamp).toBe('string');
  });

  it('logs a non-Error thrown value by stringifying it', async () => {
    logError('test:scope', 'a plain string error');
    await flush();
    const log = await getErrorLog();
    expect(log[0].message).toBe('a plain string error');
    expect(log[0].stack).toBeUndefined();
  });

  it('carries the extra context object through', async () => {
    logError('test:scope', new Error('x'), { participantCount: 3 });
    await flush();
    const log = await getErrorLog();
    expect(log[0].extra).toEqual({ participantCount: 3 });
  });

  it('always writes to the console too', async () => {
    logError('test:scope', new Error('boom'));
    await flush();
    expect(consoleErrorSpy).toHaveBeenCalledWith('[test:scope]', 'boom', '');
  });

  it('orders most-recent first', async () => {
    logError('first', new Error('1'));
    await flush();
    logError('second', new Error('2'));
    await flush();
    const log = await getErrorLog();
    expect(log.map(e => e.scope)).toEqual(['second', 'first']);
  });

  it('caps the log at 100 entries, dropping the oldest', async () => {
    for (let i = 0; i < 105; i++) {
      logError('bulk', new Error(`error-${i}`));
      await flush();
    }
    const log = await getErrorLog();
    expect(log).toHaveLength(100);
    // Most recent (error-104) survives; the oldest 5 (error-0..error-4) don't.
    expect(log[0].message).toBe('error-104');
    expect(log.some(e => e.message === 'error-0')).toBe(false);
  });

  it('clearErrorLog empties it back out', async () => {
    logError('test:scope', new Error('boom'));
    await flush();
    expect(await getErrorLog()).toHaveLength(1);

    await clearErrorLog();
    expect(await getErrorLog()).toEqual([]);
  });
});
