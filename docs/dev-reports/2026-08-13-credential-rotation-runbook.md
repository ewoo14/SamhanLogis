# 개발 스택 자격 폐기(rotation) 실행 계획서

> 작성일: 2026-08-13  
> 기준: `main` / `origin/main` `3dc78fc88eaa7e5b591c05c543c49eb6ec9bd673`  
> 실행 후보: `origin/fix/it-ephemeral-credentials` `35c9f41b90808844740a7d3b34015e8ef2ba5146`  
> 상태: **정찰·계획만 완료. 이 라운드에서 자격, 컨테이너, DB, `.env`, git 상태를 변경하지 않았다.**

## 0. 결론과 실행 게이트

개발책임자 결정문 `docs/decisions/2026-08-13-credential-rotation-and-1181-gate.md`의 전제는 현재 PC에서도 재현됐다.

- `samhan-*` 컨테이너는 정확히 24개다. 22개는 실행 중이고 `samhan-prometheus`, `samhan-nginx` 2개는 종료 상태다.
- 13자 값은 현재 PostgreSQL, RabbitMQ, MinIO, Grafana 및 실행 중인 14개 도메인 서비스의 DB/Rabbit 설정과 exact match다.
- 28자 내부 토큰은 실행 중인 14개 도메인 서비스와 exact match다. `logging-service`는 compose에는 있으나 현재 컨테이너가 없어 live 값은 셀 수 없었다.
- 동일 64자 JWT secret은 `api-gateway`, `auth-service`, `partner-auth-service`, `arologis-service`에서 사용 중이다.
- 평문 9자 로컬 시드 비밀번호는 공유 `auth_db`의 활성 계정 5개 BCrypt hash와 모두 일치한다.
- 추가 발견: gitignored `infrastructure/.env.local`의 13자 QA 기본 비밀번호, 11자 QA MASTER 비밀번호, 9자 아로로지스 관리자 비밀번호도 git 이력에 존재하고 현재 DB hash와 일치한다. 따라서 시드 계정 폐기 범위는 선행 보고서의 5개보다 크다.

실행 전 필수 게이트는 다음과 같다.

1. 가용 RAM이 1.0GB 미만이면 즉시 중단한다. 이번 정찰 시작 시 값은 22.327GB였다.
2. 다른 두 트랙의 공유 스택 사용을 중단시키고 유지보수 창을 선언한다.
3. `#1162` 후보 브랜치는 merge하지 않은 채 exact SHA `35c9f41b9`에서 build·실행한다. rotation 검증이 끝난 뒤에만 개발책임자 merge trigger를 받는다.
4. `infrastructure/.env`의 21개 필수 키를 새 값으로 먼저 완성한다. 일부 키가 비거나 placeholder인 상태에서 `Initialize-SamhanLocalEnv`를 호출하면 안 된다.
5. 새 PostgreSQL, RabbitMQ, MinIO, Grafana 자격은 서로 다른 값으로 만든다. 현재처럼 한 값을 네 시스템이 공유하지 않는다.
6. 이전 값의 emergency rollback 사본은 OS 보호 저장소 또는 현재 사용자만 읽을 수 있는 임시 파일에만 두고, 성공 즉시 폐기한다. 로그·명령행·보고서에는 쓰지 않는다.
7. git history rewrite는 이 계획의 범위가 아니며 폐기를 대체하지 않는다.

## 1. 자격 목록

값은 모두 마스킹했다. `형태`는 문자군과 길이만 뜻한다.

| ID | 시스템 | 현재 형태 | 현재 실사용/영속 근거 | 폐기 판정 |
|---|---|---|---|---|
| C1-PG | PostgreSQL | `<REDACTED: 13자, a-z+symbol>`; 사용자 6자 | 컨테이너 env, `pg_authid` SCRAM-SHA-256 133자 hash, 20개 DB의 단일 owner/login role | 필수 |
| C1-RMQ | RabbitMQ | C1-PG와 같은 13자; 사용자 6자 | 컨테이너 env와 RabbitMQ 내부 사용자 DB의 administrator 1명 | 필수; C1-PG와 다른 새 값 사용 |
| C1-MINIO | MinIO/S3 | C1-PG와 같은 13자 secret; access/root user 6자 | 컨테이너 env, 2개 bucket, root 외 IAM 사용자 0·서비스계정 0 | 필수; C1-PG와 다른 새 값 사용 |
| C1-GF | Grafana | C1-PG와 같은 13자; admin login 5자 | 컨테이너 env, SQLite DB, API상 admin 1명·서비스계정 0 | 필수; C1-PG와 다른 새 값 사용 |
| C2 | 내부 서비스 인증 토큰 | `<REDACTED: 28자, a-z+symbol>` | 실행 중 14개 도메인 서비스, compose상 15개 서비스 | 필수; 모든 발신자·검증자 동시 전환 |
| C3 | Samhan/JWT 및 아로로지스 JWT | `<REDACTED: 64자, a-z+0-9+symbol>` | gateway/auth/partner-auth/arologis 4개 컨테이너 exact match | 필수; 기존 access token 전부 무효화 |
| C4-A | auth QA 기본 비밀번호 | `<REDACTED: 13자, A-Z+a-z+0-9+symbol>` | `auth_db.accounts` 12개 hash 일치: 활성 11, soft-deleted 1 | 필수(활성 11); deleted 계정은 복구 시 강제 reset |
| C4-B | auth QA MASTER 비밀번호 | `<REDACTED: 11자, A-Z+a-z+0-9+symbol>` | 활성 계정 16개 hash 일치 | 필수 |
| C4-C | 로컬 5-role seed 비밀번호 | `<REDACTED: 9자, A-Z+a-z+0-9>` | 활성 계정 5개 hash 일치 | 필수; `#1162` 이후 `QA_DEV_DEFAULT_PASSWORD`로만 공급 |
| C4-D | 아로로지스 admin 비밀번호 | `<REDACTED: 9자, A-Z+a-z+0-9>` | `auth_admin_user` 3개 BCrypt hash 일치; active refresh 17개 | 필수; refresh token도 revoke |
| N1 | probe 전용 PostgreSQL 값 | `<REDACTED: 14자>` | `scripts/probe-896-s2-fresh-postgres.ps1:9`; 실행 때 새 일회용 컨테이너 생성 | 공유 스택 폐기 대상 아님 |
| N2 | Testcontainers 전용 값 | `<REDACTED: 17자>` | partner-auth Testcontainers 1곳; random ephemeral container | 공유 스택 폐기 대상 아님 |
| N3 | Testcontainers의 13자 고정값 | C1과 문자열은 같지만 Testcontainers 10곳 | 매 테스트의 격리 PostgreSQL container에만 주입 | 공유 스택 폐기 대상 아님 |
| N4 | CODEF 로컬 자격 | client id/secret 각 36자, public key 392자 | gitignored `services/accounting-service/.env`; git 이력 exact match 없음 | 이 개발 스택 사고의 폐기 대상 아님; vendor 판단 별도 |

