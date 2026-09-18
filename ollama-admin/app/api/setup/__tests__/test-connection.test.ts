import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/require-active-setup-admin", () => ({
  guardActiveSetupAdmin: vi.fn(),
}));

import { guardActiveSetupAdmin } from "@/lib/require-active-setup-admin";

beforeEach(() => {
  vi.clearAllMocks();
  (guardActiveSetupAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/setup/test-connection", () => {
  it("returns 200 when Ollama responds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: "0.11.0" }),
    }));

    const { POST } = await import("@/app/api/setup/test-connection/route");
    const response = await POST(
      new Request("http://localhost/api/setup/test-connection", {
        method: "POST",
        body: JSON.stringify({
          url: "http://host.docker.internal:11434",
        }),
      }) as any
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "online" });
  });

  it("tests localhost through the configured Docker host", async () => {
    vi.stubEnv(
      "DEFAULT_OLLAMA_URL",
      "http://host.docker.internal:11434"
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: "0.11.0" }),
    }));

    const { POST } = await import("@/app/api/setup/test-connection/route");
    const response = await POST(
      new Request("http://localhost/api/setup/test-connection", {
        method: "POST",
        body: JSON.stringify({ url: "http://localhost:11439" }),
      }) as any
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "http://host.docker.internal:11439/api/version",
      expect.anything()
    );
  });

  it("returns 502 and preserves the connection guidance", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(
      Object.assign(new TypeError("fetch failed"), {
        cause: { code: "ENOTFOUND" },
      })
    ));

    const { POST } = await import("@/app/api/setup/test-connection/route");
    const response = await POST(
      new Request("http://localhost/api/setup/test-connection", {
        method: "POST",
        body: JSON.stringify({
          url: "http://host.docker.internal:11434",
        }),
      }) as any
    );
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.status).toBe("offline");
    expect(data.error).toContain("host.docker.internal:host-gateway");
  });

  it("does not provide a network probe when the setup guard rejects it", async () => {
    (guardActiveSetupAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", vi.fn());

    const { POST } = await import("@/app/api/setup/test-connection/route");
    const response = await POST(
      new Request("http://localhost/api/setup/test-connection", {
        method: "POST",
        body: JSON.stringify({ url: "http://127.0.0.1:11434" }),
      }) as any
    );

    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { body: "not json", error: "Invalid JSON body" },
    { body: JSON.stringify({ url: "   " }), error: "URL is required" },
    {
      body: JSON.stringify({ url: { hostname: "localhost" } }),
      error: "URL is required",
    },
    {
      body: JSON.stringify({ url: "ftp://localhost:11434" }),
      error: "Ollama URL must use http or https",
    },
    {
      body: JSON.stringify({ url: "http://localhost:11434/#ignored" }),
      error: "Ollama URL must not include a query string or fragment",
    },
  ])("returns 400 for invalid input: $error", async ({ body, error }) => {
    const { POST } = await import("@/app/api/setup/test-connection/route");
    const response = await POST(
      new Request("http://localhost/api/setup/test-connection", {
        method: "POST",
        body,
      }) as any
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error });
  });
});
