# SP-D2 BE Review — Claude (Cycle 1)

브랜치: `feat/sp-d2-accounting-permission-migration` (commit `8090c109`)
리뷰 일시: 2026-05-18
리뷰어: Claude BE agent

---

## 1. 검증 범위

- `services/auth-service/.../domain/PageCode.java` (+7 신규 enum 상수)
- `services/auth-service/.../db/migration/V8__sp_d2_accounting_page_permissions.sql` (49 row seed)
- `services/accounting-service/.../service/DailyClosingService.java`
- `services/accounting-service/.../service/DepositMatchService.java`
- `services/accounting-service/.../service/LedgerService.java`
- `services/accounting-service/.../web/TaxInvoiceController.java`
- `services/accounting-service/.../web/JournalController.java`
- `services/accounting-service/.../web/MonthEndCloseController.java`
- `services/accounting-service/.../web/TrialBalanceController.java`
- `services/accounting-service/.../web/SupplierProfileController.java`
- `services/accounting-service/.../web/AccountingReportController.java`
- `services/accounting-service/.../report/ReportPermissionGuard.java` (신규)
- `services/accounting-service/.../report/*Controller.java` (10개 — report 패키지)
- `services/accounting-service/.../it/AccountingDynamicPermissionIT.java` (8 case)
- 기존 IT 20개 `@MockBean DynamicPermissionClient` 추가 여부

---

## 2. 결함 목록

### [CRITICAL] C1 — JournalController PAGE_CODE 불일치

**파일**: `web/JournalController.java`  
**라인**: `private static final String JOURNAL_PAGE_CODE = "accounting.general-ledger";`  
**내용**: 분개장(journals) 라우트에 `accounting.journals` PageCode 가 등록되어 있음에도 불구하고, JournalController 는 `accounting.general-ledger` 를 PAGE_CODE 로 사용한다. Flyway V8 에서 `accounting.journals` 에 ACCOUNTANT canEdit=true 이지만 `accounting.general-ledger` 에는 canEdit=false 로 seed 되어 있으므로, ACCOUNTANT 가 분개장을 편집하려 할 때 view-only override(canEdit=false + canView=true) 조건이 트리거되어 403 FORBIDDEN 이 반환될 수 있다.

**영향**: ACCOUNTANT 분개 생성(`POST /accounting/journals`) / POST / reverse 엔드포인트 모두 403 반환.  
**권장 fix**: `JOURNAL_PAGE_CODE = "accounting.journals"` 로 변경.

---

### [CRITICAL] C2 — TaxInvoiceController 세금계산서 목록 VIEW 가드 누락

**파일**: `web/TaxInvoiceController.java`  
**내용**: 컨트롤러 선언부에 `TAX_INVOICE_LIST_PAGE_CODE = "accounting.tax-invoice.list"` 상수는 있으나, `GET /accounting/tax-invoices` 엔드포인트에서 `DynamicPermissionClient.canView()` 호출 코드가 확인되지 않는다(서비스 레이어에도 checkViewPermission 없음). `@PreAuthorize` 정적 가드만 존재. IT C2(canView=false) 에서도 "403 또는 200 모두 허용"으로 느슨하게 처리되어 있어 false green 이 발생한다.  
**권장 fix**: `GET /accounting/tax-invoices` 핸들러에서 `dynamicPermissionClient.canView(roleHeader, TAX_INVOICE_LIST_PAGE_CODE)` 검증 추가 또는 서비스 레이어 `checkViewPermission` 적용.

---

### [CRITICAL] C3 — IT C2 false green (이중 assert 느슨함)

**파일**: `it/AccountingDynamicPermissionIT.java`, C2 케이스  
**내용**:
```java
boolean isExpected = status == 200 || status == 403;
```
canView=false 를 stub 했음에도 200 을 허용하는 로직은 **설계 의도(403)를 검증하지 못하는 false green**이다. SP-D2 동적 권한 deny 의 핵심 목적(VIEW 차단 = 403)을 단위 수준에서 보증하지 않는다. C7(입금 매칭 canView=true → 200/422 허용)도 동일 패턴.  
**권장 fix**: C2 는 `status().isForbidden()` 단일 assert 로 교체. C7 은 200 단독 assert.

---

### [CRITICAL] C4 — IT C8 fallback 검증 로직 오류

