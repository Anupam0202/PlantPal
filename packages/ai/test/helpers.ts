/** A syntactically valid, fake Gemini key for tests (never a real one). */
export const FAKE_KEY = 'AIza' + 'Sy' + 'TEST'.repeat(8) + '0';

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function geminiText(
  text: string,
  finishReason = 'STOP',
  usage = { promptTokenCount: 100, candidatesTokenCount: 50 },
) {
  return { candidates: [{ content: { parts: [{ text }] }, finishReason }], usageMetadata: usage };
}

export interface Recorded {
  url: string;
  init: RequestInit;
}

/** A fetch stub that replays responses in order and records every request. */
export function replayFetch(responses: Array<Response | Error>) {
  const calls: Recorded[] = [];
  const queue = [...responses];
  const f = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const next = queue.shift();
    if (!next) throw new Error('No more recorded responses');
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetch: f, calls };
}
