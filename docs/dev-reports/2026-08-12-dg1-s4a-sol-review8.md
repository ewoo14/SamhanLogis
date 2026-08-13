# PR #1170 D-G1 S4a SOL 5.6 재검토8 — rebase 재수렴

- 검토일: 2026-08-12 (Asia/Seoul)
- 대상 PR / HEAD: `#1170` / `5ba6d577deb9616b39448cb41e8c3e56bdf795a8`
- 비교 main: `origin/main` `2d5374cd01d8e3d0ae479d128293f6b6d4f57f2d`
- 범위: 요청된 네 임무와 RED-B만 재검토
- git 변경 명령: 0건
- 공유 DB 로그인·write: 0건
- 판정: **BLOCKING 0 / MAJOR 0 / MINOR 0 — PR #1170 즉시 머지 승인**

## 1. 판정 요약

rebase 후 제품 동작은 재수렴했다.

1. 격리 PostgreSQL에서 실제 `확정 → 확정 취소 → 재계산 → 재확정` 왕복이 통과했다. V99 snapshot 이력은 1행 남고 재확정 문서번호는 새 기준일로 바뀌었다.
2. 권한 적대변이 9/9와 비ASCII 적대변이 6/6은 모두 RED, 정상 구성은 각각 GREEN이었다.
3. 직접 Chromium-1217에서 기존 회계 route 43/43 open, 메뉴 44, activeTargets 33, 권한 matrix 62, native Link scroll `720 → 720`을 다시 실측했다.
4. #1169의 V99/V100, claim, 취소·재확정, 결재 종료 공통 claim 경계는 보존됐다. #1170이 `SalesCommissionSettlementService`에 더한 차이는 `list/getOne`뿐이며 #1169 취소 경로를 바꾸지 않았다.

rebase 포함관계도 직접 확인했다.

```text
#1166 merge 6a219fa8a: HEAD ancestor = true
#1169 merge b1f3a08ec: HEAD ancestor = true
#1171 merge 72cab52eb: HEAD ancestor = true
git diff --check: exit 0
```

## 2. 임무 ① — #1169 취소와 #1170 확정의 실 왕복

일회성 `@SpringBootTest(webEnvironment=RANDOM_PORT)` + Testcontainers PostgreSQL 검증을 추가해 실행 후 삭제했다. 공유 DB나 공유 서비스는 사용하지 않았다.

왕복은 다음처럼 제품 경계를 실제로 관통했다.

1. #1170 HTTP `POST /accounting/sales-commission-settlements/{id}/confirm`
2. #1169 `SalesCommissionSettlementService.cancelConfirmation`
3. DRAFT 기준일 변경 및 재계산
4. #1170 HTTP 재확정

단언:

- 최초 확정 `CONFIRMED`
- 확정 취소 후 `DRAFT`, 이전 snapshot history 정확히 1행
- 재계산 필요 상태 보존
- 재확정 `CONFIRMED`
- 이전 문서번호 `2099/12/29-1` 미재사용
- Flyway V99/V100 `success=true`

실행 결과:

```text
Tests: 1, failures 0, errors 0, skipped 0
BUILD SUCCESSFUL in 1m 18s
21 actionable tasks: 21 executed
```

별도 격리 live DB에서도 V99/V100과 #1170 실제 HTTP를 확인했다.

```text
V99  add sales commission settlement snapshot history  success=t
V100 add sales commission settlement approval claim    success=t

POST create  -> 201
POST confirm -> 200
CONFIRMED 2099/12/30-1
CONFIRMED 2099/12/30-2
```

## 3. 임무 ② — 권한 9종과 비ASCII 6종

### 3.1 권한 중복 5종

| # | 실제 파일 변이 | 결과 |
|---:|---|---|
| 1 | bucket snapshot의 ACCOUNTANT target을 `1000000`·`1110000`에 중복 | RED, duplicate snapshot cell, 1 fail / 14 pass |
| 2 | TS DB snapshot의 MANAGER target을 `0000000`·`1110000`에 중복 | RED, duplicate key/projection, 2 fail / 13 pass |
| 3 | 동일 TS 중복을 Java freshness parser가 읽음 | RED, 2 tests 중 1 fail |
| 4 | freshness 실제 DB query에 ACCOUNTANT/accounts 중복 row | RED, 2 tests 중 1 fail |
| 5 | mock ACCOUNTANT edit source에 target 중복 | RED, duplicate-free 계약 1 fail / 14 pass |