C4-A 12개 + C4-B 16개 + C4-C 5개는 현재 `auth_db.accounts` 33개 전체를 정확히 분할한다. 이 중 활성·비삭제 계정은 32개다.

## 2. 위치 전수표 — 자격 × 위치축 1~9

`0`은 해당 축을 실제 조회했으나 현재 위치가 없다는 뜻이다. `—`는 그 시스템에 적용되지 않는 축이다.

| 자격 | 1 컨테이너 env | 2 compose | 3 gitignored env | 4 application 설정/상수 | 5 CI/GitHub | 6 테스트 | 7 스크립트 | 8 DB/영속 저장소 | 9 최초 count-change |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| C1-PG/RMQ/MINIO/GF 공통 13자 | 19개 컨테이너의 관련 binding | 2파일 14회 | `infrastructure/.env` 없음 | 설정 14파일 19회 + MinIO Java 상수 4곳 | 0 | 9파일 10회(Testcontainers, 비폐기) | 4파일 12회 | PG role 1, RMQ user 1, MinIO root 1, GF admin 1 | `75f9a6192`, 2026-05-04 |
| C2 내부 토큰 28자 | 14개 실행 컨테이너 | 1파일 1회(15서비스 anchor) | `infrastructure/.env` 없음 | 설정 12파일 14회 + source 13파일 14회 | 0 | Playwright 2파일 2회(공유 스택 호출) | exact live 값 0 | 서버 측 별도 DB 저장 없음 | `75f9a6192`, 2026-05-04 |
| C3 JWT 64자 | 4개 컨테이너 | 1파일 4회 | `infrastructure/.env` 없음 | 설정 1파일 1회 + Java 상수 4파일 4회 | 0 | 1파일 2회 | 0 | access token은 stateless; 아로 refresh hash 68행 중 active 17 | `f3cb3060b`, 2026-05-14 |
| C4-A QA 13자 | 0 | 0 | `.env.local` 2개 password key가 같은 group | plaintext 설정 0; source BCrypt hash 일치 다수 | `.gitguardian.yaml` 5회 | V48/V49 seed IT hash | QA credential helper가 읽음 | auth 12(활성 11, deleted 1) | `76dfbe988`, 2026-05-11 |
| C4-B QA 11자 | 0 | 0 | `.env.local` 3개 password key가 같은 group | plaintext 설정 0 | `.gitguardian.yaml` 2회 | fixture/DB hash 검증 | QA credential helper가 읽음 | auth 활성 16 | `75f9a6192`, 2026-05-04 |
| C4-C seed 9자 | 0 | 0 | 현재 `.env.local`에는 별도 key 없음 | plaintext 설정 0 | 0 | 0 | `seed-local-stack.ps1` 5회 | auth 활성 5 | `5ac044579`, 2026-05-22 |
| C4-D 아로 admin 9자 | 0 | 0 | `.env.local` 1개 | V9 seed BCrypt hash 1, hash-gen test 1 | 0 | hash-gen test 1 | QA helper가 읽음 | admin 3, refresh 68/active 17 | `f3cb3060b`, 2026-05-14 |
| N1 probe 14자 | 일회용 실행 시에만 | 0 | 0 | 0 | 0 | probe 자체 | 1파일 1회 | 실행 시 일회용 DB | `ebf9737c9`, 2026-07-29 |
| N2 TC 17자 | 일회용 실행 시에만 | 0 | 0 | 0 | 0 | 1파일 1회 | 0 | 일회용 DB | `4d28804cb`, 2026-05-05 |

### 2.1 축 1 — 24개 컨테이너 환경변수

조회 명령:

```powershell
$names = docker ps -a --filter 'name=samhan-' --format '{{.Names}}'
foreach ($name in $names) {
  # docker inspect JSON을 메모리에서 파싱하고 값은 길이와 equality group만 출력
}
```

마스킹 출력 원문 요약:

```text
CONTAINERS_INSPECTED=24
running=22 exited=2
STACK_DB(13): postgres 1 + grafana 1 + minio 1 + rabbitmq 1 + domain service DB/RABBIT bindings
INTERNAL(28): accounting, arologis, auth, dashboard, dc-config, groupware,
              inventory, notification, partner-auth, partner-order, partner,
              product, slip, user = 14 containers
JWT_AUTH(64): api-gateway, auth, partner-auth, arologis = 4 containers
no sensitive binding: elasticsearch, eureka, nginx, prometheus, redis
```