**파일**: `it/AccountingDynamicPermissionIT.java`, C8 케이스  
**내용**:
```java
boolean isExpected = status == 201 || status == 409 || status == 404;
```
C8 설명은 "canEdit=false + canView=false = row 없음 fallback → 기존 @PreAuthorize 통과"로 명시하나, 조건에 `404` 도 허용한다. 일마감 POST fallback 통과 시 404 는 발생할 이유가 없다(NOT_FOUND 는 partnerCode 지정 시에만 발생). 404 허용은 테스트 신뢰도를 낮춘다.  
**권장 fix**: `status == 201 || status == 409` 로 좁히거나 불필요한 404 허용 제거.

---

### [HIGH] H1 — AccountingReportController 이중 PAGE_CODE 관리 문제

**파일**: `web/AccountingReportController.java`  
**내용**: 컨트롤러 내부에 `REPORTS_PAGE_CODE = "accounting.reports"` 와 `STATEMENT_BATCH_PAGE_CODE = "accounting.statement-batch"` 두 개의 PAGE_CODE 가 존재한다. `report` 패키지의 10개 controller 는 `ReportPermissionGuard` 를 공유하는데, `AccountingReportController`(web 패키지) 는 별도로 `DynamicPermissionClient` 를 직접 주입하여 중복 가드가 실행될 가능성이 있다.  
**권장 fix**: `AccountingReportController` 도 `ReportPermissionGuard` 를 공유하도록 리팩터링하거나, VIEW 전용 guard 경로를 단일화.

---

### [HIGH] H2 — V8 migration 49 row — ACCOUNTANT balances/reports/partner-ledger edit=false 불일치

**파일**: `V8__sp_d2_accounting_page_permissions.sql`  
**내용**: 주석(`# 역할별 기본 권한 정책`)에 "ACCOUNTANT → 전체 view + edit 허용 (회계 전담 역할)"이라 명시되어 있으나, 실제 seed 는 아래와 같이 edit=false 를 포함한다:
- `accounting.balances` ACCOUNTANT → `TRUE, FALSE`
- `accounting.reports` ACCOUNTANT → `TRUE, FALSE`
- `accounting.partner-ledger` ACCOUNTANT → `TRUE, FALSE`

주석과 실제 seed 가 불일치한다. 의도된 차등 권한이라면 주석을 수정해야 하고, 의도가 전체 허용이라면 seed 를 수정해야 한다. 현재 상태는 검토자가 정책을 확인할 수 없는 모호한 문서화 결함이다.  
**권장 fix**: 주석을 실제 seed 에 맞게 수정하거나, 정책 결정을 명확히 반영.

---

### [HIGH] H3 — LedgerService checkViewPermission 실질 미동작

**파일**: `service/LedgerService.java`  
**내용**: `checkViewPermission` 에서 `canView=false` 일 때 log.debug 만 남기고 예외를 발생시키지 않는다. 즉 `canView=false` 가 와도 읽기 요청은 통과된다. IT C6 에서 "canView=false → 점진 마이그레이션 fallback → 200 허용"으로 명시되어 있으나, 이는 VIEW 차단이 전혀 구현되지 않음을 의미한다. 이중 가드 정책(canView=false → 403) 과 비일관된 설계이다. 동일하게 `ReportPermissionGuard.checkView()` 도 동일 패턴.  
**권장 fix**: "점진 마이그레이션" 단계라면 IT 에 명시적 TODO 마커를 추가하고 dev-report 에 미완 구현 사항으로 기록.

---

### [MEDIUM] M1 — V8 migration pgcrypto extension 불필요 누락

**파일**: `V8__sp_d2_accounting_page_permissions.sql`  
**내용**: V7 에서는 `CREATE EXTENSION IF NOT EXISTS "pgcrypto"` 가 있으나 V8 에는 없다. V8 이 UUID 리터럴(`'d2000001-...'`)을 직접 사용하므로 기능상 문제는 없지만, 환경 일관성 차원에서 V7 에만 extension 이 있고 V8 이 생략한 이유가 불명확하다. 신규 배포 환경에서 V7 이 누락될 경우를 대비한 `CREATE EXTENSION IF NOT EXISTS "pgcrypto"` 추가 권고.

---

### [MEDIUM] M2 — DailyClosingService checkEditPermission 순서 문제

**파일**: `service/DailyClosingService.java`  
**내용**: `close()` 메서드에서 `checkEditPermission(actorRole, actorUserId)` 를 먼저 호출한 다음 `actorUserId` null/blank 검증을 수행한다:
```java
checkEditPermission(actorRole, actorUserId);  // 먼저 호출
if (actorUserId == null || actorUserId.isBlank()) {  // 이후 검증
    throw new IllegalArgumentException("actorUserId 는 필수입니다");
}
```
actorUserId=null 인 경우 checkEditPermission 에서 null 이 로그에 기록되고, 이후 별도 예외가 발생한다. 순서 역전이 혼란을 야기한다.  
**권장 fix**: `actorUserId` 검증을 `checkEditPermission` 호출보다 먼저 수행.

