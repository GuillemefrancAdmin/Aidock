import { NextResponse } from "next/server";
import { DEFAULT_OLLAMA_URL } from "@/lib/constants";
import { guardActiveSetupAdmin } from "@/lib/require-active-setup-admin";

export async function GET() {
  const guardResponse = await guardActiveSetupAdmin();
  if (guardResponse) return guardResponse;

  return NextResponse.json({ defaultOllamaUrl: DEFAULT_OLLAMA_URL });
}
