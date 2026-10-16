#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

backup_directory="${BACKUP_DIRECTORY:-./backups/postgres}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="${backup_directory}/image-set-${timestamp}.dump"

case "$retention_days" in
  ''|*[!0-9]*) echo 'BACKUP_RETENTION_DAYS must be a positive integer' >&2; exit 1 ;;
esac

command -v pg_dump >/dev/null 2>&1 || {
  echo 'pg_dump is required (PostgreSQL 17 client recommended)' >&2
  exit 1
}
command -v pg_restore >/dev/null 2>&1 || {
  echo 'pg_restore is required (PostgreSQL 17 client recommended)' >&2
  exit 1
}

mkdir -p "$backup_directory"
umask 077
pg_dump --dbname="$DATABASE_URL" --format=custom --compress=9 --file="$archive"
pg_restore --list "$archive" >/dev/null
sha256sum "$archive" >"${archive}.sha256"

find "$backup_directory" -type f \( -name 'image-set-*.dump' -o -name 'image-set-*.dump.sha256' \) \
  -mtime "+$retention_days" -delete

echo "Verified PostgreSQL backup created: $archive"
