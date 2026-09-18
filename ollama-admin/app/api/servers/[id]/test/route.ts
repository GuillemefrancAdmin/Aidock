import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  formatOllamaConnectionError,
  getVersion,
  redactOllamaUrl,
  resolveOllamaUrl,
} from "@/lib/ollama";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const server = await prisma.server.findUnique({
    where: { id: id },
  });

  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const requestedUrl = redactOllamaUrl(server.url);
  let effectiveUrl = requestedUrl;
  try {
    effectiveUrl = redactOllamaUrl(resolveOllamaUrl(server.url));
  } catch {
    // Keep legacy invalid database values diagnosable through the normal 502 path.
  }

  try {
    const version = await getVersion(server.url);
    logger.info("Ollama connection test completed", {
      serverId: server.id,
      status: "online",
      requestedUrl,
      effectiveUrl,
    });
    return NextResponse.json({
      status: "online",
      version: version.version,
    });
  } catch (err) {
    const error = formatOllamaConnectionError(server.url, err);
    logger.warn("Ollama connection test completed", {
      serverId: server.id,
      status: "offline",
      requestedUrl,
      effectiveUrl,
      error,
    });
    return NextResponse.json(
      {
        status: "offline",
        error,
      },
      { status: 502 }
    );
  }
}
