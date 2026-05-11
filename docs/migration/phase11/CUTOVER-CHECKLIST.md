# CUTOVER-CHECKLIST — Phase 11 AWS cutover 환경변수 전환 가이드

> 작성일: 2026-05-11
> Phase 11 cutover 시 14 service 의 환경변수를 로컬/MinIO 에서 AWS 로 전환하는 체크리스트.
> 각 항목은 `infrastructure/env-templates/<service>.env` 와 대응.

---

## 1. 공통 환경변수 전환

### 1-1. 데이터베이스 (로컬 PostgreSQL → RDS)

| 변수명 | 현재 값 (로컬) | cutover 값 (RDS) | 대상 service |
|---|---|---|---|
| `SAMHAN_DB_URL` | `jdbc:postgresql://localhost:5432/<db>` | `jdbc:postgresql://<RDS_ENDPOINT>:5432/<db>` | 14 service 전체 |
| `SAMHAN_DB_USERNAME` | `samhan` | `samhan` (동일) | 14 service 전체 |
| `SAMHAN_DB_PASSWORD` | `samhan_dev_pw` | Secrets Manager 주입 | 14 service 전체 |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/<db>` | `jdbc:postgresql://<RDS_ENDPOINT>:5432/<db>` | legacy fallback |

**체크리스트**:
```
[ ] RDS endpoint 확인: terraform output rds_endpoint
[ ] 14 service .env 파일에서 SAMHAN_DB_URL 교체
[ ] psql -h <RDS_ENDPOINT> -U samhan 접속 확인
[ ] 14 service 각각 /actuator/health 확인 (db UP)
```

### 1-2. 오브젝트 스토리지 (MinIO → AWS S3)

| 변수명 | 현재 값 (MinIO) | cutover 값 (S3) | 대상 service |
|---|---|---|---|
| `SAMHAN_S3_ENDPOINT` | `http://localhost:9000` | `` (빈 값 — AWS SDK 기본 endpoint 사용) | slip/partner/logging |
| `SAMHAN_S3_ACCESS_KEY` | `samhan` | EC2 IAM Role 사용 시 불필요 | slip/partner/logging |
| `SAMHAN_S3_SECRET_KEY` | `samhan_dev_pw` | EC2 IAM Role 사용 시 불필요 | slip/partner/logging |
| `SAMHAN_S3_BUCKET` | `samhan-attachments` | `samhan-attachments` (동일) | slip/logging |
| `SAMHAN_AWS_REGION` | `us-east-1` | `ap-northeast-2` | slip/partner/logging |
| `SAMHAN_S3_PATH_STYLE_ACCESS` | `true` (MinIO 필수) | `false` (S3 virtual-hosted-style) | slip/partner/logging |
| `SAMHAN_S3_PRESIGNED_EXPIRY` | `300` | `300` (동일) | slip/partner/logging |

**체크리스트**:
```
[ ] SAMHAN_S3_ENDPOINT 빈 값으로 설정 (AWS SDK 기본 사용)
[ ] SAMHAN_AWS_REGION=ap-northeast-2 설정
[ ] SAMHAN_S3_PATH_STYLE_ACCESS=false 설정
[ ] presigned URL 생성 테스트 (TTL 300s)
[ ] 파일 업로드 PUT + GET presigned URL PASS
[ ] bucket policy private — anonymous GET 403 확인
```

### 1-3. SMTP (개발 환경 → AWS SES)

| 변수명 | 현재 값 | cutover 값 | 대상 service |
|---|---|---|---|
| `SAMHAN_SMTP_HOST` | `localhost` (Mailpit) | `email-smtp.ap-northeast-2.amazonaws.com` | notification/accounting |
| `SAMHAN_SMTP_PORT` | `1025` | `587` | notification/accounting |
| `SAMHAN_SMTP_USERNAME` | `dev` | SES IAM 자격증명 | notification/accounting |
| `SAMHAN_SMTP_PASSWORD` | `dev` | SES IAM 자격증명 | notification/accounting |

**체크리스트**:
```
[ ] AWS SES 샌드박스 해제 요청 (production 발송 허용)
[ ] 발신 이메일 주소 SES 검증
[ ] 테스트 이메일 발송 확인
```

### 1-4. Redis (로컬 → EC2 Redis 또는 ElastiCache)

| 변수명 | 현재 값 (로컬) | cutover 값 | 대상 service |
|---|---|---|---|
| `SAMHAN_REDIS_HOST` | `localhost` | EC2 private IP (docker-compose Redis) | 모든 캐시 service |
| `SAMHAN_REDIS_PORT` | `6379` | `6379` (동일) | 모든 캐시 service |
| `SAMHAN_REDIS_PASSWORD` | (없음) | (설정 권장) | 모든 캐시 service |

> Phase 11 단일 EC2 환경: Redis 는 EC2 docker-compose 내 유지 (ElastiCache Phase 12 검토).
> Redis host = EC2 내부 IP 또는 localhost (14 service 와 동일 docker network).

**체크리스트**:
```
[ ] EC2 docker-compose Redis 기동 확인
[ ] redis-cli PING → PONG 확인
[ ] 14 service 캐시 hit/miss 정상 동작 확인
```

### 1-5. Eureka (로컬 → EC2 eureka-server)

| 변수명 | 현재 값 (로컬) | cutover 값 | 대상 service |
|---|---|---|---|
| `EUREKA_URL` | `http://localhost:8761/eureka/` | `http://localhost:8761/eureka/` (동일 — 동일 EC2) | 14 service 전체 |

