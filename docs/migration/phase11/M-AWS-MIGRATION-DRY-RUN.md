# M-AWS-MIGRATION-DRY-RUN — Phase 10 cutover 전 dry-run plan

본 문서는 Phase 10 (AWS 마이그레이션 + 운영 안정화) 진입 전 staging 환경에서 수행해야 할 dry-run 절차와 기준을 정리한다. Phase 8 호환성 가드 (D-P8-03 ~ D-P8-09) 산출물을 바탕으로 한다.

---

## 1. 개요 — Phase 10 cutover 전 dry-run 의무

Phase 10 production cutover 는 14 service + 5 frontend client + DNS 8 subdomain 전환을 동반하므로, 사전 dry-run 으로 회귀 위험을 줄인다.

### 1-1. dry-run 범위

| 영역 | 내용 |
|---|---|
| RDS Postgres 호환성 | Flyway V1~V8 staging RDS 적용 (14 service) |
| S3 SDK endpoint override | MinIO → S3 cutover, presigned URL 검증 |
| Eureka cluster | 자체 EC2 운영 (multi-AZ 2 노드) |
| ALB + WAF | api-gateway 8080 → ALB 443 + Target Group |
| CloudWatch alert | 5xx / 응답시간 / RDS CPU / DB connection / Disk |
| Route 53 DNS | `*.samhan-air.com` 8 subdomain 전환 절차 |
| Secrets Manager rotation | Phase 8 spec → 실 lambda 배포 |
| ServiceDiscoveryClient | AWS Cloud Map impl 활성 (placeholder 교체) |
| 14 service 부트스트랩 순서 | Eureka → DB → backing → service |
| 점진 cutover | blue-green / canary 10 → 50 → 100% |
| roll-back 절차 | 단계별 roll-back 트리거 + DNS TTL 60s |

### 1-2. dry-run 통과 기준

- staging RDS 의 Flyway baseline 14 service 모두 PASS (out-of-order 비활성)
- S3 endpoint override 패턴 4 file 모두 cutover (MinIO 도메인 잔존 0 건)
- ALB target group health check 14 service 모두 healthy
- CloudWatch alarm 5건 staging 트리거 검증
- Route 53 DNS TTL 60s 설정 + dry-run 응답 확인 (8 subdomain)

---

## 2. RDS Postgres 호환 dry-run (Flyway V1~V8 staging RDS 적용)

### 2-1. 적용 대상 14 service

| service | DB | Flyway baseline 버전 |
|---|---|---|
| auth-service | auth_db | V1~V3 |
| user-service | user_db | V1~V2 |
| product-service | product_db | V1~V8 (jsonb GIN + by-code index) |
| inventory-service | inventory_db | V1~V5 |
| slip-service | slip_db | V1~V7 (10단계 lifecycle + signature) |
| accounting-service | accounting_db | V1~V4 (65 row 시드 포함) |
| logging-service | logging_db | V1 |
| partner-auth-service | partner_auth_db | V1~V3 |
| dc-config-service | dc_config_db | V1~V2 |
| partner-order-service | partner_order_db | V1~V4 |
| api-gateway | (없음) | (해당 없음) |
| eureka-server | (없음) | (해당 없음) |

### 2-2. 절차

1. AWS RDS PostgreSQL 16 인스턴스 (db.t3.medium) 1대 생성 (staging)
2. 14 schema 분리 (`CREATE DATABASE <service>_db`)
3. service 별 `SPRING_DATASOURCE_URL` 을 staging RDS endpoint 로 override
4. service start → Flyway migrate 자동 실행
5. `SELECT version, success FROM flyway_schema_history` 로 PASS 검증

### 2-3. 검증 항목

- standard SQL 만 사용 (RDS 미지원 extension 부재) — Phase 8 1차 22 file 검증 결과
- BaseEntity 7 audit 컬럼 + Soft Delete 가드 일관 적용
- 65 row 한국 일반기업회계기준 시드 자동 적용 (accounting-service)
- 16 user 시드 자동 적용 (user-service)

---

## 3. S3 SDK endpoint override dry-run (MinIO → S3 cutover)

### 3-1. 영향 컴포넌트

