#!/bin/bash
################################################################################
# user_data.sh — SamhanLogis Phase 11 EC2 초기화 스크립트
#
# 실행 순서 (인스턴스 최초 기동 시 1회):
#   1. 시스템 업데이트 + 타임존 KST 설정
#   2. Docker + Docker Compose v2 설치
#   3. CloudWatch Agent 설치 + 설정
#   4. .env.production 생성 (Terraform 주입 RDS 엔드포인트)
#   5. RDS 15 DB 초기화 (init-rds.sql 실행)
#   6. docker-compose.prod.yml S3 다운로드
#   7. ECR 로그인 + 17 service docker-compose up
#
# 주의: user_data 는 인스턴스 최초 기동 시만 실행됨.
#   이후 설정 변경 = SSM Session Manager 또는 별도 배포 스크립트 사용.
################################################################################

set -euo pipefail
exec > >(tee /var/log/user_data.log) 2>&1

echo "=== SamhanLogis Phase 11 EC2 초기화 시작 $(date) ==="

# ─── 1. 시스템 업데이트 ──────────────────────────────────────────────────────
echo "[1/7] 시스템 업데이트 + KST 타임존 설정"
timedatectl set-timezone Asia/Seoul || true
# monitoring.tf CloudWatch Agent host dimension 일치 (mem/disk 알람 연동)
hostnamectl set-hostname "${project_name}-${environment}-app-server"
dnf update -y

# PostgreSQL 클라이언트 (RDS 초기화용 psql)
dnf install -y postgresql15 jq

# ─── 2. Docker 설치 ───────────────────────────────────────────────────────────
echo "[2/7] Docker + Docker Compose v2 설치"
dnf install -y docker
systemctl enable docker
systemctl start docker

# Docker Compose v2
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# ec2-user Docker 그룹 추가
usermod -aG docker ec2-user

# ─── 3. CloudWatch Agent 설치 ────────────────────────────────────────────────
echo "[3/7] CloudWatch Agent 설치"
dnf install -y amazon-cloudwatch-agent

# CloudWatch Agent 수집 설계 (#809 R6-H5 — AWS 공식 문서
# "CloudWatch Agent Configuration File: Logs Section" 근거):
#   - collect_list 의 file_path 와일드카드는 "Only the latest file is pushed to
#     CloudWatch Logs based on file modification time" — 17개 컨테이너 json 로그가
#     entry 1개에 매치되면 가장 최근 수정 파일만 push 되어 특정 컨테이너 라인이
#     유실될 수 있다. 아래 Docker 와일드카드 entry 는 best-effort 수집 전용이다.
#   - alarm 원천(로그 metric filter 대상)인 서비스 로그는 이 entry 가 아니라
#     docker-compose.prod.yml 의 awslogs logging driver 가 같은 log group 의
#     서비스 전용 stream 으로 직접 전달한다. 현재 2개 서비스가 해당한다:
#       · slip-service(가격기억 metric filter 2건) → stream "slip-service"
#         (CUTOVER.md M-19 참조)
#       · partner-order-service(outbox FAILED_PERMANENT metric filter 1건)
#         → stream "partner-order-service" (#854 R5-HIGH — CUTOVER.md M-20 참조)
#     awslogs driver 전환 후 두 서비스는 json 파일을 만들지 않아 이중 수집 없음.
#     신규 alarm 원천 서비스 추가 시 이 목록과 docker-compose.prod.yml 의 logging:
#     블록을 함께 갱신할 것 — 누락하면 이 wildcard tail 의 best-effort 한계에 조용히
#     노출된다(#854 R5-HIGH 가 바로 이 누락 사례).
#   - log_stream_name 지원 변수는 {instance_id}/{hostname}/{local_hostname}/{ip_address}
#     뿐이다. {container_id} 는 지원 변수가 아니라 리터럴로 렌더되므로 사용 금지.
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'CW_CONFIG'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/lib/docker/containers/**/*-json.log",
            "log_group_name": "/samhanlogis/production/docker",
            "log_stream_name": "{hostname}/docker-others",
            "timezone": "Asia/Seoul"
          },
          {
            "file_path": "/var/log/user_data.log",
            "log_group_name": "/samhanlogis/production/user-data",
            "log_stream_name": "{hostname}"
          }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "SamhanLogis/EC2",
    "metrics_collected": {
      "cpu": {
        "measurement": ["cpu_usage_idle", "cpu_usage_user", "cpu_usage_system"],
        "metrics_collection_interval": 60
      },
      "mem": {
        "measurement": ["mem_used_percent", "mem_available_percent"],
        "metrics_collection_interval": 60
      },
      "disk": {
        "measurement": ["disk_used_percent"],
        "metrics_collection_interval": 60,
        "resources": ["/"]
      }
    }
  }
}
CW_CONFIG

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config -m ec2 -s \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

