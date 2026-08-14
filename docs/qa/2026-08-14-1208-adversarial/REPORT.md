# PR #1208 1차 적대검증 보고서 (SOL)

- 검증일: 2026-08-14 (Asia/Seoul)
- 대상 PR: #1208 (`#1144` 회계전표 트랙)
- 대상 브랜치: `feat/1144-accounting-slip-link`
- 대상 HEAD: `3768975b9d0caec65ade1df5f2e10f0c1e8a9f98`
- 판정: **도달 가능한 결함 2건**
- 안전 조건: 공유 DB는 읽기 전용 트랜잭션만 사용했다. 공유 스택은 재배포하지 않았다. 쓰기 재현은 별도 PostgreSQL 컨테이너와 로컬 accounting-service에서만 수행했다. 검증 종료 후 로컬 앱 프로세스와 격리 DB 컨테이너를 제거했다.

## 0. 사전 확인

PR 본문, issue comment 2건, review 전체, inline review comment 전체를 읽었다. review와 inline review comment는 0건이었다. 다음 정본도 전부 읽고 판정 기준으로 사용했다.

- `docs/decisions/2026-08-14-accounting-slip-link-decisions.md`
- `docs/dev-reports/2026-08-14-1144-recon-home-pc.md`

금지된 git 명령은 사용하지 않았다. 로컬 HEAD는 worktree의 `.git` 포인터와 ref 파일을 직접 읽어 확인했고, PR 원격 HEAD는 `gh pr view 1208 --json headRefName,headRefOid`로 대조했다.

```text
local branch = feat/1144-accounting-slip-link
local HEAD   = 3768975b9d0caec65ade1df5f2e10f0c1e8a9f98
PR branch    = feat/1144-accounting-slip-link
PR HEAD      = 3768975b9d0caec65ade1df5f2e10f0c1e8a9f98
MATCH        = true
```

## 1. 환경 실측 원문

### 1.1 공유 DB — 읽기 전용 계측

명령 형식:

```powershell
docker exec samhan-postgres psql -X -v ON_ERROR_STOP=1 -U samhan -d <database> -c "BEGIN TRANSACTION READ ONLY; <SELECT>; ROLLBACK;"
```

실측 시각과 인코딩:

```text
slip_db       2026-08-14 12:26:52.766786+09
accounting_db 2026-08-14 12:26:52.903657+09
server_encoding | UTF8
client_encoding | UTF8
한글 왕복        | 한글 검증 / 격리 감사
```

실측 집계:

```text
active_slips_uuid_only                         | 9
active_slips_uuid_only_confirmed_inbound       | 1
active_allocation_under_deleted_header         | 1
active_tax_invoices_uuid_only                  | 13
active_accounting_headers_uuid_only            | 0
recoverable_partner_code                       | 8
unrecoverable_partner_code                     | 1
unrecoverable_slip_no                          | 2026/08/09-2
```

복원 가능성은 `partner_db`를 같은 방식의 읽기 전용 트랜잭션으로 조회했다. 2026/08/08 계열 7건은 활성 거래처 코드 `P0-6-C001`, `2026/08/09-6`은 활성 코드 `00`을 찾았고, `2026/08/09-2`의 거래처 행은 찾지 못했다. 따라서 보고된 8건/1건을 재현했다.

### 1.2 격리 쓰기 환경

```text
DB container : qa1208-accounting-pg
DB endpoint  : localhost:55432/accounting_db
DB encoding  : UTF8
한글 왕복     : 격리 앱
application  : branch HEAD accounting-service, localhost:19091
Flyway       : schema version 102
discovery    : disabled
shared stack : 미재배포
```

검증 종료 원문:

```text
LOCAL_APP_PROCESS_TREE_STOPPED
qa1208-accounting-pg
```

두 번째 줄은 정확히 식별한 격리 컨테이너를 `docker rm -f qa1208-accounting-pg`로 제거한 결과다. 공유 컨테이너는 중지하거나 변경하지 않았다.