| service | 사용처 | 환경변수 | bucket |
|---|---|---|---|
| slip-service | 출고 첨부 / 서명 PNG (P1-8) | `SAMHAN_SLIP_MINIO_*` | `slip-attachments` |
| slip-service | P1 범용 현장 사진 (P1-photo) | `SAMHAN_S3_*` | `samhan-attachments` |
| partner-service | 거래처 첨부 (P0-3) | `SAMHAN_PARTNER_MINIO_*` | `partner-attachments` |
| logging-service | log archive | `SAMHAN_S3_LOG_BUCKET` | `samhan-logs` |

**P1 신규 bucket: `samhan-attachments`** (2026-05-11 추가)

입고 검수 / 배송 완료 / 영업 방문 현장 사진을 단일 범용 bucket 에 저장한다.
로컬 개발 = MinIO `samhan-attachments` bucket, Phase 11 AWS = 동명 S3 bucket.

### 3-2. cutover 패턴

```yaml
# 현재 (로컬 MinIO — chained-default)
samhan:
  s3:
    endpoint: ${SAMHAN_S3_ENDPOINT:http://localhost:9000}
    access-key: ${SAMHAN_S3_ACCESS_KEY:samhan}
    secret-key: ${SAMHAN_S3_SECRET_KEY:samhan_dev_pw}
    bucket: ${SAMHAN_S3_BUCKET:samhan-attachments}
    presigned-expiry-seconds: ${SAMHAN_S3_PRESIGNED_EXPIRY:300}
    region: ${SAMHAN_AWS_REGION:us-east-1}
    path-style-access: ${SAMHAN_S3_PATH_STYLE_ACCESS:true}   # MinIO 필수

# Phase 11 AWS S3 — 환경변수만 교체, application.yml 코드 변경 없음
# .env / Secrets Manager override:
#   SAMHAN_S3_ENDPOINT=                       (빈 값 → AWS SDK default endpoint)
#   SAMHAN_S3_ACCESS_KEY=                     (EC2 IAM Role 사용 시 불필요)
#   SAMHAN_S3_SECRET_KEY=                     (EC2 IAM Role 사용 시 불필요)
#   SAMHAN_S3_BUCKET=samhan-attachments       (동일 이름 유지)
#   SAMHAN_S3_PRESIGNED_EXPIRY=300
#   SAMHAN_AWS_REGION=ap-northeast-2
#   SAMHAN_S3_PATH_STYLE_ACCESS=false         (AWS S3 virtual-hosted-style)
```

### 3-3. Phase 11 AWS S3 bucket 사전 준비 체크리스트

```
[ ] S3 bucket samhan-attachments 생성 (ap-northeast-2)
[ ] bucket policy: private (퍼블릭 액세스 차단 4개 항목 all ON)
[ ] SSE-S3 (또는 SSE-KMS) 기본 암호화 활성
[ ] 버전 관리: 활성 (우발적 삭제 방지)
[ ] lifecycle: 180일 후 Glacier Instant Retrieval 전환 (월 비용 절감)
[ ] IAM role 최소권한: s3:GetObject / PutObject / DeleteObject (bucket ARN/*) — EC2 IAM Role 연결
[ ] presigned URL 생성 테스트 (TTL 300s 만료 검증)
[ ] 기존 partner-attachments / slip-attachments bucket 동일 패턴 적용
```

### 3-4. 검증 항목

- presigned URL 생성 + 만료 (300s = 5분) PASS
- 단일 파일 ≤5MB PUT + GET presigned URL PASS
- bucket policy private — anonymous GET 403 확인
- SSE-S3 암호화 헤더 (`x-amz-server-side-encryption`) 확인
- IAM role 최소권한: 다른 bucket PUT 시도 → 403 확인
- `SAMHAN_S3_PATH_STYLE_ACCESS=false` 전환 후 virtual-hosted URL presigned 정상 동작

---

## 4. Eureka cluster 자체 EC2 운영 (Phase 8 2차 결정 — wrapper 불필요)

### 4-1. 결정 (D-P8-07 보강)

- ServiceDiscoveryClient wrapper 는 보유하되, Phase 10 시점은 Eureka 자체 EC2 운영
- AWS Cloud Map wrapper 는 placeholder 만 유지 (Phase 11 또는 후속 결정 시점에 활성)
- 사유 = Cloud Map 대비 Eureka self-preservation + multi-region 운영 단순성

