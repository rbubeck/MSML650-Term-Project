/** Proposed Option A control-plane routes from API_CONTRACTS.md.
 * Structured response shapes remain TBD until @live-transcription/contracts publishes Zod schemas.
 * No code here talks to Transcribe or signs URLs.
 */
export class TeamApi {
  constructor(
    private readonly baseUrl: string,
    private readonly getAccessToken: () => Promise<string>,
  ) {}

  private async request(method: string, pathname: string, body?: unknown): Promise<unknown> {
    if (!this.baseUrl.startsWith('https://') && !/^http:\/\/localhost(:\d+)?$/.test(this.baseUrl)) {
      throw new Error('An HTTPS API Gateway URL is required.');
    }
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
    if (!response.ok) {
      // Intentionally do not log request/response bodies, credentials, or signed URLs.
      throw new Error(`API request failed (${response.status}).`);
    }
    if (response.status === 204) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return null;
    return (await response.json()) as unknown;
  }

  listSessions(): Promise<unknown> {
    return this.request('GET', '/v1/sessions');
  }
  getSession(sessionId: string): Promise<unknown> {
    return this.request('GET', `/v1/sessions/${encodeURIComponent(sessionId)}`);
  }
  createSession(unapprovedRequestShape: unknown): Promise<unknown> {
    return this.request('POST', '/v1/sessions', unapprovedRequestShape);
  }
  renameSession(sessionId: string, unapprovedRequestShape: unknown): Promise<unknown> {
    return this.request(
      'PATCH',
      `/v1/sessions/${encodeURIComponent(sessionId)}`,
      unapprovedRequestShape,
    );
  }
  uploadFinalSegments(sessionId: string, unapprovedRequestShape: unknown): Promise<unknown> {
    return this.request(
      'POST',
      `/v1/sessions/${encodeURIComponent(sessionId)}/segments`,
      unapprovedRequestShape,
    );
  }
  completeSession(sessionId: string, unapprovedRequestShape: unknown): Promise<unknown> {
    return this.request(
      'POST',
      `/v1/sessions/${encodeURIComponent(sessionId)}/complete`,
      unapprovedRequestShape,
    );
  }
  deleteSession(sessionId: string): Promise<unknown> {
    return this.request('DELETE', `/v1/sessions/${encodeURIComponent(sessionId)}`);
  }
  /** Intentionally service-private in architecture: stream client adapter consumes this. */
  requestStreamCapability(sessionId: string, unapprovedRequestShape: unknown): Promise<unknown> {
    return this.request(
      'POST',
      `/v1/sessions/${encodeURIComponent(sessionId)}/stream-url`,
      unapprovedRequestShape,
    );
  }
}