## 2. 필수 확인 ① — 무결성 실측 수치

### 절차

1. `slip_db`, `accounting_db`, `partner_db`에서 모두 `BEGIN TRANSACTION READ ONLY`를 선언했다.
2. 활성(`is_deleted=false`) 조건과 공백/NULL 코드 조건을 직접 집계했다.
3. allocation은 판매/매입 양쪽을 합산하고 상위 회계전표가 삭제된 경우만 셌다.
4. 9개 slip의 거래처 식별자를 `partner_db`의 활성 거래처와 대조해 실제 코드 복원 가능 여부를 다시 계산했다.

### 결과

구현자 보고 수치 6개를 모두 그대로 재현했다. 공유 DB 값이 이번 측정 시점에는 움직이지 않았다.

| 항목 | 구현자 보고 | SOL 실측 | 결과 |
|---|---:|---:|---|
| 활성 slips UUID-only | 9 | 9 | 일치 |
| 그중 CONFIRMED INBOUND | 1 | 1 | 일치 |
| 삭제 회계전표 아래 활성 allocation | 1 | 1 | 일치 |
| 활성 tax_invoices UUID-only | 13 | 13 | 일치, 범위 밖 |
| 활성 회계전표 헤더 UUID-only | 0 | 0 | 일치 |
| 복원 가능 / 불가 | 8 / 1 | 8 / 1 | 일치 (`2026/08/09-2`) |

## 3. 필수 확인 ② — 삭제가 아닌 격리

### 절차와 실행 결과

accounting V102가 적용된 격리 DB에 회계전표 헤더, 라인, allocation을 넣고 헤더를 soft delete했다. 검증 전체를 트랜잭션으로 감싼 뒤 결과를 읽고 롤백했다.

```text
allocation_exists | is_deleted | deleted_by | source_slip_no      | source_line_no | allocated_quantity | allocated_amount
true              | true       | qa1208-sol | 2026/08/14-SOURCE  | 7              | 2.000              | 110.00
```

감사 테이블 원문 요약:

```text
allocation_type        | SALES
allocation_id          | 원 allocation ID와 일치
accounting_slip_no     | 2026/08/14-QA-ALLOC
source_slip_no         | 2026/08/14-SOURCE
source_line_no         | 7
allocated_quantity     | 2.000
allocated_amount       | 110.00
quarantined_by         | qa1208-sol
restored_at/restored_by| NULL / NULL
reason                 | 한글 격리 사유 보존
```

행은 남았고 `is_deleted=true`였다. allocation ID, 원천 전표/라인 키, 수량, 금액, 격리 주체가 보존되어 hard delete가 아님을 재현했다.

복원 경로는 Testcontainers DB와 Spring MockMvc를 사용하는 `SlipPartnerBackfillIT`의 실제 HTTP 호출 `POST /internal/slips/restore-quarantined-partner-slips`로 실행했다. 거래처 코드가 다시 조회될 때 삭제 slip이 복구되고 증거 행에 복원 정보가 기록되는 시나리오가 통과했다.

조회 제외는 다음 수준까지 확인했다.

- 실행 확인: 활성 목록/저장소 조회, 판매 조회 컨트롤러, 격리·복원 통합 시나리오.
- 코드 경로 확인: `Slip`의 기본 `is_deleted=false` restriction, 기간/검색, 원장, 첨부의 상위 slip 조인, 배차 업데이트/조회의 active 전용 repository 조건.
- 삭제 이력 노출은 OUTBOUND에서 명시적으로 `includeDeleted=true`인 경로뿐이다. 이번 파트너 코드 격리 대상 INBOUND는 해당 경로에 들어가지 않는다.
- 모바일·배송·배차 UI 전체 실기기 연쇄와 모든 합계 화면은 공유 스택 재배포 금지 때문에 실행하지 못했다. 정적 필터 발견을 실행 완료로 올려 쓰지 않으며 아래 관측 불가에 남긴다.

마이그레이션 통합 검증:

