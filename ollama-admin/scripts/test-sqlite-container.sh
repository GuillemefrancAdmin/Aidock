#!/usr/bin/env bash
set -euo pipefail

image="${1:-ollama-admin:sqlite-test}"
volume="ollama-admin-sqlite-test-${GITHUB_RUN_ID:-local}-$$"

cleanup() {
  docker volume rm -f "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker volume create "$volume" >/dev/null

# The published image must remain non-root when its entrypoint is overridden.
test "$(docker image inspect --format '{{.Config.User}}' "$image")" = "nextjs"

# Reproduce a fresh volume initialized by an older image with a root-owned mount.
docker run --rm \
  --user 0:0 \
  --entrypoint /bin/sh \
  --volume "$volume:/data" \
  "$image" \
  -c 'chown 0:0 /data'

# Repair the fresh volume, migrate it, and seed data as the non-root app user.
docker run --rm \
  --user 0:0 \
  --env DATABASE_URL=file:/data/ollama-admin.db \
  --volume "$volume:/data" \
  "$image" \
  node -e '
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    prisma.settings.upsert({
      where: { key: "permission_test" },
      update: { value: "preserved" },
      create: { key: "permission_test", value: "preserved" },
    }).finally(() => prisma.$disconnect());
  '

# Simulate an existing database left root-owned and keep an unrelated backup.
docker run --rm \
  --user 0:0 \
  --entrypoint /bin/sh \
  --volume "$volume:/data" \
  "$image" \
  -c 'printf "do not modify\n" > /data/backup.txt && chmod 600 /data/backup.txt /data/ollama-admin.db && chown 0:0 /data /data/backup.txt /data/ollama-admin.db'

verify_database() {
  docker run --rm \
    --user 0:0 \
    --env DATABASE_URL=file:/data/ollama-admin.db \
    --volume "$volume:/data" \
    "$image" \
    node -e '
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();
      prisma.settings.findUnique({ where: { key: "permission_test" } })
        .then((row) => {
          if (row?.value !== "preserved") process.exitCode = 1;
        })
        .finally(() => prisma.$disconnect());
    '
}

# Two starts prove data preservation and idempotent permission repair.
verify_database
verify_database

# Only the SQLite path and its parent are repaired. Unrelated files stay intact.
docker run --rm \
  --user 0:0 \
  --entrypoint /bin/sh \
  --volume "$volume:/data" \
  "$image" \
  -c '
    test "$(stat -c "%u:%g" /data)" = "1001:1001"
    test "$(stat -c "%u:%g" /data/ollama-admin.db)" = "1001:1001"
    test "$(stat -c "%u:%g" /data/backup.txt)" = "0:0"
    test "$(cat /data/backup.txt)" = "do not modify"
  '

# A genuine migration failure must stop the container instead of being hidden.
if docker run --rm \
  --env DATABASE_URL=file:/proc/ollama-admin.db \
  "$image" \
  /bin/true >/dev/null 2>&1
then
  echo "Expected an unwritable SQLite database to fail" >&2
  exit 1
fi

# The privileged repair must reject paths that escape the dedicated volume.
if docker run --rm \
  --user 0:0 \
  --env DATABASE_URL=file:/data/../tmp/escape.db \
  "$image" \
  /bin/true >/dev/null 2>&1
then
  echo "Expected SQLite path traversal to fail" >&2
  exit 1
fi

# A sidecar symlink must be rejected without changing its target ownership.
docker run --rm \
  --user 0:0 \
  --entrypoint /bin/sh \
  --volume "$volume:/data" \
  "$image" \
  -c 'touch /data/sensitive.txt && chown 0:0 /data/sensitive.txt && ln -s sensitive.txt /data/ollama-admin.db-wal'

if docker run --rm \
  --user 0:0 \
  --env DATABASE_URL=file:/data/ollama-admin.db \
  --volume "$volume:/data" \
  "$image" \
  /bin/true >/dev/null 2>&1
then
  echo "Expected a symbolic SQLite sidecar to fail" >&2
  exit 1
fi

docker run --rm \
  --user 0:0 \
  --entrypoint /bin/sh \
  --volume "$volume:/data" \
  "$image" \
  -c 'test "$(stat -c "%u:%g" /data/sensitive.txt)" = "0:0"'