재시작 영향:

- PostgreSQL/RabbitMQ: 현재 실행 중 14개 도메인 서비스. 후보 compose에는 현재 없는 `logging-service`까지 15개 consumer가 있다.
- MinIO: 실제 코드 consumer는 groupware, inventory, partner, slip의 storage 구현 4곳이며 dashboard notice 설정도 있다. 후보 compose가 15개 서비스에 S3 key를 공급하므로 중간 누락 방지를 위해 실행 중인 도메인 서비스 전부를 후보 설정으로 재생성한다.
- JWT: 실제 consumer 4개를 같은 유지보수 창에서 재생성한다.
- internal token: 14개 실행 consumer/validator를 모두 멈춘 뒤 새 값으로 재생성한다.

### 2.2 축 2 — compose 7개 변종

구조 조회는 PyYAML로 `services.*.environment`를 파싱했다. `!override`가 있는 portfix도 custom loader로 읽었다.

```text
infrastructure/docker-compose.yml                 services=8   credential bindings=8
infrastructure/docker-compose.local-all.yml       services=18  credential bindings=93
infrastructure/docker-compose.local-portfix.yml   services=1   credential bindings=0  (untracked 사용자 파일)
infrastructure/docker-compose.no-host-ports.yml   services=2   credential bindings=0
infrastructure/docker-compose.prod.yml            services=19  credential bindings=163, 모두 placeholder/secret 참조
infrastructure/docker-compose.slip-port-override.yml services=2 credential bindings=0
infrastructure/docker/docker-compose.arologis.yml services=1   credential bindings=6, 모두 placeholder
COMPOSE_FILES_PARSED=7
```

현재 main의 runtime literal 원문은 다음처럼 마스킹된다.

```text
infrastructure/docker-compose.yml:41  POSTGRES_PASSWORD=<REDACTED:STACK13>
:81  RABBITMQ_DEFAULT_PASS=<REDACTED:STACK13>
:138 MINIO_ROOT_PASSWORD=<REDACTED:STACK13>
:185 GF_SECURITY_ADMIN_PASSWORD=<REDACTED:STACK13>

infrastructure/docker-compose.local-all.yml:22 DB_PASSWORD=<REDACTED:STACK13>
:28 RABBIT_PASSWORD=<REDACTED:STACK13>
:31 SAMHAN_INTERNAL_TOKEN=<REDACTED:INTERNAL28>
:110,:141,:459 SAMHAN_JWT_SECRET=<REDACTED:JWT64>
:391,:429,:489,:521,:557,:589,:624 service-specific DB password=<REDACTED:STACK13>
:628 SAMHAN_AROLOGIS_JWT_SECRET=<REDACTED:JWT64>
```

후보 브랜치는 base compose의 8개 provider binding과 local-all의 DB 15, Rabbit 15, internal token 15, S3 15, JWT 실제/예방 binding을 `${...}`로 바꾼 상태다.

### 2.3 축 3 — gitignored `.env` 계열

첫 재귀 탐색은 30초 timeout이 났다. `rg --files -uu`와 build/node_modules/worktree 제외 glob으로 재실행했다.

```text
ENV_FILE_COUNT=24
tracked example/template=22
gitignored actual=2
  infrastructure/.env.local              keys=10
  services/accounting-service/.env       keys=5
infrastructure/.env                      존재하지 않음
```

값을 출력하지 않은 실제 key/길이:

```text
infrastructure/.env.local
  QA_DEV_DEFAULT_PASSWORD 13
  QA_MASTER_PASSWORD 11
  QA_DEV_MANAGER_PASSWORD 13
  QA_KIMGICHEOL_PASSWORD 11
  QA_KIMEUNJI_PASSWORD 11
  QA_AROLOGIS_ADMIN_PASSWORD 9
  login id 4개: 11,10,8,5

services/accounting-service/.env
  CODEF_CLIENT_ID 36
  CODEF_CLIENT_SECRET 36
  CODEF_PUBLIC_KEY 392
  CODEF_BASE_URL 28
  CODEF_SUBMIT_METHOD 7
```

`infrastructure/.env`가 없으므로 `#1162` helper를 그대로 실행하면 121~124행이 컨테이너의 기존 C1 값을 가져와 승계한다. 컨테이너가 `exited`여도 `docker inspect`는 성공하므로 단순 stop은 방지가 아니다.

### 2.4 축 4 — application 설정과 상수

Spring multi-document YAML을 `safe_load_all`로 19파일 모두 구조 파싱했다. 첫 단일-document 파서는 다음 원문으로 실패했고 결과에 사용하지 않았다.

```text
ComposerError: expected a single document in the stream ... but found another document
```

최종 출력:

```text
APPLICATION_FILES_PARSED=19
C1 exact: application config 14파일 19회
C2 exact: application config 12파일 14회
C3 exact: application config 1파일 1회
```

C1 설정 파일 전수:

```text
accounting, arologis, auth, dashboard, dc-config, groupware, inventory,
logging, notification, partner-order, partner, product, slip, user
각 service의 src/main/resources/application.yml
```

C1 애플리케이션 상수 전수:

```text
services/groupware-service/.../MinioApprovalAttachmentStorage.java
services/inventory-service/.../MinioInspectionAttachmentStorage.java
services/partner-service/.../MinioAttachmentStorage.java
services/slip-service/.../MinioSlipAttachmentStorage.java
```

C2 설정 12파일은 accounting, arologis, auth, dashboard, groupware, inventory, notification, partner-auth, partner, product, slip, user다. 추가 source consumer는 estimate-app의 `code.js`, `db-catalog.js`, `directory.js`, `slip-bridge.js`와 shared security guard/properties다.

C3 상수 consumer 전수:

```text
services/api-gateway/.../JwtProperties.java
services/auth-service/.../JwtIssueProperties.java
services/partner-auth-service/.../PartnerAuthJwtProperties.java
services/arologis-service/.../ArologisJwtProperties.java
```

### 2.5 축 5 — CI / GitHub Actions

12개 파일을 YAML 구조로 읽고 `${{ secrets.* }}` / `${{ vars.* }}`를 별도 수집했다.

```text
GITHUB_FILES_PARSED=12
hardcoded C1/C2/C3/C4 value=0
referenced names:
  AROLOGIS_EC2_HOST, AROLOGIS_EC2_KEY, AROLOGIS_EC2_USER,
  CAFE24_HOST, CAFE24_SSH_KEY, CAFE24_USER,
  CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, GITHUB_TOKEN
```

GitHub 저장소 측 조회 원문:

```text
gh secret list --repo ewoo14/Samhan-Public --app actions
CLAUDE_CODE_OAUTH_TOKEN  2026-05-22T01:40:42Z

gh api repos/ewoo14/Samhan-Public/environments
github-pages

github-pages environment secret/variable=0
repository variable=0
```

GitHub secret 값은 API 설계상 조회할 수 없다. 위 이름들은 개발 스택 C1~C4와 결선되어 있지 않으므로 이번 rotation 대상이 아니다.

### 2.6 축 6 — 테스트 코드

정규식만으로 판정하지 않고 exact live equality와 `PostgreSQLContainer.withPassword(...)` 구조를 함께 확인했다.

```text
STACK13 exact: 9 test files, 10 occurrences
INTERNAL28 exact: Playwright 2 files, 2 occurrences
JWT64 exact: ArologisJwtPropertiesTest 1 file, 2 occurrences
TESTCONTAINER_FIXED_PASSWORD_BINDINGS=11
  C1과 같은 13자: 10
  독립 17자: 1
```

13자 Testcontainers 위치:

```text
accounting AbstractPostgresIT, PartnerCodeWidthUpgradeIT
auth AbstractPostgresIT
inventory AbstractPostgresIT
product AbstractPostgresIT, Issue1096ProductCleanupMigrationIT(2), PriceChangeScheduleMigrationIT
slip AbstractPostgresIT
user AbstractPostgresIT
```

이 값들은 일회용 컨테이너의 bootstrap credential이라 공유 개발 스택 폐기 대상이 아니다. 반면 Playwright 2곳의 C2 fallback은 공유 실행 스택을 호출하므로 rotation 뒤 환경변수 공급 없이는 실패한다.

### 2.7 축 7 — 스크립트

```text
SCRIPT_FILES_SCANNED=109
SCRIPT_FILES_WITH_CREDENTIAL_CONTEXT=20
```

실행값 exact 위치:

```text
C1 infrastructure/scripts/setup-minio-buckets.ps1:37,57,251,254
C1 infrastructure/scripts/start-local-full.ps1:328,557,558,559
C1 scripts/launch-local-stack.ps1:175,177
C1 scripts/launch-local-stack.sh:109,111
C4-C scripts/seed-local-stack.ps1:104~108
N1 scripts/probe-896-s2-fresh-postgres.ps1:9
```

후보 브랜치 helper의 핵심 원문:

```text
30~38   RNG 24 bytes -> 48 hex characters
80~95   secretKeys/requiredKeys 21개
121~124 기존 postgres/rabbit/minio/grafana 컨테이너 env 조회
126~129 기존 값이 없을 때만 새 값 생성
131~154 internal/JWT 새 생성, provider 값 mapping
179~180 infrastructure/.env 쓰기
```

따라서 rotation은 helper의 자동 생성 경로가 아니라, 운영자가 새 21키를 완성한 `.env.next`를 먼저 만든 뒤 검증하고 `.env`로 전환해야 한다.

### 2.8 축 8 — DB와 바이너리 영속 설정

PostgreSQL 20개 DB의 catalog를 조회했다. column 이름 검색 외에도 `pg_views`, `pg_matviews`, `pg_proc`, `pg_trigger`, `bytea`, large object를 구조적으로 검사했다.

첫 query의 실패 원문과 수정:

```text
ERROR: ORDER BY position 2 is not in select list
ERROR: "array_agg" is an aggregate function
```

`ORDER BY table_schema...`로 수정하고 `pg_proc.prokind in ('f','p')`로 aggregate를 제외해 전 DB를 다시 조회했다.

최종 원문 요약:

```text
PostgreSQL role:
  <REDACTED:6자 role>|canlogin=t|super=t|createdb=t|createrole=t|validuntil=never|SCRAM-SHA-256(len=133)
databases=20, owner 전부 동일 role

credential-like columns:
  arologis_db.auth_admin_user.password_hash
  arologis_db.auth_refresh_token.token_hash
  auth_db.accounts.password_hash/password_history/password_reset_token
  auth_db.password_reset_tokens.token_hash
  partner_auth_db.partner_auth.password_hash/password_history
  notification_db.push_device_tokens.token
  product_db.ecount_alias_reservations.reservation_token
  slip_db.delivery_batches.batch_token, slips.signature_share_token/claim_token
  user_db.employee_signature_handoff_token.token

view definition matches=0
materialized view definition matches=0
function body matches=0
trigger definition matches=0
large object count=0 in every DB
bytea는 서명/도장/이미지 열뿐
```

DB row 실측:

```text
auth_db.accounts=33, not_deleted=32, enabled_not_deleted=32, bcrypt len=60
  C4-A matches=12 (active 11, deleted 1)
  C4-B matches=16 (active 16)
  C4-C matches=5  (active 5)
arologis_db.auth_admin_user=3, all BCrypt len=60, C4-D matches=3
arologis_db.auth_refresh_token=68, active/unexpired=17, token_hash len=44
partner_auth_db.partner_auth=2, delegated bcrypt-format len=68, C4 그룹 match=0
```

