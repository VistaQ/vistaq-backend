import { SupabaseServiceError } from '@src/models/errors/supabase.error';

/******************************************************************************
  Mocks — must be declared before any module imports that trigger side effects
******************************************************************************/

// Supply env vars before env.ts runs so the validation guards do not throw
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

// ---------------------------------------------------------------------------
// Supabase client mock
// ---------------------------------------------------------------------------

// Chainable builder returned by from()
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockFrom = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
  })),
}));

// ---------------------------------------------------------------------------
// LoggingService mock
// ---------------------------------------------------------------------------

const mockLoggingError = jest.fn();
const mockLoggingInfo = jest.fn();

jest.mock('@src/services/logging.service', () => ({
  __esModule: true,
  default: {
    info: mockLoggingInfo,
    error: mockLoggingError,
    warn: jest.fn(),
    debug: jest.fn(),
  },
  loggingService: {
    info: mockLoggingInfo,
    error: mockLoggingError,
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

/******************************************************************************
  Import the module under test AFTER mocks are registered
******************************************************************************/

// We import the class directly by re-requiring after mocks are set up.
// Because the singleton is created at module load time, we import it here
// after all jest.mock calls so it picks up the mocked dependencies.
import { supabaseService } from '@src/services/supabase.service';

/******************************************************************************
  Helpers
******************************************************************************/

/**
 * Configures the `mockFrom` chain so that awaiting the terminal query builder
 * returns `resolvedValue`.
 *
 * The Supabase fluent API looks like:
 *   client.from(table).select(cols)               — select
 *   client.from(table).insert(vals).select()       — insert
 *   client.from(table).update(vals).select().eq()  — update
 *   client.from(table).delete().select().eq()      — delete
 *
 * Every terminal call must be a thenable (resolvable promise-like), so we
 * make the last call in the chain return a resolved promise.
 */
function buildQueryChain(resolvedValue: unknown) {
  // eq() is always the last call in update/delete chains; for select it may
  // also be called when filters are provided.  We make eq() return a new
  // thenable that also has eq() so chains of multiple filters work.
  const eqChain: jest.Mock = jest.fn().mockImplementation(() => {
    // Return another thenable with .eq so multiple .eq() calls chain correctly
    const next = { ...thenableResult, eq: eqChain };
    return next;
  });

  const thenableResult = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolvedValue).then(resolve),
    catch: (reject: (e: unknown) => unknown) => Promise.resolve(resolvedValue).catch(reject),
    eq: eqChain,
  };

  // select() — used standalone and as the terminal call after insert/update/delete
  mockSelect.mockReturnValue(thenableResult);

  // insert().select()
  mockInsert.mockReturnValue({ select: mockSelect });

  // update().select().eq()
  mockUpdate.mockReturnValue({ select: mockSelect });

  // delete().select().eq()
  mockDelete.mockReturnValue({ select: mockSelect });

  // from() returns the builder object
  mockFrom.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  });
}

/******************************************************************************
  Test suites
******************************************************************************/

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// select
// ---------------------------------------------------------------------------

describe('SupabaseService.select()', () => {
  it('calls from(table).select(columns) and returns the response', async () => {
    const fakeResponse = { data: [{ id: '1', name: 'Alice' }], error: null };
    buildQueryChain(fakeResponse);

    const result = await supabaseService.select('users', 'id, name');

    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockSelect).toHaveBeenCalledWith('id, name');
    expect(result).toBe(fakeResponse);
  });

  it('defaults columns to "*" when no columns argument is passed', async () => {
    const fakeResponse = { data: [], error: null };
    buildQueryChain(fakeResponse);

    await supabaseService.select('users');

    expect(mockSelect).toHaveBeenCalledWith('*');
  });

  it('applies eq filters when filters object is provided', async () => {
    const fakeResponse = { data: [{ id: '1' }], error: null };
    buildQueryChain(fakeResponse);

    await supabaseService.select('users', '*', { id: '1' });

    // The eq chain is invoked for each filter entry
    const selectResult = mockSelect.mock.results[0].value;
    expect(selectResult.eq).toHaveBeenCalledWith('id', '1');
  });

  it('logs the error via loggingService when response.error is set, but does NOT throw', async () => {
    const supabaseError = { message: 'row not found', code: '404' };
    const fakeResponse = { data: null, error: supabaseError };
    buildQueryChain(fakeResponse);

    await expect(supabaseService.select('users')).resolves.toBe(fakeResponse);

    expect(mockLoggingError).toHaveBeenCalledWith(
      'SupabaseService.select query error',
      supabaseError,
      expect.objectContaining({ table: 'users' }),
    );
  });

  it('wraps an unexpected thrown error as SupabaseServiceError', async () => {
    const unexpectedError = new Error('network failure');
    mockFrom.mockImplementation(() => {
      throw unexpectedError;
    });

    await expect(supabaseService.select('users')).rejects.toBeInstanceOf(SupabaseServiceError);
  });

  it('preserves the original error as cause on the SupabaseServiceError', async () => {
    const unexpectedError = new Error('network failure');
    mockFrom.mockImplementation(() => {
      throw unexpectedError;
    });

    try {
      await supabaseService.select('users');
      fail('Expected SupabaseServiceError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SupabaseServiceError);
      expect((err as SupabaseServiceError).cause).toBe(unexpectedError);
    }
  });
});

