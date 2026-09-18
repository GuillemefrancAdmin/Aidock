import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chat: { findUnique: vi.fn(), update: vi.fn() },
    message: {
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({
    allowed: true,
    remaining: 59,
    resetMs: 1000,
  })),
  getRateLimitConfig: vi.fn(() => ({ maxRequests: 60, windowMs: 60_000 })),
}));
vi.mock("@/lib/log-async", () => ({ logAsync: vi.fn() }));

import { prisma } from "@/lib/prisma";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("POST /api/chats/[id]/messages", () => {
  it("returns a sanitized 502 for a legacy URL with credentials", async () => {
    (prisma.chat.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "chat_1",
      title: "New Conversation",
      model: "llama3",
      parameters: null,
      messages: [],
      server: {
        id: "srv_1",
        name: "Legacy Ollama",
        url: "http://alice:secret@ollama.internal:11434",
      },
    });
    (prisma.message.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn());
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { POST } = await import("@/app/api/chats/[id]/messages/route");
    const response = await POST(
      new Request("http://localhost/api/chats/chat_1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "hello" }),
      }) as any,
      { params: Promise.resolve({ id: "chat_1" }) }
    );
    const responseText = await response.text();
    const logText = errorSpy.mock.calls.flat().join(" ");

    expect(response.status).toBe(502);
    expect(fetch).not.toHaveBeenCalled();
    expect(responseText).not.toContain("alice");
    expect(responseText).not.toContain("secret");
    expect(logText).not.toContain("alice");
    expect(logText).not.toContain("secret");
    expect(responseText).toContain("http://ollama.internal:11434");
  });
});
