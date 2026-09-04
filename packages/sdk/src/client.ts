/**
 * One typed client for every product.
 *
 * Every frontend — user web app, admin console, mobile, partner integrations —
 * talks to the platform through this. It centralises the three things that would
 * otherwise be re-implemented (differently, and wrongly) in each of 100 product
 * UIs: token refresh, correlation ids, and error normalisation.
 *
 * In production this file is generated from the OpenAPI document the API already
 * publishes at /docs-json, so client types cannot drift from the server.
 */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  correlationId: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail);
    this.name = 'ApiError';
  }
  get isForbidden(): boolean { return this.problem.status === 403; }
  get isProductDisabled(): boolean { return this.problem.type.endsWith('product_not_enabled'); }
}

export interface Tokens { accessToken: string; refreshToken: string }

export class HelixClient {
  private refreshing: Promise<Tokens> | null = null;

  constructor(
    private readonly baseUrl: string,
    private tokens: Tokens | null = null,
    private readonly onTokens?: (t: Tokens | null) => void,
  ) {}

  setTokens(tokens: Tokens | null): void {
    this.tokens = tokens;
    this.onTokens?.(tokens);
  }

  async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(this.tokens ? { authorization: `Bearer ${this.tokens.accessToken}` } : {}),
        ...init.headers,
      },
    });

    // A single 401 triggers exactly one refresh, shared by every concurrent
    // request, then replays. Without the shared promise a dashboard that fires
    // twelve parallel calls would burn twelve refresh tokens.
    if (res.status === 401 && retry && this.tokens?.refreshToken) {
      this.refreshing ??= this.doRefresh(this.tokens.refreshToken);
      try {
        this.setTokens(await this.refreshing);
      } catch {
        this.setTokens(null);
        throw new ApiError(await res.json());
      } finally {
        this.refreshing = null;
      }
      return this.request<T>(path, init, false);
    }

    if (!res.ok) throw new ApiError(await res.json());
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  private async doRefresh(refreshToken: string): Promise<Tokens> {
    const res = await fetch(`${this.baseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) throw new Error('refresh failed');
    return res.json();
  }

  // ---- Platform ----------------------------------------------------------
  login(email: string, password: string) {
    return this.request<Tokens & { expiresIn: number; tenantId: string }>('/v1/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
  }
  products() { return this.request<{ data: LauncherProduct[] }>('/v1/platform/products'); }
  search(q: string, products?: string[]) {
    const qs = new URLSearchParams({ q, ...(products?.length ? { products: products.join(',') } : {}) });
    return this.request<{ data: SearchHit[] }>(`/v1/platform/search?${qs}`);
  }

  // ---- Products ----------------------------------------------------------
  calendarEvents(from: string, to: string) {
    return this.request<{ data: CalendarEvent[]; nextCursor: string | null }>(
      `/v1/calendar/events?from=${from}&to=${to}`,
    );
  }
  createMeetRoom(title: string, startsAt: string) {
    return this.request<{ id: string; code: string; joinUrl: string }>('/v1/meet/rooms', {
      method: 'POST', body: JSON.stringify({ title, startsAt }),
    });
  }
  driveNodes(parentId?: string) {
    return this.request<DriveNode[]>(`/v1/drive/nodes${parentId ? `?parentId=${parentId}` : ''}`);
  }
}

export interface LauncherProduct {
  key: string; name: string; category: string; enabled: boolean;
  ui?: { icon: string; color: string; launchUrl: string };
}
export interface SearchHit { product: string; type: string; refId: string; title: string; snippet: string | null }
export interface CalendarEvent { id: string; title: string; startsAt: string; endsAt: string; meetRoomId: string | null }
export interface DriveNode { id: string; name: string; kind: 'folder' | 'file'; sizeBytes: string }
