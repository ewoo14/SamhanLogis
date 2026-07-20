# SamhanLogis Phase 11 — AWS Cutover 런북

> 작성 2026-06-29 / 개발책임자 확인 필수  
> terraform validate: CLI 미설치로 코드 검토 갈음 (실 apply 전 `terraform validate` 실행 의무)

---

## Ready / Not-Ready 상태 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| Terraform IaC (vpc/ec2/rds/alb/route53/s3/iam/monitoring/lambda) | READY | 17 service 현행화 완료 |
| ECR 리포지토리 (ecr.tf) | READY | 17 service 신규 생성 |
| docker-compose.prod.yml | READY | RDS/S3 endpoint 반영 |
| init-rds.sql (15 DB) | READY | user_data.sh 자동 실행 (logging_db 제거 — logging-service 는 ES/RabbitMQ 전용) |
| user_data.sh (17 service 기동) | READY | ECR pull + compose up |
| **실 AWS 계정** | NOT-READY | 개발책임자 계정 직접 설정 |
| **Route 53 Hosted Zone** | NOT-READY | 사전 생성 + 도메인 등록기관 NS 위임 후 `route53_zone_id` 입력 |
| **Secrets Manager 시크릿** | NOT-READY | 아래 단계 0 참조 |
| **도메인 등록기관 NS 레코드** | NOT-READY | terraform output route53_name_servers 확인 후 수동 |
| **S3 Terraform state 버킷** | NOT-READY | 단계 0 사전 생성 |
| **ECR 이미지 push** | NOT-READY | 단계 2 수행 |
| **RDS snapshot(데이터 이관)** | NOT-READY | 단계 4 수동 수행 |

---

## 단계 0 — 사전 준비 (terraform apply 전 수동 작업)

### 0-A. AWS 계정 + CLI 설정
```bash
aws configure
# AWS Access Key ID: <발급 키>
# AWS Secret Access Key: <발급 시크릿>
# Default region name: ap-northeast-2
# Default output format: json
```

### 0-B. terraform 설치 (v1.6.0+)
```bash
# Amazon Linux 2023 (로컬이 아닌 EC2 에서는 user_data 가 자동 설치)
# 로컬(개발 PC)에서 plan/validate 용:
# https://developer.hashicorp.com/terraform/downloads
terraform version   # 1.6.0 이상 확인
```

### 0-C. S3 Terraform State 버킷 사전 생성
```bash
aws s3 mb s3://samhan-terraform-state --region ap-northeast-2
aws s3api put-bucket-versioning \
  --bucket samhan-terraform-state \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption \
  --bucket samhan-terraform-state \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
# DynamoDB state lock 테이블 (선택 — 단독 운영이면 생략 가능)
aws dynamodb create-table \
  --table-name samhan-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-northeast-2
```

### 0-D. Secrets Manager 시크릿 사전 등록
```bash
# JWT 서명 비밀키 (64자 이상 무작위 문자열)
aws secretsmanager create-secret \
  --name samhan/production/jwt-secret \
  --secret-string "$(openssl rand -hex 32)" \
  --region ap-northeast-2

# 내부 서비스 간 인증 토큰
aws secretsmanager create-secret \
  --name samhan/production/internal-token \
  --secret-string "$(openssl rand -hex 32)" \
  --region ap-northeast-2

# 아로로지스 별도 JWT 비밀키
aws secretsmanager create-secret \
  --name samhan/production/arologis-jwt-secret \
  --secret-string "$(openssl rand -hex 32)" \
  --region ap-northeast-2

# RabbitMQ 운영 비밀번호
aws secretsmanager create-secret \
  --name samhan/production/rabbit-password \
  --secret-string "$(openssl rand -hex 32)" \
  --region ap-northeast-2

# S3 호환 MinIO client 용 access/secret key
# 실 키는 cutover 직전 개발책임자가 수동 주입합니다.
aws secretsmanager create-secret \
  --name samhan/production/s3-access-key \
  --secret-string "REPLACE_S3_ACCESS_KEY" \
  --region ap-northeast-2

aws secretsmanager create-secret \
  --name samhan/production/s3-secret-key \
  --secret-string "REPLACE_S3_SECRET_KEY" \
  --region ap-northeast-2
```