```text
AccountingSlipIntegrityMigrationIT: tests=1, failures=0, errors=0, skipped=0
AccountingSlipLinkAllocationRepositoryIT: tests=1, failures=0, errors=0, skipped=0
```

## 4. 필수 확인 ③ — 재발 방지와 정상 경로

강제 재실행 명령:

```powershell
.\gradlew.bat :services:slip-service:test --tests '*SlipPartnerBackfillIT' --tests '*SlipServiceTest' --rerun-tasks --no-daemon --console=plain
.\gradlew.bat :services:slip-service:test --tests '*SlipSalesQueryControllerIT' --rerun-tasks --no-daemon --console=plain
```

원문 결과:

```text
BUILD SUCCESSFUL in 1m 38s
18 actionable tasks: 18 executed

BUILD SUCCESSFUL in 1m 11s
18 actionable tasks: 18 executed

SlipPartnerBackfillIT       tests=7  failures=0 errors=0 skipped=0
SlipServiceTest             tests=72 failures=0 errors=0 skipped=0
SlipSalesQueryControllerIT  tests=9  failures=0 errors=0 skipped=0
```

실행 시나리오 판정:

- CONFIRMED 전이에서 코드 조회 실패: `CONFLICT`로 차단되고 전이 전 상태를 유지했다.
- SAVED → SENT에서 코드 조회 실패: best-effort로 전송을 막지 않았다.
- DRAFT 생성/보관 시 빈 partner-code: 허용됐다.
- backfill: 원천 서비스에서 코드를 찾은 행만 복원했다. 찾지 못한 행은 임의 코드를 만들지 않고 격리했다.

정상 경로를 막는 회귀는 이 실행 범위에서 발견하지 못했다.

## 5. 필수 확인 ④ — eligibility와 결정 Q5/Q6

### 정적 판정 자체

`AccountingSlipEligibility`는 boolean만 반환하지 않고 다음 사유 코드와 한국어 메시지를 함께 만든다.

```text
DAILY_AMOUNT_UNVERIFIED
AMOUNT_MISMATCH
ALREADY_ALLOCATED
PERMISSION_DENIED
SOURCE_NOT_CONFIRMED
SOURCE_PARTNER_MISSING
```

역할 predicate는 `ACCOUNTANT`, `MANAGER`, `MASTER`만 허용하고 그 외 역할을 거부했다. 관련 단위 테스트는 다음과 같이 통과했다.

```text
AccountingSlipLinkEligibilityTest: tests=5, failures=0, errors=0, skipped=0
```

기존 회계 API의 권한 검사는 화면 버튼 숨김이 아니라 서버의 `@RequirePermission` AOP다. 그러나 새 eligibility는 인증 주체 및 컨트롤러와 연결되어 있지 않아 이 사유들이 실제 사용자 응답에 도달하지 않는다. 이는 결함 D-02로 판정했다.

### Q5 실제 서버 재현 — 결함

격리 DB에 공급가 100,000원, VAT 10,000원, 합계 110,000원의 ISSUED 판매 세금계산서를 넣었다. 이 원천에는 일마감 금액 검증 완료 상태가 저장되지 않았다. 이어 실제 사용자 마감 API를 호출했다.

```http
POST http://localhost:19091/accounting/daily-closings
X-Is-System-Master: true
Content-Type: application/json

{"closingDate":"2026-08-14","scopeMode":"ALL","closingKind":"SALES","sourceKind":"TAX_INVOICE"}
```

응답 원문 핵심:

```text
HTTP 201 Created
closingDate  = 2026-08-14
totalSupply  = 100000.00
totalVat     = 10000.00
totalAmount  = 110000.00
slipCount    = 1
isLocked     = true
```

DB에서도 같은 금액의 `is_locked=true` 마감 행을 확인했다. `DailyClosingService.close()`는 원천 집계 후 재계산·lock하지만 금액 검증 완료 여부를 입력받거나 검사하지 않는다. 따라서 Q5의 “미검증이면 생성·마감 차단”은 경고 수준도 아니고, 실제 마감 경로에서 우회된다.

