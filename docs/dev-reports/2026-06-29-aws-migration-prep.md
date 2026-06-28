# AWS Phase 11 이식 준비 — IaC 현행화 + 이식 준비 (PR #660)

> 슬라이스: Phase 11 AWS 이식 준비 (개발책임자 야간 지시 "바로 이식 가능하도록")
> 일자: 2026-06-29 (야간 자율 세션)
> 브랜치: `feat/aws-migration-prep` · 상태: **0수렴 open** (머지 게이트=실 terraform validate)

## 1. 목적

기존 Terraform IaC(PR #152, 2026-05-11)를 7주간 코드베이스 변경에 맞춰 **17 service 현행화**하고, 즉시 이식 가능한 배포 산출물(운영 docker-compose·ECR·RDS init·cutover 런북)을 보강. terraform CLI 미설치 환경이라 코드 검토 + 순차 듀얼리뷰(5 반복)로 검증하고, 실 `terraform validate/plan/apply`는 배포 머신(회사 PC) 과제로 명시.

## 2. 현행화 (14→17 service)

| 항목 | 변경 |
|---|---|
| `main.tf` service_ports | 17개 포트를 각 service `application.yml` 기본값과 대조해 전면 수정(May 11 초안 오류) |
| `rds.tf` | "14 DB"→15 DB(logging-service=ES/RabbitMQ 전용, DB 미사용)·max_connections 200→300(17×Hikari) |
| 주석/문서 | ec2/monitoring/outputs/variables "14"→"17" |

## 3. 신규 산출물

- **`ecr.tf`** — 17 service ECR 리포지토리 + lifecycle policy(태그/날짜/카운트).
- **`infrastructure/docker-compose.prod.yml`** — 17 Spring service + RabbitMQ/ES, RDS/S3 endpoint 환경변수·healthcheck·ECR 이미지·`docker compose config` 유효.
- **`terraform/templates/init-rds.sql`** — 15 DB 생성 + extension.
- **`terraform/templates/user_data.sh`** 재작성 — hostnamectl·Secrets Manager fail-fast(db/jwt/internal/arologis/rabbit/s3)·`psql ON_ERROR_STOP=1`·RDS init·ECR 로그인·compose up.
- **`terraform/CUTOVER.md`** — 6단계 이식 런북(사전→apply→ECR push→compose up→RDS migrate→DNS cutover→health) + ready 체크리스트 + 수동 18항목.
- **`scripts/phase11-deploy.ps1`** — 15 DB·`-VerifyRdsDatabases`·ALB/SSM healthcheck.
- **`terraform/s3.tf`** `aws_s3_object` — init-rds.sql·docker-compose.prod.yml Terraform 자동 업로드(첫 부팅 의존).

## 4. 보안·정합 (순차 듀얼리뷰 적발·해소)

- **시크릿 평문 0 → Secrets Manager 전 일원화**(db/jwt/internal/arologis/rabbit/s3) — rds_password user_data templatefile 노출 제거·fail-fast.
- **S3 첨부 5서비스**(inventory/slip/dashboard/groupware/partner) env를 각 application.yml 키명과 일치(Noop 운영가드 부팅실패 회피).
- EC2 private subnet+ALB(EIP 제거)·SSH ingress 제거(SSM-only)·ACM `*.arologis` SAN·기존 hosted zone data source·IAM/ALB/S3 의존성 그래프(depends_on).

## 5. 적발 실 이식차단 결함 (compile/unit 미검출 — 듀얼리뷰 16+건)

service_ports 실포트 오류 · user_data DB생성 MySQL 문법(PG 미지원) · rds_password 평문 노출 · EC2 private+EIP asymmetric routing · CloudWatch host dimension · ACM 와일드카드 arologis 미커버 · inventory/dashboard MinIO crash loop · fail-fast 미완 · EC2 IAM이 RDS managed secret 미접근 · partner/groupware S3 누락 · EC2 첫 부팅 S3 산출물 부재(apply 순서) · IAM/ALB 그래프 단절.

## 6. 머지 게이트 (회사 PC)

terraform CI 부재 → 머지 전 **실 `terraform validate` + `terraform plan`**(terraform CLI + AWS 계정) 의무. 통과 후 머지 → CUTOVER.md 이식. 수동 18항목(AWS 계정·tfvars·Secrets Manager 7종·SSH키·S3 backend·도메인 hosted zone·ACM SAN·로컬 PG→RDS 이관) 선행.

## 7. 검증

- `docker compose -f infrastructure/docker-compose.prod.yml config -q`: exit 0
- `phase11-deploy.ps1` PowerShell 파서: OK
- Codex focused 최종 재리뷰: "0건 — 0수렴 확인(실 terraform validate 전제)"
- 앱 CI 전 그린 · GitGuardian = PM false-positive(Secrets Manager 참조·placeholder, 실 평문 0)