### 4-2. cluster 구성

| 항목 | 값 |
|---|---|
| 노드 수 | 2 (multi-AZ) |
| 인스턴스 | t3.small × 2 |
| AZ 분산 | ap-northeast-2a / ap-northeast-2c |
| ELB | 내부 NLB (eureka.internal.samhan-air.com) |
| renewal threshold | 0.85 |
| self-preservation | 활성 |

### 4-3. 14 service 등록 검증

- 각 service 의 `eureka.client.service-url.defaultZone` 을 NLB endpoint 로 변경
- `/eureka/apps` 14 application 등록 확인
- 단일 노드 down 시 다른 노드 health check PASS
- self-preservation 트리거 (renewal < 0.85) staging 시뮬레이션

---

## 5. ALB / WAF design (api-gateway 8080 → ALB 443 + Target Group)

### 5-1. ALB 구성

| 항목 | 값 |
|---|---|
| listener | 443 (HTTPS) + 80 (HTTP → HTTPS redirect) |
| TLS | ACM 인증서 (`*.samhan-air.com`) |
| target group | api-gateway × 2 (multi-AZ), HTTP 8080 |
| health check | `GET /actuator/health` (interval 30s, threshold 2/3) |
| sticky session | 비활성 (12-factor 준수) |

### 5-2. WAF rule

| rule | 동작 |
|---|---|
| AWS Managed - Common Rule Set | block |
| AWS Managed - SQL Injection | block |
| AWS Managed - Known Bad Inputs | block |
| Rate limit (per IP) | 1000 req/5min, block |
| Geo block | KR 외 차단 (선택) |

### 5-3. 검증 항목

- ALB 443 → api-gateway 8080 routing PASS (14 service prefix 모두)
- WAF rule trigger 시 403 + CloudWatch log
- target group unhealthy 1대 → ALB 자동 격리

---

## 6. CloudWatch alert 매트릭스

| 메트릭 | 임계치 | 동작 |
|---|---|---|
| ALB 5xx 비율 | > 1% (5분 평균) | Slack webhook + SMS |
| ALB 응답시간 | p99 > 500ms | Slack webhook |
| RDS CPU | > 80% (5분 평균) | Slack webhook |
| RDS DB connection | > 80% of max | Slack webhook + SMS |
| RDS Disk | > 85% | Slack webhook + SMS |
| EC2 CPU | > 80% (5분 평균) | Slack webhook |
| Eureka renewal | < 0.85 | Slack webhook |
| Secrets rotation | RotationFailed > 0 | Slack webhook + SMS |

### 6-1. dry-run 검증

- staging RDS 의 CPU 부하 시뮬레이션 (`pgbench`) → CPU > 80% 트리거 확인
- ALB 5xx 강제 발생 (404 endpoint 호출) → 5xx > 1% 트리거 확인
- Slack webhook 수신 PASS (`#samhan-ops` 채널)

---

## 7. Route 53 DNS cutover 절차 (`*.samhan-air.com` 8 subdomain)

### 7-1. 8 subdomain 매핑

| subdomain | 현재 | Phase 10 cutover |
|---|---|---|
| app.samhan-air.com | (미사용) | desktop electron 다운로드 page |
| api.samhan-air.com | (미사용) | ALB 443 (api-gateway) |
| order.samhan-air.com | Cloudflare Pages | CloudFront → S3 또는 ALB |
| sign.samhan-air.com | (미사용) | ALB 443 (slip-service signature) |
| chat.samhan-air.com | (미사용) | groupware-service (Phase 9) |
| files.samhan-air.com | (미사용) | CloudFront → S3 (file CDN) |
| monitor.samhan-air.com | (미사용) | Grafana (Managed) |
| quote.samhan-air.com | Render | ALB 443 (estimate-app v2 또는 정적 호스팅) |

### 7-2. cutover 절차

