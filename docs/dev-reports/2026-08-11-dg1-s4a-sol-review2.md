# D-G1 S4a SOL 5.6 재검토 2차

- 검토일: 2026-08-11 KST
- 대상: PR #1170, 요청 기준 HEAD `e1e814966`
- 범위: R-1~R-5 수정, UUID 판정 재확인, accounting 전체 회귀, RED-B, 라이브 QA
- 판정: **MERGE BLOCKED — 권한 exact 감시에 잔여 false-green 1건**
- 원칙: git 조작을 하지 않았고 공유 DB를 조회하거나 쓰지 않았다.

## 1. 결론

R-2 판정 뒤집기는 맞다. 저장소 정본은 UUID의 화면 표시를 금지하지만 API wire, React key, route path param은 허용한다. 세금계산서·분개·입금보고서도 실제로 UUID `id`를 응답하고 상세 route key로 사용한다. 현재 정산 목록·상세의 사용자 표시 문자열에는 UUID가 없다.

R-3·R-4·R-5와 accounting 전체 회귀도 독립 재현에서 통과했다. 그러나 R-1 exact 테스트에는 **중복 grant가 `0 → 기대 비트` 순서일 때 GREEN이 되는 잔여 false-green**이 있다. 제공된 두 뮤테이션은 모두 RED였지만, 테스트가 스스로 표방하는 duplicate 감시는 완전하지 않다. 따라서 이번 라운드는 결함 0으로 PM 승인할 수 없다.

| ID | 심각도 | 판정 | 핵심 |
|---|---:|---|---|
| SOL-S4A-R2-01 | P0 gate | 결함 | V101 grant CTE에 `MASTER 000` 뒤 `MASTER 111` 중복행을 두어도 exact 테스트 3개가 모두 GREEN이다. 동일 대상 중복 INSERT를 감시하지 못한다. |
| SOL-S4A-R2-DOC-01 | P2 | 기록 정정 | fix 보고서의 11역할 표에 `WAREHOUSE`가 빠져 있고, desktop `2,162 passed / 1 skipped`는 실제 `2,162 total = 2,161 passed + 1 skipped`이다. |

## 2. R-1 권한 감시 재검증

### 2.1 11개 역할 × 7비트 독립 재현

비트 순서는 `VIEW CREATE UPDATE DELETE RESTORE DOWNLOAD PRINT`다. V101의 두 번째 roles/grants CTE를 독립 PowerShell 파서로 읽고 역할 수·중복·비트를 단정했다.

| 역할 | 7비트 |
|---|---:|
| MASTER | `1110000` |
| MANAGER | `1110000` |
| ACCOUNTANT | `1110000` |
| SALES | `0000000` |
| WAREHOUSE | `0000000` |
| DISPATCH | `0000000` |
| INVENTORY | `0000000` |
| DEVELOPER | `0000000` |
| PARTNER | `0000000` |
| STAFF | `0000000` |
| DRIVER | `0000000` |

결과는 `EXACT_11x7=PASS`였다. 현재 migration 값은 D-G6과 일치한다.

`SalesCommissionSettlementPermissionSeedTest.java:52-77`은 역할 목록과 최종 7비트 map에 `isEqualTo`를 사용한다. `:80-94`도 role-page VIEW/EDIT map을 `isEqualTo`로 비교한다. 행 결과 exact 경로에 `toContain`은 없다. `contains`는 `:55-57`의 pageCode/컬럼 존재 확인에만 사용한다.

### 2.2 사용자 지정 뮤테이션 ① — DRIVER 초과 부여

V101 template grant에 다음 행을 일시 추가했다.

```sql
('DRIVER', TRUE, TRUE, TRUE)
```

실행:

```text
gradlew :services:auth-service:test
  --tests com.samhanair.logis.auth.domain.SalesCommissionSettlementPermissionSeedTest
  --rerun-tasks --no-daemon
```

결과: **RED**, 3 tests 중 1 failed.

