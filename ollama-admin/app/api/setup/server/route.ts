import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeOllamaUrl } from "@/lib/ollama";
import { guardActiveSetupAdmin } from "@/lib/require-active-setup-admin";

export async function GET() {
  const guardResponse = await guardActiveSetupAdmin();
  if (guardResponse) return guardResponse;

  const server = await prisma.server.findFirst({ orderBy: { createdAt: "asc" } });
  if (!server) {
    return NextResponse.json({ error: "No server found" }, { status: 404 });
  }
  return NextResponse.json(server);
}

export async function POST(req: NextRequest) {
  const guardResponse = await guardActiveSetupAdmin();
  if (guardResponse) return guardResponse;

  const { name, url } = await req.json();

  if (!name || !url) {
    return NextResponse.json({ error: "Name and URL are required" }, { status: 400 });
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
      active: true,
    },
  });

  return NextResponse.json(server, { status: 201 });
}
