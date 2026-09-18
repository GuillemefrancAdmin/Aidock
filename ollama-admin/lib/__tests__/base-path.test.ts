import { describe, it, expect, beforeEach, vi } from "vitest";

describe("base-path", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns the path unchanged when NEXT_PUBLIC_BASE_PATH is empty", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
    const { withBasePath, basePath } = await import("@/lib/base-path");
    expect(basePath).toBe("");
    expect(withBasePath("/api/foo")).toBe("/api/foo");
    expect(withBasePath("/")).toBe("/");
    vi.unstubAllEnvs();
  });

  it("prepends the base path to absolute paths", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/ollama-admin");
    const { withBasePath, basePath } = await import("@/lib/base-path");
    expect(basePath).toBe("/ollama-admin");
    expect(withBasePath("/api/dashboard")).toBe("/ollama-admin/api/dashboard");
    expect(withBasePath("/setup")).toBe("/ollama-admin/setup");
    expect(withBasePath("/")).toBe("/ollama-admin/");
    vi.unstubAllEnvs();
  });

  it("does not double-prefix paths that already include the base path", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/ollama-admin");
    const { withBasePath } = await import("@/lib/base-path");
    expect(withBasePath("/ollama-admin/api/foo")).toBe("/ollama-admin/api/foo");
    expect(withBasePath("/ollama-admin")).toBe("/ollama-admin");
    vi.unstubAllEnvs();
  });

  it("leaves relative paths and absolute URLs unchanged", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/ollama-admin");
    const { withBasePath } = await import("@/lib/base-path");
    expect(withBasePath("api/foo")).toBe("api/foo");
    expect(withBasePath("https://example.com/api/foo")).toBe("https://example.com/api/foo");
    expect(withBasePath("http://localhost:3000/api/foo")).toBe("http://localhost:3000/api/foo");
    vi.unstubAllEnvs();
  });

  it("normalizes a value without a leading slash", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "ollama-admin");
    const { withBasePath, basePath } = await import("@/lib/base-path");
    expect(basePath).toBe("/ollama-admin");
    expect(withBasePath("/api/foo")).toBe("/ollama-admin/api/foo");
    vi.unstubAllEnvs();
  });

  it("strips a trailing slash from the configured value", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/ollama-admin/");
    const { withBasePath, basePath } = await import("@/lib/base-path");
    expect(basePath).toBe("/ollama-admin");
    expect(withBasePath("/api/foo")).toBe("/ollama-admin/api/foo");
    vi.unstubAllEnvs();
  });
});
