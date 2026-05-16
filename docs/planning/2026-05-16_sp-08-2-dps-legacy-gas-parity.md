# SP-08-2 — DPS legacy GAS DB/API parity 기획서

- 작성일: 2026-05-16
- 슬라이스: **SP-08-2** (SP-08 의 첫 번째 후속 sub-task)
- 상위 기획: [`docs/planning/2026-05-16_legacy-gas-db-api-parity.md`](2026-05-16_legacy-gas-db-api-parity.md)
- 직전 머지: PR #210 `[codex] SP-08 legacy GAS DB/API parity 기반 잠금` (main commit `af67edde`)
- 브랜치 (예정): `codex/sp-08-2-dps-legacy-gas-parity`
- 작성자: Claude PM (brainstorm 진행) → Codex CLI (구현)
- 작업 원칙 출처: [`AGENTS.md`](../../AGENTS.md), [`.codex/AGENTS.md`](../../.codex/AGENTS.md)

> 본 기획서는 자격값(Notion API key / DB internal id / SA key / Aligo key 등)을 평문으로 포함하지 않는다. 모든 자격은 환경변수 / `application.yml` placeholder / `%USERPROFILE%\.samhan\*` 경로 reference 로만 표기한다.

---

## 1. 목적 및 배경

### 1.1 목적

legacy GAS 의 두 DPS 앱 (`tools/legacy-gas/DPS 입고기록 비교/`, `tools/legacy-gas/품목별 DPS 입고내역 비교/`) 의 "**업로드 → 결과/품목 pivot → 저장내역**" 3-tab 동선 중 우리에 누락된 **저장내역(history)** 을 우리 DB/API 로 복원한다. 자동 복원 (재접속 시 마지막 결과) + 명시 저장 (기간 조회 / 과거 재현) 둘 다 지원한다.

### 1.2 배경

