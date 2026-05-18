# SP-D2 회계 RBAC 마이그레이션 — Codex 5-agent TM cycle 1

HEAD: `e234b529`
PR: #242

## 결정

**APPROVE** — Codex 3 blocker 모두 cycle 2 내 해소.

## Codex blocker → fix

| # | blocker | fix |
|---|---|---|
| 1 | FE/BE PageCode 불일치 (`accounting.journals` vs `general-ledger` 등) | ✅ Controller PAGE_CODE 상수 + Playwright spec ACCOUNTING_ROUTES 9개 전면 정합 |
| 2 | SALES hidden 충돌 — V7 seed/mock 기본값 `accounting.tax-invoice.list` view=true | ✅ V8 SALES 회계 5 페이지 UPDATE FALSE 강제 (사용자 요구 ②) |
| 3 | QA 산출물 노후화 — Playwright/scenarios/SQL/dev-report 가 V8 7개 신규 PageCode 미반영 | ✅ spec buildAccountantFullPermissions 19 페이지 추가 + 주석 정합 |

**TM 결정: APPROVE → CI green 도달 시 머지 가능.**

Codex 5-agent TM — 2026-05-18