```text
SalesCommissionSettlementPermissionSeedTest > migrationSeedsTheExactSevenBitTemplateForEveryRole() FAILED
AssertionFailedError at SalesCommissionSettlementPermissionSeedTest.java:77
BUILD FAILED in 22s
```

### 2.3 사용자 지정 뮤테이션 ② — mock DOWNLOAD 초과 비트

`MOCK_ACTION_ONLY_PAGES['accounting.sales-commission-settlement']`에 `DOWNLOAD`를 일시 추가했다.

결과: **RED**, 대상 1 test failed.

```text
Expected: ["VIEW", "CREATE", "UPDATE"]
Received: ["VIEW", "CREATE", "UPDATE", "DOWNLOAD"]
mock.test.ts:107
```

두 뮤테이션은 즉시 원복했고, 원복 후 auth exact는 `BUILD SUCCESSFUL in 28s`, mock ACCOUNTANT exact는 `1 passed`였다.

### 2.4 새 조합 — duplicate grant false-green

V101 template grant의 기존 MASTER 행 앞에 다음 행을 일시 추가했다.

```sql
VALUES ('MASTER', FALSE, FALSE, FALSE),
       ('MASTER', TRUE, TRUE, TRUE),
       ('MANAGER', TRUE, TRUE, TRUE),
       ('ACCOUNTANT', TRUE, TRUE, TRUE)
```

기대: 중복 역할이므로 RED. 실제: **GREEN**.

```text
3 tests completed
BUILD SUCCESSFUL in 27s
```

원인은 `SalesCommissionSettlementPermissionSeedTest.java:111-123`의 `bitsMap()`이다.

1. 모든 역할을 먼저 0비트로 채운다(`:113-115`).
2. 행을 넣은 뒤 이전 값이 0비트인지로 중복을 판단한다(`:119-121`).
3. 첫 `MASTER 000`은 이전값도 0이라 통과하고 map을 다시 0으로 만든다.
4. 다음 `MASTER 111`도 이전값이 여전히 0이라 또 통과한다.
5. 최종 map은 기대 `MASTER 111`이므로 equality도 통과한다.

동일 `(role_code, page_code)` 후보가 한 INSERT에서 두 번 생성되는 SQL을 exact 감시가 놓친다. 뮤테이션은 즉시 원복했다. 공유 DB write 금지 때문에 실제 PostgreSQL 적용은 하지 않았다.

## 3. R-2 UUID 판정 재확인

### 3.1 저장소 정본

`.claude/memory/feedback_uuid_no_user_visibility.md`는 다음을 명시한다.

- 금지: 화면 컬럼·라벨·입력·tooltip에 UUID 표시
- 허용: API body/wire, React key, hidden value, route path param `/sales/:id`

따라서 이전 검토의 “UUID가 응답/URL에 있으므로 자체 결함”이라는 전제는 틀렸다. `draftReference`를 만들지 않은 PM 결정이 정본과 일치한다.

### 3.2 선례 3건 코드 대조

| 선례 | REST/wire | 목록 → 상세 route |
|---|---|---|
| 세금계산서 | `TaxInvoiceResponse.java:11-13`의 `UUID id` | `TaxInvoiceListPage.tsx:271-272`의 `row.id` → `/accounting/tax-invoices/{id}` |
| 분개 | `JournalResponse.java:16`의 `UUID id` | `JournalListPage.tsx:206-207`의 `j.id` → `/accounting/journals/{id}` |
| 입금보고서 | `CashReceiptResponse.java:12-16`의 `UUID id` | `CashReceiptListPage.tsx:192-200`의 native `Link`, `row.id` → `/accounting/admin/cash-receipts/{id}` |

정산도 `SalesCommissionSettlementResponse.java:11`의 `UUID id`와 `SalesCommissionSettlementListPage.tsx:71`의 UUID route key를 같은 내부 용도로 사용한다.

### 3.3 화면 문자열 전수

정산 목록은 `SalesCommissionSettlementListPage.tsx:68-79`에서 다음만 표시한다.

- CONFIRMED: `documentNo`
- DRAFT: `임시저장 · settlementDate`