RabbitMQ:

```text
users: <REDACTED:6자 user> [administrator]
vhosts: /
permissions: <REDACTED:6자 user> .* .* .*
```

MinIO:

```text
volume=infrastructure_minio_data -> /data
buckets=partner-attachments, slip-attachments
additional IAM users=0
service accounts=0
binary config: /data/.minio.sys/**/xl.meta
```

Grafana:

```text
volume=infrastructure_grafana_data -> /var/lib/grafana
grafana.db size=1,118,208 bytes
/api/health database=ok, version=11.3.1
users=1 (login length 5, admin=true, disabled=false)
service accounts=0
```

52개 tracked BCrypt hash도 실제 C4 평문 후보와 offline 비교했다. 32개 hash occurrence가 노출 그룹과 일치했다. 특히 다음 forward-only seed가 fresh DB에서 폐기값을 되살릴 수 있다.

```text
auth V48__seed_driver_staff_dispatch_dev_accounts.sql:31,43,55
auth V49__repair_v5_dev_account_hashes.sql:22
arologis V9__seed_arologis_master.sql:16
관련 seed IT와 QA evidence의 동일 hash 사본
```

### 2.9 축 9 — git 이력 최초 등장

명령은 값을 메모리 변수로만 넘기고 출력은 commit metadata만 남겼다.

```powershell
git log origin/main --no-textconv --reverse -S '<메모리 값>' --format='%H|%aI|%s' --
```

출력 원문:

```text
C1 13자  75f9a6192037af458d728285d8d244980555177f | 2026-05-04
C2 28자  75f9a6192037af458d728285d8d244980555177f | 2026-05-04
C3 64자  f3cb3060ba00a2cd1254fc3a791b3e3e6bdd3cb0 | 2026-05-14
C4-A 13자 76dfbe98854b10f02b0fd83c81abebdee0b293b6 | 2026-05-11
C4-B 11자 75f9a6192037af458d728285d8d244980555177f | 2026-05-04
C4-C 9자  5ac0445794b2c59d2ecaa48d14cb39aed6256b09 | 2026-05-22
C4-D 9자  f3cb3060ba00a2cd1254fc3a791b3e3e6bdd3cb0 | 2026-05-14
N1 14자   ebf9737c9b74ca765f447077cab3bce9c18dfe59 | 2026-07-29
N2 17자   4d28804cbeac20857928bddcaf26f5ce01cc9a52 | 2026-05-05
CODEF client id/secret/public key exact history match=NONE
```

15개 값을 `--all`로 한 번에 순차 조회한 시도는 124초 timeout이었다. 위 최종 결과는 `origin/main`, `--no-textconv`, 6-way 병렬로 각 값을 다시 조회해 모두 exit 0을 확인한 것이다.

## 3. 자격별 단절 영향

| 자격 | 먼저 바꿀 때 끊기는 것 | 재시작/재발급 |
|---|---|---|
| PostgreSQL | 새 connection을 여는 14개 실행 서비스; logging 재기동 시 추가 | 실행 중 domain 서비스 14개 재생성. DB server는 `ALTER ROLE` 자체로 재시작 불필요하나 env metadata 일치를 위해 후보 compose로 재생성 |
| RabbitMQ | consumer reconnect·publisher 연결; 기존 TCP 연결은 잠시 살아 혼합 상태를 숨길 수 있음 | domain 서비스 14개 재생성, 기존 connection 0 확인. broker env metadata도 후보 compose로 재생성 |
| MinIO | attachment upload/download/presign 4개 구현과 notice storage | MinIO 재생성 필수. 관련 consumer를 포함해 실행 domain 서비스 전부 후보 설정으로 재생성 |
| Grafana | admin 새 로그인 | password API/CLI로 SQLite의 실제 hash 변경. Grafana 재생성 뒤 새 로그인 확인 |
| 내부 토큰 | 서로 다른 시점에 뜬 서비스 간 모든 `/internal/**` RPC | 발신자·validator 14개를 모두 멈춘 뒤 같은 새 값으로 재생성; gateway는 마지막 시작 |
| JWT | old access token, gateway/auth/partner-auth/arologis 서명·검증 | 4개 실제 consumer 동시 전환. access token 재발급/재로그인 필요 |
| auth QA 계정 | old QA 자동화 로그인 | 활성 32개 password 변경, `.env.local` 갱신. JWT rotation으로 기존 세션도 무효화 |
| Arologis admin | admin login 3개, active refresh 17개 | password hash 3개 변경 + refresh 17개 revoke + 재로그인 |

## 4. 실행 순서 런북

### 단계 0 — 유지보수 승인과 정본 고정

1. RAM을 다시 측정한다. `<1.0GB`면 중단한다.
2. 다른 두 트랙 담당자에게 공유 스택 중단 시간을 확정한다.
3. 다음 read-only 값이 다르면 중단한다.

```text
main=3dc78fc88
rotation candidate=35c9f41b9
samhan container count=24
PostgreSQL role count=1
RabbitMQ user count=1
MinIO additional user/service account=0/0
Grafana admin/service account=1/0
```

4. DB별 row count와 Docker volume 이름을 기록하고 backup을 만든다. backup에는 자격 평문을 넣지 않는다.
5. 현재 old 값과 새 값을 console에 출력하지 않는 메모리 map으로 읽는다. new 값끼리 및 old 값과의 equality가 전부 false인지 길이만 출력해 확인한다.

되돌리기: 아직 변경이 없으므로 유지보수 창을 해제한다.