> 단일 EC2 환경에서는 eureka-server 도 docker-compose 동일 네트워크 → localhost 유지.

### 1-6. RabbitMQ (로컬 → EC2 RabbitMQ)

| 변수명 | 현재 값 (로컬) | cutover 값 | 대상 service |
|---|---|---|---|
| `SPRING_RABBITMQ_HOST` | `localhost` | `localhost` (동일 — 동일 EC2) | notification/logging |
| `SPRING_RABBITMQ_PORT` | `5672` | `5672` (동일) | notification/logging |
| `SPRING_RABBITMQ_USERNAME` | `samhan` | 변경 권장 (보안) | notification/logging |
| `SPRING_RABBITMQ_PASSWORD` | `samhan_dev_pw` | Secrets Manager 주입 | notification/logging |

---

## 2. service별 환경변수 cutover 체크리스트

### auth-service (8081)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/auth_db
[ ] SAMHAN_JWT_SECRET → Secrets Manager 주입 (samhan/production/jwt-secret)
[ ] SERVER_PORT=8081 확인
[ ] /actuator/health → {"status":"UP"}
```

### user-service (8082)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/user_db
[ ] SERVER_PORT=8082 확인
[ ] /actuator/health → {"status":"UP"}
```

### product-service (8083)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/product_db
[ ] SERVER_PORT=8083 확인
[ ] Elasticsearch host 확인 (EC2 docker-compose)
[ ] /actuator/health → {"status":"UP"}
```

### inventory-service (8084)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/inventory_db
[ ] SERVER_PORT=8084 확인
[ ] /actuator/health → {"status":"UP"}
```

### slip-service (8085)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/slip_db
[ ] SAMHAN_S3_ENDPOINT → (빈 값)
[ ] SAMHAN_AWS_REGION=ap-northeast-2
[ ] SAMHAN_S3_PATH_STYLE_ACCESS=false
[ ] SERVER_PORT=8085 확인
[ ] /actuator/health → {"status":"UP"}
```

### accounting-service (8086)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/accounting_db
[ ] SAMHAN_SMTP_HOST → email-smtp.ap-northeast-2.amazonaws.com
[ ] SERVER_PORT=8086 확인
[ ] /actuator/health → {"status":"UP"}
```

### logging-service (8087)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/logging_db
[ ] SAMHAN_S3_LOG_BUCKET=samhan-logs
[ ] SERVER_PORT=8087 확인
[ ] /actuator/health → {"status":"UP"}
```

### partner-service (8088)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/partner_db
[ ] SERVER_PORT=8088 확인
[ ] /actuator/health → {"status":"UP"}
```

### partner-auth-service (8089)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/partner_auth_db
[ ] SERVER_PORT=8089 확인
[ ] /actuator/health → {"status":"UP"}
```

### dc-config-service (8090)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/dc_config_db
[ ] SERVER_PORT=8090 확인
[ ] /actuator/health → {"status":"UP"}
```

### partner-order-service (8091)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/partner_order_db
[ ] SERVER_PORT=8091 확인
[ ] /actuator/health → {"status":"UP"}
```

### notification-service (8092)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/notification_db
[ ] SAMHAN_SMTP_HOST → email-smtp.ap-northeast-2.amazonaws.com
[ ] SERVER_PORT=8092 확인
[ ] /actuator/health → {"status":"UP"}
```

### groupware-service (8093)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/groupware_db
[ ] SERVER_PORT=8093 확인
[ ] /actuator/health → {"status":"UP"}
```

### dashboard-service (8094)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/dashboard_db
[ ] SERVER_PORT=8094 확인
[ ] /actuator/health → {"status":"UP"}
```

### arologis-service (8095)

```
[ ] SAMHAN_DB_URL → jdbc:postgresql://<RDS_ENDPOINT>:5432/arologis_db
[ ] SERVER_PORT=8095 확인
[ ] /actuator/health → {"status":"UP"}
```

### api-gateway (8080)

```
[ ] EUREKA_URL=http://localhost:8761/eureka/ 확인
[ ] SAMHAN_JWT_SECRET → Secrets Manager 주입
[ ] SPRING_CLOUD_GATEWAY_HTTPCLIENT_RESPONSE_TIMEOUT=600s
[ ] SERVER_PORT=8080 확인
[ ] ALB target group health check PASS
[ ] /actuator/health → {"status":"UP"}
```

---

## 3. 최종 검증 체크리스트

```
[ ] 14 service 전체 /actuator/health UP
[ ] ALB target group 14 instance all healthy
[ ] CloudWatch 알람 8건 ALARM 없음 (OK 상태)
[ ] Health Check Lambda 정상 동작 (실패 카운터 = 0)
[ ] EC2 Auto Recovery alarm OK
[ ] RDS 자동 백업 활성 (backup_retention_period = 7)
[ ] api.samhan-air.com HTTPS 응답 확인
[ ] presigned URL 생성 + 파일 업로드/다운로드 PASS
[ ] Grafana 대시보드 데이터 수신 확인
```

---

## 4. 참조

- Terraform 코드: `infrastructure/terraform/`
- 마이그레이션 계획: `docs/migration/phase11/PHASE11-AWS-PLAN.md`
- Phase 11 dry-run: `docs/migration/phase11/M-AWS-MIGRATION-DRY-RUN.md`
- 배포 스크립트: `infrastructure/scripts/phase11-deploy.ps1`