// ---------------------------------------------------------------------------
// insert
// ---------------------------------------------------------------------------

describe('SupabaseService.insert()', () => {
  it('calls from(table).insert(values).select() and returns the response', async () => {
    const fakeResponse = { data: [{ id: '2', name: 'Bob' }], error: null };
    buildQueryChain(fakeResponse);

    const values = { id: 'uuid-2', email: 'bob@example.com', name: 'Bob', role: 'agent' };
    const result = await supabaseService.insert('users', values);

    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockInsert).toHaveBeenCalledWith(values);
    expect(mockSelect).toHaveBeenCalled();
    expect(result).toBe(fakeResponse);
  });

  it('logs the error via loggingService when response.error is set, but does NOT throw', async () => {
    const supabaseError = { message: 'duplicate key', code: '23505' };
    const fakeResponse = { data: null, error: supabaseError };
    buildQueryChain(fakeResponse);

    await expect(supabaseService.insert('users', { id: 'uuid-2', email: 'bob@example.com', name: 'Bob', role: 'agent' })).resolves.toBe(fakeResponse);

    expect(mockLoggingError).toHaveBeenCalledWith(
      'SupabaseService.insert query error',
      supabaseError,
      expect.objectContaining({ table: 'users' }),
    );
  });

  it('wraps an unexpected thrown error as SupabaseServiceError', async () => {
    const unexpectedError = new Error('connection reset');
    mockFrom.mockImplementation(() => {
      throw unexpectedError;
    });

    const minimalInsert = { id: 'uuid-3', email: 'c@example.com', name: 'Carol', role: 'agent' };
    await expect(supabaseService.insert('users', minimalInsert)).rejects.toBeInstanceOf(SupabaseServiceError);

    try {
      await supabaseService.insert('users', minimalInsert);
    } catch (err) {
      expect((err as SupabaseServiceError).cause).toBe(unexpectedError);
    }
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('SupabaseService.update()', () => {
  it('throws SupabaseServiceError immediately when filters is an empty object', async () => {
    buildQueryChain({ data: [], error: null });

    await expect(supabaseService.update('users', { name: 'Carol' }, {})).rejects.toBeInstanceOf(
      SupabaseServiceError,
    );
  });

  it('empty-filters error message indicates a safety refusal', async () => {
    buildQueryChain({ data: [], error: null });

    // The guard throws an inner SupabaseServiceError which the outer catch
    // re-wraps. The descriptive message is on the cause, not the outer error.
    try {
      await supabaseService.update('users', { name: 'Carol' }, {});
      fail('Expected SupabaseServiceError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SupabaseServiceError);
      const cause = (err as SupabaseServiceError).cause;
      expect(cause).toBeInstanceOf(SupabaseServiceError);
      expect((cause as SupabaseServiceError).message).toMatch(/filters must not be empty/i);
    }
  });

  it('calls from(table).update(values).select() and applies eq filter on happy path', async () => {
    const fakeResponse = { data: [{ id: '1', name: 'Carol' }], error: null };
    buildQueryChain(fakeResponse);

    const result = await supabaseService.update('users', { name: 'Carol' }, { id: '1' });

    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockUpdate).toHaveBeenCalledWith({ name: 'Carol' });
    expect(result).toBe(fakeResponse);
  });

  it('logs the error via loggingService when response.error is set, but does NOT throw', async () => {
    const supabaseError = { message: 'update conflict', code: '409' };
    const fakeResponse = { data: null, error: supabaseError };
    buildQueryChain(fakeResponse);

    await expect(
      supabaseService.update('users', { name: 'Carol' }, { id: '1' }),
    ).resolves.toBe(fakeResponse);

    expect(mockLoggingError).toHaveBeenCalledWith(
      'SupabaseService.update query error',
      supabaseError,
      expect.objectContaining({ table: 'users' }),
    );
  });

  it('wraps an unexpected thrown error as SupabaseServiceError', async () => {
    const unexpectedError = new Error('timeout');
    mockFrom.mockImplementation(() => {
      throw unexpectedError;
    });

    await expect(
      supabaseService.update('users', { name: 'Carol' }, { id: '1' }),
    ).rejects.toBeInstanceOf(SupabaseServiceError);

    try {
      await supabaseService.update('users', { name: 'Carol' }, { id: '1' });
    } catch (err) {
      expect((err as SupabaseServiceError).cause).toBe(unexpectedError);
    }
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('SupabaseService.delete()', () => {
  it('throws SupabaseServiceError immediately when filters is an empty object', async () => {
    buildQueryChain({ data: [], error: null });

    await expect(supabaseService.delete('users', {})).rejects.toBeInstanceOf(SupabaseServiceError);
  });

  it('empty-filters error message indicates a safety refusal', async () => {
    buildQueryChain({ data: [], error: null });

    // The guard throws an inner SupabaseServiceError which the outer catch
    // re-wraps. The descriptive message is on the cause, not the outer error.
    try {
      await supabaseService.delete('users', {});
      fail('Expected SupabaseServiceError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SupabaseServiceError);
      const cause = (err as SupabaseServiceError).cause;
      expect(cause).toBeInstanceOf(SupabaseServiceError);
      expect((cause as SupabaseServiceError).message).toMatch(/filters must not be empty/i);
    }
  });

  it('calls from(table).delete().select() and applies eq filter on happy path', async () => {
    const fakeResponse = { data: [{ id: '1' }], error: null };
    buildQueryChain(fakeResponse);

    const result = await supabaseService.delete('users', { id: '1' });

    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockDelete).toHaveBeenCalled();
    expect(result).toBe(fakeResponse);
  });

  it('logs the error via loggingService when response.error is set, but does NOT throw', async () => {
    const supabaseError = { message: 'foreign key violation', code: '23503' };
    const fakeResponse = { data: null, error: supabaseError };
    buildQueryChain(fakeResponse);

    await expect(supabaseService.delete('users', { id: '1' })).resolves.toBe(fakeResponse);

    expect(mockLoggingError).toHaveBeenCalledWith(
      'SupabaseService.delete query error',
      supabaseError,
      expect.objectContaining({ table: 'users' }),
    );
  });

  it('wraps an unexpected thrown error as SupabaseServiceError', async () => {
    const unexpectedError = new Error('socket hang up');
    mockFrom.mockImplementation(() => {
      throw unexpectedError;
    });

    await expect(supabaseService.delete('users', { id: '1' })).rejects.toBeInstanceOf(
      SupabaseServiceError,
    );

    try {
      await supabaseService.delete('users', { id: '1' });
    } catch (err) {
      expect((err as SupabaseServiceError).cause).toBe(unexpectedError);
    }
  });
});

// ---------------------------------------------------------------------------
// adminUpsert
// ---------------------------------------------------------------------------

describe('SupabaseService.adminUpsert', () => {
  it('calls upsert with onConflict and returns the response', async () => {
    const upsertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
    });
    const fromMock = jest.fn().mockReturnValue({ upsert: upsertMock });
    (supabaseService as unknown as { adminClient: { from: jest.Mock } }).adminClient = {
      from: fromMock,
    } as never;

    const response = await supabaseService.adminUpsert(
      'tenants',
      { id: '1', slug: 's', name: 'n' } as never,
      'id',
    );

    expect(fromMock).toHaveBeenCalledWith('tenants');
    expect(upsertMock).toHaveBeenCalledWith({ id: '1', slug: 's', name: 'n' }, { onConflict: 'id' });
    expect(response.data).toEqual([{ id: '1' }]);
    expect(response.error).toBeNull();
  });

  it('wraps thrown errors in SupabaseServiceError', async () => {
    const upsertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockRejectedValue(new Error('boom')),
    });
    (supabaseService as unknown as { adminClient: { from: jest.Mock } }).adminClient = {
      from: jest.fn().mockReturnValue({ upsert: upsertMock }),
    } as never;

    await expect(
      supabaseService.adminUpsert('tenants', { id: '1' } as never, 'id'),
    ).rejects.toThrow('Admin upsert operation failed in SupabaseService');
  });

  it('logs the error via loggingService when response.error is set, but does NOT throw', async () => {
    const supabaseError = { message: 'upsert conflict', code: '23505' };
    const fakeResponse = { data: null, error: supabaseError };
    const upsertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(fakeResponse),
    });
    (supabaseService as unknown as { adminClient: { from: jest.Mock } }).adminClient = {
      from: jest.fn().mockReturnValue({ upsert: upsertMock }),
    } as never;

    await expect(
      supabaseService.adminUpsert('tenants', { id: '1', slug: 's', name: 'n' } as never, 'id'),
    ).resolves.toBe(fakeResponse);

    expect(mockLoggingError).toHaveBeenCalledWith(
      'SupabaseService.adminUpsert query error',
      supabaseError,
      expect.objectContaining({ table: 'tenants' }),
    );
  });

  it('preserves the original error as cause on the SupabaseServiceError', async () => {
    const originalError = new Error('network timeout');
    const upsertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockRejectedValue(originalError),
    });
    (supabaseService as unknown as { adminClient: { from: jest.Mock } }).adminClient = {
      from: jest.fn().mockReturnValue({ upsert: upsertMock }),
    } as never;

    try {
      await supabaseService.adminUpsert('tenants', { id: '1' } as never, 'id');
      fail('Expected SupabaseServiceError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SupabaseServiceError);
      expect((err as SupabaseServiceError).cause).toBe(originalError);
    }
  });
});