---

### [MEDIUM] M3 — IT 수: 요구사항 "20개 기존 IT @MockBean 추가" 실제 21개

**내용**: 섹션 A 요구사항에 "20개 기존 IT @MockBean DynamicPermissionClient 추가"라고 명시되어 있으나, 실제로는 `AccountingDynamicPermissionIT` 포함 22개 IT 파일 모두에 `@MockBean DynamicPermissionClient` 가 확인된다. `ApplicationContextLoadIT` 와 `ChartOfAccountSeedIT` 는 `@MockBean` 어노테이션 없이 필드 선언만 존재하여 실제 MockBean 등록 여부가 불명확하다.  
**권장 fix**: ApplicationContextLoadIT, ChartOfAccountSeedIT 의 DynamicPermissionClient 필드에 `@MockBean` 어노테이션 명시.

---

### [LOW] L1 — PageCode enum Javadoc 19개 카운트 정확

**파일**: `PageCode.java`  
**내용**: enum 상수 19개 모두 한국어 Javadoc 존재 확인 (PASS).

---

### [LOW] L2 — fromCode/isValid 정적 메서드 성능 (이슈 아님)

**내용**: `fromCode()` 와 `isValid()` 모두 선형 탐색. 19개 항목에서 성능 문제 없음. 향후 PageCode 확장 시 Map 기반 색인 전환 권고 (현재 이슈 아님).

---

## 3. 항목별 검증 결과

| 검증 항목 | 결과 | 비고 |
|---|---|---|
| 이중 가드 정책 일관 (canEdit=false + canView=true → 403) | PASS | DailyClosingService, DepositMatchService, JournalController 구현 확인 |
| JournalController PAGE_CODE 정합 | FAIL | accounting.general-ledger 사용 (journals 필요) |
| TaxInvoiceController VIEW 가드 | FAIL | canView 호출 미확인 |
| actorRole=null/blank fallback 동작 | PASS | 3개 서비스 모두 early-return |
| canEdit=false + canView=false → fallback 통과 | PASS | DailyClosingService 구현 확인 |
| DynamicPermissionClient RestClient 의존성 | PASS | Spring Cloud 미사용, RestClient 직접 호출 패턴 |
| @MockBean 격리 (AccountingDynamicPermissionIT) | PASS | 8 외부 client MockBean 선언 |
| @MockBean 격리 (기존 IT 22개) | WARN | ApplicationContextLoadIT/ChartOfAccountSeedIT @MockBean 어노테이션 미명시 |
| Spring Security 회귀 | PASS | @PreAuthorize 기존 유지 확인 |
| V8 Flyway pgcrypto extension | WARN | 불필요하나 환경 일관성 관점 누락 |
| V8 단독 발급 / V7 다음 순차 | PASS | V7__add_role_page_permissions.sql → V8 순서 확인 |
| PageCode 19개 enum 누락 없음 | PASS | 19개 상수 확인 |
| 한국어 Javadoc | PASS | 모든 신규 파일 확인 |
| IT C2 false green | FAIL | 200 || 403 허용 |
| IT C8 fallback 검증 오류 | WARN | 404 불필요 허용 |
| V8 49 row seed count | PASS | 7 pageCode × 7 role = 49 |
| ACCOUNTANT balances/reports/partner-ledger 주석 불일치 | FAIL | 문서 불일치 |

---

## 4. TM 권고

**cycle 2 권고**.

CRITICAL 4건:
1. JournalController PAGE_CODE `accounting.general-ledger` → `accounting.journals` 수정 (기능 결함)
2. TaxInvoiceController 세금계산서 목록 VIEW canView 가드 추가 또는 서비스 레이어 이관
3. IT C2 false green 제거 (`200 || 403` → `isForbidden()` 단일 assert)
4. IT C8 `404` 허용 제거

HIGH 3건:
- H1: AccountingReportController 이중 가드 정리
- H2: V8 migration 주석 ACCOUNTANT 정책 불일치 수정
- H3: VIEW-only guard 미동작 TODO 마커 추가 또는 구현 완료

CRITICAL 건 중 C1(JournalController PAGE_CODE 오류)은 기능 직접 영향으로 cycle 2 fix 필수.
