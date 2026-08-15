#!/usr/bin/env bash
# 로컬 Docker 자격 초기화 helper.
# 호출 후 LOCAL_ENV_FILE 에 gitignored infrastructure/.env 경로를 남긴다.
# 자격 값은 화면에 출력하지 않는다.

new_local_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    od -An -N24 -tx1 /dev/urandom | tr -d ' \n'
  fi
}

container_env_value() {
  local container="$1"
  local key="$2"
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" 2>/dev/null \
    | awk -v prefix="${key}=" 'index($0, prefix) == 1 { sub(prefix, ""); print; exit }' || true
}

env_value() {
  local file="$1"
  local key="$2"
  awk -F= -v key="$key" '$1 == key { value=$0; sub(/^[^=]*=/, "", value) } END { print value }' "$file"
}

is_placeholder() {
  [[ -z "$1" || "$1" == "CHANGE_ME_LOCAL_ONLY" || "$1" == "SET_BY_LOCAL_ENV_BOOTSTRAP" ]]
}

replace_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local temp_file
  temp_file="$(mktemp)"
  awk -F= -v key="$key" -v value="$value" '
    BEGIN { OFS="="; found=0 }
    $1 == key { print key, value; found=1; next }
    { print }
    END { if (!found) print key, value }
  ' "$file" > "$temp_file"
  mv "$temp_file" "$file"
}

ensure_local_env() {
  local root_dir="$1"
  local infra_dir="$root_dir/infrastructure"
  local env_file="$infra_dir/.env"
  local example_file="$infra_dir/.env.example"
  local required_keys=(
    POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DB_USER DB_PASSWORD
    RABBITMQ_DEFAULT_USER RABBITMQ_DEFAULT_PASS RABBIT_USER RABBIT_PASSWORD
    MINIO_ROOT_USER MINIO_ROOT_PASSWORD GF_SECURITY_ADMIN_USER GF_SECURITY_ADMIN_PASSWORD
    SAMHAN_INTERNAL_TOKEN INTERNAL_AUTH_TOKEN SAMHAN_JWT_SECRET JWT_SECRET SAMHAN_AROLOGIS_JWT_SECRET SAMHAN_GATEWAY_ATTESTATION
    SAMHAN_S3_ACCESS_KEY SAMHAN_S3_SECRET_KEY SAMHAN_SLIP_MINIO_SECRET_KEY
  )
  local secret_keys=(
    POSTGRES_PASSWORD DB_PASSWORD RABBITMQ_DEFAULT_PASS RABBIT_PASSWORD MINIO_ROOT_PASSWORD
    GF_SECURITY_ADMIN_PASSWORD SAMHAN_INTERNAL_TOKEN INTERNAL_AUTH_TOKEN SAMHAN_JWT_SECRET
    JWT_SECRET SAMHAN_AROLOGIS_JWT_SECRET SAMHAN_GATEWAY_ATTESTATION SAMHAN_S3_SECRET_KEY SAMHAN_SLIP_MINIO_SECRET_KEY
  )

  [[ -f "$example_file" ]] || { echo "로컬 환경 템플릿을 찾을 수 없습니다: $example_file" >&2; return 1; }
  if [[ ! -f "$env_file" ]]; then
    cp "$example_file" "$env_file"
    echo "infrastructure/.env 를 만들고 로컬 랜덤 자격을 채웁니다 (값은 출력하지 않음)."
  fi

  local missing=()
  local key value
  for key in "${required_keys[@]}"; do
    value="$(env_value "$env_file" "$key")"
    if is_placeholder "$value"; then missing+=("$key"); fi
  done

  local bootstrap=0
  if (( ${#missing[@]} == ${#secret_keys[@]} )); then bootstrap=1; fi
  if (( ${#missing[@]} > 0 && bootstrap == 0 )); then
    echo "infrastructure/.env 에 필수 키가 일부만 설정되었습니다. 누락/placeholder 키: ${missing[*]}" >&2
    return 1
  fi

  if (( ${#missing[@]} > 0 )); then
    local postgres_password rabbit_password minio_password grafana_password
    postgres_password="$(container_env_value samhan-postgres POSTGRES_PASSWORD)"
    rabbit_password="$(container_env_value samhan-rabbitmq RABBITMQ_DEFAULT_PASS)"
    minio_password="$(container_env_value samhan-minio MINIO_ROOT_PASSWORD)"
    grafana_password="$(container_env_value samhan-grafana GF_SECURITY_ADMIN_PASSWORD)"
    is_placeholder "$postgres_password" && postgres_password="$(new_local_secret)"
    is_placeholder "$rabbit_password" && rabbit_password="$(new_local_secret)"
    is_placeholder "$minio_password" && minio_password="$(new_local_secret)"
    is_placeholder "$grafana_password" && grafana_password="$(new_local_secret)"

    local internal_token jwt_secret gateway_attestation local_user local_s3_access_key
    internal_token="$(new_local_secret)"
    jwt_secret="$(new_local_secret)"
    gateway_attestation="$(new_local_secret)"
    local_user="$(env_value "$env_file" POSTGRES_USER)"
    local_s3_access_key="$(env_value "$env_file" SAMHAN_S3_ACCESS_KEY)"
    replace_env_value "$env_file" POSTGRES_USER "$local_user"
    replace_env_value "$env_file" POSTGRES_PASSWORD "$postgres_password"
    replace_env_value "$env_file" POSTGRES_DB postgres
    replace_env_value "$env_file" DB_USER "$local_user"
    replace_env_value "$env_file" DB_PASSWORD "$postgres_password"
    replace_env_value "$env_file" RABBITMQ_DEFAULT_USER "$local_user"
    replace_env_value "$env_file" RABBITMQ_DEFAULT_PASS "$rabbit_password"
    replace_env_value "$env_file" RABBIT_USER "$local_user"
    replace_env_value "$env_file" RABBIT_PASSWORD "$rabbit_password"
    replace_env_value "$env_file" MINIO_ROOT_USER "$local_user"
    replace_env_value "$env_file" MINIO_ROOT_PASSWORD "$minio_password"
    replace_env_value "$env_file" GF_SECURITY_ADMIN_USER admin
    replace_env_value "$env_file" GF_SECURITY_ADMIN_PASSWORD "$grafana_password"
    replace_env_value "$env_file" SAMHAN_INTERNAL_TOKEN "$internal_token"
    replace_env_value "$env_file" INTERNAL_AUTH_TOKEN "$internal_token"
    replace_env_value "$env_file" SAMHAN_JWT_SECRET "$jwt_secret"
    replace_env_value "$env_file" JWT_SECRET "$jwt_secret"
    replace_env_value "$env_file" SAMHAN_AROLOGIS_JWT_SECRET "$jwt_secret"
    replace_env_value "$env_file" SAMHAN_GATEWAY_ATTESTATION "$gateway_attestation"
    replace_env_value "$env_file" SAMHAN_S3_ACCESS_KEY "$local_s3_access_key"
    replace_env_value "$env_file" SAMHAN_S3_SECRET_KEY "$minio_password"
    replace_env_value "$env_file" SAMHAN_SLIP_MINIO_SECRET_KEY "$minio_password"
  fi

  LOCAL_ENV_FILE="$env_file"
}
