import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardActiveSetupAdmin } from "@/lib/require-active-setup-admin";

export async function POST(req: NextRequest) {
  const guardResponse = await guardActiveSetupAdmin();
  if (guardResponse) return guardResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawRetention =
    body && typeof body === "object" && "logRetentionDays" in body
      ? (body as { logRetentionDays?: unknown }).logRetentionDays
      : undefined;
  const logRetentionDays = Number(rawRetention);
  if (
    !Number.isInteger(logRetentionDays) ||
    logRetentionDays < 1 ||
    logRetentionDays > 365
  ) {
    return NextResponse.json(
      { error: "Log retention must be between 1 and 365 days" },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.settings.upsert({
      where: { key: "logRetentionDays" },
      update: { value: String(logRetentionDays) },
      create: { key: "logRetentionDays", value: String(logRetentionDays) },
    }),
    prisma.settings.upsert({
      where: { key: "setup_completed" },
      update: { value: "true" },
      create: { key: "setup_completed", value: "true" },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