1. Route 53 hosted zone 생성 (`samhan-air.com`)
2. NS record 등록 (도메인 등록기관 측)
3. ACM 인증서 발급 (`*.samhan-air.com` + `samhan-air.com`)
4. ALB / CloudFront target 매핑
5. **DNS TTL 60s 로 사전 단축** (cutover D-1 day)
6. cutover 시점 record 일괄 변경
7. 트래픽 전환 모니터링 (CloudWatch + Slack)
8. roll-back 트리거 시 record 즉시 원복 (TTL 60s)

### 7-3. estimate-app v2 호스팅 옵션 비교 (D-P10-XX 별도 결정 — Phase 10 W1 진입 전)

estimate-app v2 (Node.js + Express + EJS, B2 옵션) 는 현재 Render Starter ($7/mo) 운영. Phase 10 cutover 시점 두 AWS 옵션 비교:

#### 옵션 A — AWS Amplify Hosting

| 항목 | 값 |
|---|---|
| 호스팅 형태 | 정적 + SSR 양립 (Next.js / Express compatible) |
| 비용 | $0~ (Free tier: 1000 build min/월 + 15GB serve/월), 초과분 $0.01/build min + $0.15/GB |
| 빌드 방식 | git push 자동 trigger (GitHub repo 연결) — Cloudflare Pages / Render 와 동일 UX |
| SSR runtime | Node.js 18/20 lambda function |
| 커스텀 도메인 | ACM 자동 발급 + Route 53 통합 |
| 적합도 | **estimate-app v2 (Express + EJS) 직접 호스팅 가능** — Render 대체 후보 1순위 |
| 단점 | SSR cold start (lambda) — 초기 응답 200~500ms 추가 |

#### 옵션 B — AWS App Runner

| 항목 | 값 |
|---|---|
| 호스팅 형태 | 컨테이너 기반 SSR (Docker image 또는 git source 직접) |
| 비용 | $5/월 ~ (vCPU 0.25 + RAM 0.5GB 최소), 트래픽 기반 추가 |
| 빌드 방식 | git push 또는 ECR image push 자동 trigger |
| SSR runtime | 항상 활성 컨테이너 (cold start 없음) |
| 커스텀 도메인 | ACM + Route 53 통합 |
| 적합도 | **Render 의 always-on 컨테이너 패턴과 1:1** — 운영 패턴 변경 최소 |
| 단점 | $5/월 minimum (Amplify Free tier 대비) |

#### 비교 요약

| 항목 | Amplify | App Runner |
|---|---|---|
| 비용 (월) | $0 ~ $5 | $5 ~ $15 |
| cold start | 있음 (lambda) | 없음 |
| Render 대비 운영 패턴 | 다름 (Cloudflare Pages 패턴) | 동일 |
| 단일 AWS account 통합 | OK | OK |
| Phase 10 cutover 난이도 | 중 (SSR 패턴 검증 필요) | 저 (컨테이너 1:1 이전) |

#### 결정 시점 + 위임

- **Phase 10 W1 진입 전 별도 결정** — 본 dry-run plan 시점에는 옵션만 제시.
- **결정 항목**: D-P10-XX (DECISIONS 미부여) — 대표 보고 후 비용 / 운영 패턴 / cold start 허용 여부 종합 판단.
- **현재 추천 (PM 시점)**: **App Runner** — Render 패턴 1:1 이전 + cold start 회피 + 대표 운영 부담 최소. 비용 $5~$15/월 = Render Starter 와 동등.
- **roll-back 가능성**: cutover 후 Render service 30일 보존 (D-P9-01 cascade — `infrastructure/render/README.md` 참조).

---

## 8. Secrets Manager rotation 활성 (Phase 8 2차 spec → 실 lambda 배포)

### 8-1. spec 출처

`docs/migration/phase8/M-SECRETS-ROTATION-spec.md` (D-P8-09)

### 8-2. 활성 절차