### 나머지 eligibility 사유

연결 금액 불일치, 이미 연결됨, CONFIRMED 아님, 거래처 코드 공백을 차단하는 pure evaluator 결과는 단위 테스트/소스에서 확인했다. 그러나 evaluator를 호출하는 운영 API가 없으므로 실제 HTTP 응답과 권한별 사유 반환은 관측할 수 없었다. 미실행을 통과로 기록하지 않는다.

## 6. 필수 확인 ⑤ — read model의 0행 함정과 UUID

`AccountingSlipLinkReadModelService`는 allocation 연결을 내부 source slip UUID로 조회하고, 표시 정보는 `SlipServiceClient`로 가져온다. partner-code를 조인 키로 사용하지 않으므로 문제의 “빈 코드라 조용히 0행” 패턴을 read model 내부에서 반복하지는 않는다. 응답 record에도 UUID 필드가 없고 전표번호, 상태, 거래처 코드, 금액만 있다.

하지만 production reference를 전수 검색한 결과는 다음과 같다.

```text
AccountingSlipLinkReadModel        -> record, service, test
AccountingSlipEligibility          -> evaluator, service, test
AccountingSlipLinkReadModelService -> 자체 클래스와 test 외 production caller 0
controller/API response usage      -> 0
```

즉 read model은 조용히 0행을 내기 전에 **사용자 경로에서 호출되지 않는다**. HTTP 직렬화 응답에 UUID가 없는지는 endpoint가 없어 실측할 수 없고, record 정의에서 UUID 비노출만 확인했다. 이는 결함 D-02다.

## 7. 필수 확인 ⑥ — accounting-service 전체 테스트

첫 실행은 캐시 때문에 다음과 같아 증거로 채택하지 않았다.

```text
> Task :services:accounting-service:test UP-TO-DATE
BUILD SUCCESSFUL in 13s
```

강제 전체 재실행:

```powershell
.\gradlew.bat :services:accounting-service:test --rerun-tasks --no-daemon --console=plain
```

원문 결과:

```text
BUILD SUCCESSFUL in 7m 15s
21 actionable tasks: 21 executed
```

fresh XML 집계:

```text
test suites = 241
tests       = 1934
failures    = 0
errors      = 0
skipped     = 10
```

실행 중 한동안 콘솔 출력이 없었으나 2026-08-14 12:30:57 KST thread dump에서 Test worker는 deadlock이나 wait가 아니라 Spring context/AOP class scanning에서 `RUNNABLE`이었다. 이후 정상 진행하여 7분 15초에 종료했다. 따라서 다른 트랙도 언급한 “기존 장시간 통합 테스트 구간 정체”는 이 HEAD/환경에서는 재현되지 않았다.

10개 skip은 XML에 사유가 없는 raw fixture header cross-check이며 통과로 계산하지 않는다.

```text
EcountGeneralVoucherImporterTest.rawHeaderCrossCheck
EcountJournalEntryImporterTest.rawHeaderCrossCheck
EcountPurchaseSlipImporterTest.rawHeaderCrossCheck
EcountSalesSlipImporterTest.rawHeaderCrossCheck
Mig4FixtureHeaderCrossCheckTest 4건
Mig5AccountingFixtureHeaderCrossCheckTest 2건
```

## 8. 도달 가능한 결함 목록

### D-01 — 높음 — Q5 금액 미검증 상태에서도 실제 일마감 API가 201로 마감·잠금

- 사용자 경로: `POST /accounting/daily-closings`
- 재현 결과: 미검증 원천 1건, 합계 110,000원이 `201 Created`, `isLocked=true`가 됐다.
- 결정 위반: Q5는 회계전표 생성과 일마감을 모두 차단하도록 정했다.
- 원인 범위: `DailyClosingService.close()`가 검증 완료 상태를 받거나 조회하지 않고 집계·lock한다. 새 eligibility evaluator도 이 경로에서 호출되지 않는다.
- 영향: 사용자는 검증하지 않은 금액으로 일마감을 확정할 수 있다.

