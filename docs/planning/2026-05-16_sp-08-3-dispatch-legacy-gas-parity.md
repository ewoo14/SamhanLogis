# SP-08-3 — 배차 legacy GAS DB/API parity 기획서

- 작성일: 2026-05-16
- 슬라이스: **SP-08-3** (SP-08 의 두 번째 후속 sub-task. SP-08-1 기반 잠금 + SP-08-2 DPS 완료 후)
- 상위 기획: [`docs/planning/2026-05-16_legacy-gas-db-api-parity.md`](2026-05-16_legacy-gas-db-api-parity.md)
- 직전 머지: PR #211 `[codex] SP-08-2 DPS legacy GAS 저장내역 DB/API parity` (main commit `ce947fe8`)
- 브랜치 (예정): `feat/sp-08-3-1-dispatch-parity-base`
- 작성자: Claude PM (brainstorm 진행) → Codex CLI (구현)
- 작업 원칙 출처: [`AGENTS.md`](../../AGENTS.md), [`.codex/AGENTS.md`](../../.codex/AGENTS.md)

> 본 기획서는 자격값(Notion API key / DB internal id / SA key / Aligo key 등)을 평문으로 포함하지 않는다. 모든 자격은 환경변수 / `application.yml` placeholder / `%USERPROFILE%\.samhan\*` 경로 reference 로만 표기한다.

---

## 1. 목적 및 배경

### 1.1 목적

legacy GAS 의 배차 관련 6 앱 (`tools/legacy-gas/{가배차분류리스트, 지방가배차분류리스트, 미배차리스트, 전표정리리스트, 배차안내문자, 운송사-실배차내역 비교}`) 의 "**저장 / 복원 / preview / send 흐름**" 을 우리 Samhan Public DB/API 로 정렬한다. 6 화면 모두 SP-08-2 (DPS) 와 동일한 history 패턴 (자동 latest upsert + 명시 named append + JSONB payload + 2-Tab UI) 을 적용한다.

### 1.2 배경