1. AWS Secrets Manager secret 7건 생성 (`SAMHAN_DB_PASSWORD` / `SAMHAN_INTERNAL_TOKEN` / `SAMHAN_JWT_SECRET` / `SAMHAN_GOOGLE_SERVICE_ACCOUNT_KEY` / `ALIGO_API_KEY` / `SAMHAN_SLACK_WEBHOOK_URL` / `RABBIT_PASSWORD`)
2. lambda 함수 배포 (Python 3.12) — spec 의 4 단계 (createSecret / setSecret / testSecret / finishSecret) 구현
3. IAM role 부여 (`secretsmanager:RotateSecret` + `rds:ModifyDBInstance` + `mq:UpdateUser`)
4. rotation schedule 등록 (DB password 30일 / token 90일 / API key manual)
5. 14 service 의 `spring.config.import: aws-secretsmanager:samhan/<env>/...` 활성
6. CloudWatch alarm `RotationFailed` 활성

### 8-3. dry-run 검증

- staging Secrets Manager 에서 rotation 트리거 → testSecret 단계 PASS
- service 측 자동 재바인딩 PASS (재시작 없이 Secret 변경 반영)
- rotation 실패 시 rollback 트리거 검증

---

## 9. ServiceDiscoveryClient AWS Cloud Map impl 활성 (Phase 8 2차 placeholder → 실 구현)

### 9-1. 출처

`shared/discovery-abstraction/AwsCloudMapServiceDiscoveryClient.java` (D-P8-07 placeholder)

### 9-2. 본 dry-run 시점 결정 (D-P10-pending)

- Eureka 자체 EC2 운영 채택 (section 4) → AWS Cloud Map 활성 보류
- placeholder 그대로 유지 (`UnsupportedOperationException("Phase 10 cutover 시점 구현")`)
- 활성 시점 = Phase 11 또는 Eureka 운영 부담이 임계 도달 시
- 본 dry-run 에서는 Eureka cluster 검증만 수행

### 9-3. (참고) 활성 절차 (Phase 11 위임)

1. `AwsCloudMapServiceDiscoveryClient` 4 operation 실 구현 (AWS SDK 사용)
2. `samhan.discovery.provider=aws-cloud-map` toggle
3. 14 service의 의존성 추가 (`shared:discovery-abstraction`)
4. AWS Cloud Map namespace 생성 (`samhan.local`)
5. 14 service 등록 검증

---

## 10. 14 service production 부트스트랩 순서 (Eureka → DB → backing → service)

### 10-1. 단계별 부트스트랩

| 단계 | 컴포넌트 | 검증 |
|---|---|---|
| 1 | Eureka cluster (2 노드) | `/eureka/apps` 응답 PASS |
| 2 | RDS PostgreSQL (14 schema) | `psql -c "SELECT 1"` PASS |
| 3 | ElastiCache Redis | `redis-cli PING` PASS |
| 4 | AWS MQ (RabbitMQ) | management UI 접속 PASS |
| 5 | OpenSearch (또는 자체 ES) | cluster green |
| 6 | S3 bucket (3건) | `aws s3 ls` PASS |
| 7 | Secrets Manager (7 secret) | `aws secretsmanager get-secret-value` PASS |
| 8 | api-gateway × 2 | ALB target healthy |
| 9 | auth-service × 2 | Eureka 등록 + JWT issue PASS |
| 10 | user / product / inventory / slip / accounting / logging | Eureka 등록 + health PASS |
| 11 | partner-auth / dc-config / partner-order | Eureka 등록 + Internal API PASS |
| 12 | (Phase 9 후) partner / groupware / notification / dashboard | 동일 |

### 10-2. graceful shutdown

- ECS Fargate `server.shutdown=graceful` 적용 (Phase 8 1차 IX 항목 → Phase 10)
- ALB deregistration delay 30s
- in-flight 요청 완료 후 종료

---

## 11. 점진 cutover (blue-green / canary 10→50→100%)

### 11-1. blue-green 옵션

- ALB 의 weighted target group (blue 100% / green 0% 시작)
- green = 신규 인스턴스 (RDS 동일 사용)
- weight 점진 변경 (100/0 → 90/10 → 50/50 → 0/100)

### 11-2. canary 단계

| 단계 | 트래픽 비율 | 관찰 시간 | 통과 기준 |
|---|---|---|---|
| 1 | green 10% | 30분 | 5xx < 1% / p99 < 500ms |
| 2 | green 50% | 1시간 | 5xx < 1% / p99 < 500ms |
| 3 | green 100% | 24시간 모니터링 | 5xx < 0.5% / p99 < 400ms |

### 11-3. 자동 트리거 조건

