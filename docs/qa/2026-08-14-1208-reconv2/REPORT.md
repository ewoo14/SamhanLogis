# PR #1208 머지 직전 재수렴 최종 검증 보고서 (SOL)

- 검증일: 2026-08-14 (Asia/Seoul)
- PR: `#1208` (`#1144` 회계전표)
- 브랜치: `feat/1144-accounting-slip-link`
- 검증 HEAD: `a51e2771ba955973722f21c9e8f6878ef9b4cb41`
- 정본: `docs/decisions/2026-08-14-accounting-slip-link-decisions.md`
- 판정: **도달 가능한 결함 0건**
- 안전 결과: 공유 DB 쓰기 0, 공유 스택 재배포 0, 합성 PNG 0, `docs/qa` 캡처 스크립트 0

## ① 환경 실측 원문

worktree `.git` 포인터와 ref 파일을 직접 읽고 `gh pr view 1208`의 원격 head와 대조했다. 금지된 git 명령은 사용하지 않았다.

```text
local_ref  = refs/heads/feat/1144-accounting-slip-link
local_sha  = a51e2771ba955973722f21c9e8f6878ef9b4cb41
PR branch  = feat/1144-accounting-slip-link
PR SHA     = a51e2771ba955973722f21c9e8f6878ef9b4cb41
MATCH      = true
PR state   = OPEN
mergeable  = MERGEABLE
```

`infrastructure/.env.local`은 값은 출력하지 않고 byte-level UTF-8 유효성만 확인했다.

```text
UTF-8 valid = true
UTF-8 BOM   = false
Docker      = client 29.6.2 / server 29.6.2
Java        = Temurin 17.0.18
Gradle      = 8.10.2
```

검증 DB는 다음처럼 분리했다.

| 용도 | DB | 접근 |
|---|---|---|
| 권한·Q5·V102 통합 테스트 및 accounting 전체 suite | Testcontainers `postgres:16-alpine` / `accounting_db` | 테스트가 만든 격리 DB |
| 격리·복원 통합 테스트 | Testcontainers `postgres:16-alpine` / `slip_db` | 테스트가 만든 격리 DB |
| Q5 실 HTTP | `qa1208-reconv2-accounting-pg`, `127.0.0.1:55437/accounting_db` | branch JAR 전용 격리 DB, 종료 후 제거 |
| V120 목록·합계·조인 | `qa1208-reconv2-slip-pg` / `slip_db` | V119 schema-only + 실제 V120 SQL, 종료 후 제거 |
| 기존 무결성 수치 | 공유 `samhan-postgres`의 `slip_db/accounting_db/partner_db` | `BEGIN TRANSACTION READ ONLY ... ROLLBACK`만 실행 |

격리 DB는 모두 server/client `UTF8`과 한국어 왕복을 확인했다. 마지막 확인에서 `qa1208-reconv2-*` 컨테이너 잔존 수는 0이다.

원문: `evidence/00-environment.txt`, `04-integrity-readonly-db.txt`, `05-isolated-v120-list-sum-join.txt`, `09-q5-isolated-http.txt`

## ② 필수 확인 1 — 권한 있는 계정 통과

### 절차

1. gateway의 실제 `JwtAuthenticationGatewayFilterFactoryTest` 24건을 fresh 실행했다.
2. 유효 JWT에서 gateway가 `X-User-Id`, `X-Is-System-Master`, `X-User-Groups`를 재주입하고 `X-User-Role`은 제거하는 단언을 확인했다.
3. branch accounting-service를 `RANDOM_PORT`로 띄우는 `AccountingSlipLinkEligibilityHttpIT`에서 gateway형 MASTER 요청을 실제 HTTP로 보냈다.

```text
X-User-Id: master-user
X-Is-System-Master: true
X-User-Groups: <gateway가 검증한 MASTER 그룹>
X-User-Role: 없음
```

### 결과

```text
gateway contract: 24 tests / failures 0 / errors 0 / skipped 0
AccountingSlipLinkEligibilityHttpIT:
gateway형_MASTER는_역할_헤더_없이_통과하고_SALES는_위조_역할도_거부한다()
failure=false / error=false / skipped=false
MASTER assertion: HTTP 200, "allowed":true
```

