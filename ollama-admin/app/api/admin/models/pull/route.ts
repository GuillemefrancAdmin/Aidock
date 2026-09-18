import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pullManager } from "@/lib/pull-manager";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import {
  buildOllamaUrl,
  formatOllamaConnectionError,
} from "@/lib/ollama";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { serverId, name, stream } = await req.json();

  if (!serverId || !name) {
    return NextResponse.json(
      { error: "serverId and name are required" },
      { status: 400 }
    );
  }

  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }
  if (!server.active) {
    return NextResponse.json({ error: "Server is inactive" }, { status: 403 });
  }

  logger.info("Pull requested", { model: name, server: server.name });

  // Stream mode: passthrough to Ollama (used by Models admin page)
  if (stream) {
    let ollamaRes: Response;
    try {
      ollamaRes = await fetch(buildOllamaUrl(server.url, "/api/pull"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, stream: true }),
      });
    } catch (error) {
      const message = formatOllamaConnectionError(server.url, error);
      logger.error("Pull connection failed", { model: name, error: message });
      return NextResponse.json({ error: message }, { status: 502 });
    }

    if (!ollamaRes.ok || !ollamaRes.body) {
      logger.error("Pull failed", { model: name, status: ollamaRes.status });
      return NextResponse.json(
        { error: `Pull failed: ${ollamaRes.statusText}` },
        { status: 502 }
      );
    }

    return new Response(ollamaRes.body, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  // Background mode: delegate to PullManager (used by Discover page)
  const job = pullManager.startPull(serverId, server.url, name);
  return NextResponse.json(
    { id: job.id, model: job.model, tag: job.tag, status: job.status },
    { status: 202 }
  );
}
