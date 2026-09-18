const MAX_SAMPLES = 24;
const STALE_MS = 6_000;
const CLEANUP_INTERVAL_MS = 60_000;
const IDLE_EVICTION_MS = 5 * 60_000;

interface TokenMetricEntry {
  timestamps: number[];
  tokensPerSecond: number;
  lastUpdate: number;
}

const store = new Map<string, TokenMetricEntry>();

function key(serverId: string, model: string): string {
  return `${serverId}::${model}`;
}

export function recordToken(serverId: string, model: string, now = Date.now()): void {
  const k = key(serverId, model);
  let entry = store.get(k);
  if (!entry) {
    entry = { timestamps: [], tokensPerSecond: 0, lastUpdate: now };
    store.set(k, entry);
  }

  entry.timestamps.push(now);
  if (entry.timestamps.length > MAX_SAMPLES) {
    entry.timestamps.shift();
  }
  entry.lastUpdate = now;

  if (entry.timestamps.length >= 2) {
    const spanMs = entry.timestamps[entry.timestamps.length - 1] - entry.timestamps[0];
    entry.tokensPerSecond =
      spanMs > 0 ? ((entry.timestamps.length - 1) / spanMs) * 1000 : entry.tokensPerSecond;
  }
}

/**
 * Directly sets a precise tokens/s reading, replacing the rolling arrival-time
 * estimate. Used for Ollama's final `done` chunk (which carries exact
 * eval_count/eval_duration) and for non-streaming responses, where a single
 * response has no per-token arrival times to sample from.
 */
export function recordCompletion(
  serverId: string,
  model: string,
  tokensPerSecond: number,
  now = Date.now()
): void {
  const k = key(serverId, model);
  store.set(k, { timestamps: [now], tokensPerSecond, lastUpdate: now });
}

export function getTokensPerSecond(serverId: string, model: string, now = Date.now()): number | null {
  const entry = store.get(key(serverId, model));
  if (!entry) return null;
  if (now - entry.lastUpdate > STALE_MS) return null;
  return Math.round(entry.tokensPerSecond * 10) / 10;
}

function extractContentLength(parsed: unknown): number | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.response === "string") {
    return obj.response.length > 0 ? obj.response.length : null;
  }

  const message = obj.message as { content?: unknown } | undefined;
  if (message && typeof message.content === "string") {
    return message.content.length > 0 ? message.content.length : null;
  }

  const choices = obj.choices as Array<{ delta?: { content?: unknown } }> | undefined;
  if (Array.isArray(choices) && choices.length > 0) {
    const content = choices[0]?.delta?.content;
    if (typeof content === "string" && content.length > 0) return content.length;
  }

  return null;
}

/**
 * Ollama's own eval_count/eval_duration (nanoseconds), present on the final
 * `done` chunk of both streaming and non-streaming responses. This is the
 * only signal available for a non-streaming call, since it has no
 * intermediate chunks to time.
 */
function extractCompletionRate(parsed: unknown): number | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.done !== true) return null;

  const evalCount = obj.eval_count;
  const evalDuration = obj.eval_duration;
  if (
    typeof evalCount === "number" &&
    evalCount > 0 &&
    typeof evalDuration === "number" &&
    evalDuration > 0
  ) {
    return (evalCount / evalDuration) * 1e9;
  }
  return null;
}

/**
 * Best-effort background consumer for a tee'd Ollama response stream.
 * Never throws — a failure here must not affect the client-facing stream.
 */
export async function consumeOllamaStream(
  serverId: string,
  model: string,
  stream: ReadableStream<Uint8Array>
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const jsonText = line.startsWith("data:") ? line.slice(5).trim() : line;
        if (!jsonText || jsonText === "[DONE]") continue;

        try {
          const parsed = JSON.parse(jsonText);
          if (extractContentLength(parsed) !== null) {
            recordToken(serverId, model);
          }
          const completionRate = extractCompletionRate(parsed);
          if (completionRate !== null) {
            recordCompletion(serverId, model, completionRate);
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }
  } catch {
    // ignore stream read errors, this is best-effort telemetry
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    store.forEach((entry, k) => {
      if (now - entry.lastUpdate > IDLE_EVICTION_MS) {
        store.delete(k);
      }
    });
  }, CLEANUP_INTERVAL_MS);
}