`HeaderAuthenticationFilterTest`도 검증된 `X-Is-System-Master:true`가 `SYSTEM_MASTER` authority로 변환되는 것을 통과했다. 따라서 gateway가 실제로 만드는 헤더 조합에서 허용 계정이 통과한다.

원문: `evidence/01b-gateway-header-contract.log`, `01c-gateway-junit-summary.txt`, `02-focused-junit-summary.txt`

## ③ 필수 확인 2 — 권한 없는 계정과 위조 역할 거부

같은 실제 HTTP IT에서 SALES 그룹 요청에 호출자가 임의로 역할 헤더를 덧붙였다.

```text
X-User-Id: sales-user
X-Is-System-Master: false
X-User-Groups: <gateway가 검증한 SALES 그룹>
X-User-Role: MASTER
```

단언은 `HTTP 200`, `"allowed":false`, `PERMISSION_DENIED`이며 fresh 실행에서 통과했다. 별도 필터 테스트는 raw `X-User-Role: MASTER`가 `ROLE_MASTER` authority로 변환되지 않음을 단언했다.

즉 호출자가 `X-User-Role`을 붙여도 판정은 바뀌지 않는다. gateway도 inbound `X-User-Role`을 명시적으로 제거하고, accounting controller는 raw role 헤더를 읽지 않는다.

원문: `evidence/01c-gateway-junit-summary.txt`, `02-focused-junit-summary.txt`, `07-accounting-full-suite-summary.txt`

## ④ 필수 확인 3 — Q5 게이트 불변

branch JAR을 `http://127.0.0.1:19094`에 띄우고 Flyway V102가 적용된 격리 PostgreSQL에 ISSUED SALES 세금계산서 1건을 넣었다.

```text
공급가 100000.00
VAT    10000.00
합계   110000.00
```

gateway형 system-master identity를 사용했고 `X-User-Role`은 보내지 않았다.

### 미검증 원천

```text
POST /accounting/daily-closings
amountVerified 누락
HTTP 409
message = 일마감 금액 검증이 완료되지 않았습니다
거부 직후 활성 daily_closings = 0
```

### 검증된 원천

```text
POST /accounting/daily-closings
amountVerified = true
HTTP 201
totalSupply = 100000.00
totalVat = 10000.00
totalAmount = 110000.00
slipCount = 1
isLocked = true
lockedBy = qa1208-sol
```

DB 행도 동일 금액, `is_locked=true`였다. 미검증 409와 한국어 사유, 검증 완료 201과 정상 잠금이 모두 실 HTTP로 재현됐다.

원문: `evidence/09-q5-isolated-http.txt`

## ⑤ 필수 확인 4 — 원래 CI 6건과 fixture diff

GitHub contents API로 fix 전 `3768975b...`, fixture fix `1c4bcd3d...`, 현재 head `a51e2771b...`의 5개 IT 파일을 exact ref로 읽어 비교했다.

| 파일 | patch | assertion 수 전/후 | assertion hash | 테스트 메서드 hash | 현재 head까지 fixture blob |
|---|---:|---:|---|---|---|
| `SlipControllerIT` | +5/-0 | 93/93 | 동일 | 동일 | 동일 |
| `SlipInspectControllerIT` | +6/-0 | 57/57 | 동일 | 동일 | 동일 |
| `SlipLifecycleControllerIT` | +5/-0 | 34/34 | 동일 | 동일 | 동일 |
| `SlipOutboundApprovalEnforcementIT` | +9/-1 | 50/50 | 동일 | 동일 | 동일 |
| `SlipQueryPurchaseIT` | +2/-0 | 57/57 | 동일 | 동일 | 동일 |

변경 patch의 assertion 추가·삭제 줄은 총 0이다. 변경 범위는 `PartnerInternalClient` mock/stub/reset fixture뿐이다.

캐시를 배제한 fresh 재실행 결과:

```text
BUILD SUCCESSFUL in 1m 25s
6 suites / 74 tests / failures 0 / errors 0 / skipped 0
직전 실패 6개 testcase matched = 6 / 6, 모두 PASS
```

따라서 테스트를 새 동작에 맞춰 완화한 것이 아니라 원래 단언 그대로 통과했다.

원문: `evidence/03-ci6-fixture-diff.txt`, `03b-ci6-rerun.log`, `03c-ci6-junit-summary.txt`