systemctl enable amazon-cloudwatch-agent
systemctl start amazon-cloudwatch-agent

# ─── 4. .env.production 생성 ─────────────────────────────────────────────────
echo "[4/7] .env.production 생성"
mkdir -p /opt/samhanlogis
cd /opt/samhanlogis

AWS_REGION="${aws_region}"
RDS_ENDPOINT="${rds_endpoint}"
RDS_USERNAME="${rds_username}"
RDS_PASSWORD_SECRET_ID="${rds_password_secret_id}"
PROJECT_NAME="${project_name}"

# Secrets Manager 에서 비밀값 조회 (실패 시 fail-fast — fallback 없음)
get_secret_string() {
    local secret_id="$1"
    local label="$2"

    aws secretsmanager get-secret-value \
        --secret-id "$secret_id" \
        --query SecretString --output text \
        --region "$AWS_REGION" || {
        echo "[FATAL] Secrets Manager $label 조회 실패 — 스크립트를 중단합니다." >&2
        exit 1
    }
}

DB_PASSWORD=$(get_secret_string "$RDS_PASSWORD_SECRET_ID" "$RDS_PASSWORD_SECRET_ID")
if [ -z "$DB_PASSWORD" ]; then
    echo "[FATAL] $RDS_PASSWORD_SECRET_ID 값이 비어 있습니다." >&2
    exit 1
fi

JWT_SECRET=$(get_secret_string "samhan/production/jwt-secret" "samhan/production/jwt-secret")
INTERNAL_TOKEN=$(get_secret_string "samhan/production/internal-token" "samhan/production/internal-token")
AROLOGIS_JWT_SECRET=$(get_secret_string "samhan/production/arologis-jwt-secret" "samhan/production/arologis-jwt-secret")
RABBIT_PASSWORD=$(get_secret_string "samhan/production/rabbit-password" "samhan/production/rabbit-password")
S3_ACCESS_KEY=$(get_secret_string "samhan/production/s3-access-key" "samhan/production/s3-access-key")
S3_SECRET_KEY=$(get_secret_string "samhan/production/s3-secret-key" "samhan/production/s3-secret-key")

# ECR registry (account_id.dkr.ecr.region.amazonaws.com)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$AWS_REGION")
ECR_REGISTRY="$${ACCOUNT_ID}.dkr.ecr.$${AWS_REGION}.amazonaws.com"

cat > /opt/samhanlogis/.env.production << EOF
# ============================================================
# Phase 11 Production 환경변수 — Terraform user_data 자동 생성
# 생성 시각: $(date -u +%Y-%m-%dT%H:%M:%SZ)
# 수동 수정 후 docker compose up -d --env-file .env.production
# ============================================================

# ─── ECR ────────────────────────────────────────────────────
ECR_REGISTRY=$${ECR_REGISTRY}
IMAGE_TAG=latest

# ─── 공통 ────────────────────────────────────────────────────
SPRING_PROFILES_ACTIVE=production
TZ=Asia/Seoul
JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=70.0 -XX:InitialRAMPercentage=30.0 -Duser.timezone=Asia/Seoul

# ─── RDS (PostgreSQL 15) ─────────────────────────────────────
SAMHAN_DB_HOST=$${RDS_ENDPOINT}
SAMHAN_DB_PORT=5432
SAMHAN_DB_USERNAME=$${RDS_USERNAME}
SAMHAN_DB_PASSWORD=$${DB_PASSWORD}

# ─── slip-service 창고 매핑 (inventory_db.warehouses 실재 행) ─────────────
WAREHOUSE_UUID_HQ=11111111-1111-1111-1111-000000000001
WAREHOUSE_UUID_HUBAL=11111111-1111-1111-1111-000000000002
WAREHOUSE_UUID_ANSEONG=11111111-1111-1111-1111-000000000003
WAREHOUSE_UUID_CHANGWON=11111111-1111-1111-1111-000000000004

# ─── AWS ─────────────────────────────────────────────────────
AWS_DEFAULT_REGION=$${AWS_REGION}
SAMHAN_AWS_REGION=$${AWS_REGION}

# ─── S3 (MinIO → AWS S3 운영 endpoint) ──────────────────────
SAMHAN_S3_ENDPOINT=https://s3.ap-northeast-2.amazonaws.com
SAMHAN_S3_ACCESS_KEY=$${S3_ACCESS_KEY}
SAMHAN_S3_SECRET_KEY=$${S3_SECRET_KEY}
SAMHAN_S3_BUCKET=samhan-attachments
SAMHAN_S3_PATH_STYLE_ACCESS=false
SAMHAN_S3_PRESIGNED_EXPIRY=300

