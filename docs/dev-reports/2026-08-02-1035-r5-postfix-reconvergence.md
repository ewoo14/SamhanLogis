# PR #1048 머지 전 R5 postfix 재수렴 리뷰

- 대상: Issue #1035 / PR #1048
- 브랜치/HEAD: `fix/1035-warehouse-uuid-boot` / `dcad4f5ec563f61da9575d779d8cb55cd2b227d7`
- 검토 범위: 직전 fix `dcad4f5ec`가 새로 만든 README 및 `.env.dev-seed` 표면
- 실행 제약: production 코드 수정 없음, commit/push/checkout/브랜치 조작 없음, Docker 이미지 재빌드 없음, 합성 데이터 없음
- standalone 포트: `18390`; 검증 종료 후 프로세스와 listener를 정리함

## 1. 맨 상태 README 재현 결과

### 1.1 재현 절차

공유 PostgreSQL 컨테이너는 이미 healthy 상태였으므로 재생성하지 않았다. HEAD의 standalone jar를 먼저 만들고, 별도 PowerShell 자식 셸에서 `.env.dev-seed`에 있는 모든 키를 제거했다. 그 뒤 README 937~942행의 PowerShell 로더 로직을 그대로 실행하고, 사용자 제약에 따라 README의 `bootRun` 대신 같은 HEAD의 standalone jar를 `18390`에서 실행했다.

jar 생성 원문:

```text
> Task :services:slip-service:bootJar

BUILD SUCCESSFUL in 8s
17 actionable tasks: 1 executed, 16 up-to-date
```

환경변수 제거 직후 원문:

```text
=== BEFORE README LOAD (fresh child shell) ===
SPRING_PROFILES_ACTIVE=<UNSET>
WAREHOUSE_UUID_HQ=<UNSET>
WAREHOUSE_UUID_HUBAL=<UNSET>
WAREHOUSE_UUID_ANSEONG=<UNSET>
WAREHOUSE_UUID_CHANGWON=<UNSET>
```

README의 PowerShell 로더 실행 직후 원문:

```text
=== README POWERSHELL LOAD (lines 937-942 verbatim logic) ===
SPRING_PROFILES_ACTIVE=dev
WAREHOUSE_UUID_HQ=11111111-1111-1111-1111-000000000001
WAREHOUSE_UUID_HUBAL=11111111-1111-1111-1111-000000000002
WAREHOUSE_UUID_ANSEONG=11111111-1111-1111-1111-000000000003
WAREHOUSE_UUID_CHANGWON=11111111-1111-1111-1111-000000000004
```

standalone 실제 기동 원문:

```text
PID=46408 PORT=18390
HEALTH_STATUS=200 HEALTH_BODY=123 34 115 116 97 116 117 115 34 58 34 85 80 34 125
2026-08-02T21:41:53.634+09:00  INFO 46408 --- [slip-service] [           main] c.s.logis.slip.SlipServiceApplication    : The following 1 profile is active: "dev"
2026-08-02T21:42:04.402+09:00  INFO 46408 --- [slip-service] [           main] org.flywaydb.core.FlywayExecutor         : Database: jdbc:postgresql://localhost:5432/slip_db (PostgreSQL 16.14)
2026-08-02T21:42:04.639+09:00  INFO 46408 --- [slip-service] [           main] o.f.core.internal.command.DbValidate     : Successfully validated 62 migrations (execution time 00:00.161s)
2026-08-02T21:42:04.688+09:00  INFO 46408 --- [slip-service] [           main] o.f.core.internal.command.DbMigrate      : Schema "public" is up to date. No migration necessary.
2026-08-02T21:42:21.757+09:00  INFO 46408 --- [slip-service] [           main] o.s.c.n.e.s.EurekaServiceRegistry        : Registering application SLIP-SERVICE with eureka with status UP
```

PowerShell이 health 응답 본문을 byte array로 표시했지만 HTTP status는 `200`이다. `local`/H2가 아니라 `dev`/PostgreSQL/Flyway/Eureka 경로가 선택됐다.

기동 전후 실제 DB 계수 및 종료 원문:

```text
=== DB BEFORE ===
total_slips=2455
fallback_slips=1428
=== DB AFTER START ===
total_slips=2455
fallback_slips=1428
AFTER_CLEANUP_EXITED=True
AFTER_CLEANUP_LISTENERS=0
```