> RDS master password 는 `samhan/production/db-password` Secrets Manager 시크릿으로 일원화합니다. 이 시크릿은 Terraform `aws_secretsmanager_secret.db_password`가 생성하고, `terraform.tfvars`의 `rds_password` 값이 RDS password 와 시크릿 버전에 함께 주입됩니다. 따라서 EC2 IAM 의 기존 `samhan/*` 정책으로 조회 가능합니다.

### 0-E. AMI ID 최신 확인
```bash
# Amazon Linux 2023 최신 AMI (ap-northeast-2)
aws ec2 describe-images \
  --owners amazon \
  --filters "Name=name,Values=al2023-ami-*-x86_64" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --region ap-northeast-2
# 결과를 terraform.tfvars 의 ec2_ami_id 에 업데이트
```

### 0-F. terraform.tfvars 작성
```bash
cp infrastructure/terraform/terraform.tfvars.example infrastructure/terraform/terraform.tfvars
# 실 값 입력 (Git 커밋 금지 — .gitignore 에 포함됨):
#   - rds_password: RDS master password. Terraform 이 samhan/production/db-password 시크릿도 생성.
#   - route53_zone_id: 0-G 에서 획득
#   - ec2_ami_id: 0-E 결과
#   - slack_webhook_url: Slack 웹훅 URL
#   - ec2_key_pair_name: 기본 null 권장. SSH 없이 SSM Session Manager 로 접속.
```

### 0-G. Route 53 Hosted Zone 사전 생성/위임 확인
```bash
# Hosted Zone 은 terraform apply 전에 이미 존재하고, 도메인 등록기관 NS 위임이 끝나 있어야 합니다.
aws route53 list-hosted-zones --query 'HostedZones[?Name==`samhan-air.com.`].Id'
# → terraform.tfvars 의 route53_zone_id 에 입력 (Z로 시작하는 ID)
```

### 0-H. Terraform backend 주석 해제
`infrastructure/terraform/main.tf` 내 `# backend "s3"` 블록 주석 해제:
```hcl
backend "s3" {
  bucket         = "samhan-terraform-state"
  key            = "phase11/terraform.tfstate"
  region         = "ap-northeast-2"
  encrypt        = true
  dynamodb_table = "samhan-terraform-locks"
}
```

---

## 단계 1 — terraform apply (AWS 인프라 생성)

```bash
cd infrastructure/terraform

# 초기화 (backend 연결)
terraform init -upgrade

# 유효성 검사
terraform validate

# 변경 계획 확인 (PLAN 만 — 실 자원 없음)
terraform plan -var-file=terraform.tfvars -out=tfplan

# 계획 검토 후 apply (월 ₩405,000 비용 발생)
terraform apply tfplan

# 출력값 저장
terraform output -json > /tmp/phase11-outputs.json
cat /tmp/phase11-outputs.json
```

**주요 출력값 확인:**
- `rds_endpoint` → .env.production 의 SAMHAN_DB_HOST
- `ecr_registry` → .env.production 의 ECR_REGISTRY
- `alb_dns_name` → DNS cutover 전 임시 접속 확인
- `route53_name_servers` → 도메인 등록기관 NS 설정

---

## 단계 2 — Docker 이미지 빌드 + ECR push (17 services)

> 로컬 또는 CI/CD (GitHub Actions) 에서 실행

```bash
# ECR 로그인
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=ap-northeast-2
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ECR_REGISTRY

# 서비스 목록 (17)
SERVICES=(
  "eureka-server" "api-gateway" "auth-service" "logging-service"
  "user-service" "product-service" "inventory-service" "slip-service"
  "accounting-service" "partner-order-service" "dc-config-service"
  "partner-auth-service" "groupware-service" "notification-service"
  "dashboard-service" "partner-service" "arologis-service"
)

# 빌드 태그 (배포 날짜 기반 또는 Git SHA)
IMAGE_TAG=$(date +%Y%m%d-%H%M)

# 각 서비스 Gradle 빌드 + Docker 이미지 빌드 + ECR push
for svc in "${SERVICES[@]}"; do
  echo "=== $svc 빌드 ==="

  # Gradle JAR 빌드 (루트에서)
  ./gradlew :services:${svc}:bootJar -x test

  # Docker 이미지 빌드
  docker build \
    -f infrastructure/docker/spring-service.Dockerfile \
    --build-arg JAR_FILE=services/${svc}/build/libs/${svc}.jar \
    -t $ECR_REGISTRY/samhanlogis-production-${svc}:${IMAGE_TAG} \
    -t $ECR_REGISTRY/samhanlogis-production-${svc}:latest \
    .

  # ECR push
  docker push $ECR_REGISTRY/samhanlogis-production-${svc}:${IMAGE_TAG}
  docker push $ECR_REGISTRY/samhanlogis-production-${svc}:latest

  echo "=== $svc push 완료 ==="
done

echo "IMAGE_TAG=${IMAGE_TAG}" >> .env.production.push
```

