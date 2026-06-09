# arologis 간이회계 표준 계정과목 + 부서 확정 + 활성상태 관리 — Spec

> 2026-06-09 개발책임자 지시. arologis 백오피스 실 운영 seed 확정 + 계정과목 활성상태 관리 기능.

## 1. 배경 / 결정

arologis-desktop 백오피스(인사/간이회계/권한)의 임시 placeholder seed를 실 운영값으로 확정한다.
개발책임자 결정(2026-06-09, 본 세션):

| 항목 | 결정 |
|---|---|
| 운영 단위 | **아로로지스**(삼한 퍼블릭 아님 — 독립 부서·계정과목 운영) |
| 부서 | **대표실 / 행정팀 / 회계팀** 3개만 |
| 계정과목 | **일반기업회계기준 표준계정과목 5유형 전체** 적재 |
| 활성 정리 | 운송업 비상용 계정은 비활성(active=false), 데이터는 보존 |
| 활성상태 설정 권한 | **대표실·회계팀** → 롤 매핑 **마스터(MASTER) + 회계사원(ACCOUNTANT)** 만 |
| UI 표기 | 내부 필드 `active` 미노출, **"활성상태"** 로 표시 |

## 2. 스코프

### 2.1 데이터 (arologis-service V17)
- `arologis_department`: 대표실(EXEC)/행정팀(ADMIN)/회계팀(ACCOUNTING) 3개. 기존 배차/운영 soft-delete.
- `arologis_simple_account.type` CHECK: 4유형 → **5유형(자본 EQUITY 추가)**. 기존 4유형이라 EQUITY INSERT 거부됨 → CHECK 확장 필수 ([[enum-expansion-check-constraint]]).
- 표준계정과목 **101개** 적재(자산 35 / 부채 15 / 자본 8 / 수익 11 / 비용 32). 코드 체계 4자리(1xxx 자산·2xxx 부채·3xxx 자본·4xxx 수익·8xxx 비용). 운송업 상용 계정만 active=TRUE.

### 2.2 활성상태 관리 (신규 기능)
- BE arologis-service:
  - `GET /admin/arologis/accounting/accounts/all` — 비활성 포함 전체(관리용). page-code `arologis.accounting.accounts` VIEW.
  - `PUT /admin/arologis/accounting/accounts/{code}/active` — 활성상태 토글. 동 page-code UPDATE.
  - `SimpleAccountView` 에 `active` 필드 추가. `ArologisSimpleAccount.changeActive(boolean)`.
- auth-service:
  - PageCode `AROLOGIS_ACCOUNTING_ACCOUNTS("arologis.accounting.accounts")`.
  - V54 시드: 마스터/회계사원만 V/E, 나머지 4롤(매니저/개발자/영업사원/배송기사) 차단. 현금출납장(cashbook) page-code 와 **분리** — 거래 입력 권한이 있어도 계정 마스터 관리는 격리.
- FE arologis-desktop:
  - `AccountsPage` — 표준계정과목 목록 + 유형/활성상태 필터 + **활성상태 토글**(낙관적 갱신+롤백). "활성상태" 한국어 표기.
  - `canManageAccounts(role)` = MASTER|ACCOUNTANT (nav/페이지 게이트). BE @RequirePermission 최종 방어.
  - 네비 "계정과목" 항목, 라우트 `/admin/accounts`.

### 2.3 비스코프
- 계정과목 CRUD(생성/수정/삭제) — 표준차트 고정이므로 활성상태 토글만 제공.
- 복식부기/분개/마감 — 단식부기 현금출납장 유지.

## 3. 권한 매핑 근거
아로로지스는 부서(대표실/행정팀/회계팀)와 롤(6롤)이 별개 축이며 enforcement는 롤 기반 page-code 매트릭스로만 동작.
"대표실·회계팀" → 마스터(대표실 대표 계정)·회계사원(회계팀)으로 매핑. 매니저(행정팀 관리)는 회계 거래 입력은 가능하나
계정과목 마스터 활성상태 관리에서는 제외(권한 격리).

## 4. 검증 (Docker 실 QA 의무)
- **실 Postgres IT**: V17 자본(EQUITY) 계정 실 INSERT 적재 검증(CHECK 미확장 시 Flyway 실패) + listAccounts(active)↔listAllAccounts(전체) 분리 + setAccountActive 토글로 드롭다운 노출 변동.
- **풀스택 Docker 실 QA**: auth+arologis+Postgres 기동 → ① 마스터/회계사원 계정과목 관리 진입 + 토글 persist ② 매니저/영업 403 ③ 비활성→활성 시 현금출납장 드롭다운 노출 ④ 실화면 5유형 차트 스크린샷. 증빙 `docs/qa/arologis-accounting-standard-chart/`.

## 5. 워크플로우
6단계 슬라이스. **Codex 사용량 한도 다운(~6/11) → 구현+dual review+QA 전 단계 Claude 에이전트 대체**(환경한계 예외, 회복 시 정상 복귀). QA 에이전트는 실 Docker 직접 테스트(code-read PASS 금지).