따라서 `.env.dev-seed`를 아직 export하지 않은 맨 상태의 개발자도 README에 적힌 로드 단계를 수행하면 UUID 4개를 얻고 실제 기동한다. 기동으로 새 전표가 추가되지 않았고 기존 fallback UUID 참조 1,428건도 그대로 보존됐다.

### 1.2 판정

**PASS.** 직전 라운드에서 우려한 원위치 회귀는 재현되지 않았다. README 자체가 Bash 경로에서는 `set -a` → `source .../.env.dev-seed` → `set +a`를, PowerShell 단계별 경로에서는 같은 파일의 대입을 process environment에 설정하도록 안내한다.

## 2. 기동 경로 11건 재집계

직전 R4의 분모와 순서를 바꾸지 않고 각 공급 파일을 HEAD에서 다시 판독했다.

| # | 진입점 / 구성 | HEAD에서 다시 확인한 입력 | R5 | R4 대비 |
|---:|---|---|---|---|
| 1 | README 기본 `:services:slip-service:bootRun` | README가 `.env.dev-seed`를 먼저 로드; dev UUID 4개 | PASS | 유지 |
| 2 | `start-local-full.ps1` | `.env.dev-seed` 파싱 후 `Start-Job`으로 slip-service 실행 | PASS | 유지 |
| 3 | `slip-service.env` export + bootRun/systemd | UUID 4개 존재 | PASS | 유지 |
| 4 | 명시적 `local` standalone/bootRun | `application.yml` local 문서의 고정 map 4개 | PASS | 유지 |
| 5 | `docker-compose.yml` + `docker-compose.local-all.yml` | local-all이 slip-service UUID 4개 전달 | PASS | 유지 |
| 6 | `scripts/launch-local-stack.ps1` | base + local-all compose 사용 | PASS | 유지 |
| 7 | `scripts/launch-local-stack.sh` | base + local-all compose 사용 | PASS | 유지 |
| 8 | #5 + `docker-compose.no-host-ports.yml` | slip-service overlay 유지 | PASS | 유지 |
| 9 | #5 + `docker-compose.slip-port-override.yml` | slip-service port overlay 유지 | PASS | 유지 |
| 10 | Terraform `user_data.sh` + `docker-compose.prod.yml` | user-data UUID 4개 → prod compose 환경 참조 4개 | PASS | 유지 |
| 11 | 수동 prod compose + 정상 `.env.production` | prod compose `--env-file` 경로 + `.env.example` UUID 4개 | PASS | 유지 |
| | **합계** | | **11/11** | **직전 11/11, 증감 0** |

재집계 하네스 원문:

```text
PATH=1 RESULT=PASS SOURCE=README + .env.dev-seed
PATH=2 RESULT=PASS SOURCE=start-local-full.ps1
PATH=3 RESULT=PASS SOURCE=slip-service.env
PATH=4 RESULT=PASS SOURCE=application.yml local profile
PATH=5 RESULT=PASS SOURCE=compose base + local-all
PATH=6 RESULT=PASS SOURCE=launch-local-stack.ps1
PATH=7 RESULT=PASS SOURCE=launch-local-stack.sh
PATH=8 RESULT=PASS SOURCE=compose + no-host-ports overlay
PATH=9 RESULT=PASS SOURCE=compose + slip-port override
PATH=10 RESULT=PASS SOURCE=Terraform user_data + prod compose
PATH=11 RESULT=PASS SOURCE=manual prod compose + .env.example
RECOUNT=11/11 PREVIOUS=11/11 DELTA=0
```

`196101760..HEAD`에서 11개 경로 관련 변경은 README, `.env.dev-seed`, 해당 회귀 테스트뿐이다. compose, launcher, systemd/env 및 Terraform/prod 공급 경로는 줄지 않았다.

## 3. `.env.dev-seed` 주석·값의 다른 서비스·스크립트 영향

### 3.1 유효 대입 비교

직전 11/11 fix 커밋 `196101760`의 파일과 HEAD 파일을 주석·빈 줄을 제외해 key/value로 다시 파싱했다.

```text
PRIOR_ASSIGNMENTS=31 HEAD_ASSIGNMENTS=31 ADDED=0 REMOVED=0 VALUE_CHANGED=0
WAREHOUSE_VALUES_EQUAL=True
```