상세는 `SalesCommissionSettlementDetailPage.tsx:67-104`에서 문서번호/상태/정산일/금액/계약 버전만 표시한다. Playwright에서 목록·DRAFT 상세·CONFIRMED 상세 각각 `body.innerText`를 UUID 정규식으로 검사했고 모두 false였다. 주소의 UUID는 허용된 내부 route key다.

## 4. R-3·R-4 입금보고서 패턴 대조

| 계약 | 입금보고서 | 정산 | 판정 |
|---|---|---|---|
| native hyperlink | `CashReceiptListPage.tsx:192` `<Link>` | `SalesCommissionSettlementListPage.tsx:70` `<Link>` | 일치 |
| 내부 route key | `row.id` | `row.id` | 일치 |
| 목록 identity | `{ pathname, search }` | `{ pathname, search }` | 일치 |
| history identity | `returnEntryKey: location.key` | 동일 | 일치 |
| scroll 저장 | `saveScrollAnchor(location.key)` | 동일 | 일치 |
| scroll 복원 | `requestAnimationFrame` + `window.scrollTo` | 동일 | 일치 |
| 상세 복귀 | return entry가 있으면 `navigate(-1)`, 없으면 replace | 동일 | 일치 |

Playwright DOM에서 DRAFT와 CONFIRMED control의 `tagName === A`와 UUID href를 확인했다. scroll은 `720 → 상세 → 뒤로 가기 → 720`으로 복원됐다.

### DRAFT 링크 텍스트

세금계산서의 번호 없는 DRAFT는 번호 셀에 `—`를 표시하고 상태 badge에서 `임시저장`을 표시한다. 분개·입금보고서는 각각 `journalNo`·`slipNo`를 표시한다. 정산은 번호 셀 자체가 상세 진입점이어야 하므로 상태 용어 `임시저장`과 업무 식별값 `settlementDate`를 합친 `임시저장 · 2026-08-12`를 사용한다. 선례와 문자 그대로 같지는 않지만 상태 어휘, 번호 없음, UUID 비노출 규칙과 모순되지 않는다.

## 5. R-5 격리 실제 HTTP 403

`SalesCommissionSettlementHttpGuardIT`에 응답 출력만 일시 추가하고 원복했다. H2 in-memory, embedded Tomcat RANDOM_PORT, Eureka 비활성, 외부 client 6종 mock 격리 상태다.

```text
SOL_REVIEW2_HTTP_STATUS=403
SOL_REVIEW2_HTTP_BODY={"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny ? page=accounting.sales-commission-settlement action=VIEW role=SALES reason=account permission missing","data":null,"timestamp":"2026-08-11T09:30:34.455246700Z"}
BUILD SUCCESSFUL in 1m 2s
```

요청 header는 `X-User-Id=00000000-0000-0000-0000-000000000901`, `X-User-Role=SALES`였고 `DynamicPermissionClient`의 정산 VIEW 결과를 false로 두었다. stale 배포 JAR이나 MockMvc가 아닌 실제 TCP HTTP 결과다.

## 6. accounting 미완주 회귀 강제 완주

실행:

```text
gradlew :services:accounting-service:test --rerun-tasks --no-daemon
```

결과:

```text
BUILD SUCCESSFUL in 8m 15s
XML files=225
tests=1,871 failures=0 errors=0 skipped=10 executed=1,861
```

기존 1,870에 신규 `SalesCommissionSettlementHttpGuardIT` 1건이 추가되어 현재 정확한 총계는 1,871이다.

S1·S2 핵심 XML:

- `draft_hasNoDocumentNumber_untilConfirmed`
- `confirm_assignsDocumentNumber_andReturnsDomainForChaining`
- `createDraft_thenConfirm_thenFindByDocumentNo_roundTripsTheSameSettlement`
- `persisted_versions_keep_their_own_confirmed_settlement_snapshots_after_reload`
- `old_settlement_snapshot_does_not_change_when_a_new_rate_version_is_used`

모두 failure/error/skip 0이다.

