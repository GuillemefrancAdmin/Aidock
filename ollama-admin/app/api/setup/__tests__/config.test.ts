import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/require-active-setup-admin", () => ({
  guardActiveSetupAdmin: vi.fn(),
}));

import { guardActiveSetupAdmin } from "@/lib/require-active-setup-admin";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEFAULT_OLLAMA_URL", "http://host.docker.internal:11434");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/setup/config", () => {
  it("returns the runtime URL to an authorized setup admin", async () => {
    (guardActiveSetupAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    vi.resetModules();

    const { GET } = await import("@/app/api/setup/config/route");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      defaultOllamaUrl: "http://host.docker.internal:11434",
    });
  });

  it("does not expose configuration when the guard rejects the request", async () => {
    (guardActiveSetupAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
    );
    vi.resetModules();

    const { GET } = await import("@/app/api/setup/config/route");
    const response = await GET();

    expect(response.status).toBe(403);
  });
});