---

## 단계 3 — EC2 docker-compose.prod.yml 배포 + 서비스 기동

### 3-A. Terraform 자동 업로드 산출물 확인
```bash
# 배포 산출물은 terraform apply 가 aws_s3_object 로 자동 업로드합니다.
# EC2 user_data 는 아래 두 객체를 첫 부팅 시 다운로드합니다.
aws s3 ls s3://samhan-attachments/deploy/docker-compose.prod.yml
aws s3 ls s3://samhan-attachments/deploy/init-rds.sql
```

> user_data.sh 는 EC2 최초 기동 시 자동 실행됨 (단계 1 terraform apply 완료 후).  
> `infrastructure/docker-compose.prod.yml` 또는 `infrastructure/terraform/templates/init-rds.sql` 변경 시 Terraform `source` + `etag` 감지로 S3 객체가 갱신됨.  
> `.env.production` 의 SES/NTS/KFTC/CODEF/Aligo 등 운영 실값 보정은 SSM Session Manager 접속 후 수동 수행.  
> 재배포 시: SSM Session Manager 로 접속 후 수동 실행.

### 3-B. 첫 기동 확인 (EC2 SSM Session Manager)
```bash
# AWS 콘솔 → EC2 → 인스턴스 → "연결" → "Session Manager"
# 또는:
aws ssm start-session --target <INSTANCE_ID> --region ap-northeast-2

# 초기화 로그 확인
tail -f /var/log/user_data.log

# 컨테이너 상태 확인
docker compose -f /opt/samhanlogis/docker-compose.prod.yml ps
```

### 3-C. 재배포 (이미지 업데이트)
```bash
# SSM 세션에서:
cd /opt/samhanlogis

# 새 이미지 pull + 단일 컨테이너 recreate
docker compose -f docker-compose.prod.yml --env-file .env.production \
  pull && docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d --remove-orphans

# readiness 대기 (slip-service 예시, 최대 3분). healthy 전에는 배포 완료로 판정하지 않는다.
for attempt in $(seq 1 36); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' samhan-slip-service 2>/dev/null)" = "healthy" ] && break
  if [ "$attempt" -eq 36 ]; then
    docker logs --tail 200 samhan-slip-service
    exit 1
  fi
  sleep 5
done
curl -fsS http://127.0.0.1:8086/actuator/health
```

현재 공식 운영 compose 는 서비스별 `container_name` 하나만 두므로 위 절차는 rolling deploy 가 아니라
기존 컨테이너를 새 이미지 컨테이너로 **recreate** 한다. 서비스별 예상 중단시간은 이미지 교체와 Spring
기동을 합쳐 보통 **30~120초**이며, readiness 확인이 끝날 때까지 해당 서비스 요청은 중단될 수 있다.

> 향후 서비스가 다중 인스턴스로 확장되면 가격기억처럼 afterCommit 보조 write 가 구버전 인스턴스에 남을
> 수 있다. 그때는 write quiesce 또는 durable outbox/backfill 을 갖춘 뒤 인스턴스별 rolling 절차를
> 설계해야 한다. 현재 단일 컨테이너 운영에는 해당 rolling 혼재 문제가 없다.

---

## 단계 4 — RDS Flyway 마이그레이션 검증

각 Spring 서비스는 startup 시 Flyway 마이그레이션을 자동 실행합니다.

```bash
# SSM 세션에서 서비스 로그 확인 (auth-service 예시)
docker logs samhan-auth-service 2>&1 | grep -E "Flyway|migration|Successfully"

# RDS 직접 접속하여 스키마 확인 (psql 필요)
PGPASSWORD="${DB_PASSWORD}" psql \
  -h "${SAMHAN_DB_HOST}" -U samhan -d auth_db \
  -c "\dt" 2>&1 | head -30
```

