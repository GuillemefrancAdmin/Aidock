import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chat: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";

describe("GET /api/chats/[id]", () => {
  it("does not load or return the server relation", async () => {
    (prisma.chat.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "chat_1",
      serverId: "srv_1",
      model: "llama3",
      messages: [],
    });

    const { GET } = await import("@/app/api/chats/[id]/route");
    const response = await GET(new Request("http://localhost") as any, {
      params: Promise.resolve({ id: "chat_1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).not.toHaveProperty("server");
    expect(prisma.chat.findUnique).toHaveBeenCalledWith({
      where: { id: "chat_1" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  });
});
