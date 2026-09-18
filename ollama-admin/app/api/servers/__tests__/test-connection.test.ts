import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    server: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

const server = {
  id: "srv_1",
  url: "http://host.docker.internal:11434",
};

beforeEach(() => {
  vi.clearAllMocks();
  (requireAdmin as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "admin_1", role: "admin" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/servers/[id]/test", () => {
  it("forbids non-admin users before looking up the target", async () => {
    (requireAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { POST } = await import("@/app/api/servers/[id]/test/route");
    const response = await POST(new Request("http://localhost") as any, {
      params: Promise.resolve({ id: server.id }),
    });

    expect(response.status).toBe(403);
    expect(prisma.server.findUnique).not.toHaveBeenCalled();
  });

  it("returns 200 only when Ollama responds", async () => {
    (prisma.server.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      server
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: "0.11.0" }),
    }));

    const { POST } = await import("@/app/api/servers/[id]/test/route");
    const response = await POST(new Request("http://localhost") as any, {
      params: Promise.resolve({ id: server.id }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "online",
      version: "0.11.0",
    });
  });

  it("tests a saved localhost server through the configured Docker host", async () => {
    vi.stubEnv(
      "DEFAULT_OLLAMA_URL",
      "http://host.docker.internal:11434"
    );
    (prisma.server.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...server,
      url: "http://localhost:11439",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: "0.11.0" }),
    }));

    const { POST } = await import("@/app/api/servers/[id]/test/route");
    const response = await POST(new Request("http://localhost") as any, {
      params: Promise.resolve({ id: server.id }),
    });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "http://host.docker.internal:11439/api/version",
      expect.anything()
    );
  });

  it("returns 502 with an actionable error when Ollama is unreachable", async () => {
    (prisma.server.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      server
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(
      Object.assign(new TypeError("fetch failed"), {
        cause: { code: "ECONNREFUSED" },
      })
    ));

    const { POST } = await import("@/app/api/servers/[id]/test/route");
    const response = await POST(new Request("http://localhost") as any, {
      params: Promise.resolve({ id: server.id }),
    });
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.status).toBe("offline");
    expect(data.error).toContain("OLLAMA_HOST=0.0.0.0:11434");
  });

  it("returns 404 for an unknown server", async () => {
    (prisma.server.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    const { POST } = await import("@/app/api/servers/[id]/test/route");
    const response = await POST(new Request("http://localhost") as any, {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
  });
});