## 7. RED-B 독립 재실측

| 표면 | 현재 exact | 신규 좌표 수 | 판정 |
|---|---:|---:|---|
| accounting activeTargets | 33 unique | 1 | 기존 32 → 33 보존 |
| 회계 렌더 anchor | 44 unique | 1 | 기존 43 → 44 보존 |
| 권한 matrix 회계 pageCode | 62 unique | 1 | 기존 61 → 62 보존 |

임시 Playwright route sweep에서 기존 43개 route를 MASTER로 하나씩 열어 hash path 유지, NotFound 없음, login redirect 없음을 확인했다. 신규 포함 회계 그룹 DOM anchor도 exact 44였다. sweep 결과는 `2 passed (6.5s)`이며 임시 spec은 삭제했다.

## 8. desktop 회귀와 라이브 QA

### 8.1 desktop Vitest

첫 병렬 전체 실행은 제품 assertion 실패 없이 다음 인프라 오류로 종료됐다.

```text
Unhandled Error
Error: Worker exited unexpectedly
exit 1, 68.9s
```

동일 전체 suite를 single-worker로 다시 실행했다.

```text
npm test -- --run --maxWorkers=1 --minWorkers=1
exit 0, 298.3s
```

`vitest list --json` 독립 집계는 248 files / 2,162 total이다. 전체 실행에서 skip은 `mock.test.ts` 1건이므로 정확한 표현은 **2,161 passed / 1 skipped / 0 failed**다.

### 8.2 Playwright

- 공식 S4a: `5 passed (9.0s)`
- 독립 ACCOUNTANT/Sales live flow: 첫 실행은 검토 selector strict-mode 오류 1 fail, SALES 1 pass
- selector를 exact heading으로 좁힌 동일 재실행: `2 passed (6.4s)`
- 기존 43 route + anchor 44 sweep: `2 passed (6.5s)`
- Playwright 1.59.1, 설치된 `chromium-1217` / `chromium_headless_shell-1217`
- 자동 QA 서버 종료 후 port 5173 listener 없음

첫 독립 실행 실패 원문:

```text
strict mode violation: getByRole('heading', { name: '2026/08/11-1' }) resolved to 2 elements
```

제품 실패가 아니라 검토 spec이 header `<h2>`와 상세 `<h3>`를 동시에 잡은 원인이었고, `exact: true` 한 변수만 바꿔 재실행했다.

가시성 단정:

- ACCOUNTANT 목록에서 `2026/08/11-1`, `임시저장 · 2026-08-12`가 실제 가시
- DRAFT/CONFIRMED 모두 native anchor이고 상세 진입 성공
- 상세와 목록 body에 UUID 표시 문자열 없음
- history scroll `720 → 720`
- SALES는 정산 직접 route에서 대시보드로 복귀하고 정산 메뉴 0개

캡처:

- [ACCOUNTANT 목록](../qa/2026-08-11-dg1-s4a-sol2/01-accountant-list.png)
- [DRAFT 상세](../qa/2026-08-11-dg1-s4a-sol2/02-accountant-draft-detail.png)
- [scroll 720 복귀 목록](../qa/2026-08-11-dg1-s4a-sol2/03-accountant-list-after-back-720.png)
- [CONFIRMED 상세](../qa/2026-08-11-dg1-s4a-sol2/04-accountant-confirmed-detail.png)
- [SALES 거부](../qa/2026-08-11-dg1-s4a-sol2/05-sales-denied.png)

## 9. 구현자 수정 지시서

### 9.1 불변식

1. V101의 각 `grants` CTE에서 `role_code`는 행 단위로 유일해야 한다.
2. template grant role set은 exact `{MASTER, MANAGER, ACCOUNTANT}` 3개이고 각 비트는 `111`; 그 밖의 8역할 결과는 `0000000`이다.
3. role-page grant role set도 exact `{MASTER, MANAGER, ACCOUNTANT}` 3개이고 각 비트는 `11`이다.
4. 최종 map equality뿐 아니라 원본 grant 행의 개수·role set·중복을 각각 독립 단정한다.
5. 기존 DRIVER 초과 grant와 mock DOWNLOAD 초과 bit 뮤테이션은 계속 RED여야 한다.
6. migration 본문과 권한 결과는 현재 11×7 표에서 바뀌지 않는다.
7. R-2~R-5, accounting 1,871, desktop 2,162 total, RED-B 33/44/62를 보존한다.