### 기존 데이터 이관 (로컬 → RDS)
```bash
# 로컬 PostgreSQL 덤프 (각 서비스별)
pg_dump -h localhost -U samhan -d auth_db -F c -f auth_db.dump

# RDS 로 복원
pg_restore -h "${RDS_ENDPOINT}" -U samhan -d auth_db auth_db.dump

# 또는 직접 pg_dump | pg_restore 파이프
pg_dump -h localhost -U samhan -d auth_db -F c \
  | pg_restore -h "${RDS_ENDPOINT}" -U samhan -d auth_db
```

---

## 단계 5 — Route 53 DNS Cutover

### 5-A. cutover D-1: TTL 단축 확인
ALB alias 레코드는 AWS 가 TTL 을 자동 관리(60s). 별도 TTL 단축 불필요.

### 5-B. 도메인 등록기관 NS 레코드 설정
```bash
# terraform output 에서 NS 서버 4개 확인
terraform output route53_name_servers
# → 도메인 등록기관 관리 화면에서 samhan-air.com 의 NS 레코드를 위 4개로 교체
```

### 5-C. DNS 전파 확인 (전파 최대 48시간, 보통 1시간)
```bash
nslookup api.samhan-air.com 8.8.8.8
# → ALB DNS 이름으로 CNAME 또는 A 레코드 확인
```

---

## 단계 6 — /actuator/health 전체 검증

```bash
# ALB DNS HTTPS 임시 헬스체크
# 인증서는 api.samhan-air.com / *.arologis.samhan-air.com 용이라 ALB DNS hostname 과 불일치합니다.
# DNS cutover 전 임시 확인에만 -k 를 사용합니다.
ALB_DNS=$(terraform output -raw alb_dns_name)
curl -k -fs "https://${ALB_DNS}/actuator/health" | python3 -m json.tool

# DNS cutover 완료 후 운영 도메인 직접 확인 (정식 TLS 검증)
curl -fs https://api.samhan-air.com/actuator/health | python3 -m json.tool

# 17 service 전체 health check (SSM Session Manager 세션 내부 localhost curl)
# EC2 에 퍼블릭 IP 없음 — SSM 으로 접속:
#   aws ssm start-session --target <INSTANCE_ID> --region ap-northeast-2
PORTS=(8761 8080 8081 8082 8083 8084 8085 8086 8087 8088 8089 8091 8092 8093 8094 8095 8097)
for port in "${PORTS[@]}"; do
  status=$(curl -s "http://localhost:${port}/actuator/health" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','N/A'))" 2>/dev/null || echo "FAILED")
  echo "Port ${port}: ${status}"
done
```

**합격 기준:**
- 모든 서비스: `{"status":"UP"}`
- ALB health check: api-gateway:8080/actuator/health 200 OK
- Health Check Lambda: CloudWatch Logs 에서 `[OK] Health check 통과` 확인

---

## 롤백 절차

### R-1. 서비스 중단 (즉시)
```bash
# EC2 SSM 세션에서
docker compose -f /opt/samhanlogis/docker-compose.prod.yml down
```

### R-2. DNS 복구 (Route 53 → 구 서버)
```bash
# Route 53 레코드를 구 서버 IP 로 변경
# ALB alias 레코드 삭제 또는 다른 IP 로 변경
# (DNS 전파: ~60s, ALB alias TTL 자동 관리)
```

### R-3. RDS 롤백
```bash
# RDS 자동 백업에서 Point-in-time 복구
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier samhanlogis-production-rds \
  --target-db-instance-identifier samhanlogis-production-rds-rollback \
  --restore-time <TIMESTAMP> \
  --region ap-northeast-2
```

---

## 미해결 수동 항목 (개발책임자 직접 처리 필요)

