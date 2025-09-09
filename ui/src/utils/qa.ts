import { API_URL } from './constants';

export async function streamAnswer(
  question: string,
  onToken: (chunk: string) => void,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const controller = new AbortController();
  const signal = options?.signal ?? controller.signal;

  const res = await fetch(`${API_URL}/qa/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Request failed with status ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) onToken(chunk);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