### 단계 1 — 새 자격 파일 두 벌을 먼저 준비

후보 worktree `.claude/worktrees/w1162`에서 다음을 준비한다.

- `infrastructure/.env.next`: helper의 requiredKeys 21개를 모두 채운다.
- `infrastructure/.env.rollback`: 현재 provider/runtime 값. 현재 사용자만 읽을 수 있게 ACL을 제한한다.
- `infrastructure/.env.local.next`: C4-A/B/C/D의 새 값과 필요한 login id를 채운다.

필수 규칙:

- C1-PG, C1-RMQ, C1-MINIO, C1-GF를 서로 다른 48자 이상 random 값으로 만든다.
- C2와 C3도 서로 다른 48자 이상 random 값으로 만든다.
- C4는 애플리케이션 password policy를 통과하는 새 값으로 만든다.
- 파일의 key 집합·길이·placeholder 부재만 출력한다.
- `Initialize-SamhanLocalEnv` 자동 생성은 호출하지 않는다. 121~124행 승계 경로 때문이다.

검증:

```text
required key count=21
missing=0
placeholder=0
new-vs-old equality=0
new provider cross-equality=0
```

되돌리기: `.next` 파일만 보안 삭제하고 변경 전 상태로 끝낸다.

### 단계 2 — 후보 이미지 사전 build

서비스 중단 전에 exact SHA `35c9f41b9`의 provider-placeholder 결선과 application fallback 제거가 들어간 이미지를 build한다. 이때 현재 실행 컨테이너에는 손대지 않는다.

검증:

- compose 구조상 C1/C2/C3 binding이 모두 `${...}`인지 확인한다.
- image label/digest를 기록한다.
- build 중 C1~C4 문자열이 새 image layer에 남지 않았는지 값 비공개 scanner로 확인한다.

되돌리기: 새 image를 사용하지 않고 유지보수 창을 종료한다. image 삭제는 별도 정리 작업으로 둔다.

### 단계 3 — 사용자/시드 자격부터 폐기

이 단계는 기존 auth/JWT가 정상일 때 수행한다.

1. `auth_db.accounts`의 활성 32개를 C4-A/B/C 그룹별로 분류한다. login id는 실행 메모리에서만 다룬다.
2. 각 계정으로 기존 password login 후 지원 endpoint `POST /auth/password/change`를 호출해 새 group password로 바꾼다.
3. C4-A의 soft-deleted 1개는 현재 인증 불가 상태를 유지하고, 향후 restore 절차에 `password reset required`를 강제하는 표식을 남긴다.
4. 아로로지스 admin 3개는 password-change API가 없으므로 단일 DB transaction에서 새 BCrypt hash로 갱신한다. 같은 transaction에서 해당 admin의 active refresh token 17개를 revoke하고 audit field를 갱신한다.
5. `.env.local.next`를 실제 `.env.local`로 전환한다.

검증:

- 새 password로 대표 account login 200.
- old C4-A/B/C/D password login은 전부 401/403.
- DB의 32 active auth hash와 3 admin hash를 offline verify했을 때 old group match=0.
- active Arologis refresh token=0. rotation 직후 새 login으로 생긴 token은 별도 구분한다.

되돌리기:

- **노출된 old password로 되돌리지 않는다.** 실패 계정은 password reset 또는 두 번째 새 값으로 복구한다.
- `.env.local`만 잘못 전환했다면 DB에 실제 반영된 새 값과 일치하도록 파일을 고친다.

### 단계 4 — ingress와 모든 credential consumer 정지

순서:

1. `api-gateway`를 먼저 멈춰 새 외부 요청을 차단한다.
2. 실행 중인 14개 domain service를 모두 멈춘다.
3. `logging-service`는 원래 없으므로 새로 시작하지 않는다. 다만 후보 `.env` 결선은 검증한다.
4. PostgreSQL `pg_stat_activity`에 application connection 0, RabbitMQ connection 0이 될 때까지 확인한다.
5. eureka, PostgreSQL, RabbitMQ, MinIO, Grafana, Redis, Elasticsearch는 이 시점까지 유지한다.

검증: DB/Rabbit consumer connection=0, gateway port 비수락, provider health 정상.

되돌리기: provider state를 아직 바꾸지 않았다면 old compose로 consumer와 gateway를 다시 시작한다.

### 단계 5 — 영속 provider 자격 변경

소비자가 0인 상태에서 다음 순서로 한다.

1. PostgreSQL: 컨테이너 내부 local admin session의 interactive `\password <REDACTED:6자 role>`로 C1-PG를 변경한다. 실제 role은 container env에서 메모리로 읽고 password를 shell argument나 SQL log에 넣지 않는다.
2. RabbitMQ: management API의 localhost HTTPS/HTTP body로 C1-RMQ를 변경한다. `rabbitmqctl change_password ... <값>`처럼 process argument에 값을 노출하지 않는다.
3. Grafana: authenticated password-change API로 SQLite의 실제 admin hash를 C1-GF로 변경한다. `GF_SECURITY_ADMIN_PASSWORD`만 바꾸는 것은 rotation이 아니다.
4. 후보 worktree의 `.env.next`를 `infrastructure/.env`로 원자 전환한다.
5. PostgreSQL, RabbitMQ, Grafana를 후보 compose로 재생성해 container env metadata와 이미 변경한 영속 hash를 맞춘다.
6. MinIO를 후보 compose로 재생성한다. 현재 추가 IAM user/service account가 없으므로 새 root/S3 secret이 이 재시작에서 활성화된다.

각 provider 직후 검증:

- new credential positive test 성공.
- old credential로 **새 connection**을 만들면 실패.
- 기존 connection이 0이라 old connection이 살아 성공을 위장하지 않음.

되돌리기:

- consumer를 계속 정지한 상태로 둔다.
- new credential로 provider 관리 endpoint에 접속해 rollback 값을 복원하고 `.env.rollback`을 `.env`로 되돌린 뒤 provider를 재생성한다.
- old 노출값을 다시 살리는 emergency rollback이므로 보안 게이트는 실패 상태로 남고, 같은 유지보수 창에서 새 값으로 다시 시도한다.

### 단계 6 — 새 C2/C3로 domain service 재생성

provider positive/old-negative 검증이 모두 끝난 뒤 시작한다.

1. auth, partner-auth, arologis, user, dc-config, partner를 후보 image와 새 `.env`로 시작한다.
2. 나머지 실행 대상 domain service를 시작한다.
3. 각 service가 새 DB/Rabbit/MinIO/internal/JWT 값을 가진 컨테이너인지 값 없이 key length/equality group만 확인한다.
4. 모든 domain health가 green이 된 뒤 `api-gateway`를 마지막에 시작한다.
5. 원래 없던 `logging-service`와 원래 종료된 nginx/prometheus를 이 작업 때문에 새로 올리지 않는다.

중간에 한 서비스라도 old C1/C2/C3 group을 가지면 gateway를 열지 않고 전체 domain consumer를 다시 정지한다.

되돌리기: 단계 5의 provider rollback을 먼저 하고, `.env.rollback`으로 원래 실행 대상만 재생성한다. 일부 서비스만 old 값으로 되돌리는 혼합 상태는 금지한다.

### 단계 7 — 폐기와 기능 회귀 검증

다음은 모두 통과해야 한다.

1. Docker:
   - preflight와 같은 container topology.
   - 실행 대상 전부 healthy.
   - 24개 env inspect에서 old C1/C2/C3 exact match=0.
2. PostgreSQL:
   - new credential로 20개 DB `SELECT 1`.
   - old credential new connection 실패.
   - Flyway validate 및 대표 read/write transaction rollback.
3. RabbitMQ:
   - new credential connection/publish/consume 성공.
   - old credential new connection 실패.
   - service connection이 모두 새 재연결이고 orphan connection=0.
4. MinIO:
   - new credential로 2개 bucket list 성공.
   - disposable object upload/download/delete 성공.
   - old credential list 실패.
5. Grafana:
   - `/api/health` 200.
   - new admin `/api/user` 200, old admin 401.
   - users=1, service accounts=0 유지.
6. internal token:
   - new token으로 대표 `/internal/**` endpoint 200.
   - old token과 token 누락은 401/403.
   - 대표 service-to-service RPC가 정상.
7. JWT:
   - pre-rotation access token은 gateway와 arlogin protected endpoint에서 실패.
   - 새 auth login·partner login·arologis admin login이 새 token을 받고 protected endpoint 200.
   - Arologis old refresh token 실패.
8. 계정:
   - C4 old password group 4개 모두 login 실패.
   - QA helper가 `.env.local`의 새 값으로 대표 MASTER/MANAGER/STAFF/DRIVER/admin login 성공.
9. 전체 기능:
   - attachment upload/download, 전표 조회, 파트너 lookup, 알림, dashboard KPI, Rabbit event를 smoke한다.
   - `#1162` 후보의 CI/IT와 local credential scanner를 exact SHA로 통과시킨다.

### 단계 8 — 성공 확정과 `#1162` merge gate

1. `.env.rollback`과 메모리의 old 값 사본을 폐기한다.
2. 새 `.env`, `.env.local`은 gitignored 상태와 ACL을 확인한다.
3. old C1~C4 값으로 container/DB/API에 새 인증이 하나도 성공하지 않는다는 negative 결과를 남긴다. 값 자체는 남기지 않는다.
4. fresh DB가 V48/V49/V9 hash를 통해 old QA password를 되살리지 않도록 §7의 companion 조치를 먼저 확정한다.
5. 개발책임자에게 rotation evidence와 `#1162` exact SHA CI green을 제시한다.
6. 개발책임자 merge trigger 후에만 `#1162`를 merge한다.

## 5. 단계별 검증·되돌리기 요약

| 단계 | 정상 판정 | 되돌리기 |
|---|---|---|
| 0 정본 | SHA/topology/count 일치 | 무변경 종료 |
| 1 파일 | 21키, placeholder 0, equality 0 | `.next` 폐기 |
| 2 build | candidate image에 runtime literal 0 | image 미사용 |
| 3 계정 | old login 0, new login 성공, old hash match 0 | old 복원 금지; 두 번째 새 값/reset |
| 4 정지 | DB/Rabbit app connection 0 | old stack 재시작 |
| 5 provider | provider별 new 성공/old 실패 | consumer 정지 유지 후 전체 provider+env 일괄 rollback |
| 6 service | 전 health green, mixed group 0 | gateway 미개방, 전체 consumer 정지 후 단계 5 rollback |
| 7 회귀 | provider/internal/JWT/account negative+positive 전부 통과 | 성공 확정 금지; 문제 축만 새 값으로 재시도 |
| 8 완료 | rollback 사본 폐기, fresh-seed resurrection 차단 | merge하지 않고 blocker 유지 |

## 6. 폐기 대상이 아닌 것