### 9.2 수정 좌표 전수

- `services/auth-service/src/test/java/com/samhanair/logis/auth/domain/SalesCommissionSettlementPermissionSeedTest.java:111-123` — `bitsMap()` 중복 판정
- 같은 파일 `:52-77` — template exact 테스트
- 같은 파일 `:80-94` — role-page exact 테스트
- `services/auth-service/src/main/resources/db/migration/V101__seed_sales_commission_settlement_page_permission.sql:10-12` — role-page grants
- 같은 migration `:31-35` — template grants
- `docs/dev-reports/2026-08-11-dg1-s4a-fix.md:44-55` — WAREHOUSE 행 누락
- 같은 보고서 `:175` — desktop 통과 수 과대 표기

### 9.3 재현 데이터

template grant의 기존 MASTER 앞에 `('MASTER', FALSE, FALSE, FALSE)`를 추가하고 exact 테스트를 실행한다. 현재는 `BUILD SUCCESSFUL`이므로 RED가 되어야 한다.

### 9.4 RED-A 표적

1. `Set<String>` 등 비트값과 독립된 seen-role 감시로 동일 role 두 번째 행을 무조건 RED로 만든다.
2. template parsed rows의 role set과 row count가 exact 3인지 단정한다.
3. role-page parsed rows의 role set과 row count가 exact 3인지 단정한다.
4. `MASTER 000 → MASTER 111` 중복 mutation이 RED인지 직접 실행한다.
5. 가능하면 공유 DB가 아닌 격리 PostgreSQL/Testcontainers에 V101을 적용해 중복행 mutation의 migration 실패도 증명한다.

### 9.5 RED-B 표적

1. 현재 정상 V101에서 auth exact 3 tests가 GREEN이다.
2. DRIVER `111` 초과 grant가 RED다.
3. mock DOWNLOAD 초과 bit가 RED다.
4. 11역할×7비트, builtin group/account materialization 비트가 그대로다.
5. accounting 전체와 S1·S2 핵심 계약이 그대로다.
6. 공식 Playwright 5건과 DRAFT/CONFIRMED history 복귀가 그대로다.

### 9.6 반드시 추가할 새 조합

- template: `MASTER 000` 다음 `MASTER 111`
- template: `DRIVER 000` 중복 2행
- role-page: `MASTER 00` 다음 `MASTER 11`
- grants에 알려지지 않은 역할 1행
- 허용 3역할 순서 변경(순서는 허용하되 중복/누락은 RED)
- 정상 3행 baseline

**제 전제가 틀렸다면 고치지 말고 중단·보고하십시오.** 특히 PostgreSQL의 동일 INSERT 중복 후보가 실제 schema/constraint상 cardinality violation이 아니거나, grant CTE에 같은 role을 여러 행 두는 것이 승인된 설계라면 테스트만 임의로 강화하지 말고 그 정본 좌표와 격리 실행 원문을 먼저 보고해야 한다.

## 10. 이 라운드가 보지 않은 표면

- 공유 DB에 V101을 실제 적용한 결과: write 금지로 미검증
- 운영 gateway/JWT/reverse proxy를 통과한 실제 403: 이번 증거는 accounting embedded HTTP와 gateway 전달 header 계약까지다.
- VIEW-only/CREATE-only/UPDATE-only 계정의 네 endpoint 실 HTTP 교차표
- live DB에서 DRAFT 생성·확정 및 동시 채번
- Electron 패키징 설치본, 모바일 클라이언트, 운영 프린트 surface

이 미검증 목록과 별개로 현재 병합 차단 사유는 SOL-S4A-R2-01 한 건이다.