### 3.2 fix2 계열 4종

| # | V101 변이 | 결과 |
|---:|---|---|
| 6 | DRIVER 초과 grant | RED, seed 5 tests 중 1 fail |
| 7 | ACCOUNTANT grant 누락 | RED, seed 5 tests 중 1 fail |
| 8 | MASTER row 중복 | RED, seed 5 tests 중 1 fail |
| 9 | MASTER 중복 + DRIVER 초과 | RED, seed 5 tests 중 1 fail |

복원 후 정상 구성:

```text
desktop exact permission contract: 15/15 GREEN
SalesCommissionSettlementPermissionSeedTest: 5/5 GREEN
AccountingPermissionProjectionFreshnessIT: 2/2 GREEN
```

### 3.3 비ASCII 적대변이 6종

| # | 실제 변이 | 결과 |
|---:|---|---|
| G1 | generator `DB 파생` → valid-Unicode mojibake | RED, 1 fail / 14 pass |
| G2 | generator `×` → U+FFFD | RED, 1 fail / 14 pass |
| G3 | checker `↔` → `→` | RED, 1 fail / 14 pass |
| G4 | checker `역할` → `役割` | RED, 1 fail / 14 pass |
| G5 | 생성 snapshot `×` → `…` | RED, 1 fail / 14 pass |
| G6 | 생성 snapshot에 신규 비ASCII `Ω` 라인 추가 | RED, 1 fail / 14 pass |

모두 실제 파일을 변이하고 runner 종료 직후 복원했다. 최종 정상 상태는 **15/15 GREEN**이다. 변이 대상 7개 파일은 모두 최종 working filtered blob과 HEAD blob이 동일했다.

## 4. 임무 ③ — route·count·scroll 직접 Playwright

Codex 내장 브라우저는 사용하지 않았다. `clients/desktop` 안에서 Playwright를 직접 실행했다.

- 스펙 임시 경로: `playwright/2026-08-12-dg1-s4a-review8-real-qa/dg1-s4a-review8-real-qa.spec.ts`
- 디렉터리와 파일명 모두 `-real-qa`
- 캡처: `resolveQaShotsDir()` 경유
- renderer: `127.0.0.1:29911`, `VITE_MOCK_MODE=0`
- accounting: 격리 JAR `127.0.0.1:59028`
- PostgreSQL: 격리 container `127.0.0.1:60441`
- 브라우저: `C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe`
- headless: true

정산 API만 격리 accounting 서비스로 전달하고 인증 세션·권한 조회만 고정 fixture로 주입했다. 생성·목록·상세·확정과 SALES 403은 mock 응답이 아니다.

```text
Running 2 tests using 1 worker
2 passed (7.4s)

actual HTTP:
GET  list       200
POST create     201
GET  detail     200
POST confirm    200

menu=44
legacyRoutesOpen=43
failedRoutes=[]
activeTargets=33
permissionMatrix=62
scroll=720->720
```

기존 route 43개는 현재 MASTER 회계 메뉴 DOM anchor 44개에서 신규 정산 route 1개를 제외해 얻었고, 각각 직접 열어 login redirect 및 NotFound가 0임을 확인했다. scroll 검증은 정산 문서 링크가 실제 `A`임을 먼저 확인하고 `locator.click()`의 자동 스크롤을 피하기 위해 DOM click으로 상세 왕복했다.

로컬 증거:

- `docs/qa/2026-08-12-dg1-s4a-review8-real-qa/_local/01-isolated-http-confirmed.png`
- `docs/qa/2026-08-12-dg1-s4a-review8-real-qa/_local/02-scroll-back-720.png`
- `docs/qa/2026-08-12-dg1-s4a-review8-real-qa/_local/03-sales-denied.png`
- `docs/qa/2026-08-12-dg1-s4a-review8-real-qa/_local/qa-observation.json`

