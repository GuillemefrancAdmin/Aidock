import { describe, it, expect } from "vitest";
import {
  recordToken,
  recordCompletion,
  getTokensPerSecond,
  consumeOllamaStream,
} from "@/lib/token-metrics";

function streamFromLines(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + "\n"));
      }
      controller.close();
    },
  });
}

describe("recordToken / getTokensPerSecond", () => {
  it("computes a rate from recent token timestamps", () => {
    const serverId = "srv-a";
    const model = "llama3.1:8b";

    recordToken(serverId, model, 0);
    recordToken(serverId, model, 250);
    recordToken(serverId, model, 500);
    recordToken(serverId, model, 750);

    expect(getTokensPerSecond(serverId, model, 750)).toBe(4);
  });

  it("returns null once the last token is older than the staleness window", () => {
    const serverId = "srv-b";
    const model = "mistral:7b";

    recordToken(serverId, model, 0);

    expect(getTokensPerSecond(serverId, model, 6001)).toBeNull();
  });

  it("returns null for a server/model combination with no recorded tokens", () => {
    expect(getTokensPerSecond("srv-unknown", "unknown:1b")).toBeNull();
  });
});

describe("recordCompletion", () => {
  it("sets an exact rate from eval_count/eval_duration, independent of arrival timestamps", () => {
    const serverId = "srv-completion";
    const model = "llama3.1:8b";

    recordCompletion(serverId, model, 42, 1000);

    expect(getTokensPerSecond(serverId, model, 1000)).toBe(42);
  });
});

describe("consumeOllamaStream", () => {
  it("counts content chunks from an Ollama NDJSON stream and ignores the done chunk", async () => {
    const serverId = "srv-ndjson";
    const model = "llama3.1:8b";
    const stream = streamFromLines([
      JSON.stringify({ model, response: "Hel", done: false }),
      JSON.stringify({ model, response: "lo ", done: false }),
      JSON.stringify({ model, response: "there", done: false }),
      JSON.stringify({ model, done: true, eval_count: 3 }),
    ]);

    await consumeOllamaStream(serverId, model, stream);

    expect(getTokensPerSecond(serverId, model)).not.toBeNull();
  });

  it("counts delta chunks from an OpenAI-compatible SSE stream and ignores [DONE]", async () => {
    const serverId = "srv-sse";
    const model = "gpt-oss:20b";
    const stream = streamFromLines([
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hi" } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "!" } }] })}`,
      "data: [DONE]",
    ]);

    await consumeOllamaStream(serverId, model, stream);

    expect(getTokensPerSecond(serverId, model)).not.toBeNull();
  });

  it("ignores malformed lines without throwing", async () => {
    const serverId = "srv-malformed";
    const model = "llama3.1:8b";
    const stream = streamFromLines(["not json", "", JSON.stringify({ response: "ok", done: false })]);

    await expect(consumeOllamaStream(serverId, model, stream)).resolves.toBeUndefined();
    expect(getTokensPerSecond(serverId, model)).not.toBeNull();
  });

  it("computes an exact rate from a non-streaming response (single blob with done:true)", async () => {
    const serverId = "srv-nonstreaming";
    const model = "llama3.1:8b";
    // Ollama's stream:false response: one object carrying the full text AND
    // done:true together, unlike stream:true which spreads content across
    // multiple done:false chunks before a final done:true summary.
    const stream = streamFromLines([
      JSON.stringify({
        model,
        response: "The full generated answer.",
        done: true,
        eval_count: 20,
        eval_duration: 500_000_000, // 0.5s -> 40 tok/s
      }),
    ]);

    await consumeOllamaStream(serverId, model, stream);

    expect(getTokensPerSecond(serverId, model)).toBe(40);
  });
});
