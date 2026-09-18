import { NextRequest, NextResponse } from "next/server";
import {
  formatOllamaConnectionError,
  getVersion,
  normalizeOllamaUrl,
  redactOllamaUrl,
  resolveOllamaUrl,
} from "@/lib/ollama";
import { guardActiveSetupAdmin } from "@/lib/require-active-setup-admin";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const guardResponse = await guardActiveSetupAdmin();
  if (guardResponse) return guardResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let url: string;
  try {
    url = normalizeOllamaUrl(
      body && typeof body === "object" && "url" in body
        ? (body as { url?: unknown }).url
        : undefined
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid URL" },
      { status: 400 }
    );
  }

  const requestedUrl = redactOllamaUrl(url);
  const effectiveUrl = redactOllamaUrl(resolveOllamaUrl(url));

  try {
    const version = await getVersion(url);
    logger.info("Ollama setup connection test completed", {
      status: "online",
      requestedUrl,
      effectiveUrl,
    });
    return NextResponse.json({ status: "online", version: version.version });
  } catch (err) {
    const error = formatOllamaConnectionError(url, err);
    logger.warn("Ollama setup connection test completed", {
      status: "offline",
      requestedUrl,
      effectiveUrl,
      error,
    });
    return NextResponse.json(
      { status: "offline", error },
      { status: 502 }
    );
  }
}