# ─── 인증/보안 ──────────────────────────────────────────────
SAMHAN_JWT_SECRET=$${JWT_SECRET}
JWT_SECRET=$${JWT_SECRET}
SAMHAN_INTERNAL_TOKEN=$${INTERNAL_TOKEN}
INTERNAL_AUTH_TOKEN=$${INTERNAL_TOKEN}
COOKIE_SECURE=true

# ─── 아로로지스 JWT (별도 발급) ──────────────────────────────
SAMHAN_AROLOGIS_JWT_SECRET=$${AROLOGIS_JWT_SECRET}

# ─── Eureka ──────────────────────────────────────────────────
EUREKA_URL=http://eureka-server:8761/eureka/
SAMHAN_DISCOVERY_PROVIDER=eureka

# ─── slip-service auth/가격기억 운영 노브 (#809) ─────────────
# docker-compose.prod.yml 의 명시 environment 매핑을 통해 slip-service 에 전달.
SAMHAN_AUTH_CONNECT_TIMEOUT_MS=2000
SAMHAN_AUTH_READ_TIMEOUT_MS=3000
SAMHAN_PRICE_MEMORY_LOCK_TIMEOUT_MS=1000
SAMHAN_PRICE_MEMORY_STATEMENT_TIMEOUT_MS=3000
SAMHAN_PRICE_MEMORY_TRANSACTION_TIMEOUT_SECONDS=4
SAMHAN_PRICE_MEMORY_ASYNC_CORE_POOL_SIZE=2
SAMHAN_PRICE_MEMORY_ASYNC_MAX_POOL_SIZE=4
SAMHAN_PRICE_MEMORY_ASYNC_QUEUE_CAPACITY=100
SAMHAN_PRICE_MEMORY_ASYNC_SHUTDOWN_AWAIT_SECONDS=5
# R6-M2 + D-R8-2: slip-service 메인 DataSource Hikari 커넥션 획득 대기 상한(ms).
# 30000 = fleet 표준(Hikari 기본). 종전 4000 전역화는 pool 포화 시 사용자 요청을 4초 만에
# 500 으로 끊었다. 가격기억 4초 정책은 아래 전용 pool 로 격리
# (runbook: docs/runbooks/slip-price-memory-upsert-failure.md).
DB_CONNECTION_TIMEOUT_MS=30000
# 가격기억 전용 pool — 메인과 격리. POOL_MAX 4 = ASYNC_MAX_POOL_SIZE 4 와 1:1.
SAMHAN_PRICE_MEMORY_DB_CONNECTION_TIMEOUT_MS=4000
SAMHAN_PRICE_MEMORY_DB_POOL_MAX=4
SAMHAN_PRICE_MEMORY_DB_POOL_MIN_IDLE=0

# ─── RabbitMQ (docker-compose.prod.yml 컨테이너) ────────────
RABBIT_HOST=rabbitmq
RABBIT_PORT=5672
RABBIT_USER=samhan
RABBIT_PASSWORD=$${RABBIT_PASSWORD}

# ─── Elasticsearch (docker-compose.prod.yml 컨테이너) ────────
ES_URI=http://elasticsearch:9200

# ─── SMTP (auth-service / notification-service) ─────────────
# Phase 11 AWS SES: host=email-smtp.ap-northeast-2.amazonaws.com port=587
SAMHAN_SMTP_HOST=email-smtp.ap-northeast-2.amazonaws.com
SAMHAN_SMTP_PORT=587
SAMHAN_SMTP_AUTH=true
SAMHAN_SMTP_STARTTLS=true
SAMHAN_SMTP_USERNAME=REPLACE_SES_SMTP_USERNAME
SAMHAN_SMTP_PASSWORD=REPLACE_SES_SMTP_PASSWORD
SAMHAN_PASSWORD_RESET_FROM_EMAIL=no-reply@samhan-air.com
SMTP_HOST=email-smtp.ap-northeast-2.amazonaws.com
SMTP_PORT=587
SMTP_USERNAME=REPLACE_SES_SMTP_USERNAME
SMTP_PASSWORD=REPLACE_SES_SMTP_PASSWORD
SMTP_FROM=noreply@samhan-air.com
SMTP_STARTTLS=true

# ─── 외부 API (운영 실값 주입 필수) ─────────────────────────
# NTS (전자세금계산서) — DRY_RUN 유지 또는 sandbox 키 입력
ETAX_SUBMIT_METHOD=DRY_RUN
NTS_API_KEY=
NTS_BASE_URL=https://teht.hometax.go.kr