- SP-08-1 (`af67edde`) 에서 legacy GAS 의 Notion live target 통신 제거 + 저장내역 기간 필터 (`/partner-orders/drafts?from=&to=`) 복원 완료.
- 그러나 SP-08 dev-report `후속 구현 대상` 표 1번 행 = **DPS** = "업로드 → 결과/품목 pivot → 저장내역 legacy 탭 복원 + 공통 history/state DB/API 연결" 이 남아 있다.
- 우리 inventory-service 에 `DpsCompareService` + `DpsByProductService` 가 이미 존재 (PR-E1 #117 + P0-B 후속). desktop 에 `InventoryDpsComparePage` (`/warehouse/dps-compare`) + `DpsByProductPage` (`/warehouse/dps-compare/by-product`) 둘 다 존재. 두 페이지 모두 **단일 화면 (탭 없음) + 저장내역 부재**.
- 따라서 SP-08-2 는 **신규 도메인 `DpsSaveHistory` 추가 + 두 페이지에 2-Tab 도입** 이 범위.

### 1.3 legacy GAS DPS history 패턴 (이식 baseline)

| 항목 | legacy GAS (Notion) | SamhanLogis (DB/API) |
|---|---|---|
| 저장소 | Notion DB | `inventory_db.dps_save_history` (신규) |
| Payload | gzip + base64 압축 → `저장내역1/2` rich_text chunk × 100 × 2000자 = ≤ 400,000자 | PostgreSQL `JSONB` column (≤ 100KB 보호 가드) |
| 구분 | `프로그램유형` select (`교차검증` / `품목별 교차검증`) | `program_type` enum (`DPS_COMPARE` / `DPS_BY_PRODUCT`) |
| 작성자 | `작업자` + `작업계정(email)` properties | BaseEntity `createdBy` (RBAC user) 자동 |
| Topic | `저장주제` rich_text, default `자동저장` | `topic` VARCHAR(200), default `자동저장` |
| Save 4 API | `autoSaveToNotion`, `getHistoryFromNotion(start,end)`, `getSpecificHistory(pageId)`, `getLatestHistoryFromNotion` | `POST /dps-history`, `GET /dps-history?from=&to=&mode=`, `GET /dps-history/{id}`, `GET /dps-history/latest` |

### 1.4 적용 범위

| 영역 | 변경 |
|---|---|
| `services/inventory-service` | 신규 entity / repository / service / controller / Flyway V11 |
| `clients/desktop` `/warehouse/dps-compare` | 2-Tab 도입 + latest 자동 복원 + 저장 / 복원 UX |
| `clients/desktop` `/warehouse/dps-compare/by-product` | 동일 패턴 |
| Playwright | `sp-08-2-dps-history` spec 신규 |
| QA 캡처 | `docs/qa/sp-08-2-dps-history/screenshots/*.png` (≥ 6장) |

### 1.5 범위 밖 (Non-goals)

1. **공통 `legacy_gas_history/state` 계층 도입 X** — DPS 단독 + 도메인별 endpoint. SP-08-3~6 의 다른 도메인이 자체 history endpoint 를 둠.
2. **DPS 비교/품목 pivot 자체 알고리즘 수정 X** — `DpsCompareService` / `DpsByProductService` 로직은 그대로.
3. **UI 리디자인 X** — 기존 한 화면을 `실행` 탭으로 옮기는 최소 wrap. design-system 토큰/색상 변경 없음.
4. **mobile-staff 적용 X** — Samhan Public desktop 한정.
5. **인쇄 양식 X** — DPS 결과는 화면 표시만, print 양식 추가 없음.

---

## 2. 유저 스토리

### 2.1 창고 담당자 — 자동 복원

> "DPS 엑셀로 비교한 결과를 보다가 다른 메뉴 갔다 다시 돌아왔는데, 매번 엑셀 다시 업로드해야 해서 번거롭다. 마지막 비교 결과가 그대로 떠 있으면 좋겠다."

- 비교 실행 직후 자동 latest 저장 (silent, AUTO_LATEST).
- 페이지 재방문 시 `GET /dps-history/latest?programType=DPS_COMPARE` 호출 → 결과 표 즉시 복원 + 상단 배너 `"이전 결과 복원됨 · 2026-05-16 14:32"`.
- 새 비교 실행 시 직전 AUTO_LATEST 행은 soft-delete, 신규 AUTO_LATEST 행 insert (per user/program 최신 1건만 활성).

### 2.2 창고 담당자 — 명시 저장 + 기간 조회

> "특히 중요한 비교 결과 (예: 월말 마감) 는 따로 저장해 두고 나중에 기간 조회로 다시 봐야 한다."

- `[내역으로 저장]` 버튼 클릭 → topic prompt modal (`"오전 마감 점검"` 등 입력) → `POST /dps-history { saveMode: MANUAL_NAMED, topic }`.
- `[저장내역]` 탭 → 기간 from/to + `mode=MANUAL_NAMED` (default) 필터 → 목록 표시 (작성시각 / 작성자 / topic / mismatch 건수 요약).
- 행 클릭 → `GET /dps-history/{id}` → 실행 탭으로 navigate + 결과 표 복원 + 배너 `"복원: 2026-05-15 14:32 김ㅇㅇ '오전마감'"`.

### 2.3 창고 담당자 — 품목별 DPS 동일 패턴

> "품목별 DPS 분석도 같은 방식으로 저장/복원하고 싶다."

- `/warehouse/dps-compare/by-product` 도 동일 2-Tab 구조. `programType=DPS_BY_PRODUCT` 로 격리.
- AUTO_LATEST / MANUAL_NAMED 동일 동작.

---

## 3. 기술 스택

| 계층 | 기술 |
|---|---|
| Backend | Spring Boot 3.3 + Java 17, JPA / Hibernate, Flyway, springdoc-openapi |
| DB | PostgreSQL (inventory_db), `JSONB` column |
| Testcontainers | PostgreSQL container (IT) |
| Frontend | React 18 + TypeScript, Vite, electron-vite (desktop), @tanstack/react-query, @samhan/design-system |
| Test | JUnit 5 + Mockito, Spring Boot Test, Testcontainers, Playwright (정적 계약 + Vite mock) |
| QA | PowerShell `System.Drawing` mock PNG 1280×900 (`scripts/generate-sp-08-2-dps-history-screenshots.ps1`) |

---

## 4. API 설계

### 4.1 Endpoint 표

| Method | Path | 동작 | Request | Response |
|---|---|---|---|---|
| `POST` | `/api/v1/warehouse/audit/dps-history` | 저장 (auto/manual) | `DpsSaveHistoryRequest` | `{ id: UUID, savedAt: ISO }` |
| `GET` | `/api/v1/warehouse/audit/dps-history` | 기간 조회 (payload 미포함) | query `programType`, `from`, `to`, `mode`, `page`, `size` | `Page<DpsSaveHistoryListRow>` |
| `GET` | `/api/v1/warehouse/audit/dps-history/{id}` | 상세 (payload 포함, 복원용) | path `id: UUID` | `DpsSaveHistoryDetailResponse` |
| `GET` | `/api/v1/warehouse/audit/dps-history/latest` | 최신 AUTO_LATEST 단건 (재접속 자동 복원) | query `programType` | `DpsSaveHistoryDetailResponse` or 404 |

### 4.2 RoleGuard

`@PreAuthorize("hasAnyRole('WAREHOUSE', 'MANAGER', 'MASTER')")` — 기존 DPS endpoint 와 동일.

### 4.3 DTO 계약

```java
record DpsSaveHistoryRequest(
    @NotNull DpsProgramType programType,        // DPS_COMPARE | DPS_BY_PRODUCT
    @NotNull DpsSaveMode saveMode,              // AUTO_LATEST | MANUAL_NAMED
    @Size(max = 200) String topic,              // MANUAL_NAMED 시 필수 (service-side 검증), AUTO_LATEST 시 nullable → service 가 '자동저장' 채움
    @NotNull JsonNode requestParams,            // {from, to, groupBy, warehouseId?, fileName?, rowCount?}
    @NotNull JsonNode responsePayload           // DpsCompareResponse 또는 DpsByProductResponse 전체
) {}
// validation: saveMode=MANUAL_NAMED 일 때 topic blank → 400 (DpsSaveHistoryService.save 진입 시 검증).
//             responsePayload 직렬화 후 UTF-8 byte length > 100KB → 422 (`DPS_HISTORY_PAYLOAD_TOO_LARGE`).

record DpsSaveHistoryListRow(
    UUID id,
    DpsProgramType programType,
    DpsSaveMode saveMode,
    String topic,
    Instant createdAt,
    String createdBy,
    JsonNode requestParams,
    int mismatchCount        // requestParams 에서 derived (frontend 노출용)
) {}

record DpsSaveHistoryDetailResponse(
    UUID id,
    DpsProgramType programType,
    DpsSaveMode saveMode,
    String topic,
    Instant createdAt,
    String createdBy,
    JsonNode requestParams,
    JsonNode responsePayload
) {}
```

### 4.4 Query params (목록)

- `programType=DPS_COMPARE|DPS_BY_PRODUCT|ALL` (default `ALL`)
- `from=YYYY-MM-DD`, `to=YYYY-MM-DD` (optional, 한쪽만도 허용 — PR #210 patterns 재사용)
- `mode=AUTO_LATEST|MANUAL_NAMED|ALL` (default `MANUAL_NAMED` — 사용자 의도 named 만 기본 노출)
- `page` (default 0), `size` (default 50, max 200)

### 4.5 한국어 Javadoc + springdoc-openapi 의무

모든 entity / service / controller / DTO 에 한국어 Javadoc + `@Operation(summary = "...", description = "...")` (`feedback_function_documentation.md` 3-layer).

---

## 5. 데이터 모델

### 5.1 Flyway migration `V11__add_dps_save_history.sql`

```sql
-- DPS 저장내역 — legacy GAS Notion `저장내역1/2` rich_text 의 우리 DB 대체.
-- AUTO_LATEST: per (created_by, program_type) 최신 1건만 활성 (직전 AUTO_LATEST row 는 soft-delete).
-- MANUAL_NAMED: append, 기간 조회 / 과거 재현 용도.
CREATE TABLE dps_save_history (
    -- BaseEntity 7 audit
    id              UUID            PRIMARY KEY,
    created_at      TIMESTAMP       NOT NULL,
    created_by      VARCHAR(100)    NOT NULL,
    updated_at      TIMESTAMP       NOT NULL,
    updated_by      VARCHAR(100)    NOT NULL,
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(100),
    is_deleted      BOOLEAN         NOT NULL DEFAULT FALSE,
    -- 도메인
    program_type    VARCHAR(20)     NOT NULL,
    save_mode       VARCHAR(20)     NOT NULL,
    topic           VARCHAR(200)    NOT NULL DEFAULT '자동저장',
    request_params  JSONB           NOT NULL,
    response_payload JSONB          NOT NULL,
    CONSTRAINT chk_dps_save_history_program_type
        CHECK (program_type IN ('DPS_COMPARE', 'DPS_BY_PRODUCT')),
    CONSTRAINT chk_dps_save_history_save_mode
        CHECK (save_mode IN ('AUTO_LATEST', 'MANUAL_NAMED'))
);
COMMENT ON TABLE dps_save_history IS 'DPS 비교 / 품목별 DPS 결과의 사용자별 저장내역 (legacy GAS Notion 저장 이식)';

-- 기간 조회 인덱스
CREATE INDEX ix_dps_save_history_user_program_created
    ON dps_save_history (created_by, program_type, created_at DESC)
    WHERE is_deleted = FALSE;

-- AUTO_LATEST 의 per-user/program unique partial index — race condition 시 DB 레벨 가드
CREATE UNIQUE INDEX ux_dps_save_history_auto_latest_per_user_program
    ON dps_save_history (created_by, program_type)
    WHERE is_deleted = FALSE AND save_mode = 'AUTO_LATEST';
```

### 5.2 Entity

```java
@Entity
@Table(name = "dps_save_history")
@SQLRestriction("is_deleted = false")
@SoftDelete
public class DpsSaveHistory extends BaseEntity {
    @Enumerated(EnumType.STRING)
    @Column(name = "program_type", nullable = false, length = 20)
    private DpsProgramType programType;

    @Enumerated(EnumType.STRING)
    @Column(name = "save_mode", nullable = false, length = 20)
    private DpsSaveMode saveMode;

    @Column(name = "topic", nullable = false, length = 200)
    private String topic;

    @Type(JsonBinaryType.class)
    @Column(name = "request_params", nullable = false, columnDefinition = "jsonb")
    private JsonNode requestParams;

    @Type(JsonBinaryType.class)
    @Column(name = "response_payload", nullable = false, columnDefinition = "jsonb")
    private JsonNode responsePayload;

    // 도메인 메서드 — set 직접 호출 금지 (`project_build_conventions.md`)
    public DpsSaveHistory rename(String newTopic) { ... }
    // restore / supersedeBy / ... 등은 service 가 도메인 메서드 chain 으로 호출
}
```

### 5.3 보관 정책

| save_mode | 정책 | 구현 |
|---|---|---|
| `AUTO_LATEST` | **per `(createdBy, programType)` 최신 1건만 활성** | service 트랜잭션 내 `findActiveAutoLatest(...)` → 존재 시 `softDelete()` → 신규 `save()`. DB partial unique index 가 race 가드 |
| `MANUAL_NAMED` | append (soft-delete only) | 무제한 누적 (운영 수년차 partitioning 도입은 별도 슬라이스) |

### 5.4 BaseEntity / Soft Delete / UUID 비공개

- `BaseEntity` 7 audit field 의무.
- `DELETE` statement 신규 추가 0. `isDeleted=true` only.
- 화면 노출 식별자 = `topic` / `createdBy (managerName)` / `createdAt`. UUID 는 path param + `data-testid` 내부값으로만, 화면 라벨에 표시 X (`feedback_uuid_no_user_visibility.md`).

---

## 6. UI 변경

### 6.1 `/warehouse/dps-compare` (`InventoryDpsComparePage.tsx`)

```
┌─────────────────────────────────────────────────────────┐
│ [실행]  [저장내역]                                       │  ← 신규 TabBar
├─────────────────────────────────────────────────────────┤
│ ✦ 이전 결과 복원됨 · 2026-05-16 14:32  [닫기]            │  ← latest 자동 복원 배너
├─────────────────────────────────────────────────────────┤
│ 날짜 from/to  groupBy SLIP/ITEM  [DPS 엑셀 업로드]       │
│ [양식 다운로드]  [비교 실행]                              │
├─────────────────────────────────────────────────────────┤
│ mismatch 표 (slipNo / productCode / 출고/DPS / 사유)     │
│                                          [내역으로 저장]  │  ← topic prompt modal
└─────────────────────────────────────────────────────────┘
```

**저장내역 탭**:

```
┌─────────────────────────────────────────────────────────┐
│ [실행]  [저장내역]                                       │
├─────────────────────────────────────────────────────────┤
│ 기간 from [____]  to [____]  모드 [명시 저장만 ▾]        │
│                                              [조회]      │
├─────────────────────────────────────────────────────────┤
│ 작성시각          작성자    Topic          mismatch 수   │
│ 2026-05-16 14:32 김ㅇㅇ    오전 마감 점검  12            │ ← 클릭 시 GET /{id} → 실행 탭 복원
│ 2026-05-15 09:15 이ㅇㅇ    월말 마감        0            │
└─────────────────────────────────────────────────────────┘
```

### 6.2 `/warehouse/dps-compare/by-product` 동일 패턴

`programType=DPS_BY_PRODUCT` 로 격리. UI 골격은 동일 컴포넌트 재사용 (`<DpsHistoryTab programType="DPS_BY_PRODUCT" />`).

### 6.3 design-system

- `Button`, `DataGrid` 재사용.
- `TabBar` — design-system 에 이미 있는지 확인 → 없으면 design-system 에 1개 추가 (Designer 합의). 사용자에게 신규 작성 금지 (`design-system import 우선`).

### 6.4 data-testid (UUID 비공개)

| 요소 | testid |
|---|---|
| TabBar 실행 탭 | `dps-history-tab-run` |
| TabBar 저장내역 탭 | `dps-history-tab-list` |
| latest 복원 배너 | `dps-history-restored-banner` |
| [내역으로 저장] 버튼 | `dps-history-save-button` |
| Topic prompt input | `dps-history-topic-input` |
| 저장내역 행 (i 번째) | `dps-history-row-{i}` (UUID 미사용) |
| 저장내역 행 작성시각 cell | `dps-history-row-{i}-created-at` |

---

## 7. 예외 처리 시나리오

| # | 상황 | 처리 |
|---|---|---|
| 1 | `responsePayload` 직렬화 후 UTF-8 byte length > 100KB | 422 + error code `DPS_HISTORY_PAYLOAD_TOO_LARGE` + 사용자 message `"비교 결과가 너무 큽니다. 기간을 좁혀 다시 시도하세요."` |
| 2 | AUTO_LATEST 동시 race (두 탭 동시 비교 실행) | DB partial unique index 가 두 번째 insert 차단 → service 가 catch 후 기존 활성 행을 soft-delete + 재시도 (1회) |
| 3 | latest 조회 시 active row 없음 | 404 + 사용자 화면 배너 미표시 (정상 first-visit) |
| 4 | MANUAL_NAMED 저장 시 topic 미입력 | 400 + frontend 가 input required 가드 |
| 5 | 복원하려는 행이 soft-deleted (관리자 정리 후) | 404 + 사용자 message `"해당 저장 내역을 찾을 수 없습니다."` |
| 6 | 다른 사용자 history 접근 시도 (직접 UUID query) | 403 — service 가 `createdBy` 검증 (현 사용자 일치 필수) |
| 7 | `from > to` reverse range | service 가 swap-and-proceed (PR #210 패턴 — silent OK) |
| 8 | RBAC role 미달 | 401/403 — `@PreAuthorize` 가드 |
| 9 | `request_params` 가 schema 위반 (필수 키 누락) | 400 + Jackson `@Valid` |
| 10 | Notion runtime 호출 재유입 시도 | SP-08-1 grep 가드가 자동 차단 (PR gate RED) |

---

## 8. 작업 단위 분해 (sub-task)

본 슬라이스는 1 PR 으로 묶어 발행. 5-team agent 패턴 + 통합 PR (`feedback_multi_agent_team_pattern.md`, `feedback_integrated_pr_pattern.md`) 적용.

### 8.1 Backend (BE)

- [ ] `entity/DpsSaveHistory.java` + `DpsProgramType.java` + `DpsSaveMode.java` (enum)
- [ ] `repository/DpsSaveHistoryRepository.java`
  - `Optional<DpsSaveHistory> findActiveAutoLatest(String createdBy, DpsProgramType programType)`
  - `Page<DpsSaveHistory> findByFilter(...)` (programType ALL/single, mode ALL/single, from/to optional, createdBy current user)
  - `Optional<DpsSaveHistory> findActiveByIdAndCreatedBy(UUID id, String createdBy)`
- [ ] `service/DpsSaveHistoryService.java`
  - `save(request, currentUser)` — AUTO_LATEST upsert / MANUAL_NAMED append
  - `list(filter, currentUser, pageable)`
  - `findDetail(id, currentUser)`
  - `findLatestAutoLatest(programType, currentUser)`
- [ ] `web/DpsSaveHistoryController.java` — 4 endpoint + `@PreAuthorize` + 한국어 `@Operation`
- [ ] `web/dto/*` — 3 record (Request / ListRow / DetailResponse)
- [ ] Flyway `V11__add_dps_save_history.sql`
- [ ] Unit: `DpsSaveHistoryServiceTest` (AUTO upsert / MANUAL append / soft-delete 격리 / 사용자 격리 / payload size 422 / reverse range swap)
- [ ] IT: `DpsSaveHistoryIT` (Testcontainers, POST → GET 목록 → GET 상세 → GET latest 전체 흐름, AUTO race 시뮬 1회 retry, `@MockBean SlipServiceClient`)

### 8.2 Frontend (FE)

- [ ] `clients/desktop/src/renderer/api/dpsSaveHistoryApi.ts` — 4 endpoint client
- [ ] `clients/desktop/src/renderer/components/DpsHistoryTab.tsx` — 저장내역 탭 공통 (programType prop)
- [ ] `clients/desktop/src/renderer/components/DpsRestoredBanner.tsx` — 자동 복원 배너
- [ ] `clients/desktop/src/renderer/components/DpsSaveDialog.tsx` — topic prompt modal
- [ ] `clients/desktop/src/renderer/routes/InventoryDpsComparePage.tsx` — TabBar wrap + latest 자동 복원 + 저장 버튼 + 복원 navigate
- [ ] `clients/desktop/src/renderer/routes/warehouse/DpsByProductPage.tsx` — 동일 패턴
- [ ] typecheck / lint / build PASS

### 8.3 Designer

- [ ] design-system `TabBar` 존재 확인, 없으면 1개 추가 (Pretendard 9 weight + token 색상)
- [ ] DpsRestoredBanner / DpsSaveDialog 의 디자인 가이드 확인 (한국 ERP 컨벤션, 이카운트 참조)
- [ ] 인쇄 양식 적용 없음 (Non-goals §1.5)

### 8.4 DevOps

- [ ] inventory-service `application.yml` 신규 환경변수 없음 — 추가 secret 없음
- [ ] gradle test targeted: `:services:inventory-service:test --tests "*DpsSaveHistory*"`
- [ ] Playwright spec 신규 `clients/desktop/playwright/sp-08-2-dps-history/`
- [ ] QA mock PNG 생성 스크립트 `scripts/generate-sp-08-2-dps-history-screenshots.ps1` (1280×900, ≥ 6장)

### 8.5 QA

- [ ] Playwright `sp-08-2-dps-history.spec.ts` (sequential after BE/FE):
  - 두 페이지 2-Tab 구조 정적 계약
  - latest 자동 복원 배너 visible (mock API response)
  - 저장내역 탭 → 행 클릭 → 실행 탭 navigate + 결과 복원
  - UUID 비노출 정적 scan (`dps-history-row-{i}` 형식 + UUID regex 0 매치)
  - AUTO / MANUAL 구분 표시
  - MANUAL topic 미입력 시 저장 버튼 비활성
- [ ] 회귀: 기존 `dps-by-product.spec.ts` GREEN 유지
- [ ] QA 캡처 6장 ≥, raw URL inline 첨부

### 8.6 통합 PR + 5-team 리뷰 + CI green + 머지

- [ ] 통합 PR 발행 (한국어 본문, QA 캡처 inline, `연관 Issue: 없음` 또는 SP-08 우산 issue 가 있으면 link — PR #210 패턴 따라)
- [ ] `gh pr checks --watch` 즉시 시작 (`feedback_pr_ci_monitoring.md`)
- [ ] 5-team 리뷰 → TM 통합 → CI green → PM 자동 머지 (`feedback_user_merge_authority.md`) → squash + branch delete
- [ ] 머지 후 `docs/handoff/CURRENT-WORK.md` 갱신 + 메모리 인덱스 갱신 (`feedback_continuous_docs_sync.md`)

---

## 9. 위험 요소

| # | 위험 | 영향 | 완화 |
|---|---|---|---|
| 1 | AUTO_LATEST 동시 race (두 탭/창에서 동시 비교) | DB unique partial index 위반 → 500 | service 가 catch + 기존 활성 soft-delete + 1회 retry. IT 에 시나리오 1개 포함 |
| 2 | `responsePayload` 가 100KB 초과 (mismatch 수만 행) | row 부풀림 + 조회 slow | 100KB 보호 가드 (422 + 사용자 message). 운영 모니터링 후 partitioning 결정 |
| 3 | 다른 사용자 history UUID 추측 접근 | 보안 위반 | service 가 `createdBy = currentUser` 검증 필수. IT 에 시나리오 포함 |
| 4 | Notion runtime 호출 재유입 | SP-08 회귀 | SP-08-1 grep 가드가 자동 차단 |
| 5 | UUID 가 신규 UI 에 노출 | `feedback_uuid_no_user_visibility.md` 위반 | data-testid 는 `dps-history-row-{i}` 형식 + Playwright UUID regex scan |
| 6 | Soft Delete 위반 (DELETE statement 추가) | 감사로그 무결성 손상 | review-blocker. Flyway migration / repository diff 의 DELETE statement 신규 0 |
| 7 | Windows 한글 경로 + JDK 17 gradle test 실패 | `feedback_korean_path_jdk.md` | targeted test (`--tests` 지정) 우회 |
| 8 | IT 외부 client `@MockBean` 누락 | Eureka 비활성 → 500 | `SlipServiceClient` @MockBean 격리 의무 |
| 9 | design-system `TabBar` 부재 | UI 작업 blocker | Designer 가 1개 추가 → BE 와 병렬 진행 |
| 10 | Plan/PR 산출물 한국어 미준수 | `feedback_korean_commits.md` 위반 | 본 기획서/commit/PR/Issue/QA 캡처 caption 한국어 |

---

## 10. QA 검증 체크리스트 (= 완료 기준)

> 본 슬라이스의 통합 PR 본문에는 `docs/qa/sp-08-2-dps-history/screenshots/*.png` 중 최소 6장을 인라인 첨부한다 (`feedback_pr_qa_screenshots.md`).

### 10.1 Backend 회귀 (targeted)

- [ ] `.\gradlew.bat :services:inventory-service:test --tests "*DpsSaveHistory*" --no-daemon --rerun-tasks` PASS (skipped 0)
- [ ] `.\gradlew.bat :services:inventory-service:test --tests "*DpsCompare*" --tests "*DpsByProduct*" --no-daemon --rerun-tasks` PASS (회귀)

### 10.2 Frontend 회귀

- [ ] `npm run typecheck` (`clients/desktop`) PASS
- [ ] `npm run lint` (`clients/desktop`) PASS (error 0)
- [ ] `npm run build` (`clients/desktop`) PASS

### 10.3 Playwright 정적 계약

- [ ] `npx playwright test playwright/sp-08-2-dps-history/sp-08-2-dps-history.spec.ts --reporter=line` PASS (skipped 0)
- [ ] `npx playwright test playwright/sp-08-2-dps-history playwright/sp-08-legacy-gas-db-api-parity playwright/dps-by-product playwright/full-menu-contract --reporter=line` PASS (회귀)

### 10.4 자격 / Notion runtime / UUID 비노출 zero

- [ ] CI grep 가드 PASS — Notion API key / DB internal id / Sheet id / Aligo key / PRIVATE KEY marker 0 매치 (신규 commit diff)
- [ ] `clients/desktop/src/renderer/components/Dps*` 의 신규 component 에 UUID regex 0 매치
- [ ] `services/inventory-service/src/main/` 에 `api.notion.com` / `Notion-Version` / `@notionhq` import 0 매치

### 10.5 QA 캡처

- [ ] `scripts/generate-sp-08-2-dps-history-screenshots.ps1` 또는 동등 스크립트 PASS — 1280×900 PNG ≥ 6장 (`01-tab-run.png`, `02-restored-banner.png`, `03-tab-list.png`, `04-restore-navigate.png`, `05-save-dialog.png`, `06-by-product-pattern.png`, `07-uuid-hidden-scan.png` 권장)
- [ ] PR 본문은 최종 commit SHA raw URL 로 캡처 고정

### 10.6 문서 동기화 (`feedback_continuous_docs_sync.md`)

- [ ] `README.md`, `ROADMAP.md`, `migration/decisions/DECISIONS.md`, `docs/handoff/CURRENT-WORK.md`, `docs/dev-reports/sp-08-2-dps-legacy-gas-parity.md` (신규), `clients/desktop/README.md`, `services/inventory-service/README.md` 갱신을 같은 통합 commit 에 포함
- [ ] `docs/dev-reports/sp-08-legacy-gas-db-api-parity.md` 의 "후속 구현 대상" 표 1번 행 (DPS) 을 `완료 (SP-08-2)` 로 갱신

### 10.7 5-team / TM / PM 게이트

- [ ] BE / FE / Designer / DevOps / QA 5-team 각 0 결함 확인
- [ ] TM 통합 commit + 한국어 PR 본문
- [ ] CI green + 5-team 0 결함 시 PM 자동 머지 (`feedback_user_merge_authority.md`)
- [ ] 머지 후 연관 Issue close (`feedback_issue_close_after_pr.md`)

### 10.8 운영 검증 (선택)

- [ ] 운영 PC 에서 비교 실행 → 자동 latest 저장 → 페이지 새로고침 → 결과 자동 복원 확인 (1 case)
- [ ] 비교 실행 → 명시 저장 (topic 입력) → 저장내역 탭 조회 → 행 클릭 → 결과 복원 확인 (1 case)

---

## 11. 산출물 위치

| 종류 | 경로 |
|---|---|
| 본 기획서 | `docs/planning/2026-05-16_sp-08-2-dps-legacy-gas-parity.md` |
| dev-report (신규) | `docs/dev-reports/sp-08-2-dps-legacy-gas-parity.md` |
| Flyway migration | `services/inventory-service/src/main/resources/db/migration/V11__add_dps_save_history.sql` |
| Playwright 정적 계약 | `clients/desktop/playwright/sp-08-2-dps-history/sp-08-2-dps-history.spec.ts` |
| QA 캡처 | `docs/qa/sp-08-2-dps-history/screenshots/*.png` |
| QA 캡처 생성 스크립트 | `scripts/generate-sp-08-2-dps-history-screenshots.ps1` |
| 핸드오프 | `docs/handoff/CURRENT-WORK.md` (갱신) |
| 결정 누적 | `migration/decisions/DECISIONS.md` (신규 entry: `D-SP-08-2-01 DPS history 도메인 위치` 등) |

---

## 12. 참조 메모리

- `feedback_samhan_public_name.md` — 외부 호칭 "Samhan Public"
- `feedback_uuid_no_user_visibility.md` — UUID 사용자 비공개
- `project_build_conventions.md` — BaseEntity 7 audit + Soft Delete
- `feedback_korean_commits.md` — 한국어 commit / PR / Issue
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