## ⑥ 필수 확인 5 — 1순위 무결성·격리·복원

### 공유 DB 읽기 전용 재실측

```text
활성 slips UUID-only                    9
그중 CONFIRMED INBOUND                  1
삭제 회계전표 아래 활성 allocation       1
활성 tax_invoices UUID-only             13
활성 회계전표 헤더 UUID-only             0
복원 가능 / 불가                         8 / 1
복원 불가 전표                           2026/08/09-2
```

복원 가능 8건은 2026/08/08 계열 7건 `P0-6-C001`, 2026/08/09-6 1건 `00`으로 다시 대조했다. evidence에는 내부 UUID를 쓰지 않고 전표번호→거래처 코드만 남겼다.

### 격리·복원 실행

fresh Testcontainers 결과:

```text
SlipPartnerBackfillIT                           7 / failures 0 / errors 0 / skipped 0
AccountingSlipIntegrityMigrationIT              1 / 0 / 0 / 0
AccountingSlipLinkAllocationRepositoryIT        1 / 0 / 0 / 0
```

실행된 시나리오는 다음을 단언했다.

- 복원 불가 slip은 soft-delete되어 활성 목록에서 제외되고 한국어 격리 사유가 남는다.
- 거래처 원본 코드가 다시 확인되면 `restore-quarantined-partner-slips`로 복원되고 `restoredAt`이 기록된다.
- 복원 가능 8건은 `processedCount=8`이고 quarantine evidence가 없어 격리 입력에 삼켜지지 않는다.
- 삭제 회계전표 아래 allocation은 soft-delete되고 감사행이 남는다.
- 삭제된 상위 회계전표의 allocation은 연결 read model repository join에서 제외된다.

### V120 목록·합계·조인 직접 계측

공유 slip DB의 V119 schema-only dump를 격리 PostgreSQL에 적용한 뒤 branch의 실제 V120 SQL을 `psql -f`로 적용했다. 활성 100원 행과 격리 200원 행을 격리 DB에만 넣었다.

```text
physical_slip_count                     2
active_list_count                       1
physical_sum                          300.00
active_sum                            100.00
active_join_rows                        1
active_join_total                     100.00
quarantined_contribution_to_active_join 0
격리 사유                               활성 partner 원본 없음
```

격리 행은 물리적으로 보존되지만 목록·합계·조인 기여도는 0이다. 격리 컨테이너는 결과 수집 후 제거했고 `cleanup_remaining=0`을 확인했다.

원문: `evidence/02-focused-junit-summary.txt`, `04-integrity-readonly-db.txt`, `05-isolated-v120-list-sum-join.txt`

## ⑦ 필수 확인 6 — 전체 accounting suite

구현자가 304초 제한으로 완료 원문을 얻지 못한 명령을 별도 15분 제한으로 fresh 실행했다.

```powershell
.\gradlew.bat :services:accounting-service:test --rerun-tasks --no-daemon --console=plain
```

```text
BUILD SUCCESSFUL in 7m 19s
exit code       0
elapsed         439.996 seconds
test suites     243
tests           1941
failures        0
errors          0
skipped         10
```

앞선 1,934건에서 현재 1,941건으로 늘어난 것은 후속 fix의 회귀 테스트 추가를 포함한 현재 HEAD의 fresh 집계다. skip 10은 기존 ECOUNT raw fixture header cross-check이며 이번 변경 경로 테스트의 skip은 0이다. 성공으로 세지 않고 명단을 원문 summary에 남겼다.

원문: `evidence/06-accounting-full-suite.log`, `07-accounting-full-suite-summary.txt`

## ⑧ 필수 확인 7 — exact SHA CI

GitHub check-runs API와 PR rollup을 exact SHA로 재조회했다.

```text
expected/pr head SHA       a51e2771ba955973722f21c9e8f6878ef9b4cb41
SHA match                  true
GitHub Actions workflows   5 / completed success 5
check runs                 47 / completed success 47
non-success                0
PR rollup                   47 / completed success 47
```

성공 workflow는 CI, QA E2E, Harness Guard, Docs Guard, Applied Flyway Migration Guard다. 실패 check가 없으므로 실패 로그 대상도 없다. **exact SHA CI는 green**이다.