## 5. 임무 ④ — #1169 보존 감사

### 5.1 merge blob 대조

| 좌표 | #1169 merge blob vs HEAD |
|---|---|
| accounting V99 snapshot history | 동일 |
| accounting V100 approval claim | 동일 |
| `SalesCommissionSettlement` 취소/재확정 domain | 동일 |
| `SalesCommissionSettlementApprovalClaimService` | 동일 |
| groupware `ApprovalAttachmentService` | 동일 |
| groupware `ApprovalLineService` | 동일 |

`SalesCommissionSettlementService`는 blob이 다르지만 diff는 #1170의 `list(Pageable)`와 `getOne(UUID)` 추가뿐이다. `cancelConfirmation`, snapshot capture, DRAFT 기준일 변경, 재계산, 재확정 코드는 그대로다.

### 5.2 표적 회귀

```text
accounting #1169 표적: 33 tests, failures/errors/skipped 0
groupware #1169 표적: 12 tests, failures/errors/skipped 0
```

claim 수명은 결재 상태별 외부 호출로 흩어지지 않았다.

- USER reject → `releaseSettlementClaimsAfterCompletion`
- GROUP reject → 같은 helper
- withdraw → 같은 helper
- helper → `ApprovalAttachmentService.releaseSettlementClaimsAfterApprovalCompletion`
- 결재 ID 기준 정산 참조를 다시 수집하고 exact pair를 after-commit 해제
- rollback 시 callback 미실행
- APPROVED 참조는 claim을 유지해 확정 취소 차단
- TTL `ACTIVE_TTL_SECONDS=300`

## 6. RED-B

### 6.1 V101·SALES·HTTP

- V101 정상: seed **5/5 GREEN**, 11역할 exact
- SALES runtime: 정산 메뉴 0, 직접 route 차단
- accounting 실제 HTTP: `403 FORBIDDEN`
- 메시지: `page=accounting.sales-commission-settlement action=VIEW role=SALES reason=account permission missing`
- 전체 accounting의 `SalesCommissionSettlementHttpGuardIT` 포함 GREEN

### 6.2 PowerShell 5.1 generator

```text
PowerShell 5.1.26100.8972
PS51_EXIT_1=0
PS51_EXIT_2=0
SHA_BEFORE=8AA5EB82337B18E02F5D3CB4694F9E7F8F0D7F76AF2292973471EE0AF37BCA2B
SHA_1     =8AA5EB82337B18E02F5D3CB4694F9E7F8F0D7F76AF2292973471EE0AF37BCA2B
SHA_2     =8AA5EB82337B18E02F5D3CB4694F9E7F8F0D7F76AF2292973471EE0AF37BCA2B
bytes=15818, LF=413, CRLF=0, BOM=false, U+FFFD=0
```

중복 row 실패:

```text
exit=1
DB 파생 스냅샷 갱신 중단: duplicate projection cell ACCOUNTANT|accounting.accounts first/second bits cannot be represented
실패 전후 output SHA 동일
PowerShell stack 없음
```

### 6.3 rebase HEAD 전체 수치

이전 보고서 수치를 재사용하지 않고 `--rerun-tasks`/fresh runner로 다시 실행했다.

| suite | 새 실측 |
|---|---:|
| accounting 전체 | 230 XML, **1,899 tests**, failures 0, errors 0, skipped 10, exit 0 |
| desktop 전체 | 254 files, **2,218 passed / 2 skipped** (2,220 total), exit 0 |

accounting 원문:

```text
BUILD SUCCESSFUL in 8m 2s
21 actionable tasks: 21 executed
```

desktop은 single worker 전체 실행 후 exit 0이었고, 동일 HEAD의 Vitest 수집 JSON으로 2,220개/254파일을 별도 검산했다. 조건부 skip 2개는 `mock.test.ts`에서 직접 `154 passed / 2 skipped`로 확인했다.

### 6.4 migration 네 축

각 tree의 `services/*/src/main/resources/db/migration/V*__*`를 전수 집계했다.