즉 `dcad4f5ec`는 유효 환경변수 대입을 하나도 바꾸지 않았다. 추가한 창고 설명은 `#` 주석이며 README 로더와 `start-local-full.ps1` 모두 주석을 건너뛴다.

### 3.2 소비 표면

docs와 test를 제외한 `WAREHOUSE_UUID_*` 참조 파일은 8개였고, service main 설정 소비자는 다음 원문처럼 slip-service 1곳뿐이었다.

```text
CONSUMER_FILES_TOTAL=8
SERVICE_MAIN_CONSUMERS=1
.\services\slip-service\src\main\resources\application.yml
```

`start-local-full.ps1`가 환경을 15개 job에 상속시키지만 다른 service main 설정은 이 이름을 읽지 않는다. 스크립트 동작 변경도 없고, 다른 서비스에 직접 주입 의미가 생긴 곳도 없다.

### 3.3 판정

**PASS.** 새 주석은 로더에서 무시되고, 네 값은 직전 fix와 동일하다. 다른 서비스·스크립트의 유효 동작 변경은 확인되지 않았다.

## 4. 오주입 차단 유지 여부

production source에서 동일 canonical pattern을 기동 검증과 `resolve` 양쪽에 적용하는 것을 다시 확인했다.

```text
23:    private static final String CANONICAL_UUID_PATTERN =
54:            if (!configuredValue.matches(CANONICAL_UUID_PATTERN)) {
84:            if (!configuredValue.matches(CANONICAL_UUID_PATTERN)) {
```

Java 17 `String.matches`에 production pattern literal과 요청된 네 형식을 실행한 원문:

```text
FORM=SHORT MATCH=false RESULT=REJECT
FORM=SPACE MATCH=false RESULT=REJECT
FORM=BRACES MATCH=false RESULT=REJECT
FORM=NO_HYPHEN MATCH=false RESULT=REJECT
FORM=CANONICAL MATCH=true RESULT=ACCEPT
```

관련 README/기동 및 mapper 회귀 테스트도 fresh 실행했다.

```text
> Task :services:slip-service:test

BUILD SUCCESSFUL in 28s
18 actionable tasks: 18 executed
```

| 형식 | 결과 |
|---|---|
| 축약형 `1-1-1-1-1` | REJECT |
| canonical UUID 앞뒤 공백 | REJECT |
| `{canonical-uuid}` 중괄호 | REJECT |
| 하이픈 없는 32 hex | REJECT |
| canonical `8-4-4-4-12` | ACCEPT |

**PASS.** 네 오주입 차단은 기동 검증과 `resolve`에 모두 유지된다.

## 5. 최종 판정

**PASS — 이번 fix가 만든 새 표면에서 머지 차단 결함 0건.**

- 맨 상태 README 재현: 실제 standalone health 200, dev/PostgreSQL 16.14/Flyway 62/Eureka 확인
- 기동 경로: 11/11, 직전 대비 감소 0
- `.env.dev-seed` 영향: 유효 key/value 변경 0, 다른 service main 소비 0
- 오주입: 축약형·공백·중괄호·하이픈 생략 모두 REJECT
- 보존: 전표 `2455→2455`, fallback 참조 `1428→1428`
- 정리: PID 종료, `18390` listener 0

## 6. 이 라운드가 보지 않은 것

- `dcad4f5ec` 이전 production 로직과 기존 범위의 재리뷰
- 11개 경로의 서비스·컨테이너를 모두 실제로 동시에 기동하는 full-stack 실행; 이번 라운드는 각 구성의 입력 공급을 재집계하고 README 경로 1건만 standalone 실기동했다.
- 공유 스택의 Docker 이미지 재빌드·재기동·재생성
- README의 전체 `assemble` 및 저장소 전체 `test`; HEAD jar 생성과 지정 회귀 테스트만 실행했다.
- Bash/Linux 셸 자체의 `set -a; source; set +a` 실기동; Windows 개발자용 README PowerShell 로더를 실제 실행했다.
- 실제 production secret/Parameter Store의 UUID 값과 production 배포
- 다른 서비스의 전체 기능·성능·보안·UI·CI 전체 suite
- 기존 1,428건 전표가 생성된 과거 입력의 인과 추적
- PR merge, GitHub write, 수정안 설계 또는 코드 변경

## 7. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1035-r5-postfix-reconvergence.md`

기존 보고서는 덮어쓰거나 축약하지 않았다.