- SP-08-1 (`af67edde`) 에서 legacy GAS 의 Notion live target 통신 제거 + 저장내역 기간 필터 (`/partner-orders/drafts?from=&to=`) 복원 완료.
- SP-08-2 (`ce947fe8`) 에서 DPS 비교 / 품목별 DPS 화면에 `dps_save_history` 도메인 + 2-Tab + latest 자동 복원 + 명시 저장/복원 흐름 도입 완료.
- 그러나 SP-08 dev-report `후속 구현 대상` 표 2번 행 = **배차** = "가배차 / 지방가배차 / 미배차 / 전표정리 / 배차문자 / 운송사 비교의 저장 / 복원 / preview / send 흐름 정렬" 이 남아 있다.
- 6 화면은 **3 도메인 (arologis-service / slip-service / notification-service)** 에 분산. 각 화면은 PR-E1 (#117) 에서 endpoint + desktop page 이미 구현됨 — 본 슬라이스는 그 위에 **저장내역 (history)** + **preview/send 흐름 정렬** 만 추가.

### 1.3 SP-08-2 패턴 재사용 (8 화면 일관)

| 항목 | SP-08-2 (DPS) | SP-08-3 (배차) |
|---|---|---|
| 도메인 | inventory-service 1개 | arologis / slip / notification 3개 |
| 화면 수 | 2 (DPS 비교 + 품목별 DPS) | 6 (가배차/지방/미배차/전표정리/배차문자/운송사비교) |
| history table | `dps_save_history` 1개 | 도메인별 3개 (`dispatch_save_history` / `slip_cleanup_save_history` / `dispatch_sms_save_history`) |
| saveMode | AUTO_LATEST / MANUAL_NAMED | 5 화면 동일 + 배차문자 1개 `SEND_AUDIT` 추가 |
| payload | Full JSONB response | 동일 |
| UI | 2-Tab `[실행 | 저장내역]` | 동일 (6 화면 적용) |
| 보관 | AUTO_LATEST upsert (per user/programType), MANUAL_NAMED append | 동일. SEND_AUDIT 는 append (soft-delete 일반 허용) |
| testid | `dps-history-row-{i}` 인덱스 기반 | 화면별 prefix (`pre-classify-history-row-{i}` 등) 인덱스 기반 |

### 1.4 적용 범위 (SP-08-3-1 본 PR)

| 영역 | 변경 |
|---|---|
| `docs/planning/` | 본 기획서 (마스터, 본 파일) |
| `clients/desktop/playwright/sp-08-3-dispatch-parity/` | 6 endpoint 정적 계약 + UUID/Notion runtime scan spec |
| `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1` | QA mock PNG 6장 strict check |
| `docs/qa/sp-08-3-dispatch-parity/` | 매트릭스 / 도메인별 history 자리 / preview-send 흐름 / UUID scan 캡처 |
| README / ROADMAP / DECISIONS / handoff / dev-report (신규) | docs sync 6 file |
| 즉시 fix (식별 시) | legacy GAS 문구/라벨 차이 정렬 |

### 1.5 범위 밖 (Non-goals)

1. **3 도메인 history table 실제 생성 X** — SP-08-3-1 은 자리 예고만, Flyway migration 은 SP-08-3-2~4 진입 시 `V*.sql` glob 재확인 후 최신+1 채번 (DECISIONS SP-08-3-1-08 참조).
2. **6 화면 2-Tab 도입 X** — UI 변경은 SP-08-3-2~4.
3. **공통 `legacy_gas_history` 계층 X** — SP-08-2 결정 일관, 도메인별 history endpoint.
4. **배차 자체 알고리즘 수정 X** — pre-classify / unassigned / reconcile / cleanup / preview / send 로직은 그대로.
5. **Aligo 실 API 활성화 X** — `dispatch-batch/{preview,send}` 는 mock `dryRun=true` 유지 (SP-08-6 별도 슬라이스).
6. **인쇄 양식 X** — 배차 결과는 화면 표시만.
7. **mobile-staff 적용 X** — Samhan Public desktop 한정.

---

## 2. 유저 스토리

### 2.1 배차 담당자 — 가배차 분류 자동 복원

> "조회 조건 입력하고 가배차 분류 실행한 뒤 다른 메뉴 갔다 돌아왔는데, 매번 다시 실행해야 한다. 마지막 결과가 그대로 떠 있으면 좋겠다."

- SP-08-3-2 에서 `/arologis/pre-classify` 에 2-Tab + latest 자동 복원. programType=`PRE_CLASSIFY` / `REGIONAL` 토글별 격리.

### 2.2 배차 담당자 — 전표정리 명시 저장

> "월말 마감 직전 전표정리 결과는 따로 저장해 두고 나중에 재현이 필요하다."

- SP-08-3-3 에서 `/sales/slip-cleanup` 에 2-Tab + 명시 저장 dialog. programType=`SLIP_CLEANUP`.

### 2.3 배차 담당자 — 배차문자 preview 후 send

> "preview 한 결과를 검토 후 send 하는데, send 한 이력은 누가/언제/몇 건 보냈는지 영구 audit 으로 남아야 한다."

- SP-08-3-4 에서 `/dispatch/sms` 에 2-Tab. preview = AUTO_LATEST 자동 / 명시 저장 가능. send = `SEND_AUDIT` saveMode 로 append (soft-delete 일반 허용 — 운영자 삭제 가능).

### 2.4 배차 담당자 — 운송사 비교 업로드

> "운송사 엑셀 업로드한 비교 결과도 DPS 와 동일하게 저장/복원 되면 좋겠다."

- SP-08-3-2 에서 `/arologis/dispatch-reconcile` 에 2-Tab. programType=`RECONCILE`. 업로드/비교 결과 JSONB 저장.

### 2.5 배차 담당자 — 미배차 / 지방가배차 / 운송사비교 동일 패턴

> "나머지 화면도 같은 동선이면 학습 비용 0."

- SP-08-3-2 4 화면 (PRE_CLASSIFY / REGIONAL / UNASSIGNED / RECONCILE) 공통 컴포넌트 (`DispatchHistoryTab.tsx`).

---

## 3. 기술 스택

| 계층 | 기술 |
|---|---|
| Backend | Spring Boot 3.3 + Java 17, JPA / Hibernate, Flyway, springdoc-openapi |
| DB | PostgreSQL 3 DB (arologis_db / slip_db / notification_db), `JSONB` column |
| Testcontainers | PostgreSQL container (IT, 3 도메인 각각) |
| Frontend | React 18 + TypeScript, Vite, electron-vite (desktop), @tanstack/react-query, @samhan/design-system |
| Test | JUnit 5 + Mockito, Spring Boot Test, Testcontainers, Playwright (정적 계약 + Vite mock) |
| QA | PowerShell `System.Drawing` mock PNG 1280×900 (`scripts/generate-sp-08-3-*.ps1`) |

---

## 4. API 설계

### 4.1 6 화면 × 3 도메인 매트릭스 (정적 계약 잠금 대상)

| # | 화면 (legacy GAS) | legacy desktop route | 현재 Samhan desktop route | 도메인 / endpoint (기존) | 신규 history endpoint (SP-08-3-2~4) | programType |
|---|---|---|---|---|---|---|
| 1 | 가배차분류 (가배차분류리스트) | `/dispatches/pre-classify` | `/arologis/pre-classify` | arologis `GET /admin/arologis/dispatches/pre-classify` | `POST/GET /admin/arologis/dispatches/history` (4개 공통) | `PRE_CLASSIFY` |
| 2 | 지방가배차분류 (지방가배차분류리스트) | `/dispatches/pre-classify` 토글 | `/arologis/pre-classify` 토글 | arologis `GET /admin/arologis/dispatches/regional` | (동일 history endpoint, programType 격리) | `REGIONAL` |
| 3 | 미배차 (미배차리스트) | `/dispatches/unassigned` | `/arologis/unassigned` | arologis `GET /admin/arologis/dispatches/unassigned` | (동일) | `UNASSIGNED` |
| 4 | 운송사 비교 (운송사-실배차내역 비교) | `/dispatches/reconcile` | `/arologis/dispatch-reconcile` | arologis `POST /admin/arologis/dispatch/reconcile` | (동일) | `RECONCILE` |
| 5 | 전표정리 (전표정리리스트) | `/sales/slip-cleanup` | `/sales/slip-cleanup` | slip `GET /slips/cleanup` | `POST/GET /slips/cleanup/history` | `SLIP_CLEANUP` |
| 6 | 배차문자 (배차안내문자) | `/dispatch/sms` | `/arologis/dispatch-sms` | notification `POST /admin/notifications/dispatch-batch/preview` | `POST/GET /admin/notifications/dispatch-sms/history` | `DISPATCH_SMS` (표시·편집·복사 전용) |

### 4.2 도메인별 history endpoint 4 종 (SP-08-2 DPS 와 동일 패턴)

각 도메인이 다음 4 endpoint 노출:

| Method | Path | 동작 |
|---|---|---|
| `POST` | `/.../history` | 저장 (AUTO_LATEST upsert / MANUAL_NAMED append / `SEND_AUDIT` append — notification 만) |
| `GET` | `/.../history` | 기간 조회 (payload 미포함, `programType` / `from` / `to` / `mode` / `page` / `size` query) |
| `GET` | `/.../history/{id}` | 상세 (payload 포함, 복원용) |
| `GET` | `/.../history/latest` | 최신 AUTO_LATEST 단건 (재접속 자동 복원) — `programType` query |

### 4.3 RoleGuard (도메인별 기존 endpoint 와 일치)

| 도메인 | history endpoint role |
|---|---|
| arologis | `MASTER` / `MANAGER` / `DISPATCH` / `AROLOGIS_MASTER` / `AROLOGIS_MANAGER` — `ArologisAdminController` `/dispatches/{pre-classify,regional,unassigned}` + `DispatchReconcileController` `/dispatch/reconcile` grep 결과 |
| slip | `SALES` / `MANAGER` / `MASTER` — `SlipController#getCleanup` `@PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")` grep 결과 |
| notification | `DISPATCH` / `MANAGER` / `MASTER` — `DispatchBatchAdminController` `/dispatch-batch/{preview,send}` grep 결과 |

> **중요**: SP-08-2 에서 INVENTORY role 누락이 P2 결함이었다. 본 슬라이스 sub-sub-task 진입 시 기존 endpoint `@PreAuthorize` 와 100% 매칭 검증.

### 4.4 한국어 Javadoc + springdoc-openapi 의무

모든 신규 entity / service / controller / DTO 에 한국어 Javadoc + `@Operation` (`feedback_function_documentation.md` 3-layer).

---

## 5. 데이터 모델 (SP-08-3-2~4 자리 예고)

### 5.1 도메인별 history table 자리 (SP-08-3-1 에서는 작성 X, sub-sub-task 에서 실제 Flyway)

```text
arologis_db.dispatch_save_history          (SP-08-3-2 진입 시 V*.sql glob 재확인 후 최신+1 채번)
slip_db.slip_cleanup_save_history          (SP-08-3-3 진입 시 V*.sql glob 재확인 후 최신+1 채번)
notification_db.dispatch_sms_save_history  (SP-08-3-4 진입 시 V*.sql glob 재확인 후 최신+1 채번)
```

### 5.2 공통 스키마 (3 table 동일, SP-08-2 `dps_save_history` 와 같은 구조)

```sql
CREATE TABLE <도메인>_save_history (
    id               UUID         PRIMARY KEY,
    program_type     VARCHAR(20)  NOT NULL,   -- 도메인별 enum (§4.1 매트릭스)
    save_mode        VARCHAR(20)  NOT NULL,   -- AUTO_LATEST | MANUAL_NAMED [| SEND_AUDIT (notification 만)]
    topic            VARCHAR(200) NOT NULL DEFAULT '자동저장',
    request_params   JSONB        NOT NULL,
    response_payload JSONB        NOT NULL,

    -- BaseEntity 7 audit (shared/common 동일)
    created_at       TIMESTAMP    NOT NULL,
    created_by       VARCHAR(50)  NOT NULL,
    modified_at      TIMESTAMP,
    modified_by      VARCHAR(50),
    deleted_at       TIMESTAMP,
    deleted_by       VARCHAR(50),
    is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE
);

-- 도메인별 CHECK constraint 는 sub-sub-task Flyway 에서 실제 table 명으로 고정한다.
-- arologis_db.dispatch_save_history (SP-08-3-2)
ALTER TABLE dispatch_save_history ADD CONSTRAINT chk_dispatch_save_history_program_type
    CHECK (program_type IN ('PRE_CLASSIFY', 'REGIONAL', 'UNASSIGNED', 'RECONCILE'));
ALTER TABLE dispatch_save_history ADD CONSTRAINT chk_dispatch_save_history_save_mode
    CHECK (save_mode IN ('AUTO_LATEST', 'MANUAL_NAMED'));

-- slip_db.slip_cleanup_save_history (SP-08-3-3)
ALTER TABLE slip_cleanup_save_history ADD CONSTRAINT chk_slip_cleanup_save_history_program_type
    CHECK (program_type IN ('SLIP_CLEANUP'));
ALTER TABLE slip_cleanup_save_history ADD CONSTRAINT chk_slip_cleanup_save_history_save_mode
    CHECK (save_mode IN ('AUTO_LATEST', 'MANUAL_NAMED'));

-- notification_db.dispatch_sms_save_history (SP-08-3-4)
ALTER TABLE dispatch_sms_save_history ADD CONSTRAINT chk_dispatch_sms_save_history_program_type
    CHECK (program_type IN ('DISPATCH_SMS'));
ALTER TABLE dispatch_sms_save_history ADD CONSTRAINT chk_dispatch_sms_save_history_save_mode
    CHECK (save_mode IN ('AUTO_LATEST', 'MANUAL_NAMED', 'SEND_AUDIT'));

-- 기간 조회 인덱스
CREATE INDEX ix_<도메인>_history_user_program_created
    ON <도메인>_save_history (created_by, program_type, created_at DESC)
    WHERE is_deleted = FALSE;

-- AUTO_LATEST partial unique (race guard)
CREATE UNIQUE INDEX ux_<도메인>_history_auto_latest_per_user_program
    ON <도메인>_save_history (created_by, program_type)
    WHERE is_deleted = FALSE AND save_mode = 'AUTO_LATEST';
```

### 5.3 saveMode 차등

| 도메인 | saveMode 값 |
|---|---|
| arologis | `AUTO_LATEST`, `MANUAL_NAMED` (DPS 동일) |
| slip | `AUTO_LATEST`, `MANUAL_NAMED` (DPS 동일) |
| notification | `AUTO_LATEST`, `MANUAL_NAMED`, **`SEND_AUDIT`** (배차문자 실 발송 audit) |

`SEND_AUDIT` 보관:
- append-only (AUTO_LATEST 처럼 upsert 안 함)
- soft-delete 일반 허용 (운영자 삭제 가능 — `project_build_conventions` 일관)
- preview history (AUTO/MANUAL) 와 동일 table 안에서 saveMode flag 로 구분 → 별도 audit table 불필요
- `SEND_AUDIT` enum 은 공통 `DispatchSaveMode`가 아니라 notification 전용 `DispatchSmsSaveMode`에만 둔다.

### 5.4 BaseEntity / Soft Delete / UUID 비공개

- BaseEntity 7 audit 필드 + `@SQLRestriction("is_deleted = false")` + Soft Delete only.
- DELETE statement 신규 추가 0.
- 화면 노출 식별자 = `topic` / `createdByLabel` / `createdAt`. UUID 는 path param 과 React 상태에서만 사용하고 화면 라벨 / `data-testid` 에 미노출.
- createdBy 표시 정책은 **옵션 C** 를 채택한다. FE 는 `created_by` 또는 `X-User-Id` 계열 값이 UUID 형식이면 `"사용자"` 라벨로 mask 하고, UUID가 아닌 운영자명/로그인명만 그대로 표시한다. 별도 `created_by_name` snapshot column 과 user-service per-request lookup 은 이번 SP-08-3 하위 PR 범위에 넣지 않는다.
- createdBy mask helper 는 SP-08-3-2 진입 시 필수 — `DpsHistoryTab.tsx:118` raw 출력도 함께 정정해 SP-08-2 산출물 회귀를 방지한다.

---

## 6. UI 변경 (SP-08-3-2~4 자리 예고)

### 6.1 6 화면 모두 SP-08-2 와 동일 2-Tab 구조

```
[실행] [저장내역]
   ↓
실행 탭 (기존 화면):
  - 마운트 시 GET /history/latest?programType=<...> → 자동 복원 + 배너
  - 실행 직후 → POST /history { saveMode: AUTO_LATEST, ... } (silent)
  - [내역으로 저장] 버튼 → topic prompt modal → POST { saveMode: MANUAL_NAMED, topic }
  - 배차문자만: [SMS 발송] 버튼 → POST { saveMode: SEND_AUDIT, ... } (send 후 audit append)

저장내역 탭:
  - 기간 from/to + mode select (MANUAL_NAMED default)
  - 행 클릭 → GET /history/{id} → 실행 탭 navigate + 결과 복원
```

- PRE_CLASSIFY/REGIONAL 토글 시 `useEffect` 의존 배열에 `programType` 포함 의무 — programType 별 latest 자동 복원 격리 보장.
- `isSaving: boolean` prop 외부 주입 의무 — 각 page 가 `mutation.isPending`을 바인딩해 SP-08-2 FE-Blocker-1 회귀를 피한다.
- SMS 발송 버튼은 `--color-warning` token 사용 + 이중 confirm dialog 의무 (sub-sub-task SP-08-3-4).

### 6.2 공통 컴포넌트 재사용

- SP-08-2 의 `DpsHistoryTab.tsx` / `DpsRestoredBanner.tsx` / `DpsSaveDialog.tsx` 를 일반화 → `HistoryTab.tsx` / `RestoredBanner.tsx` / `SaveDialog.tsx` 로 추상화. 신규 6 화면 + 기존 DPS 2 화면 모두 동일 컴포넌트 사용. SP-08-3-2 진입 시 리팩토링.
- 공통 `HistoryTab.tsx` 의 prop 명칭 = `isSaving: boolean`. `DpsSaveDialog.tsx` 의 `saving` 도 `isSaving` 으로 통일 (SP-08-3-2 진입 시).
- `HistoryTab.tsx` 분리 지점:
  - `list/detail adapter` interface: 도메인별 API client (`dps`, `arologis`, `slip`, `notification`) 주입.
  - `columns: ColumnDef[]`: 도메인별 컬럼 정의 주입. `mismatchCount` 같은 DPS 특화 컬럼은 공통 컴포넌트에 하드코딩하지 않는다.
  - `renderSummary` / `rowCountLabel`: 도메인별 요약 렌더링과 행 수 라벨 함수를 주입한다.
- 리팩토링 전 `DpsHistoryTab.tsx` props 인터페이스 snapshot 을 dev-report 에 기록 → 회귀 기준으로 사용.

### 6.3 design-system 의무

- 실제 `@samhan/design-system` export 기준 `Button` / `DataGrid` / `Tabs` / **`Input`** 을 import 한다. `TabBar` 명칭은 사용하지 않는다.
- 현재 design-system 은 `Select` 를 export 하지 않는다. SP-08-3-2 진입 전 `Select` 컴포넌트를 design-system 에 선행 추가하거나, TM 승인 하에 기존 design-system 패턴으로 대체 컨트롤을 명시해야 한다. HTML 네이티브 `<select>` 직접 사용 금지.
- Pretendard 9 weight + 색상 token (CSS var) (SP-08-2 P2 결함 회고 — hex literal 금지).
- sub-sub-task 완료 전 `grep -r '<input\|<select' src/renderer/pages/<target>` PASS 의무.

### 6.4 data-testid (UUID 비공개)

| 요소 | testid |
|---|---|
| 실행 탭 | `<screen-prefix>-tab-run` |
| 저장내역 탭 | `<screen-prefix>-tab-list` |
| 자동 복원 배너 | `<screen-prefix>-restored-banner` |
| 저장 버튼 | `<screen-prefix>-save-button` |
| Topic input | `<screen-prefix>-topic-input` |
| 저장내역 행 i | `<screen-prefix>-row-{i}` (UUID 미사용) |
| send audit 행 (notification 만) | `dispatch-sms-history-row-{i}-send-audit` |

화면 prefix 매핑:

| 화면 | programType | prefix |
|---|---|---|
| arologis 가배차 | `PRE_CLASSIFY` | `pre-classify-history` |
| arologis 지방가배차 | `REGIONAL` | `pre-classify-history` (동일 화면 토글, programType 으로 격리) |
| arologis 미배차 | `UNASSIGNED` | `unassigned-history` |
| arologis 운송사 비교 | `RECONCILE` | `dispatch-reconcile-history` |
| slip 전표정리 | `SLIP_CLEANUP` | `slip-cleanup-history` |
| notification 배차문자 | `DISPATCH_SMS` | `dispatch-sms-history` |

Playwright assertion 은 위 prefix 를 직접 기대값으로 고정한다. 예: `pre-classify-history-row-0`, `unassigned-history-row-0`, `dispatch-reconcile-history-row-0`, `slip-cleanup-history-row-0`, `dispatch-sms-history-row-0`.

---

## 7. 예외 처리 시나리오 (SP-08-2 와 동일 + send 특화)

| # | 상황 | 처리 |
|---|---|---|
| 1 | `responsePayload` 직렬화 후 UTF-8 byte > 100KB | 422 + `<DOMAIN>_HISTORY_PAYLOAD_TOO_LARGE` |
| 2 | AUTO_LATEST 동시 race (두 탭 동시 실행) | DB partial unique index 가드 + service 1회 retry |
| 3 | latest 조회 시 active row 없음 | 404 + frontend 배너 미표시 |
| 4 | MANUAL_NAMED 저장 시 topic 미입력 | 400 + frontend input required |
| 5 | 복원하려는 행 soft-deleted | 404 + 사용자 message |
| 6 | 다른 사용자 history 직접 접근 | 404 — `findByIdAndCreatedBy` 사용, 존재 은닉 정책으로 `SLIP_CLEANUP_HISTORY_NOT_FOUND` 반환 |
| 7 | reverse range from > to | service swap-and-proceed (PR #210 패턴) |
| 8 | RBAC role 미달 | 401/403 — `@PreAuthorize` |
| 9 | Notion runtime 호출 재유입 | SP-08-1 grep 가드 자동 차단 |
| 10 | **(notification 만)** send audit 저장 실패 | SMS 발송 자체는 성공했어도 audit 저장 실패 시 명시적 사용자 메시지 + 운영 로그. 사용자가 직접 named 저장 재시도 가능 |
| 11 | 동일일 `from=to` 경계 | 당일 데이터 포함 검증 IT |
| 12 | `from`/`to` 모두 null | 전체 기간 동작 IT |

### 7.1 예외 → IT 시나리오 매핑

SP-08-3-2~4 IT catalog 는 아래 형식으로 통일한다.

| 케이스명 | 전제 | API 기대값 | 검증 SQL |
|---|---|---|---|
| `historyPayloadTooLargeReturns422` | UTF-8 JSON payload 100KB 초과 | 422 + `<DOMAIN>_HISTORY_PAYLOAD_TOO_LARGE` | insert row 0건 |
| `autoLatestRaceKeepsSingleActiveRow` | 같은 사용자/프로그램에서 AUTO_LATEST 동시 저장 | 최종 200 또는 retry 후 200 | `save_mode='AUTO_LATEST' AND is_deleted=false` active count = 1 |
| `manualNamedBlankTopicReturns400` | MANUAL_NAMED topic blank | 400 | insert row 0건 |
| `restoreDeletedHistoryReturns404` | 대상 row soft delete | 404 | `is_deleted=true` row 는 조회 결과 제외 |
| `otherUserHistoryHiddenReturns404` | created_by 가 다른 row detail 접근 | 404 | `created_by <> requester` row 미노출 + 존재 은닉 |
| `sameDayFromToIncludesRows` | `from=YYYY-MM-DD&to=YYYY-MM-DD` 동일일 | 200 + 당일 row 포함 | `created_at >= date AND created_at < date + interval '1 day'` 범위 count 일치 |
| `nullFromToReturnsAllActiveRows` | `from`/`to` 모두 null | 200 + active 전체 기간 row | `is_deleted=false` active count 일치 |
| `sendAuditFailureReturnsExplicitMessage` | notification SEND_AUDIT 저장 실패 | 발송 결과와 별개로 명시적 audit 실패 message | SEND_AUDIT row 0건 + 운영 로그 |

---

## 8. 작업 단위 분해

### SP-08-3-1 (본 PR) — 기획 + scope 잠금

- [ ] 본 기획서 작성 + `docs/handoff/CURRENT-WORK.md` 갱신 (필요시 `.claude/memory/project_sp_08_legacy_gas_parity.md` 에 SP-08-3 entry 추가)
- [ ] Playwright SP-08-3 정적 계약 spec 골격 — 6 endpoint 매트릭스 (§4.1) 검증 + UUID regex scan + Notion runtime 호출 zero scan
- [ ] 즉시 fix (식별 시) — legacy GAS 문구/라벨 차이 정렬
- [ ] `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1` — QA mock PNG 6장 strict check
- [ ] docs sync — README + ROADMAP + DECISIONS + 각 client/service README + dev-report 신규
- [ ] **PR 제목**: `[FEAT] SP-08-3-1 배차 GAS parity 기반 잠금`

### SP-08-3-2 — arologis (4 화면)

- [ ] `arologis_db.dispatch_save_history` Flyway — 진입 시 `V*.sql` glob 재확인 후 최신+1 채번 (DECISIONS SP-08-3-1-08 참조)
- [ ] entity `DispatchSaveHistory` + enum `DispatchProgramType` (PRE_CLASSIFY/REGIONAL/UNASSIGNED/RECONCILE) + `DispatchSaveMode` (AUTO_LATEST/MANUAL_NAMED)
- [ ] repository / service (AUTO upsert + retry, 사용자 격리 `findByIdAndCreatedBy` — SP-08-2 BE-P1-1 회고) / controller (4 endpoint, `@PreAuthorize` arologis role)
- [ ] DTO 4 record + 한국어 Javadoc + `@Operation`
- [ ] Unit + IT (Testcontainers + arologis 외부 client 전체 `@MockBean` — `SlipServiceClient` 단건만 보지 말고 `rg "Client" services/arologis-service/src/main/java` 결과 전체 grep)
- [ ] IT 최소 6건: AUTO_LATEST race 1건 / MANUAL_NAMED append 2건+ / latest empty 404 1건 / 타인 history 404 존재 은닉 1건 / 동일일 `from=to` 1건 / `from=to=null` 전체 기간 1건. catalog 는 §7.1 형식(케이스명 / 전제 / API 기대값 / 검증 SQL) 준수.
- [ ] FE: `dispatchSaveHistoryApi.ts` + `HistoryTab.tsx` (DpsHistoryTab 일반화) / `RestoredBanner.tsx` / `SaveDialog.tsx`
- [ ] 4 page modified (`/arologis/pre-classify` + 토글 / `/arologis/unassigned` / `/arologis/dispatch-reconcile`) — 2-Tab + 자동 복원 + 명시 저장
- [ ] Playwright `sp-08-3-2-dispatch-history` (4 정적 계약 + 2 mock UI)
- [ ] QA mock PNG ≥6장
- [ ] **PR 제목**: `[FEAT] SP-08-3-2 arologis 배차 저장내역 4 화면 일관`

### SP-08-3-3 — slip (1 화면)

- [ ] `slip_db.slip_cleanup_save_history` Flyway — 진입 시 `V*.sql` glob 재확인 후 최신+1 채번 (DECISIONS SP-08-3-1-08 참조)
- [ ] entity `SlipCleanupSaveHistory` + enum (SLIP_CLEANUP) + saveMode (AUTO/MANUAL)
- [ ] repository / service / controller / DTO (arologis 와 동일 골격)
- [ ] IT catalog 는 §7.1 형식(케이스명 / 전제 / API 기대값 / 검증 SQL)으로 작성하고 동일일 `from=to`, `from=to=null` 경계를 포함한다.
- [ ] FE: `slipCleanupSaveHistoryApi.ts` + 공통 컴포넌트 재사용
- [ ] `/sales/slip-cleanup` 2-Tab + UX
- [ ] Playwright `sp-08-3-3-slip-cleanup-history` + QA PNG ≥5장
- [ ] **PR 제목**: `[FEAT] SP-08-3-3 전표정리 저장내역 2-Tab`

### SP-08-3-4 — notification (1 화면, preview/send 흐름)

- [ ] `notification_db.dispatch_sms_save_history` Flyway — 진입 시 `V*.sql` glob 재확인 후 최신+1 채번 (DECISIONS SP-08-3-1-08 참조)
- [ ] entity `DispatchSmsSaveHistory` + enum (DISPATCH_SMS) + saveMode (AUTO/MANUAL/**SEND_AUDIT**)
- [ ] repository / service (SEND_AUDIT append-only, preview/send 분기) / controller
- [ ] IT catalog 는 §7.1 형식(케이스명 / 전제 / API 기대값 / 검증 SQL)으로 작성하고 동일일 `from=to`, `from=to=null`, SEND_AUDIT 실패 경계를 포함한다.
- [ ] FE: `dispatchSmsSaveHistoryApi.ts` + `/arologis/dispatch-sms` 2-Tab
  - preview 결과 자동 AUTO_LATEST + 명시 MANUAL_NAMED
  - send 후 자동 SEND_AUDIT append (사용자 noop, silent)
  - 저장내역 탭에 send audit 별도 mode select 옵션 추가
- [ ] commit 직전 notification `V*.sql` glob 즉시 확인 후 최신+1 채번 (`Get-ChildItem services/notification-service/src/main/resources/db/migration -Filter 'V*.sql'`)
- [ ] Playwright `sp-08-3-4-dispatch-sms-history` (preview/send 흐름 정적 계약 + mock UI)
- [ ] QA mock PNG ≥6장 (preview / send 후 audit / 저장내역 탭 mode 선택 etc.)
- [ ] SP-08-3-9 통합 또는 후속: 6 화면 통합 운영자 동선 e2e — 가배차 분류 → 미배차 확인 → 배차문자 send
- [ ] **PR 제목**: `[FEAT] SP-08-3-4 배차문자 preview+send+audit 저장내역`

---

## 9. 위험 요소

| # | 위험 | 영향 | 완화 |
|---|---|---|---|
| 1 | 3 도메인 history table 의 unique partial index 모두 동일 패턴이라 복사-붙여넣기 오류 가능 | AUTO_LATEST race guard 작동 안 함 | SP-08-3-2~4 각 PR 에 IT 시나리오 1건 의무 (`countActiveAutoLatest == 1` 검증) |
| 2 | RBAC role 매트릭스 불일치 (SP-08-2 P2-3 회고) | 사용자 역할 mismatch → 403 fail | sub-sub-task 진입 시 기존 endpoint `@PreAuthorize` grep + 100% 매칭 검증 IT |
| 3 | 공통 컴포넌트 (`HistoryTab.tsx` 등) 추상화 시 SP-08-2 DPS 회귀 | 기존 DPS 화면 동작 변경 | DPS 페이지 Playwright 회귀 spec 유지, mock UI 시나리오 추가 |
| 4 | SEND_AUDIT 추가로 mode filter 가 3 값 분기 → 기존 filter UI 복잡화 | UI 가독성 저하 | mode select option 3개 vs default 'MANUAL_NAMED' 유지, send audit 는 별도 옵션 |
| 5 | payload 100KB 초과 (배차 결과는 DPS 보다 클 수 있음 — 수백~수천 전표) | 422 빈번 | sub-sub-task 진입 시 실제 운영 데이터 측정, 200KB 또는 300KB 로 상향 검토 |
| 6 | Notion runtime 호출 재유입 | SP-08-1 회귀 | SP-08-1 grep 가드가 자동 잠금, SP-08-3-1 정적 계약에도 명시 추가 |
| 7 | UUID 신규 화면 노출 (SP-08-2 P2-4 회고) | feedback_uuid_no_user_visibility 위반 | data-testid 화면별 prefix 인덱스 기반, createdBy UUID mask helper |
| 8 | design-system 미사용 (SP-08-2 FE-Blocker-2 회고) | 컨벤션 위반 | sub-sub-task `Button`/`DataGrid`/`Tabs`/`Input` design-system import 의무 + `Select` 선행 추가 |
| 9 | 색상 토큰 hex literal (SP-08-2 Designer-Blocker-1 회고) | 토큰 단일 진실 위반 | sub-sub-task CSS var(--color-*) 사용 의무 |
| 10 | Aligo dryRun=true 그대로 — 실 발송 불가 | SEND_AUDIT 의 실 운영 가치 약함 | SP-08-3-4 는 mock 으로 SEND_AUDIT 동작 검증만, 실 API 활성화는 SP-08-6 별도 |

---

## 10. QA 검증 체크리스트 (SP-08-3-1 본 PR 완료 기준)

### 10.1 Playwright 정적 계약

- [ ] `cd clients/desktop && npx playwright test playwright/sp-08-3-dispatch-parity/sp-08-3-dispatch-parity.spec.ts --reporter=line` PASS (skipped 0)
- [ ] `cd clients/desktop && npx playwright test playwright/sp-08-3-dispatch-parity playwright/sp-08-2-dps-history playwright/dps-by-product playwright/sp-08-legacy-gas-db-api-parity playwright/full-menu-contract --reporter=line` PASS (회귀)

### 10.2 자격 / Notion runtime / UUID 비노출 zero

- [ ] secret-like artifact scan (Notion key / DB id / Sheet id / Aligo key / PRIVATE KEY) 0 매치 in `docs/`, `clients/desktop/playwright/`, 신규 commit diff
- [ ] Notion runtime call zero (`api.notion.com`, `Notion-Version`, `@notionhq`) 0 매치 in 3 service `src/main/`, desktop `src/renderer/`

### 10.3 QA 캡처

- [ ] `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1` PASS — 1280×900 PNG 6장 strict check (매트릭스 / 도메인별 history 자리 / preview-send 흐름 / UUID hidden scan / SP-08-2 패턴 일관 비교)
- [ ] PR 본문 최종 commit SHA raw URL inline 첨부
- [ ] 현 PNG 는 영문 라벨 + 일부 텍스트 폭 초과가 있다. SP-08-3-2 진입 시 한국어 라벨 + 폭 조정 컴포넌트 실 캡처로 교체한다.

### 10.4 5-team / TM / PM 게이트 (`feedback_dual_5agent_review.md` 의무)

- [ ] **Claude 5-agent**: `backend-engineer` / `frontend-engineer` / `designer` / `devops-engineer` / `qa-tester` 병렬 디스패치 → 통합 PR 코멘트
- [ ] **Codex 5-agent**: `codex exec` 5 섹션 통합 prompt → PR 코멘트
- [ ] 양쪽 0 결함 + CI green 시 PM 자동 머지 (`feedback_user_merge_authority.md`)
- [ ] 머지 후 연관 Issue close (`feedback_issue_close_after_pr.md`)

### 10.5 문서 동기화 (`feedback_continuous_docs_sync.md`)

- [ ] `README.md`, `ROADMAP.md`, `migration/decisions/DECISIONS.md`, `docs/handoff/CURRENT-WORK.md`, `docs/dev-reports/sp-08-3-dispatch-legacy-gas-parity.md` (신규), 각 client/service README 갱신을 같은 통합 commit 에 포함
- [ ] `docs/dev-reports/sp-08-legacy-gas-db-api-parity.md` 의 "후속 구현 대상" 표 2번 행 (배차) 을 `진행 중 (SP-08-3-1)` 로 갱신

---

## 11. 산출물 위치

| 종류 | 경로 |
|---|---|
| 본 기획서 | `docs/planning/2026-05-16_sp-08-3-dispatch-legacy-gas-parity.md` |
| dev-report (신규) | `docs/dev-reports/sp-08-3-dispatch-legacy-gas-parity.md` |
| Playwright 정적 계약 | `clients/desktop/playwright/sp-08-3-dispatch-parity/sp-08-3-dispatch-parity.spec.ts` |
| QA 캡처 | `docs/qa/sp-08-3-dispatch-parity/screenshots/*.png` |
| QA 캡처 스크립트 | `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1` |
| QA 캡처 교체 기준 | SP-08-3-2 진입 시 02/03/06 PNG 를 실 컴포넌트 레이아웃으로 교체 |
| 핸드오프 | `docs/handoff/CURRENT-WORK.md` (갱신) |
| 결정 누적 | `migration/decisions/DECISIONS.md` (신규 entry: `D-SP-08-3-01 배차 history 3 도메인 분산` 등) |
| Flyway migration | SP-08-3-2~4 에서 작성: 각 service `V*.sql` glob 재확인 후 최신+1 채번 (DECISIONS SP-08-3-1-08 참조) |

---

## 12. 참조 메모리

- `feedback_samhan_public_name.md` — 외부 호칭 "Samhan Public"
- `feedback_uuid_no_user_visibility.md` — UUID 사용자 비공개
- `project_build_conventions.md` — BaseEntity 7 audit + Soft Delete
- `feedback_korean_commits.md` — 한국어 commit / PR / Issue
- `feedback_pr_title_caps_bracket.md` — **PR 제목 `[FEAT]` 대괄호+대문자 (2026-05-16 신규)**
- `feedback_dual_5agent_review.md` — **Claude 5-agent + Codex 5-agent 양쪽 리뷰 의무 (2026-05-16 신규)**
- `feedback_integrated_pr_pattern.md` — 통합 PR 패턴
- `feedback_multi_agent_team_pattern.md` — 5-team agent 디스패치
- `feedback_pm_integration_build_check.md` — PM 통합 풀빌드 가드
- `feedback_pr_qa_screenshots.md` — PR QA 스크린샷 의무
- `feedback_continuous_docs_sync.md` — 문서 동기화 의무
- `feedback_function_documentation.md` — 한국어 Javadoc + OpenAPI + dev-report 3-layer
- `feedback_it_mockbean_external_clients.md` — IT @MockBean 격리
- `feedback_korean_path_jdk.md` — Windows 한글 경로 트랩
- `feedback_user_merge_authority.md` — PM 자동 머지 조건
- `feedback_issue_close_after_pr.md` — PR 머지 후 Issue close
- `feedback_pr_ci_monitoring.md` — PR 발행 후 CI watch
- `feedback_gitguardian_false_positive.md` — GitGuardian 처리
- `project_sp_08_legacy_gas_parity.md` — SP-08 마스터 컨텍스트