1. N1 14자 probe DB 값: `docker run --rm` 성격의 fresh PostgreSQL probe에만 쓰며 현재 20개 DB/role과 연결되지 않는다.
2. N2 17자 Testcontainers 값: partner-auth IT의 random ephemeral container 전용이다.
3. Testcontainers의 C1 동일 13자 10곳: 문자열은 같아도 격리 컨테이너 bootstrap에만 쓰므로 공유 provider password rotation과 무관하다. `#1162`의 source cleanup 대상일 수는 있다.
4. 단위/Mock 테스트의 `test-internal-token`, `wrong-token`: 실제 C2와 exact match가 아니며 인증 분기 fixture다.
5. CODEF 로컬 자격: gitignored 파일에만 있고 exact `git log -S` 결과가 없다. 외부 vendor credential rotation은 비용·운영 영향 때문에 별도 결정이다.
6. GitHub Actions의 배포 secret과 자동 `GITHUB_TOKEN`: C1~C4와 결선되지 않았다.
7. Redis/Elasticsearch/Eureka: 현재 인증 자격이 설정되지 않았으며 이번 노출값과 exact match가 없다. 인증 미설정 자체의 보안 평가는 별도다.

## 7. 개발책임자 판단이 필요한 것

### J1. fresh DB seed hash 재생성 차단 — 필수 blocker

현재 V48/V49/V9 및 관련 seed hash가 노출 C4 값과 검증상 일치한다. runtime DB만 바꾸면 fresh rebuild가 old password를 되살린다.

권고안:

- `#1162`에 companion forward migration 또는 local-only post-seed bootstrap을 추가한다.
- immutable 과거 migration은 수정하지 않는다.
- forward migration은 노출 hash 계정을 unusable random hash + password-change-required로 만든다.
- 로컬 QA 계정은 gitignored `QA_DEV_DEFAULT_PASSWORD` / `QA_MASTER_PASSWORD` / `QA_AROLOGIS_ADMIN_PASSWORD`로 명시 bootstrap한다.

이 차단책 없이 “rotation 완료” 판정을 내리지 않는 것을 권고한다.

### J2. auth 계정 32개의 새 비밀번호 배분

권고안은 현재 자동화 계약을 보존해 C4-A/C 16개를 새 `QA_DEV_DEFAULT_PASSWORD`, C4-B 16개를 새 `QA_MASTER_PASSWORD`로 나누는 것이다. 계정별 unique password는 더 강하지만 현 QA harness가 모든 계정별 secret key를 갖지 않아 별도 설계가 필요하다.

### J3. soft-deleted auth 계정 1개

현재는 인증 불가라 old password가 이미 죽어 있다. 복구 시 password reset을 강제할지, 이번 rotation transaction에서 unusable hash로 바꿀지 결정이 필요하다. 권고는 후자다.

### J4. 실운영·회사PC·다른 공유환경

이 PC의 개발 스택만 실측했다. 같은 C1~C4 값이 회사PC, 원격 공유 개발환경, production에 쓰이는지는 알 수 없다. 하나라도 같다면 해당 환경을 별도 maintenance window로 즉시 rotation해야 한다.

### J5. MinIO root와 애플리케이션 access key 분리

후보 helper는 `SAMHAN_S3_ACCESS_KEY`를 root user와 같게, S3 secret을 root password와 같게 만든다. 이번 긴급 폐기는 이 계약대로 실행 가능하지만, 후속으로 bucket별 최소권한 service account를 만드는 것을 권고한다. 현재 service account가 0이라 이번에 함께 설계하면 범위가 커진다.

## 8. 못 센 것 / 판정 불가

1. GitHub secret **값**: API는 이름·갱신시각만 제공한다. org-level secret의 값 및 선택 repository policy도 현재 repository 권한으로 볼 수 없다.
2. 다른 PC/원격/production의 live equality: 접근하지 않았으므로 판정 불가다.
3. Grafana SQLite의 password hash algorithm/직접 token table: container에 `sqlite3`와 `file`이 없다. 실패 원문:

```text
sh: file: not found
```

API로 user 1·service account 0·새/old login은 검증할 수 있으나 DB hash 원문은 읽지 않았다.

4. MinIO `xl.meta` binary 내부 원문: grep하지 않았다. 첫 명령 실패 원문은 다음과 같다.

```text
sh: line 1: sed: command not found
```

`mc admin user list`와 `mc admin user svcacct list`를 root env alias로 재실행해 추가 user 0·service account 0을 확인했다. binary 파일 자체는 rotation 후에도 admin API와 negative auth로 검증한다.

5. `logging-service` live env: compose에는 있으나 24개 컨테이너 목록에 해당 컨테이너가 없다. 후보 결선은 셌지만 실행값은 셀 수 없었다.

6. GitGuardian dashboard 내부 validity/fingerprint는 선행 정찰과 동일하게 권한이 없다. 이는 runtime rotation 필요성 판정에는 영향이 없다.

## 9. 조사 실패 원문과 보정 기록

결론에 쓰지 않은 실패를 재현 가능하게 남긴다.

```text
# .env 재귀 Get-ChildItem
command timed out after 30019 milliseconds
-> rg --files -uu + 제외 glob으로 24파일 재계수

# Spring YAML 단일 문서 parser
ComposerError: expected a single document in the stream ... but found another document
-> yaml.safe_load_all로 19파일 재계수

# RabbitMQ 최신 CLI column 문법 가정
Error (argument validation): too many arguments.
-> 설치 버전 문법 list_users/list_permissions로 재조회

# PostgreSQL catalog query
ERROR: ORDER BY position 2 is not in select list
ERROR: "array_agg" is an aggregate function
-> 명시 column ORDER BY + prokind f/p로 수정, 20 DB 재조회

# 전체 git ref 15값 순차 history scan
UnicodeEncodeError: 'cp949' codec can't encode character
command timed out after 124027 milliseconds
-> UTF-8 + origin/main + --no-textconv + 병렬 조회, 전부 exit 0
```

이 계획의 완료 조건은 “새 값이 동작한다”가 아니라 **old C1~C4로 새 인증이 모두 실패하고, fresh seed가 이를 되살리지 않으며, 그 뒤에 `#1162`가 merge되는 것**이다.
