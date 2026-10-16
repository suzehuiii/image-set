#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${1:?Usage: restore-postgres.sh /path/to/image-set-TIMESTAMP.dump}"

archive="$1"
if [ "${ALLOW_DATABASE_RESTORE:-}" != 'I_UNDERSTAND_THIS_OVERWRITES_DATA' ]; then
  echo 'Refusing restore. Set ALLOW_DATABASE_RESTORE=I_UNDERSTAND_THIS_OVERWRITES_DATA after verifying the target database.' >&2
  exit 1
fi
if [ ! -f "$archive" ]; then
  echo "Backup archive not found: $archive" >&2
  exit 1
fi

command -v pg_restore >/dev/null 2>&1 || {
  echo 'pg_restore is required (PostgreSQL 17 client recommended)' >&2
  exit 1
}

if [ -f "${archive}.sha256" ]; then
  sha256sum --check "${archive}.sha256"
fi
pg_restore --list "$archive" >/dev/null
pg_restore \
  --dbname="$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$archive"

echo 'PostgreSQL restore completed. Run the application health and smoke checks now.'