### D-02 — 높음 — 2순위 read model/eligibility의 운영 호출 경로가 0개

- 사용자 경로: 없음. 기존 accounting controller/API 어느 곳도 `AccountingSlipLinkReadModelService`를 호출하지 않는다.
- 재현 결과: production reference 전수 검색에서 service의 caller와 controller 응답 사용이 0이었다.
- 영향: 사용자에게 연결 가능 여부, Q5/Q6, 금액 불일치, 이미 연결됨, 상태/거래처 오류의 사유 코드와 한국어 메시지가 전달되지 않는다. 서버 역할 판정도 새 연결 기능의 실제 요청에서 실행되지 않는다.
- 부수 영향: record 수준 UUID 비노출은 확인되지만, 실제 HTTP 응답 계약은 존재하지 않아 검증할 수 없다.

## 9. 관측 불가와 실패 원문

### 9.1 격리 accounting 상세 조회

역할 헤더만 사용한 상세 조회는 auth-service가 없는 격리 환경에서 서버 권한 판정으로 거부됐다.

```text
HTTP 403 Forbidden
```

system-master 우회로 상세 조회를 시도하면 partner-service를 발견할 수 없어 실패했다.

```text
HTTP 502 Bad Gateway
code    = PARTNER_IDENTITY_LOOKUP_UNAVAILABLE
message = 거래처 식별 정보를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.
```

따라서 상세 화면의 실제 표시 상태는 관측 불가다. 반면 같은 격리 앱의 마감 POST는 외부 서비스 없이 실행되어 D-01을 직접 재현했다.

### 9.2 UI·모바일·배송·배차 전체 연쇄 및 모든 합계 화면

공유 스택 재배포와 공유 DB 쓰기가 금지되어 이 HEAD의 실 UI/모바일 앱을 공유 환경에 올리지 않았다. 저장소 query의 삭제 필터와 일부 통합 테스트는 확인했지만, 다음은 실 사용자 UI에서 미실행이므로 관측 불가다.

```text
모바일 화면 전체
배송 화면 전체
배차 화면 전체
모든 기간/합계/원장/첨부 화면의 종단 간 연쇄
```

### 9.3 전체 테스트 skip 10건

위 7절의 raw fixture header cross-check 10건은 fresh 전체 실행에서도 `<skipped/>`였고 XML에 사유가 없었다. 이 10건은 검증 안 된 상태다.

## 10. 캡처 SHA-256

- 실 캡처 파일: 0개
- SHA-256 목록: 없음
- 중복 SHA-256: **0개**

공유 배포 금지로 이 HEAD의 실 UI를 캡처하지 않았고, 터미널 결과를 합성 PNG로 만들지 않았다. 따라서 `screenshots/`에는 제출할 이미지가 없다.

## 11. 증거 무결성 정정

1. **DB 수치 정정 없음.** 구현자 보고의 9 / 1 / 1 / 13 / 0 / 8·1을 2026-08-14 12:26:52 KST 공유 DB 읽기 전용 계측에서 모두 재현했다.
2. **개별 테스트 수치 정정 없음.** 구현자 코멘트의 7 / 9 / 72 테스트를 `--rerun-tasks`로 다시 실행해 모두 재현했다.
3. **전체 accounting 테스트 정체 상태 정정.** 구현자의 당시 중단 사실과 별개로, 현재 HEAD에서는 fresh 전체 실행이 정체하지 않고 7분 15초에 성공했다. 1934건 중 실패/오류 0, skip 10이었다.
4. **PR 본문 상태 정정 필요.** PR 본문과 제목은 여전히 “정찰만, 구현 아직 없음/결정 대기” 상태로 쓰여 있으나, 현재 HEAD와 후속 코멘트에는 1·2순위 구현이 존재한다. 현재 산출물의 원문 상태를 설명하는 문구로는 더 이상 사실이 아니다.