| 축 | accounting | auth | 축 내부 중복 |
|---|---:|---:|---:|
| 격리 실 DB | V100 success | generator/freshness 격리 DB V101 success | 0 |
| `origin/main` `2d5374cd` | V100 | V100 | 전 서비스 0 |
| PR #1170 `5ba6d577d` | V100 | V101 | 전 서비스 0 |
| PR #1172 `cd36db9b8` | V100 | V100 | 전 서비스 0, 변경 migration 0 |
| PR #1173 `2c62128fc` | V98 | V100 | 전 서비스 0, 변경 migration 0 |
| PR #1174 `5993a7638` | V98 | **별도 V101** | 전 서비스 0, 변경 migration 1 |

검토 도중 #1174 head가 갱신돼 `V102__preserve_permission_change_actor_id.sql`을 추가했다. #1170의 `V101__seed_sales_commission_settlement_page_permission.sql`과 **내용이 다른 auth migration 번호 충돌을 해소한 상태**다.

이는 현재 main이 auth V100이므로 #1170 자체의 merge 결함은 아니다. **merge 순서는 #1170 우선**이어야 한다. #1170 머지 직후 #1174는 main에 rebase하고 자기 migration을 다음 빈 번호(V102 이상)로 renumber한 뒤 다시 검증해야 한다. #1174를 현 head 그대로 #1170 뒤에 머지하는 것은 금지한다.

## 7. 실행 중 false RED와 정리

제품 결함에서 제외한 harness 문제:

1. accounting/auth Gradle을 같은 build dir에서 병렬 실행해 class 산출물이 경합한 최초 시도 — 순차 fresh 재실행 GREEN.
2. Windows 제외 포트 범위의 60887/61087/60911 — 동적 포트 59028과 29911로 교체.
3. Vite version 문자열 `2026/08/12-review8` 형식 오류 — 유효한 `2026/08/12-8`로 교체.
4. 임시 Playwright의 비ASCII HTTP header 및 strict locator 2건 — 제품 요청 전/정상 DOM 2개 매칭의 스펙 오류로 교정 후 fresh 2/2 GREEN.
5. desktop 전체 suite가 삭제한 추적 fixture `tools/.s24-build-only/build/deep/tracked-writer.mjs` — HEAD 1줄로 복원, 제품 diff 없음.

종료 감사:

```text
임시 roundtrip Java test: 삭제
임시 Playwright spec: 삭제
port 29911 listeners=0
port 59028 listeners=0
port 60441 listeners=0
owned process remains=0
container dg1-s4a-review8-db remains=0
```

generator는 `git status` stat/eol 항목이 남았지만 filtered working blob과 HEAD blob이 모두 `cf66d49c1cd014299f37b9568c82244877cc609f`이고 실제 diff는 0이다.

## 8. 이 라운드가 보지 않은 표면

요청대로 새 각도를 탐색하지 않았다.

1. 운영/공유 DB write, 운영 배포 JAR, 운영 gateway/auth 로그인은 실행하지 않았다.
2. 저장소 전체 real-QA 548개 시나리오, Electron native shell, installer/update, 모바일 클라이언트는 실행하지 않았다.
3. accounting·groupware 표적 및 accounting/desktop 전체 외 다른 서비스 전체 suite는 실행하지 않았다.
4. #1172/#1173/#1174의 기능 동작은 검토하지 않았다. 이들은 migration tree와 변경 migration만 대조했다.
5. 외부 vendor와 실제 회계 데이터는 건드리지 않았다.

## 9. 최종 결론 및 PM 전달

**PR #1170: BLOCKING 0 / MAJOR 0 / MINOR 0. HEAD `5ba6d577d` 즉시 머지 승인.**

PM 실행 순서:

1. #1170을 #1174보다 먼저 머지한다.
2. #1174는 그 뒤 main rebase 및 auth migration `V101` → 다음 빈 번호로 renumber한다.
3. #1174에서 Flyway와 actor-id migration 검증을 다시 수행한다.

현재 GitHub Actions는 조회 시점에 GitGuardian pending 1건을 제외하고 전부 pass였다. 이는 본 코드 검토의 제품 결함은 아니며 저장소 GitGuardian 정책에 따라 PM이 처리한다.