| # | 항목 | 수행 시점 |
|---|------|-----------|
| M-1 | AWS 계정 생성 + IAM 사용자 발급 | 단계 0 전 |
| M-2 | samhan-air.com Route 53 Hosted Zone 사전 생성 + 도메인 등록기관 NS 위임 | 단계 0-G |
| M-3 | Secrets Manager 시크릿 실 값 입력 (jwt-secret/internal-token/arologis-jwt/rabbit-password/S3 access/secret key) + terraform.tfvars `rds_password` 입력 | 단계 0-D/0-F |
| M-4 | SMTP 자격증명 (AWS SES SMTP 발급 + 발신 도메인 인증) | 단계 0 후 |
| M-5 | AMI ID 최신 확인 + tfvars 업데이트 | 단계 0-E |
| M-6 | Slack Webhook URL 발급 | 단계 0 |
| M-8 | terraform.tfvars 실 값 작성 + .gitignore 확인 | 단계 0-F |
| M-9 | 도메인 등록기관 NS 레코드 교체 | 단계 5-B |
| M-10 | 기존 로컬 데이터 → RDS 이관 (pg_dump/restore) | 단계 4 |
| M-11 | arologis SAMHAN_INSUNG_QUICK_* 인성데이타 vendor sandbox 키 | 운영 후 |
| M-12 | FCM credentials (notification-service, arologis-service) | 운영 후 |
| M-13 | Aligo SMS 키 (notification-service) | 운영 후 |
| M-14 | NTS/KFTC/CODEF sandbox 키 (accounting-service) | 운영 후 |
| M-15 | .env.production 의 SAMHAN_COMPENSATION_ALERT_RECIPIENT_USER_ID 입력 | 단계 3 |
| M-16 | RabbitMQ 운영 비밀번호 Secrets Manager 주입 (`samhan/production/rabbit-password`) | 단계 0-D |
| M-17 | terraform.tfvars `route53_zone_id` 에 사전 위임된 Hosted Zone ID 입력 | 단계 1 전 |
| M-18 | AWS S3 access/secret key 실값 수동 주입 (`samhan/production/s3-access-key`, `samhan/production/s3-secret-key`) | 단계 0-D |
| M-19 | slip-service 가격기억 fail-soft prod 감지 확인 (#809 — slip-service awslogs driver 직접 전달(선행 조건) + Terraform metric filter 2건/alarm 2건 + **양성 도달 검사**, 아래 "M-19 상세" 참조) | 단계 3 후 |
| M-20 | partner-order-service 전표 발행 outbox 영구실패 prod 알람 감지 확인 (#854 — partner-order-service awslogs driver 직접 전달(선행 조건) + Terraform metric filter 1건/alarm 1건 + **양성 도달 검사**, 아래 "M-20 상세" 참조) | 단계 3 후 |

### M-19 상세 — 가격기억 upsert 실패 prod 알람 이식 (#809)

dev 로컬 스택은 Prometheus rule `SlipPriceMemoryUpsertFailure`
(`infrastructure/prometheus/rules/slip-price-memory.yml`) 가 upsert 실패를 감지하지만,
**prod 에는 Prometheus 컨테이너가 없다** (Phase 11 기결정 — 모니터링 = CloudWatch 일원화).
가격기억은 fail-soft 보조 기능이라 upsert 가 전멸해도 원 전표/견적 저장은 성공하고
`/actuator/health` 도 `UP` 을 유지한다.

**로그 전달 경로 (R6-H5 재설계)**: slip-service 컨테이너 로그는
`docker-compose.prod.yml` 의 `awslogs` logging driver 가 log group
`/samhanlogis/production/docker` 의 stream `slip-service` 로 **직접 전달**한다.
`user_data.sh` CloudWatch Agent 의 Docker json 와일드카드 tail 은 AWS 공식 문서상
"Only the latest file is pushed to CloudWatch Logs based on file modification time"
제약으로 17개 컨테이너 동시 기록에서 slip 라인이 유실될 수 있어 **alarm 원천으로
쓰지 않는다** (나머지 컨테이너 best-effort 수집 전용, stream `{hostname}/docker-others`).
`monitoring.tf` 가 WARN 문자열 2종의 metric filter 와 alarm 을 각각 선언한다.
대응 절차: `docs/runbooks/slip-price-memory-upsert-failure.md`.

> ⚠️ **정직 한계 (2026-07-16)**: 실 EC2 가 아직 없어 본 절차는 AWS 공식 문서
> (CloudWatch Agent Logs Section / awslogs logging driver) 기반 설계 검증까지만
> 완료했다. 라이브 end-to-end 실측은 cutover 시 본 M-19 가 최초이며, 아래 ⓪~④ 를
> 통과하기 전까지 alarm 2건의 실효는 **미확증** 상태로 취급한다.

```bash
# ⓪ 선행 조건 — S3 업로드본 docker-compose.prod.yml 에 slip-service awslogs driver
#    선언이 포함돼 있는지 확인 (없으면 단계 3-A 의 S3 업로드부터 다시 수행).
#    awslogs driver 는 컨테이너 시작 시 CreateLogStream 을 호출한다 — log group
#    선생성(Terraform aws_cloudwatch_log_group.docker)과 EC2 instance role
#    (iam.tf logs:CreateLogStream/PutLogEvents) 이 전제이며, 둘 중 하나라도 없으면
#    slip-service 가 기동에 실패한다.
aws s3 cp s3://samhan-attachments/deploy/docker-compose.prod.yml - \
  --region ap-northeast-2 | grep -n -A 7 'driver: awslogs'
docker inspect --format '{{.HostConfig.LogConfig.Type}}' samhan-slip-service
# 기대값: awslogs (json-file 이면 stale compose — 재다운로드 + up -d 재기동)

# ① CloudWatch Agent 상태 (나머지 16개 컨테이너 best-effort 수집 + user_data 로그).
sudo systemctl is-active amazon-cloudwatch-agent
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -m ec2 -a status

# ② slip-service 전용 log stream 존재 + 로그 도달 확인.
aws logs describe-log-streams \
  --log-group-name /samhanlogis/production/docker \
  --log-stream-name-prefix slip-service \
  --region ap-northeast-2
aws logs tail /samhanlogis/production/docker --since 30m \
  --log-stream-names slip-service \
  --region ap-northeast-2 | head -20

# ③ Terraform 4개 리소스 적용 전후 확인 (filter 2 + alarm 2).
terraform plan \
  -target=aws_cloudwatch_log_metric_filter.slip_price_memory_upsert_failed \
  -target=aws_cloudwatch_log_metric_filter.slip_price_memory_queue_rejected \
  -target=aws_cloudwatch_metric_alarm.slip_price_memory_upsert_failed \
  -target=aws_cloudwatch_metric_alarm.slip_price_memory_queue_rejected

aws logs describe-metric-filters \
  --log-group-name /samhanlogis/production/docker \
  --filter-name-prefix slip-price-memory- --region ap-northeast-2
aws cloudwatch describe-alarms \
  --alarm-name-prefix samhanlogis-production-slip-price-memory- \
  --region ap-northeast-2

# ④ 양성 도달 검사 (end-to-end, R6-H5) — 감시 문자열 2종을 인위 echo 로 1회 출력.
#    실제 upsert 실패를 유발하지 않는 echo 이며, alarm 1회 발화(OK→ALARM→OK)는
#    로그→metric filter→alarm→SNS 전 체인이 살아 있다는 "의도된 검증 신호"다
#    (SNS/Slack 수신 확인 겸용 — 수신자에게 사전 공지).
docker exec samhan-slip-service sh -c \
  'echo "M-19 synthetic probe: partner-product price memory batch upsert failed (인위 출력 — 실제 실패 아님)" >> /proc/1/fd/1'
docker exec samhan-slip-service sh -c \
  'echo "M-19 synthetic probe: partner-product price memory queue rejected (인위 출력 — 실제 실패 아님)" >> /proc/1/fd/1'

# 도달 확인 — 수 초 ~ 1분 내 events 배열에 각 1건 이상 조회돼야 한다.
START_MS=$(( ($(date +%s) - 900) * 1000 ))
aws logs filter-log-events \
  --log-group-name /samhanlogis/production/docker \
  --log-stream-names slip-service \
  --filter-pattern '"partner-product price memory batch upsert failed"' \
  --start-time "$START_MS" --region ap-northeast-2
aws logs filter-log-events \
  --log-group-name /samhanlogis/production/docker \
  --log-stream-names slip-service \
  --filter-pattern '"partner-product price memory queue rejected"' \
  --start-time "$START_MS" --region ap-northeast-2

# alarm 발화 확인 — metric period 300s 이므로 5~10분 대기 후 조회.
aws cloudwatch describe-alarm-history \
  --alarm-name samhanlogis-production-slip-price-memory-upsert-failure \
  --history-item-type StateUpdate --max-records 5 --region ap-northeast-2
aws cloudwatch describe-alarm-history \
  --alarm-name samhanlogis-production-slip-price-memory-queue-rejected \
  --history-item-type StateUpdate --max-records 5 --region ap-northeast-2
```

완료 조건: ⓪ slip-service `LogConfig.Type` = `awslogs` · ① Agent `active` ·
② stream `slip-service` 존재 · ③ metric filter 2건 + alarm 2건 존재 ·
④ **양성 도달 검사** — synthetic 이벤트가 두 filter-pattern 모두에서
`filter-log-events` 로 조회되고, alarm 2건 모두 `OK→ALARM→OK` 상태 전이 이력이
남아야 한다. **존재 검사(①~③)만으로는 통과 불가** — ④ 없이는 "매치 0 → alarm
영원히 OK" 인 구조적 false-negative 를 걸러낼 수 없다 (R6-H5). 운영 중 WARN 이
없으면 `aws logs tail` 이 비어 있는 것이 정상이며, ④ 통과 후에는 인위 출력을
반복 생성하지 않는다.

### M-20 상세 — partner-order 전표 발행 outbox 영구실패 prod 알람 이식 (#854)

dev 로컬 스택은 Prometheus rule `PartnerOrderSlipPublishTerminalFailure`
(`infrastructure/prometheus/rules/partner-order-outbox.yml`) 가 outbox terminal 전이를
감지하지만, **prod 에는 Prometheus 컨테이너가 없다**(M-19 와 동일한 구조적 이유 — 모니터링 =
CloudWatch 일원화). 대상 상태(`FAILED_PERMANENT`)는 전표 발행이 영구 실패해 수동 개입이
필요한 사건이며, 발생 즉시 `partner_order_slip_publish_terminal_total{reason=...}` 카운터가
증가하고 로그에 `"Outbox FAILED_PERMANENT"` 문자열이 남는다(R4 Track 2 관측 배선).

**로그 전달 경로 (#854 R5-HIGH)**: partner-order-service 컨테이너 로그는
`docker-compose.prod.yml` 의 `awslogs` logging driver 가 log group
`/samhanlogis/production/docker` 의 stream `partner-order-service` 로 **직접 전달**한다.
최초 구현 시 이 driver 가 누락되어 있었고(monitoring.tf 의 filter/alarm 만 존재), M-19 가
이미 명문화한 "CloudWatch Agent Docker json 와일드카드 tail = best-effort 전용, alarm 원천
아님" 원칙을 partner-order-service 는 지키지 못하고 있었다 — slip-service 와 **형상(filter/
alarm)은 동형이었으나 수송 경로는 비동형**이었던 것을 이 배치에서 slip-service 와 동형화했다.
`monitoring.tf` 가 문자열 `"Outbox FAILED_PERMANENT"` 의 metric filter 와 alarm 을 각각
선언한다. 대응 절차: `docs/runbooks/partner-order-outbox-terminal-failure.md`.

> ⚠️ **정직 한계 (M-19 와 동일)**: 실 EC2 가 아직 없어 본 절차는 설계 검증까지만 완료했다.
> 라이브 end-to-end 실측은 cutover 시 본 M-20 이 최초이며, 아래 ⓪~④ 를 통과하기 전까지
> alarm 의 실효는 **미확증** 상태로 취급한다.

```bash
# ⓪ 선행 조건 — S3 업로드본 docker-compose.prod.yml 에 partner-order-service awslogs
#    driver 선언이 포함돼 있는지 확인 (없으면 단계 3-A 의 S3 업로드부터 다시 수행).
aws s3 cp s3://samhan-attachments/deploy/docker-compose.prod.yml - \
  --region ap-northeast-2 | grep -n -B 2 -A 7 'awslogs-stream: partner-order-service'
docker inspect --format '{{.HostConfig.LogConfig.Type}}' samhan-partner-order-service
# 기대값: awslogs (json-file 이면 stale compose — 재다운로드 + up -d 재기동)

# ① CloudWatch Agent 상태 — M-19 ①과 공유(같은 EC2 · 같은 Agent 프로세스). 별도 확인 불필요.

# ② partner-order-service 전용 log stream 존재 + 로그 도달 확인.
aws logs describe-log-streams \
  --log-group-name /samhanlogis/production/docker \
  --log-stream-name-prefix partner-order-service \
  --region ap-northeast-2
aws logs tail /samhanlogis/production/docker --since 30m \
  --log-stream-names partner-order-service \
  --region ap-northeast-2 | head -20

# ③ Terraform 2개 리소스 적용 전후 확인 (filter 1 + alarm 1).
terraform plan \
  -target=aws_cloudwatch_log_metric_filter.partner_order_outbox_failed_permanent \
  -target=aws_cloudwatch_metric_alarm.partner_order_outbox_failed_permanent

aws logs describe-metric-filters \
  --log-group-name /samhanlogis/production/docker \
  --filter-name-prefix partner-order-outbox- --region ap-northeast-2
aws cloudwatch describe-alarms \
  --alarm-name-prefix samhanlogis-production-partner-order-outbox- \
  --region ap-northeast-2

# ④ 양성 도달 검사 (end-to-end) — 감시 문자열을 인위 echo 로 1회 출력.
#    실제 outbox 영구실패를 유발하지 않는 echo 이며, alarm 1회 발화(OK→ALARM→OK)는
#    로그→metric filter→alarm→SNS 전 체인이 살아 있다는 "의도된 검증 신호"다
#    (SNS/Slack 수신 확인 겸용 — 수신자에게 사전 공지).
docker exec samhan-partner-order-service sh -c \
  'echo "M-20 synthetic probe: Outbox FAILED_PERMANENT (인위 출력 — 실제 실패 아님)" >> /proc/1/fd/1'

# 도달 확인 — 수 초 ~ 1분 내 events 배열에 1건 이상 조회돼야 한다.
START_MS=$(( ($(date +%s) - 900) * 1000 ))
aws logs filter-log-events \
  --log-group-name /samhanlogis/production/docker \
  --log-stream-names partner-order-service \
  --filter-pattern '"Outbox FAILED_PERMANENT"' \
  --start-time "$START_MS" --region ap-northeast-2

# alarm 발화 확인 — metric period 300s 이므로 5~10분 대기 후 조회.
aws cloudwatch describe-alarm-history \
  --alarm-name samhanlogis-production-partner-order-outbox-failed-permanent \
  --history-item-type StateUpdate --max-records 5 --region ap-northeast-2
```

완료 조건: ⓪ partner-order-service `LogConfig.Type` = `awslogs` · ① Agent `active`
(M-19 와 공유) · ② stream `partner-order-service` 존재 · ③ metric filter 1건 + alarm 1건
존재 · ④ **양성 도달 검사** — synthetic 이벤트가 `filter-log-events` 로 조회되고, alarm 이
`OK→ALARM→OK` 상태 전이 이력을 남겨야 한다. **존재 검사(①~③)만으로는 통과 불가** — M-19 와
동일한 이유로 ④ 없이는 "매치 0 → alarm 영원히 OK" 구조적 false-negative 를 걸러낼 수 없다.
운영 중 FAILED_PERMANENT 가 없으면 `aws logs tail` 이 비어 있는 것이 정상이며, ④ 통과 후에는
인위 출력을 반복 생성하지 않는다.

---

## 참고 파일 경로

| 파일 | 용도 |
|------|------|
| `infrastructure/terraform/main.tf` | Terraform 진입점, 17 service 포트 맵 |
| `infrastructure/terraform/ec2.tf` | EC2 + ALB + ACM + Auto Recovery |
| `infrastructure/terraform/rds.tf` | RDS PostgreSQL 15, 15 DB, backup 7일 |
| `infrastructure/terraform/ecr.tf` | ECR 17 service 리포지토리 |
| `infrastructure/terraform/vpc.tf` | VPC/Subnet/NAT/Security Groups |
| `infrastructure/terraform/route53.tf` | samhan-air.com 8 subdomain |
| `infrastructure/terraform/arologis.tf` | 아로로지스 3 subdomain |
| `infrastructure/terraform/lambda.tf` | Health Check Lambda (Tier 3) |
| `infrastructure/terraform/monitoring.tf` | CloudWatch 알람 11종(기반 8 + slip 가격기억 2 + partner-order outbox 1) + Dashboard |
| `infrastructure/terraform/s3.tf` | samhan-attachments / samhan-logs |
| `infrastructure/terraform/iam.tf` | EC2 Role + Lambda Role |
| `infrastructure/terraform/variables.tf` | 입력 변수 정의 |
| `infrastructure/terraform/outputs.tf` | 배포 후 출력값 |
| `infrastructure/terraform/terraform.tfvars.example` | tfvars 예시 (실 값 없음) |
| `infrastructure/terraform/templates/user_data.sh` | EC2 최초 기동 스크립트 |
| `infrastructure/terraform/templates/init-rds.sql` | RDS 15 DB 초기화 SQL |
| `infrastructure/terraform/templates/health_check_lambda.py` | Health Check Lambda 소스 |
| `infrastructure/docker-compose.prod.yml` | 17 service 운영 docker-compose |
| `infrastructure/scripts/phase11-deploy.ps1` | 배포 자동화 PowerShell |
