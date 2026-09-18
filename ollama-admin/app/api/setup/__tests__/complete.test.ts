import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/require-active-setup-admin", () => ({
  guardActiveSetupAdmin: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    settings: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { guardActiveSetupAdmin } from "@/lib/require-active-setup-admin";

beforeEach(() => {
  vi.clearAllMocks();
  (guardActiveSetupAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (prisma.settings.upsert as ReturnType<typeof vi.fn>).mockImplementation(
    (operation) => operation
  );
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

function request(body: string) {
  return new Request("http://localhost/api/setup/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("POST /api/setup/complete", () => {
  it("saves retention and completion in one transaction", async () => {
    const { POST } = await import("@/app/api/setup/complete/route");
    const response = await POST(
      request(JSON.stringify({ logRetentionDays: "90" })) as any
    );

    expect(response.status).toBe(200);
    expect(prisma.settings.upsert).toHaveBeenNthCalledWith(1, {
      where: { key: "logRetentionDays" },
      update: { value: "90" },
      create: { key: "logRetentionDays", value: "90" },
    });
    expect(prisma.settings.upsert).toHaveBeenNthCalledWith(2, {
      where: { key: "setup_completed" },
      update: { value: "true" },
      create: { key: "setup_completed", value: "true" },
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it.each(["0", "366", "not-a-number"]) (
    "rejects invalid retention %s without completing setup",
    async (logRetentionDays) => {
      const { POST } = await import("@/app/api/setup/complete/route");
      const response = await POST(
        request(JSON.stringify({ logRetentionDays })) as any
      );

      expect(response.status).toBe(400);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
  );

  it("does not parse or persist anything when the setup guard rejects", async () => {
    (guardActiveSetupAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
    );

    const { POST } = await import("@/app/api/setup/complete/route");
    const response = await POST(request("not json") as any);

    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
