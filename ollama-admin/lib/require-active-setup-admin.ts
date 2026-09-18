import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

/** Protect setup operations that are only valid after admin creation and before completion. */
export async function guardActiveSetupAdmin(): Promise<NextResponse | null> {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const setting = await prisma.settings.findUnique({
    where: { key: "setup_completed" },
  });
  if (setting?.value === "true") {
    return NextResponse.json(
      { error: "Setup already completed" },
      { status: 403 }
    );
  }

  return null;
}
