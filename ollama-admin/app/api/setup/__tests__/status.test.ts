import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    settings: { findUnique: vi.fn() },
    user: { count: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";

describe("GET /api/setup/status", () => {
  it("returns setup state without exposing the configured Ollama URL", async () => {
    vi.resetModules();
    (prisma.settings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );
    (prisma.user.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const { GET } = await import("@/app/api/setup/status/route");
    const response = await GET();
    const data = await response.json();

    expect(data).toMatchObject({
      completed: false,
      hasAdmin: false,
    });
    expect(data).not.toHaveProperty("defaultOllamaUrl");
  });
});
