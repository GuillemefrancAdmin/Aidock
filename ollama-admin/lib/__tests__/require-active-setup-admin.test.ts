import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { settings: { findUnique: vi.fn() } },
}));

import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { guardActiveSetupAdmin } from "@/lib/require-active-setup-admin";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("guardActiveSetupAdmin", () => {
  it("rejects unauthenticated and non-admin requests before reading setup state", async () => {
    (requireAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const response = await guardActiveSetupAdmin();

    expect(response?.status).toBe(403);
    expect(prisma.settings.findUnique).not.toHaveBeenCalled();
  });

  it("rejects requests after setup completion", async () => {
    (requireAdmin as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "admin_1", role: "admin" },
    });
    (prisma.settings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      value: "true",
    });

    const response = await guardActiveSetupAdmin();

    expect(response?.status).toBe(403);
  });

  it("allows an admin while setup is active", async () => {
    (requireAdmin as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "admin_1", role: "admin" },
    });
    (prisma.settings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    await expect(guardActiveSetupAdmin()).resolves.toBeNull();
  });
});
