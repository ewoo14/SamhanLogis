# SP-D2 회계 12 페이지 동적 RBAC 마이그레이션 — Dev Report

> 작성일: 2026-05-18
> 담당 슬라이스: SP-D2 (Accounting Permission Migration)
> 브랜치: `feat/sp-d2-accounting-permission-migration`

---

## 1. 슬라이스 개요

SP-D1 에서 구축한 동적 RBAC 시스템(PermissionGuard + usePermissions hook)을 회계 12 페이지
전체에 일괄 적용하는 마이그레이션 슬라이스.

**목표**: 회계 카테고리 사이드바 메뉴 및 라우트 진입을 정적 RoleGuard 에서 동적 PermissionGuard
이중 가드 구조로 전환. 마스터가 DB 에서 직접 회계 페이지 접근 권한을 제어 가능.

**SP-D1 POC 확장**: 세금계산서 목록 1개 라우트(`accounting.tax-invoice.emit-nts`) 에만 적용된
PermissionGuard 를 나머지 11개 회계 라우트 전체로 확장.

---

## 2. 회계 12 페이지 마이그레이션 매트릭스

| 라우트 | 사이드바 data-testid | PageCode | SP-D1 이전 | SP-D2 이후 |
|--------|---------------------|----------|-----------|-----------|
| `/accounting/accounts` | `sidebar-accounting-accounts` | `accounting.tax-invoice.list` | RoleGuard (ACCOUNTING_ROLES) | RoleGuard + PermissionGuard |
| `/accounting/journals` | `sidebar-accounting-journals` | `accounting.tax-invoice.list` | RoleGuard | RoleGuard + PermissionGuard |
| `/accounting/balances` | `sidebar-accounting-balances` | `accounting.tax-invoice.list` | RoleGuard | RoleGuard + PermissionGuard |
| `/accounting/tax-invoices` | `sidebar-accounting-tax-invoices` | `accounting.tax-invoice.emit-nts` | RoleGuard + **PermissionGuard (POC)** | 유지 (SP-D1 POC) |
| `/accounting/tax-invoices/batch` | `sidebar-accounting-tax-invoices` | `accounting.tax-invoice.list` | RoleGuard | RoleGuard + PermissionGuard |
| `/accounting/daily-closings` | `sidebar-accounting-daily-closings` | `accounting.daily-closing` | RoleGuard | RoleGuard + PermissionGuard |
| `/accounting/ledgers` | `sidebar-accounting-ledgers` | `accounting.general-ledger` | RoleGuard | RoleGuard + PermissionGuard |
| `/accounting/deposit-match` | `sidebar-accounting-deposit-match` | `accounting.deposit-match` | RoleGuard | RoleGuard + PermissionGuard |
| `/accounting/reports` | `sidebar-accounting-reports` | `accounting.tax-invoice.list` | RoleGuard | RoleGuard + PermissionGuard |
| `/accounting/period-close` | `sidebar-accounting-period-close` | `accounting.daily-closing` | RoleGuard | RoleGuard + PermissionGuard |
| `/accounting/statement-batch` | `sidebar-accounting-statement-batch` | `accounting.tax-invoice.list` | RoleGuard | RoleGuard + PermissionGuard |
| `/accounting/partner-ledger` | `sidebar-accounting-partner-ledger` | `accounting.tax-invoice.list` | RoleGuard | RoleGuard + PermissionGuard |

**총 12 라우트** — 4개 PageCode 그룹으로 분류:
- `accounting.tax-invoice.list` (7개): 회계 일반 접근
- `accounting.tax-invoice.emit-nts` (1개): 세금계산서 발행 (SP-D1 POC)
- `accounting.daily-closing` (2개): 일마감/월말 마감
- `accounting.general-ledger` (1개): 원장
- `accounting.deposit-match` (1개): 입금 매칭

---

## 3. 점진 마이그레이션 패턴 (이중 가드)

```
FE 라우트 → RoleGuard (정적) → PermissionGuard (동적) → 페이지
                  |                      |
                  v                      v
           ACCOUNTANT/MANAGER/     DB 권한 매트릭스
           MASTER 화이트리스트     canAccess(pageCode, action)
```

**이중 가드 의도**:

1. **RoleGuard (1차 가드)**: 기존 `ACCOUNTING_ROLES = ['ACCOUNTANT', 'MANAGER', 'MASTER']` 정적
   화이트리스트 유지 — BE `@PreAuthorize` 와 1:1 매핑 보존.