원문: `evidence/08-exact-sha-ci.txt`

## 도달 가능한 결함 목록

**0건.**

이번 fix의 원래 증상인 gateway형 MASTER 거부는 현재 HEAD에서 재현되지 않았고, SALES가 `X-User-Role: MASTER`를 덧붙인 권한 상승도 재현되지 않았다. Q5와 1순위 무결성·격리·복원 회귀도 발견되지 않았다.

## 관측 불가와 실패 원문

필수 항목 1~7에서 관측 불가는 없다. 다만 공유 gateway를 branch JAR로 재배포하지 않았으므로, 운영 공유 gateway에 서명 JWT를 넣어 branch accounting JAR까지 한 네트워크 체인으로 통과시키는 배포형 E2E는 수행하지 않았다. 대신 다음의 연속된 실제 코드 경계를 각각 실행했다.

```text
gateway 실제 filter 계약 24건
→ gateway가 만드는 동일 헤더 조합의 accounting-service RANDOM_PORT 실 HTTP IT
```

검증 중 있었던 비판정 실행 실패는 다음과 같다.

1. 최초 집중 Testcontainers 캡처 셸이 424,033ms 제한을 넘겨 exit 124가 됐다. 자식이 뒤늦게 XML을 만들었지만 완료 증거로 채택하지 않고 전체 accounting 명령을 별도로 재실행했다.
2. 최초 환경 캡처는 `java -version`의 정상 stderr를 PowerShell이 `NativeCommandError`로 승격해 중단됐다. 설정을 국소 완화해 다시 측정했다.
3. 첫 Q5 재실행의 임시 actor가 UUID형이라 그 증거는 폐기하고 `qa1208-sol`로 동일 실 HTTP를 다시 실행했다.

원문: `evidence/01-focused-testcontainers.log`, `10-observation-failures.txt`

## 증거 SHA-256

- 증거 파일: 15개
- SHA-256 고유값: 15개
- 중복 SHA-256 그룹: **0개**
- UUID 정규식이 발견된 증거 파일: 0개
- 실 PNG/합성 PNG: 0개 / 0개

```text
00-environment.txt                         c3333cd35d9184655de4730d5ec0e179e33f6edec10bafb6a8d19f4527218298
01b-gateway-header-contract.log            65757b3b8c84af0a26ffdbaebfb858506fc16538bd91a30e89cd2f8909524570
01c-gateway-junit-summary.txt              bd5c8b683e9bd6f58d6266bdbf768ef6623cd79f9f39a955656ea2cb09bea133
01-focused-testcontainers.log              cf536211a5387ac1e06a023a66e128a2bc34fbe2724200af461972054bd13496
02-focused-junit-summary.txt               a700aeb752a7ec9cba7700d8483f91b8ee37349c9dd40039c56937389a881db8
03b-ci6-rerun.log                          31458fd6d8eac04e8f2a004190caf36b721d1d6daca39e541ac26fb84806a825
03c-ci6-junit-summary.txt                  a694d12d8cca1fda5ca569e706f55518bb9f078258d767714e530f715fc304de
03-ci6-fixture-diff.txt                    35278c93d59599268df8b4c2ebf07b5bc24dbb6fc072a940e627eb2cca7f1dbc
04-integrity-readonly-db.txt               8e4c099ad0c583560df2be35a23ea3a08b8109db3a5ddffd577a29ae15e0593d
05-isolated-v120-list-sum-join.txt         7c3fed1906ae7afb1d02307645f99a0392d27f1902d441aeaa59f21ced8e54da
06-accounting-full-suite.log               f298c096e8736683e4459ebd97e2411eb246106ef07557fc0f3f66fecb03ea5d
07-accounting-full-suite-summary.txt       5f5beddf1c882ef585a40840fc3376972351afdb40e38c2abb8c0a2bd247e98e
08-exact-sha-ci.txt                        07dfada9343e95005e75602d24de913e852f8077ab19918016d6a349ab2541c9
09-q5-isolated-http.txt                    69297bedcead8dcd668bfd9855aa7311df43136cecc2c59bd47bd1420b994404
10-observation-failures.txt                3fff4f6e392f346559650f55e2f3ce7b271b14b07ed5bae591e15f2c0977bfad
```
