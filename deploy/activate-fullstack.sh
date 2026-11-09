#!/usr/bin/env bash
set -euo pipefail

release=${1:?Direktori rilis wajib diberikan}
domain=${2:-sababuka.31-97-105-154.sslip.io}
env_dir=/etc/sababuka
env_file=$env_dir/sababuka.env
credential_file=/root/sababuka-demo-credentials
evidence_dir=/var/lib/sababuka/evidence
service_file=/etc/systemd/system/sababuka-api.service
nginx_file=/etc/nginx/sites-available/sababuka

test -f "$release/backend/dist/src/server.js"
test -f "$release/frontend/dist/index.html"

install -d -m 700 "$env_dir"
install -d -m 750 -o sababuka -g sababuka "$evidence_dir"

if [[ ! -f "$env_file" ]]; then
  db_password=$(openssl rand -hex 24)
  connector_key=$(openssl rand -base64 32 | tr -d '\n')

  sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres \
    -c "ALTER ROLE sababuka_app LOGIN PASSWORD '$db_password'" \
    -c "ALTER DATABASE sababuka OWNER TO sababuka_app"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d sababuka \
    -c 'CREATE EXTENSION IF NOT EXISTS postgis' \
    -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto' \
    -c 'CREATE EXTENSION IF NOT EXISTS citext'

  install -m 600 /dev/null "$env_file"
  printf '%s\n' \
    'NODE_ENV=production' \
    'HOST=127.0.0.1' \
    'PORT=3001' \
    'LOG_LEVEL=info' \
    "DATABASE_URL=postgresql://sababuka_app:${db_password}@127.0.0.1:5432/sababuka" \
    'COOKIE_SECURE=true' \
    'SESSION_TTL_SECONDS=43200' \
    'LOGIN_MAX_FAILURES=5' \
    'LOGIN_LOCK_SECONDS=900' \
    'INVITATION_TTL_SECONDS=259200' \
    "CONNECTOR_ENCRYPTION_KEY=${connector_key}" \
    "EVIDENCE_STORAGE_PATH=${evidence_dir}" \
    'EVIDENCE_MAX_BYTES=10485760' \
    'BPS_DOMAIN_CODE=6203' > "$env_file"

fi

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

cd "$release/backend"
pnpm db:migrate

# Data contoh tidak pernah dimasukkan otomatis ke produksi. Seed hanya tersedia
# untuk lingkungan demonstrasi yang secara eksplisit mengaktifkannya.
if [[ "${ENABLE_DEMO_SEED:-false}" == "true" ]]; then
  demo_password=${DEMO_PASSWORD:-$(openssl rand -base64 24 | tr -d '\n' | tr '/+' 'AZ')}
  install -m 600 /dev/null "$credential_file"
  printf '%s\n' \
    'Akun demo SABABUKA' \
    'developer@sababuka.com' \
    'bapperida@sababuka.com' \
    'kominfo@sababuka.com' \
    'opd.dkpp@sababuka.com' \
    'opd.dinkes@sababuka.com' \
    'pimpinan@sababuka.com' \
    "PASSWORD=${demo_password}" > "$credential_file"

  user_count=$(sudo -u postgres psql -d sababuka -Atc \
    "SELECT count(*) FROM sababuka.users")
  if [[ "$user_count" == "0" ]]; then
    NODE_ENV=development DEMO_PASSWORD="$demo_password" pnpm dev:seed-users
    NODE_ENV=development pnpm dev:seed-official
  fi
  NODE_ENV=development DEMO_PASSWORD="$demo_password" pnpm dev:seed-pilot
fi

install -m 644 "$release/deploy/sababuka-api.service" "$service_file"
ln -sfn "$release" /srv/sababuka/current
if [[ -f /etc/letsencrypt/live/sababuka.31-97-105-154.sslip.io/fullchain.pem ]]; then
  install -m 644 "$release/deploy/nginx-sababuka-https.conf" "$nginx_file"
else
  install -m 644 "$release/deploy/nginx-sababuka.conf" "$nginx_file"
fi
ln -sfn "$nginx_file" /etc/nginx/sites-enabled/sababuka

systemctl daemon-reload
systemctl enable sababuka-api
systemctl restart sababuka-api
nginx -t
systemctl reload nginx

backend_ready=false
for _ in {1..15}; do
  if curl -fsS http://127.0.0.1:3001/api/v1/health >/dev/null 2>&1; then
    backend_ready=true
    break
  fi
  sleep 1
done
test "$backend_ready" = true
if [[ -f /etc/letsencrypt/live/sababuka.31-97-105-154.sslip.io/fullchain.pem ]]; then
  curl -fsS "https://$domain/api/v1/health" >/dev/null
else
  curl -fsS -H "Host: $domain" http://127.0.0.1/api/v1/health >/dev/null
fi

echo "Rilis aktif: $release"
echo "Domain HTTP siap: http://$domain"