describe('SupabaseService.uploadToStorage', () => {
  it('uploads to the given bucket and path, returning the response', async () => {
    const uploadMock = jest.fn().mockResolvedValue({ data: { path: 'abc.xlsx' }, error: null });
    const fromMock = jest.fn().mockReturnValue({ upload: uploadMock });
    (supabaseService as unknown as { adminClient: { storage: { from: jest.Mock } } }).adminClient = {
      storage: { from: fromMock },
    } as never;

    const buf = Buffer.from('fake');
    const res = await supabaseService.uploadToStorage(
      'reports-raw',
      'jobs/1.xlsx',
      buf,
      'application/octet-stream',
    );

    expect(fromMock).toHaveBeenCalledWith('reports-raw');
    expect(uploadMock).toHaveBeenCalledWith('jobs/1.xlsx', buf, {
      contentType: 'application/octet-stream',
      upsert: false,
    });
    expect(res.data?.path).toBe('abc.xlsx');
  });

  it('wraps thrown errors in SupabaseServiceError', async () => {
    const fromMock = jest.fn().mockReturnValue({
      upload: jest.fn().mockRejectedValue(new Error('boom')),
    });
    (supabaseService as unknown as { adminClient: { storage: { from: jest.Mock } } }).adminClient = {
      storage: { from: fromMock },
    } as never;

    await expect(
      supabaseService.uploadToStorage('reports-raw', 'x', Buffer.alloc(1), 'application/octet-stream'),
    ).rejects.toThrow('Storage upload failed in SupabaseService');
  });
});