- 각 단계에서 5xx > 1% 또는 p99 > 1s → 자동 weight rollback (이전 단계로 복귀)
- 수동 승인 필요 = 단계 진입 시점만 (PM/DevOps 승인)

---

## 12. roll-back 절차

### 12-1. 단계별 roll-back

| 단계 | 트리거 | 동작 |
|---|---|---|
| code 회귀 | 5xx > 5% (10분) | ECS task 이전 image tag 로 redeploy |
| DB schema 회귀 | Flyway 검증 fail | RDS snapshot restore (cutover 직전 snapshot) |
| DNS 회귀 | 트래픽 미수신 (5분) | Route 53 record 원복 (TTL 60s) |
| 전체 회귀 | 30분 내 5xx > 10% | 8 subdomain 모두 원래 인프라 (Cloudflare/Render) 로 원복 |

### 12-2. roll-back 사전 준비

- cutover 직전 RDS manual snapshot
- ECS service 의 이전 task definition 보존
- Route 53 record 의 backup JSON (`route53 list-resource-record-sets > backup.json`)
- Cloudflare Pages / Render의 deployment 보존 (즉시 DNS 전환 가능)

---

## 13. dry-run 시나리오 (3단계 — staging dry-run → canary 10% → full cutover)

### 13-1. 단계 1 — staging dry-run (Phase 10 W1)

| 작업 | 통과 기준 |
|---|---|
| Section 2 RDS Flyway 적용 | 14 service Flyway PASS |
| Section 3 S3 endpoint override | presigned URL + multipart PASS |
| Section 4 Eureka cluster 가동 | 14 service 등록 PASS |
| Section 5 ALB + WAF 적용 | health check PASS |
| Section 6 CloudWatch alert | 5건 모두 트리거 확인 |

### 13-2. 단계 2 — canary 10% cutover (Phase 10 W3)

| 작업 | 통과 기준 |
|---|---|
| Section 7 DNS TTL 60s 단축 | 사전 D-1 day 완료 |
| Section 11 canary 10% 트래픽 | 30분 5xx < 1% |
| Section 8 Secrets rotation 활성 | 7 secret rotation PASS |
| Section 12 roll-back 절차 simulation | 1회 staging 검증 PASS |

### 13-3. 단계 3 — full cutover (Phase 10 W4)

| 작업 | 통과 기준 |
|---|---|
| Section 11 canary 50% → 100% | 1시간 + 24시간 PASS |
| Section 7 8 subdomain 모두 cutover | 응답 PASS (HTTPS 200) |
| Section 12 roll-back 사전 준비 | snapshot + DNS backup 보유 |
| 24시간 모니터링 | 5xx < 0.5% / p99 < 400ms |

---

## 14. timeline

### 14-1. Phase 10 5주 timeline (예상)

| 주차 | 작업 |
|---|---|
| W1 | AWS account 발급 + IAM baseline + RDS / EC2 / S3 staging 생성 + section 2~5 dry-run |
| W2 | Section 6 CloudWatch + section 8 Secrets Manager 활성 + 14 service 부트스트랩 검증 |
| W3 | Section 7 Route 53 + ALB cutover + section 11 canary 10% |
| W4 | Section 11 canary 50% → 100% + section 12 roll-back 사전 준비 |
| W5 | 24시간 모니터링 + Phase 10 회고 + Migration Service (8096) 진입 |

### 14-2. 의존성

- Phase 9 4 service (partner / groupware / notification / dashboard) 완료 후 진입
- AWS account 발급 + IAM baseline 정의 (W1 시작 전)
- DNS TTL 60s 단축 (W3 시작 전 D-1 day)

---

## 참조

- Phase 8 1차 호환성 가드: `docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md`
- Phase 8 2차 ServiceDiscoveryClient: `shared/discovery-abstraction/`
- Phase 8 Secrets rotation spec: `docs/migration/phase8/M-SECRETS-ROTATION-spec.md`
- Phase 8 환경변수 표준: `docs/migration/phase8/M-ENV-STANDARDIZATION.md`
- Phase 8 회고: `docs/dev-reports/phase8-retrospective.md`
- 누적 결정: `migration/decisions/DECISIONS.md`