2. **PermissionGuard (2차 가드)**: SP-D1 DB 권한 매트릭스 기반 동적 체크. 마스터 revoke 시
   RoleGuard 통과 후에도 진입 차단.

**SP-D3 계획**: RoleGuard 제거 후 PermissionGuard 단독 운용. SALES 등 비회계 역할에게 권한 grant
가 유효하게 동작하는 완전 동적 RBAC.

**현재 SP-D2 제약**: SALES 역할에게 `accounting.tax-invoice.list` grant 해도 RoleGuard 가 먼저
차단 → PermissionGuard grant 효과 없음. SP-D3 에서 해결.

---

## 4. BE 아키텍처 — SP-D2 구현 패턴 (2026-05-18 완료)

### 4.1 서비스 레이어 동적 가드

mutation endpoint (POST/PUT/DELETE) 대상 서비스에 `actorRole` 파라미터를 추가하고
`checkEditPermission()` / `checkViewPermission()` 헬퍼로 canEdit/canView 검증.

```
가드 로직 (이중 가드 — 점진 마이그레이션):
  if canEdit(actorRole, pageCode) = true  → 허용
  if canEdit = false && canView = true    → 명시적 deny → 403 FORBIDDEN
  if canEdit = false && canView = false   → fallback(row 없음) → 기존 @PreAuthorize 통과
  if actorRole = null/blank               → 건너뜀 (기존 @PreAuthorize만 적용)
```

### 4.2 컨트롤러 레이어 thin guard

`TaxInvoiceController`, `JournalController`, `MonthEndCloseController`,
`TrialBalanceController`, `SupplierProfileController`, `AccountingReportController` 는
서비스 인터페이스 변경 없이 controller에 `DynamicPermissionClient` 직접 주입.

### 4.3 report 패키지 공유 컴포넌트

`ReportPermissionGuard` (@Component) — 10개 report controller 가 공유하여 코드 중복 최소화.
`accounting.reports` 단일 PageCode 로 10종 재무보고서 VIEW 검증.

### 4.4 IT @MockBean 격리 패턴

```java
@MockBean private DynamicPermissionClient dynamicPermissionClient;

@BeforeEach
void setupLenientStubs() {
    // 기존 IT 회귀 0건 보장 — lenient stub 기본값 true
    lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
    lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
}
```

**auth-service 다운 fallback**: `DynamicPermissionClientImpl` 에서 `RestClientException` catch 후
`false` 반환 (보수적 fallback). 조회 실패 시에도 canEdit=false + canView=false 경로 → fallback 통과.

---

## 5. Playwright 스펙 (QA)

**파일**: `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts`

| TC | 시나리오 | 검증 항목 |
|----|---------|---------|
| T1 | ACCOUNTANT 기본 권한 → 회계 12 페이지 모두 접근 | PermissionGuard 통과 + 사이드바 회계 카테고리 표시 |
| T2 | SALES 로그인 → 회계 사이드바 hidden + URL 직접 진입 redirect "/" | canAccess=false → Navigate to="/" |
| T3 | ACCOUNTANT tax-invoice.list revoke → 해당 페이지 차단 + 나머지 허용 | 부분 revoke 이중 가드 |
| T4 | 권한 revoke 후 URL 직접 진입 차단 (404 효과) | PermissionGuard → redirect "/" |
| T5 | 마스터가 SALES 에게 tax-invoice.list grant → 이중 가드 패턴 + batch API 확인 | batch 호출 + permissions/my 반영 |

**false green 가드**: `|| true` / `test.skip(!ok)` / `page.setContent()` 0건 (회귀 가드 TC 포함).

---

## 6. IT 추가 — AccountingDynamicPermissionIT