# KFTC (오픈뱅킹) — DRY_RUN 유지 또는 sandbox 키 입력
KFTC_SUBMIT_METHOD=DRY_RUN
KFTC_API_KEY=
KFTC_CLIENT_ID=
KFTC_CLIENT_SECRET=
KFTC_BASE_URL=https://testapi.openbanking.or.kr

# CODEF (금융기관 거래내역) — DRY_RUN 유지 또는 sandbox 키 입력
CODEF_SUBMIT_METHOD=DRY_RUN
CODEF_API_KEY=
CODEF_CLIENT_ID=
CODEF_CLIENT_SECRET=
CODEF_PUBLIC_KEY=
CODEF_BASE_URL=https://api.codef.io

# Aligo SMS — 실 발송 전 키 발급 후 입력
SAMHAN_ALIGO_API_URL=https://apis.aligo.in/send/
SAMHAN_ALIGO_KEY=
SAMHAN_ALIGO_USERID=
SAMHAN_ALIGO_SENDER=

# FCM (Firebase) — Phase 11 실 credential 파일 또는 base64 입력
SAMHAN_FCM_PROJECT_ID=
SAMHAN_FCM_CREDENTIALS_BASE64=

# 인성데이타 퀵프로그램 — sandbox 키 발급 후 입력
SAMHAN_INSUNG_QUICK_API_URL=
SAMHAN_INSUNG_QUICK_API_KEY=
SAMHAN_INSUNG_QUICK_PARTNER_ID=
SAMHAN_INSUNG_QUICK_SANDBOX_MODE=true
SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET=

# ─── 보상 실패 운영 (Phase 11 cutover 후 활성화 권장) ────────
SAMHAN_COMPENSATION_RETENTION_ENABLED=true
SAMHAN_COMPENSATION_PURGE_ENABLED=true
SAMHAN_COMPENSATION_ALERT_ENABLED=true
SAMHAN_COMPENSATION_ALERT_RECIPIENT_USER_ID=REPLACE_ADMIN_USER_UUID
SAMHAN_COMPENSATION_RETRY_ENABLED=true
EOF

chmod 600 /opt/samhanlogis/.env.production
echo "[4/7] .env.production 생성 완료"

# ─── 5. RDS 15 DB 초기화 ─────────────────────────────────────────────────────
echo "[5/7] RDS DB 초기화"

# init-rds.sql S3 다운로드 (실패 시 fail-fast)
# - MySQL 호환 인라인 폴백 제거: PostgreSQL 은 CREATE DATABASE IF NOT EXISTS 미지원
# - user_data 로그는 CloudWatch /samhanlogis/production/user-data 로 실시간 전송됨
# - S3 업로드 선행 필수: CUTOVER.md 단계 3-A 참조
aws s3 cp "s3://samhan-attachments/deploy/init-rds.sql" /tmp/init-rds.sql \
    --region "$AWS_REGION" || {
    echo "[FATAL] init-rds.sql S3 다운로드 실패 — 스크립트를 중단합니다." >&2
    exit 1
}

# psql RDS DB 초기화
# ON_ERROR_STOP=1: SQL 오류도 psql 종료코드 비-0 → set -e 로 스크립트 중단
PGPASSWORD="$DB_PASSWORD" psql \
    -v ON_ERROR_STOP=1 \
    -h "$RDS_ENDPOINT" -U "$RDS_USERNAME" -d postgres \
    -f /tmp/init-rds.sql

echo "[5/7] RDS DB 초기화 완료"

# ─── 6. docker-compose.prod.yml S3 다운로드 ──────────────────────────────────
echo "[6/7] docker-compose.prod.yml 다운로드"
aws s3 cp "s3://samhan-attachments/deploy/docker-compose.prod.yml" \
    /opt/samhanlogis/docker-compose.prod.yml \
    --region "$AWS_REGION"

# ─── 7. ECR 로그인 + docker-compose up ────────────────────────────────────────
echo "[7/7] ECR 로그인 + 17 service 기동"

# ECR 로그인
aws ecr get-login-password --region "$AWS_REGION" \
    | docker login --username AWS --password-stdin "$${ECR_REGISTRY}"

# docker-compose up
cd /opt/samhanlogis
docker compose \
    -f docker-compose.prod.yml \
    --env-file .env.production \
    up -d --pull always

echo "=== SamhanLogis Phase 11 초기화 완료 $(date) ==="
echo "=== 서비스 상태 확인: docker compose -f /opt/samhanlogis/docker-compose.prod.yml ps ==="
