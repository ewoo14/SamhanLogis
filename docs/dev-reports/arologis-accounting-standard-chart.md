# arologis 간이회계 표준 계정과목 + 활성상태 관리 — 개발 상세

> 2026-06-09. arologis 백오피스 실 운영 seed 확정 + 계정과목 활성상태 관리 기능. PR: feat/arologis-accounting-standard-chart.

## 변경 요약

### arologis-service
- **V17 마이그레이션** (`V17__arologis_standard_chart_and_departments.sql`)
  - 부서 3개 확정: 대표실(EXEC)/행정팀(ADMIN)/회계팀(ACCOUNTING). 배차/운영 soft-delete.
  - `arologis_simple_account.type` CHECK 4→5유형(EQUITY 추가).
  - 표준계정과목 83개 upsert(자산33/부채15/자본8/수익11/비용31). 운송업 상용만 active=TRUE.
- `AccountType` enum: `EQUITY` 추가(5분류).
- `ArologisSimpleAccount.changeActive(boolean)`: 멱등 활성상태 변경(동일값 무시).
- `ArologisAccountingService`: `listAllAccounts()`(비활성 포함) + `setAccountActive(code, active, actor)`. `SimpleAccountView` 에 `active` 추가.
- `ArologisAccountingController`: `GET /accounts/all`(VIEW), `PUT /accounts/{code}/active`(UPDATE) — page-code `arologis.accounting.accounts`. `AccountActiveRequest(@NotNull Boolean active)`.

### auth-service
- `PageCode.AROLOGIS_ACCOUNTING_ACCOUNTS("arologis.accounting.accounts", "아로로지스 계정과목 관리")`.
- **V54 마이그레이션**: role_page_permissions 시드 — MASTER/ACCOUNTANT V/E, MANAGER/DEVELOPER/SALES/DRIVER 차단.
- `PageCodeTest`: V54 동기화 단언 추가.

### arologis-desktop (FE)
- `AccountsPage.tsx`(신규): 표준차트 목록 + 유형/활성상태 필터 + 활성상태 토글(낙관적 갱신+롤백). "활성상태" 표기.
- `arologisAccounting.ts`: `AccountType += EQUITY`, `SimpleAccountView.active`, `listAllAccounts()`, `setAccountActive()`.
- `authStore.canManageAccounts(role)` = MASTER|ACCOUNTANT.
- `AppLayout` 네비 "계정과목"(canManageAccounts 게이트), `routes` `/admin/accounts`.
- `CashbookPage` 계정유형 라벨에 자본 추가 + fallback 옵션 active 보정.

## 핵심 설계 결정
1. **활성상태 page-code 분리**: 현금출납장(`arologis.accounting.cashbook`)과 별도 `arologis.accounting.accounts`. 회계 거래 입력 권한과 계정 마스터 관리 권한 격리(매니저는 거래 입력 가능, 계정 관리 불가).
2. **권한 매핑**: 대표실=마스터, 회계팀=회계사원. 부서≠롤 별개 축이나 enforcement는 롤 기반.
3. **스코프 한정**: 표준차트 고정 → CRUD 아닌 활성상태 토글만.

## 테스트
- `ArologisAccountingServiceIT`(실 Postgres): EQUITY 실 INSERT 적재 검증, active↔전체 분리, setAccountActive 토글 노출 변동, 미존재 코드 404.
- `PageCodeTest`: V54 page-code 동기화.
- 검증: arologis-service compileJava/compileTestJava + auth-service compileTestJava + arologis-desktop `npm run typecheck` 전부 PASS.

## QA (실 Docker 의무)
풀스택 Docker 실 QA — `docs/qa/arologis-accounting-standard-chart/`. (PR 진행 중 첨부)

## 교훈
- **[[enum-expansion-check-constraint]] 재적용**: 영속 enum 값(EQUITY) 추가 시 DB CHECK 마이그레이션 동반 필수. 본 슬라이스는 V17에서 CHECK 확장을 선반영 — 실 Postgres IT가 자본 계정 INSERT로 회귀 가드.