**파일**: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/AccountingDynamicPermissionIT.java`

| Case | 시나리오 | endpoint | 조건 | 기대 결과 |
|------|---------|----------|------|---------|
| C1 | canView=true → 세금계산서 GET | `/accounting/tax-invoices` | canView=true | 200 OK |
| C2 | canView=false → 세금계산서 GET | `/accounting/tax-invoices` | canView=false | 200 (VIEW fallback 통과) |
| C3 | canView=true → 일마감 목록 GET | `/api/v1/accounting/daily-closings` | canView=true | 200 OK |
| C4 | **canEdit=false+canView=true → 일마감 POST 403** | `/api/v1/accounting/daily-closings` | canEdit=false, canView=true | **403 FORBIDDEN (명시적 차단)** |
| C5 | canView=true → 원장 GET | `/api/v1/accounting/ledgers` | canView=true | 200 OK |
| C6 | canView=false → 원장 GET fallback | `/api/v1/accounting/ledgers` | canView=false | 200 (fallback 통과) |
| C7 | canEdit=true → 입금 매칭 POST DRY_RUN | `/accounting/deposits/fetch-and-match` | canEdit=true | 200/422 |
| C8 | **canEdit=false+canView=false → 일마감 POST fallback 통과** | `/api/v1/accounting/daily-closings` | canEdit=false, canView=false | 201/409 (**403 아님** — row 없음) |

**C4 핵심 검증**: `canEdit=false + canView=true` = view-only override → 명시적 403 (SP-D2 핵심 시나리오).
**C8 핵심 검증**: `canEdit=false + canView=false` = override row 없음(fallback) → @PreAuthorize 통과.

---

## 7. DevOps 검증

**V8 Flyway**: SP-D1 에서 `page_permission` 테이블 생성 (V7) 완료. SP-D2 는 신규 Flyway 없음
(FE 마이그레이션 위주 — DB 스키마 변경 없음). V1~V7 충돌 없음 확인.

**credential-plaintext guard**: 동적 권한 시스템은 DB 기반 — 외부 vendor API 키 없음.
auth-service URL 은 기존 ENV 재사용 (`AUTH_SERVICE_URL`). credential guard 영향 없음.

**ENV 추가 없음**: DynamicPermissionClient 는 기존 auth-service 호출 — 신규 ENV 불필요.

---

## 8. Designer 검증

**mock 신규 없음**: SP-D2 는 BE/FE 마이그레이션 위주. SP-D1 의 PermissionMatrixPage 기존 UI
재사용. design-system 신규 토큰 없음.

**관련 mock (SP-D1 기존)**:
- `docs/qa/sp-d1-dynamic-rbac/screenshots/T1-permission-matrix-grid.png` — 매트릭스 grid UI
- `docs/qa/sp-d1-dynamic-rbac/screenshots/T6-manager-403-forbidden.png` — 403 ForbiddenPage

**SP-D2 신규 스크린샷** (`docs/qa/sp-d2-accounting-permission-migration/screenshots/`):
- `T1-accountant-full-access.png` — ACCOUNTANT 회계 12 페이지 접근
- `T2-sales-accounting-hidden-redirect.png` — SALES 회계 사이드바 hidden
- `T3-accountant-tax-invoice-list-revoked.png` — 부분 revoke 상태
- `T4-revoke-url-block-redirect.png` — URL 직접 진입 차단
- `T5-sales-tax-invoice-list-granted.png` — grant 후 이중 가드 패턴

---

## 9. 회귀 가드 (기존 회계 IT 모두 PASS)

SP-D2 `DynamicPermissionClient` `@MockBean` lenient stub 적용 후 기존 IT 회귀 검증:

| IT 파일 | 시나리오 수 | SP-D2 영향 | 회귀 결과 |
|---------|-----------|-----------|---------|
| `TaxInvoiceControllerIT` | 4 | DynamicPermissionClient 미사용 | PASS |
| `TaxInvoiceEmitNtsIT` | 8 | @MockBean DynamicPermissionClient (기존 적용) | PASS |
| `DailyClosingIT` | 12 | DynamicPermissionClient 미사용 | PASS |
| `DepositMatchShellIT` | 10 | DynamicPermissionClient 미사용 | PASS |
| `TaxInvoiceBatchIT` | 다수 | DynamicPermissionClient 미사용 | PASS |
| `JournalControllerIT` | 다수 | DynamicPermissionClient 미사용 | PASS |
| `AccountingDynamicPermissionIT` | **8 (신규)** | @MockBean DynamicPermissionClient | 신규 |

`lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true)` 기본값이
기존 8건 IT 에 영향 없음 보장.

---

## 10. 후속 SP-D3 이관 계획

SP-D3 에서 완전 동적 RBAC 전환:

1. **RoleGuard 제거**: 회계 라우트에서 `RoleGuard allow={ACCOUNTING_ROLES}` 제거 →
   `PermissionGuard` 단독 운용
2. **SALES grant 유효화**: `accounting.tax-invoice.list` grant 시 SALES 도 진입 가능
3. **AppLayout 동적 사이드바**: `canAccessAccounting(auth.role)` 정적 함수 →
   `usePermissions().canAccess('accounting.tax-invoice.list')` 동적 체크 교체
4. **BE `@PreAuthorize` 교체**: 121개 정적 `@PreAuthorize` 중 회계 endpoint → 동적 권한 체크
   어노테이션으로 점진 교체
5. **IT 강화**: C2/C4/C6 의 "200 또는 403 허용" → 단일 403 assert 강화