describe('SupabaseService.createSignedDownloadUrl', () => {
  it('returns the signed URL', async () => {
    const signedMock = jest.fn().mockResolvedValue({
      data: { signedUrl: 'https://signed/' },
      error: null,
    });
    const fromMock = jest.fn().mockReturnValue({ createSignedUrl: signedMock });
    (supabaseService as unknown as { adminClient: { storage: { from: jest.Mock } } }).adminClient = {
      storage: { from: fromMock },
    } as never;

    const url = await supabaseService.createSignedDownloadUrl('reports-raw', 'jobs/1.xlsx', 300);

    expect(signedMock).toHaveBeenCalledWith('jobs/1.xlsx', 300);
    expect(url).toBe('https://signed/');
  });

  it('throws SupabaseServiceError when signing returns an error', async () => {
    const fromMock = jest.fn().mockReturnValue({
      createSignedUrl: jest.fn().mockResolvedValue({ data: null, error: { message: 'nope' } }),
    });
    (supabaseService as unknown as { adminClient: { storage: { from: jest.Mock } } }).adminClient = {
      storage: { from: fromMock },
    } as never;

    await expect(
      supabaseService.createSignedDownloadUrl('reports-raw', 'jobs/1.xlsx', 300),
    ).rejects.toThrow('Create signed download URL failed');
  });
});

describe('SupabaseService.removeFromStorage', () => {
  it('calls remove on the bucket with the given paths', async () => {
    const removeMock = jest.fn().mockResolvedValue({ data: [], error: null });
    const fromMock = jest.fn().mockReturnValue({ remove: removeMock });
    (supabaseService as unknown as { adminClient: { storage: { from: jest.Mock } } }).adminClient = {
      storage: { from: fromMock },
    } as never;

    await supabaseService.removeFromStorage('reports-raw', ['jobs/1.xlsx']);

    expect(removeMock).toHaveBeenCalledWith(['jobs/1.xlsx']);
  });
});
