export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import { normalizeOllamaUrl, redactOllamaUrl } from "@/lib/ollama";

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get("all") === "true";
  if (all) {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const servers = await prisma.server.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(servers);
  }

  const servers = await prisma.server.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(servers);
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, url, gpuAgentUrl, gpuIndex, active } = body;

  if (!name || !url) {
    return NextResponse.json(
      { error: "Name and URL are required" },
      { status: 400 }
    );
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeOllamaUrl(url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid URL" },
      { status: 400 }
    );
  }

  const server = await prisma.server.create({
    data: {
      name,
      url: normalizedUrl,
      gpuAgentUrl: gpuAgentUrl || null,
      gpuIndex: gpuIndex === "" || gpuIndex == null ? null : Number(gpuIndex),
      active: active ?? true,
    },
  });

  logger.info("Server added", { name, url: redactOllamaUrl(normalizedUrl) });
  return NextResponse.json(server, { status: 201 });
}
