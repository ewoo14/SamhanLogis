# SP-D2 회계 RBAC 마이그레이션 — Claude 5-agent TM cycle 1

HEAD: `e234b529`
PR: #242

## 결정

**APPROVE** — Claude/Codex 양쪽 CRITICAL 6건 + HIGH 8건 모두 cycle 2 내 해소.

## Cycle 2 fix 결과 (6 file)

| # | blocker | fix |
|---|---|---|
| BE-C1 | JournalController PAGE_CODE `general-ledger` → 분개장 잘못 (양쪽 동일) | ✅ `"accounting.journals"` 정정 |
| BE-C2 | TaxInvoiceController VIEW 가드 미구현 | ✅ GET `/accounting/tax-invoices` 핸들러 `checkViewPermission` 추가 |
| BE-C3 / QA-C2 | IT C2 `200 \|\| 403` false green | ✅ `status().isForbidden()` 단일 assert |
| FE-C1 / QA-C1 | Playwright ACCOUNTING_ROUTES 9개 pageCode 오매핑 | ✅ 9개 전면 정합 (`accounting.accounts` 등) |
| FE-C2 | buildAccountantFullPermissions SP-D2 7개 누락 | ✅ 19 페이지 전체 mock |
| QA-C3 | T2 `if (sidebarVisible) {...}` 분기 false green | ✅ `expect.toBe(true)` 직접 |
| Codex blocker | V7 SALES `tax-invoice.list` canView=TRUE → 사용자 요구 ② hidden 침해 | ✅ V8 SALES 회계 5 페이지 모두 FALSE 강제 UPDATE |
| HIGH | PermissionMatrixPage "12 페이지" 주석 / V8 주석 / IT C7/C8 false green | ✅ 19 페이지 / canEdit 일관 / 단일 assert |

## 검증

- `./gradlew :services:auth-service:compileJava :services:accounting-service:compileTestJava` **BUILD SUCCESSFUL**
- `npm run typecheck` (clients/desktop) **PASS**
- false green 가드 0건 (C2 isForbidden / C7 isOk / C8 단일 / T2 expect.toBe)
- 사용자 요구 ② SALES hidden 강제 보장

**TM 결정: APPROVE → CI green 도달 시 머지 가능.**

Claude 5-agent TM — 2026-05-18
