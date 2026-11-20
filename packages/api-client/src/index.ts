import {
  healthSchema, loginSchema, snapshotSchema, historySchema, reportSchema,
  type ActionInputs, type ActionName, type ActionResults, type HistoryFilters,
  type LoginInput, type ReportParams,
} from '@bep/contracts';

export interface ClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  getToken?: () => string | null;
  getStaffAccount?: () => string | null;
  timeoutMs?: number;
}
export interface RequestOptions { signal?: AbortSignal }
export interface ActionOptions extends RequestOptions { key: string }

// Never attach request data, response bodies, URLs, or upstream error causes:
// they may contain login credentials, tokens, or confidential inventory data.
export class ApiError extends Error {
  readonly status: number;
  readonly kind: 'http' | 'network' | 'timeout' | 'aborted' | 'response';
  constructor(status: number, kind: ApiError['kind'] = 'http') {
    super(kind === 'http' ? `Inventory API request failed (${status}).` : `Inventory API ${kind} error.`);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
  }
}

function queryString(params: object): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) query.set(name, String(value));
  }
  return query.size ? '?' + query.toString() : '';
}

export function createInventoryClient(options: ClientOptions = {}) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? 20_000;

  async function request(path: string, method: 'GET' | 'POST', body: unknown,
    requestOptions: RequestOptions = {}, key?: string, binary = false): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (requestOptions.signal?.aborted) abort();
    else requestOptions.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const headers = new Headers();
      const token = options.getToken?.();
      const account = options.getStaffAccount?.();
      if (token) headers.set('Authorization', 'Bearer ' + token);
      if (account) headers.set('X-Staff-Account', account);
      if (key !== undefined) headers.set('Idempotency-Key', key);
      if (body !== undefined) headers.set('Content-Type', 'application/json');
      const response = await fetcher(baseUrl + '/api/' + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new ApiError(response.status);
      try {
        return binary ? await response.blob() : await response.json();
      } catch {
        if (controller.signal.aborted) throw new ApiError(0, timedOut ? 'timeout' : 'aborted');
        throw new ApiError(response.status, 'response');
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, timedOut ? 'timeout' : controller.signal.aborted ? 'aborted' : 'network');
    } finally {
      clearTimeout(timeout);
      requestOptions.signal?.removeEventListener('abort', abort);
    }
  }

  async function read<T>(path: string, schema: { safeParse: (input: unknown) =>
    { success: true; data: T } | { success: false } }, requestOptions?: RequestOptions): Promise<T> {
    const result = schema.safeParse(await request(path, 'GET', undefined, requestOptions));
    if (!result.success) throw new ApiError(200, 'response');
    return result.data;
  }

  return {
    health: (requestOptions?: RequestOptions) => read('health', healthSchema, requestOptions),
    async login(input: LoginInput, requestOptions?: RequestOptions) {
      const result = loginSchema.safeParse(await request('login', 'POST', input, requestOptions));
      if (!result.success) throw new ApiError(200, 'response');
      return result.data;
    },
    async logout(requestOptions?: RequestOptions) {
      const result = healthSchema.safeParse(await request('logout', 'POST', undefined, requestOptions));
      if (!result.success) throw new ApiError(200, 'response');
      return result.data;
    },
    snapshot: (requestOptions?: RequestOptions) => read('snapshot', snapshotSchema, requestOptions),
    history: (filters: HistoryFilters = {}, requestOptions?: RequestOptions) =>
      read('history' + queryString(filters), historySchema, requestOptions),
    report: (params: ReportParams = {}, requestOptions?: RequestOptions) =>
      read('report' + queryString(params), reportSchema, requestOptions),
    photo: async (id: string, requestOptions?: RequestOptions) =>
      await request('photos/' + encodeURIComponent(id), 'GET', undefined, requestOptions, undefined, true) as Blob,
    action: async <A extends ActionName>(action: A, input: ActionInputs[A], actionOptions: ActionOptions): Promise<ActionResults[A]> =>
      await request(action, 'POST', input, actionOptions, actionOptions.key) as ActionResults[A],
  };
}

export type InventoryClient = ReturnType<typeof createInventoryClient>;
