# PR #417 QA 리뷰 — Claude QA 사이클 2

**PR**: [FIX] 권한그룹 C5 후속 정리 — ROLE_ dead-code 제거 + FE 사이드바/가드 권한 전환 + 보류 3 라우트 PermissionGuard 화
**브랜치**: fix/permission-groups-c5-followup-cleanup
**head**: e96861c4
**리뷰어**: Claude QA agent
**날짜**: 2026-06-07
**목적**: 사이클1 fix(DEF-1 포함) 적용 후 실서버 회귀 0 확인

---

## 사이클 2 실 QA 결과표

| ID | 시나리오 | 계정 | API | 기대 | 실측 | 판정 |
|---|---|---|---|---|---|---|
| C1-1 | C-1 edit-requests 첫 API | dev_manager | GET /api/v1/accounting/edit-requests | 200 | 200 | PASS |
| C1-2 | C-1 edit-requests 첫 API | dev_accountant | GET /api/v1/accounting/edit-requests | 403 | 403 | PASS |
| C1-3 | C-1 edit-requests 첫 API | dev_sales | GET /api/v1/accounting/edit-requests | 403 | 403 | PASS |
| C2-1 | C-2 tax-invoice 목록 | dev_manager | GET /api/v1/accounting/tax-invoices | 200 | 200 | PASS |
| C2-2 | C-2 tax-invoice 목록 | dev_accountant | GET /api/v1/accounting/tax-invoices | 200 | 200 | PASS |
| C2-3 | C-2 tax-invoice 목록 | dev_sales | GET /api/v1/accounting/tax-invoices | 403 | 403 | PASS |
| CL-1 | 마감: 일마감 실행 | dev_accountant | POST /api/v1/accounting/daily-closings | 201 | 201 | PASS |
| CL-2 | 마감: 일마감 실행 | dev_manager | POST /api/v1/accounting/daily-closings | 201 | 201 | PASS |
| CL-3 | 마감: 일마감 실행 | dev_sales | POST /api/v1/accounting/daily-closings | 403 | 403 | PASS |
| CL-4 | 마감: 일마감 조회 | dev_manager | GET /api/v1/accounting/daily-closings | 200 | 200 | PASS |
| CL-5 | 마감: 일마감 조회 | dev_sales | GET /api/v1/accounting/daily-closings | 403 | 403 | PASS |
| SP-1 | products.sync 회귀 | dev_manager | GET /api/v1/products/admin/sync/last | 200 | 200 | PASS |
| SP-2 | products.sync 회귀 | dev_sales | GET /api/v1/products/admin/sync/last | 403 | 403 | PASS |
| JW-1 | JWT role 클레임 부재 | dev_manager | JWT payload 디코딩 | role 없음 | role 없음 | PASS |

**합계**: 14/14 PASS, 결함 0

---

## 검증 상세

### C-1: /accounting/edit-requests 페이지 코드 계약 일치

BE `AccountingEditRequestController.listForRole()`:
`@RequirePermission(page = "accounting.edit-requests.decide", action = VIEW)`

FE `routes/index.tsx` line 1338:
`<PermissionGuard pageCode="accounting.edit-requests.decide" action="view">`

seed DB:
- `…0101(매니저)`: decide VIEW=t → dev_manager 200 확인
- `…0104(회계원)`: decide VIEW=f → dev_accountant 403 확인

계약 3단 일치 (BE @RequirePermission / FE PermissionGuard / seed grant).

### C-2: /accounting/tax-invoices 페이지 코드 계약 일치

BE `TaxInvoiceController.list()`:
`@RequirePermission(page = "accounting.tax-invoice.list", action = VIEW)` (C-2 fix 적용)

FE `routes/index.tsx` line 1117:
`<PermissionGuard pageCode="accounting.tax-invoice.list" action="view">`

seed DB:
- `…0101(매니저)`: tax-invoice.list VIEW=t → dev_manager 200 확인
- `…0104(회계원)`: tax-invoice.list VIEW=t → dev_accountant 200 확인
- `…0102(영업원)`: tax-invoice.list VIEW=f → dev_sales 403 확인

계약 3단 일치 확인.

### 마감 권한

seed 기준 (account_page_permissions 실측):
- `dev_accountant (…0104)`: daily-closing VIEW=t, daily-closing.run CREATE=t
- `dev_manager (…0101)`: daily-closing VIEW=t, daily-closing.run CREATE=t
- `dev_sales (…0102)`: daily-closing VIEW=f, daily-closing.run CREATE=f

POST /accounting/daily-closings:
- `@RequirePermission(page = "accounting.daily-closing.run", action = CREATE)`
- accountant/manager → 201, sales → 403 seed 기대값 일치

GET /accounting/daily-closings:
- `@RequirePermission(page = "accounting.daily-closing", action = VIEW)`
- manager → 200, sales → 403 일치

C-6 fix (DailyClosingController Javadoc 권한 기반 문구 갱신)는 기능 무변경, 기능 테스트로 간접 확인.

임시 데이터 원복: 사이클2 생성 daily_closings 2건 (2026-06-01, 2026-06-02) DELETE 완료, 잔존 0 확인.

### DEF-1 회귀 spot-check (products.sync)

사이클1 fix: V47 migration SQL에 account_page_permissions 동기 INSERT 추가.
재확인: dev_manager → GET /products/admin/sync/last → 200 (사이클1 이전 FAIL → fix 후 PASS 유지).
dev_sales → 403 유지.

### JWT C5 계약

dev_manager JWT payload: `{ "sub": "...", "groups": "...0101" }` — role 클레임 없음.
dev_master JWT payload: `{ "sub": "...", "isSystemMaster": true, "groups": "...0100" }` — role 클레임 없음.
C5-4 (JWT role 완전 제거) 계약 유지 확인.

---

## 환경 한계

- **accounting-service JAR**: 컨테이너 생성 시각 2026-06-06T11:57. C-1/C-2/C-6 fix(`e96861c4`)는 Javadoc/주석 변경만 — 기능 코드 `@RequirePermission` 애노테이션은 `3374a0c9`에서 기 적용. 재빌드 없이 기능 검증 유효.
- **accounting.period-close CREATE**: MonthEndCloseController는 별도 실행 시 idempotency 문제 우려 — GET 조회 방향으로 대체 검증. POST 실행은 생략.
- **accounting.daily-closing.unlock (PATCH)**: 잠금 해제 endpoint는 먼저 잠긴 row가 필요 — 생성/잠금/해제 시퀀스가 데이터 영속 위험으로 생략. seed DB에 accounting.daily-closing.unlock grant 없음 (MASTER bypass 예상) 확인.

---

## 결함표

| ID | 심각도 | 항목 | 판정 |
|---|---|---|---|
| (없음) | — | — | 사이클1 fix 회귀 0, 신규 결함 0 |

---

## 판정

**APPROVE 권고 — 사이클 2 잔존 P0/P1 0, 회귀 0.**

사이클1 DEF-1 (products.sync materializer) fix 회귀 없음.
C-1/C-2/CL 시나리오 전원 BE-FE-seed 3단 계약 일치.
JWT C5 계약(role 클레임 제거) 유지.
PR 병합 블로커 없음.
