# Phase 5 — Discussion Round 3 (UX / 동적 스펙 / 우선순위 perspective + 종합 매트릭스)

> **참여 perspective**: Reviewer agent POV (이번 라운드 driver) + Plan agent POV + 분석 agent POV
> **입력**: `04-migration-plan.md` §11 #13/#14/#15 (Phase 4.5 신규) + DOMAIN-EXTENSIONS §3 (usageScope) + §4 (ProductSpec/SpecKeyTemplate) + Round 1 §7.1 (D1~D6) + Round 2 §8.1 (D7~D13) + Phase 3 §9 14건 + Round 1+2 게이트 G9~G16
> **처리 주제**: D14~D20 (ProductSpec 정책 + 인쇄 + UX + Phase 6 우선순위 + cross-validation) + 종합 매트릭스
> **단일 산출 파일** — 다른 파일 수정/생성 금지
> 작성일: 2026-05-05 / 한국어 / 추측 금지 / 출처 (파일:라인) 명시 의무
> **누락 0 의무** — 종합 매트릭스에 Phase 3 §9 14건 + Discussion D1~D20 모두 등재

---

## §0 라운드 메타

| 항목 | 값 |
|---|---|
| 라운드 번호 | 3 / 3 (최종) |
| 주 perspective | Reviewer agent (driver) — Round 1+2 합의 + Phase 4.5 신규 도메인 implementation 우선순위 재조정 |
| 보조 perspective | Plan agent + 분석 agent |
| 처리 항목 | D14~D20 (7건) + 종합 매트릭스 (D1~D20 + Phase 3 §9 14건) |
| 이전 라운드 인용 | Round 1 §7.1 / Round 2 §8.1 (전 라운드 starting point 의무) |
| 종합 산출 | (1) 종합 결정 매트릭스 D1~D20 / (2) Phase 6 입력 명세 / (3) 사용자 확정 필요 게이트 표 G9~G19 (라운드 3 신규 G17~G19 추가) |
| 회고 가드 | `feedback_print_design_iteration.md` (D18 인쇄) / `feedback_pm_integration_build_check.md` Layer 4+5 / `feedback_uuid_no_user_visibility.md` (D17 UX) / `feedback_multi_agent_team_pattern.md` (D19 5-team 디스패치) |

---

## §1. D14 — ProductSpec multi-value 시드 정책 (`소비전력(kW)(최소/정격/최대)` `"3 / 4 / 5"` 1 row vs 3 row 분리)

### 분석 agent POV (모호 / 근거)

- `decisions/DOMAIN-EXTENSIONS.md:202-205` (§4 표): "냉방성능(kW) | ✓ | `성능(kW)(최소/정격/최대)` (싱글) — splitBar".
- `decisions/DOMAIN-EXTENSIONS.md:243-244` (시드 룰 #2): "싱글 세트 의 splitBar/splitSlash 룰은 시드 시점에 펼쳐서 별도 row 로 (예: `소비전력(kW)(최소/정격/최대)` 의 `'3 | 4'` → ProductSpec 2 row: `소비전력(냉방)`/`소비전력(난방)`)".
- `decisions/DOMAIN-EXTENSIONS.md:222-223` (§4 ERV 분기): "마이그 시: 다중 컬럼은 `joinCols(row, cols).join(' / ')` 그대로 specValue 에 저장 (예: `'3.5 / 5.0 / 6.5'`)".
- 즉 DOMAIN-EXTENSIONS §4 가 **두 가지 정책** 동시 명시 — splitBar (cool/heat) = 분리, splitSlash (배관길이/고낙차) = 분리, joinCols ERV (터보/강/약) = 단일 specValue. 정책 비대칭 — 이중 표준 문제.

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:716` (§3.1.2 표): "싱글 세트 — `scanSingle()` (1118-1194) 21 — 다중-value 컬럼 펼침 — `소비전력(kW)(최소/정격/최대)` `splitBar` '3 | 4' → 2 row (cool/heat 분리). `배관길이/고낙차(m)` `splitSlash` '12/8' → 2 row. `전원(mm²)/차단(A)` splitSlash → 2 row".
- `04-migration-plan.md:717` (§3.1.2 표): "상업멀티 — ERV3 layout (1262-1276): 냉방Cap/Pow + 난방Cap/Pow 각 3 컬럼 (터보/강/약) → `joinCols(row, cols).join(' / ')` → 단일 specValue ('3.5 / 5.0 / 6.5'), unit 에 `최소/정격/최대` 표기".
- `04-migration-plan.md:1193` (§11 #13): "ProductSpec specValue multi-value 시드 정책 — 싱글 세트 의 `소비전력(kW)(최소/정격/최대)` 같은 multi-value (`splitBar` '3 | 4' cool/heat) 시드 시점에 (a) 1 row 로 `specValue='3 / 4'` 보존 vs (b) N row 분리 (`소비전력(냉방)`/`소비전력(난방)`)? 상업멀티 ERV joinCols 도 동일. 인쇄 가독성 vs 데이터 정합성 trade-off — 사용자 확정".
- 사유 (Plan): splitBar = cool/heat (의미적 분리 명확) → 분리. ERV = 운전모드 (터보/강/약, 단일 사양의 운전 조건별 값) → 통합 가독성 우월. 이중 표준 정당화.

### Reviewer POV (모순 / 누락 catch)

- 모순 catch 1: DOMAIN-EXTENSIONS §4 "소비전력(kW)(최소/정격/최대)" 컬럼명이 "최소/정격/최대" 인데 splitBar 분리는 cool/heat 으로 표기 — 의미 불일치. 시트 실 데이터 spot-check 의무 (`03-sheet-schema.md:171` 참조: `0.35/1.41/2.64 \| 0.37/1.61/3.10` — `\|` 좌측 cool, 우측 heat. `/` 로 최소/정격/최대 분리). 즉 컬럼명 "(최소/정격/최대)" 는 `/` slash 분리, splitBar `\|` 는 cool/heat — 두 layer 동시 발생.
- 모순 catch 2: `04-migration-plan.md:716` 의 splitBar 결과 `'3 | 4'` → 2 row 가 ProductSpec key 자체를 다르게 (`소비전력(냉방)` / `소비전력(난방)`) 만든다면 unique 제약 `(productMasterId, specKey)` 충족. 단 specKey 명명 룰이 시트 헤더 원문 보존이 아닌 derived 가 됨 → estimate Code.js `idx(H, [...])` 호출 인자 1:1 매핑 가드 (`04-migration-plan.md:723` Phase 6 QA 가드 #1) 와 충돌 가능.
- 누락 catch: ERV joinCols 단일 specValue 에 unit="최소/정격/최대" 표기 → 인쇄 양식 출력 시 `key: value unit` 표 형식이 가독성 떨어짐 (예: `냉방성능(kW): 3.5 / 5.0 / 6.5 최소/정격/최대`). 인쇄 layout 별도 분기 필요.
- 인쇄 vs 데이터 trade-off — Round 2 D13 (인쇄 템플릿 2-tier 통합) 와 직결. 인쇄 가독성 우선 시 ERV joinCols 통합 정당, 데이터 정합성 우선 시 splitBar 분리 일관 적용.

### 합의 (또는 사용자 확정 필요)

| 옵션 | 장점 | 단점 |
|---|---|---|
| (a) Plan §3.1.2 그대로 — splitBar 분리 + ERV joinCols 통합 (이중 표준) | 의미적 정확 (cool/heat 분리) + 인쇄 가독 (ERV) | 시드 변환 룰 분기 복잡 / specKey derived |
| (b) 모두 분리 (splitBar + splitSlash + ERV 모두 N row) | 데이터 정합성 일관 / unit 단순 | ERV 인쇄 가독성 ↓ / row 부피 증가 |
| (c) 모두 단일 row (시트 원본 그대로 specValue 보존) | 시드 변환 단순 / Apps Script 출력 ↔ Java 1:1 비교 가드 충족 | 검색/필터/계산 어려움 (예: 냉방 소비전력 단독 추출 불가) |

**권장 (Reviewer + Plan + 분석 합의)**: **옵션 (a) Plan §3.1.2 그대로 (이중 표준 유지) + 시드 변환 룰 표 명시 + Phase 6 QA 가드 보강**.
- 시드 변환 룰 (Phase 6 BACKEND 의무):
  - `splitBar` (`\|` cool/heat 분리) → 2 row, specKey 에 `(냉방)`/`(난방)` suffix 추가
  - `splitSlash` (`/` 의미적 분리, 배관길이/고낙차 등) → 2 row, specKey 별도
  - `joinCols` (ERV 운전모드, 인쇄 가독성 우선) → 1 row, unit 에 `최소/정격/최대` 표기
- Phase 6 QA 가드: Apps Script `getSpecDetailMap_()` 출력 ↔ Java 시드 결과 1:1 비교 (sample 30 SKU, splitBar/splitSlash/joinCols 양 케이스 fixture).

→ **사용자 확정 필요 (G17 신규 게이트)** — 옵션 (a) / (b) / (c) 중 선택. 권장 (a).

---

## §2. D15 — SpecKeyTemplate 추천 키 vs 자유 입력 우선순위 (충돌 시 정책)

### 분석 agent POV (모호 / 근거)

- `decisions/DOMAIN-EXTENSIONS.md:141` (§4): "unique constraint: `(productMasterId, specKey)` — 동일 품목에 같은 키 중복 금지".
- `decisions/DOMAIN-EXTENSIONS.md:155` (§4 SpecKeyTemplate): "isRecommended boolean | TRUE = '추천 스펙' 으로 자동 추가 (사용자는 삭제 가능)".
- `decisions/DOMAIN-EXTENSIONS.md:177` (§4 UI 동작): "신규 품목 등록 시 카테고리 (estimateCategory) 선택 → SpecKeyTemplate 의 `isRecommended=TRUE` 키들이 자동 추가됨 (값은 빈 칸, 사용자가 채움)".

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:1194` (§11 #14): "SpecKeyTemplate 추천 키 vs 사용자 자유 입력 우선순위 — (a) 사용자가 추천 키와 동명 자유 입력 시 충돌 처리 (unique 충돌 409 vs auto-merge) (b) 카테고리 변경 시 기존 ProductSpec row (사용자 자유 입력본) 보존 정책 — 사용자 확정".
- `04-migration-plan.md:268` (§2.1.7 API): "POST `/api/v1/products/{modelCode}/specs` — ProductSpec 추가 (specKey unique 충돌 시 409)".
- 사유 (Plan): unique 제약 `(productMasterId, specKey)` 위반 시 409 default — 단 추천 키 자동 추가 시점에 사용자가 같은 키 자유 입력했을 때의 정책 미명시.

### Reviewer POV (cross-review 발견)

- 누락 catch 1: 추천 키 자동 추가는 카테고리 선택 시점 trigger — 만약 사용자가 카테고리 선택 후 추천 키를 일부 삭제하고 같은 키를 자유 입력 (예: unit 변경 의도) 시 409 발생. UX 끊김 위험.
- 누락 catch 2: 카테고리 변경 시점 (`PATCH /products/{code}/usage` 의 estimateCategory 변경) — 기존 ProductSpec row 처리 정책 미명시. (a) 모두 보존 (b) 추천 외 row 모두 삭제 (c) 사용자 confirmation modal.
- 누락 catch 3: `isRecommended=TRUE` 키와 `isRecommended=FALSE` 사용자 추가 키의 우선순위 — displayOrder 가 같으면 어느 것을 먼저 노출? Plan §2.1.1.1 의 displayOrder int default 0 → 시점별 충돌 가능.

### 합의 (또는 사용자 확정 필요)

| 옵션 | 충돌 시 정책 | 카테고리 변경 시 정책 |
|---|---|---|
| (a) 409 strict + 카테고리 변경 시 모두 보존 | 데이터 정합성 우선 | 사용자 자유 입력 보존 |
| (b) auto-merge (추천 키 unit override) + 카테고리 변경 시 추천 외 보존 | UX 부드러움 / 추천 키 완전 보존 | 사용자 자유 입력 보존 |
| (c) **409 strict + UI 가드 (자동 추가 후 사용자가 같은 키 추가 시 disabled) + 카테고리 변경 시 confirmation modal** (Reviewer 추천) | 데이터 정합성 + UX 끊김 방지 | 사용자 명시적 결정 |

**권장 (Reviewer + Plan 합의)**: **옵션 (c)** — 409 strict + Frontend 가드.
- BACKEND: `POST /specs` 가 409 응답 — `{error: "specKey already exists", existingSpecId: <UUID>}`
- FRONTEND: 자동 추가된 추천 키는 disabled 상태로 표시 + "수정" 버튼 → `PATCH /specs/{id}` 호출 (specValue/unit 수정만, specKey 변경 X)
- 카테고리 변경 시: confirmation modal — "기존 14 row spec 중 추천 외 5 row 보존 / 새 카테고리 추천 21 row 자동 추가 / 진행?"
- displayOrder 충돌: Plan §2.1.7 `PATCH /specs/reorder` (drag&drop bulk) 사용 — 사용자가 명시적 정렬

→ **사용자 확정 필요 (G18 신규 게이트)** — 옵션 (a) / (b) / (c) 중 선택. 권장 (c). UI 동작 mockup 의무 (DESIGN team).

---

## §3. D16 — 운영 중 SpecKeyTemplate 키 추가 시 기존 ProductMaster ProductSpec 자동 추가 정책

### 분석 agent POV (모호 / 근거)

- `decisions/DOMAIN-EXTENSIONS.md:144-156` (§4): SpecKeyTemplate entity 정의 + 시드 53 row. 운영 중 추가 정책은 명시 안 됨.
- 시드 후 실제 운영 중 신규 카테고리 표준 키 (예: `IoT 호환 여부`) 추가 시점 — 기존 ProductMaster ~3000 SKU 처리 정책 누락.

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:1195` (§11 #15): "운영 중 SpecKeyTemplate 키 추가 시 기존 ProductMaster ProductSpec 자동 추가 정책 — 새 SpecKeyTemplate row 등록 시 (a) 기존 ProductMaster (~3000) 의 ProductSpec 에 자동 추가 vs (b) 신규 등록 품목부터만 적용. 자동 추가 시 specValue 빈 칸 처리 + 일괄 batch 작업 부담 — 사용자 확정".
- 사유 (Plan): 자동 추가 = ~3000 row × 카테고리별 비율 (HOME_MULTI 119 + SINGLE_SET 288 + COMM 414 + LEGACY 41 = 862 SKU 가 카테고리 보유) → 최대 862 row INSERT. 일괄 batch 부담 측정.

### Reviewer POV (모순 / 누락 catch)

- Round 2 D10 (PartnerOrderDraft cron) 와 비슷한 운영 batch 패턴 — 동일 cron 인프라 재활용 가능.
- 누락 catch 1: 자동 추가 시점에 specValue 빈 칸 → 검색/필터 시 "값 없음" 표시 정책 미명시.
- 누락 catch 2: `isRecommended=FALSE` 신규 키는 자동 추가 안 함 (의미: 추천 외 키는 사용자 명시적 추가만) — 정책 명시 필요.
- 누락 catch 3: 자동 추가 후 사용자가 일괄 입력 도구 (admin bulk editor) 필요 — Phase 6 FRONTEND 추가 디스패치 부담.

### 합의 (또는 사용자 확정 필요)

| 옵션 | 자동 추가 정책 | 운영 부담 |
|---|---|---|
| (a) 자동 추가 (`isRecommended=TRUE` 만 / specValue 빈 칸) | UX 일관 / 검색 가능 | INSERT 862 row + bulk editor 필요 |
| (b) 신규 등록 품목부터만 적용 | 운영 단순 | 기존 품목 검색/필터 시 누락 (이력 분리) |
| (c) **자동 추가 + admin trigger only** (Reviewer 추천) | 운영 batch 시점 사용자 결정 / 자동 변동 X | admin UI 필요 |

**권장 (Reviewer 추천)**: **옵션 (c)** — admin trigger only.
- 신규 SpecKeyTemplate 등록 시: BACKEND 가 자동 추가 X
- admin UI 에 "기존 품목 일괄 추가" 버튼 → 사용자 confirmation modal → `POST /spec-key-templates/{id}/apply-to-existing` endpoint 호출
- BACKEND: 해당 카테고리 ProductMaster 전체 → ProductSpec INSERT (specValue NULL, unit=defaultUnit, displayOrder = 카테고리 표준)
- 옵션: dry-run mode (몇 row 영향받는지 사전 표시)
- 회고 가드 적용: `feedback_pm_integration_build_check.md` Layer 5 (시드 검증) — apply-to-existing 후 row count 검증 의무

→ **사용자 확정 필요 (G19 신규 게이트)** — 옵션 (a) / (b) / (c) 중 선택. 권장 (c). admin endpoint 설계 의무.

---

## §4. D17 — 견적/주문 화면 카테고리 선택 UX (`usageScope=BOTH` 품목 양쪽 카테고리 노출 시 중복 처리)

### 분석 agent POV (모호 / 근거)

- `decisions/DOMAIN-EXTENSIONS.md:84-95` (§3): `usageScope enum {NONE, ESTIMATE, PARTNER_ORDER, BOTH}` + `estimateCategory enum nullable`. BOTH 인 경우 견적/주문 양쪽 모달에 노출.
- `decisions/DOMAIN-EXTENSIONS.md:103-104` (§3 비즈니스 룰): "견적/주문 화면 품목 선택 모달은 `WHERE usageScope IN ('ESTIMATE', 'BOTH')` (견적서) / `WHERE usageScope IN ('PARTNER_ORDER', 'BOTH')` (주문서) 로 자동 필터링".
- `decisions/DOMAIN-EXTENSIONS.md:104` (§3): "견적서 작성 시 사용자가 카테고리 선택 UI (HOME_MULTI / SINGLE_SET / COMMERCIAL_MULTI / LEGACY / OTHER) → 해당 카테고리의 품목만 모달에 노출".

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:514` (§2.3.6 estimate API): "GET `/api/v1/products?usageScope=ESTIMATE,BOTH&category={enum}` — 견적 품목 검색 모달 — 카테고리 선택 시 자동 필터 (`usageScope IN ('ESTIMATE','BOTH') AND estimate_category = ?`)".
- `04-migration-plan.md:626` (§2.4.7 partner-order API): 동상 — `usageScope=PARTNER_ORDER,BOTH`.
- 사유 (Plan): 카테고리 = estimateCategory 1:1 매핑. BOTH 품목은 양쪽 화면에서 동일 카테고리 노출 — 카테고리 자체는 중복 아님 (단일 품목 = 단일 카테고리).

### Reviewer POV (cross-review 발견)

- 모순 catch 1: 주문서 화면이 "estimateCategory" 를 카테고리 필터로 사용하는 것이 의미적 모순 — `estimateCategory` 컬럼명이 "estimate" prefix → 주문서에서도 동일 enum 재사용은 명명 혼란.
- 누락 catch 1: 주문서 카테고리 선택 UX 미명세. 견적서는 카테고리 선택 후 모달, 주문서도 동일 흐름인지? Plan §7.2.2 시퀀스 다이어그램 (`04-migration-plan.md:946-948`) 에는 "카테고리 선택 → 품목 모달" 명시. OK.
- 누락 catch 2: 추가 `productCategory` (또는 `displayCategory`) enum 별도 추가 검토 안 됨 — 견적/주문 공통 카테고리 명명 정리 가능.
- 누락 catch 3: BOTH 품목이 견적서에서 HOME_MULTI 카테고리, 주문서에서도 HOME_MULTI 카테고리 — 중복은 아니지만 양 화면 검색 결과 동일. 운영 중 견적/주문 카테고리 분리 필요 시 (예: 주문서는 HOME_MULTI 만 노출, 견적서는 HOME_MULTI + LEGACY) 컬럼 분할 의무.

### 합의 (또는 사용자 확정 필요)

| 옵션 | 컬럼 정책 | UX |
|---|---|---|
| (a) Plan 그대로 — `estimateCategory` 단일 컬럼, 견적/주문 공통 사용 | 단순 / 시드 단순 | 명명 모호 (주문서가 estimate prefix 사용) |
| (b) `estimateCategory` rename → `displayCategory` (양 화면 공통) | 명명 명확 | DB 컬럼 rename 부담 (Phase 4.5 이미 결정 후 변경) |
| (c) **Plan 그대로 + Frontend 명명만 `category` 으로 통일** (Reviewer 추천) | DB 변경 없음 / Frontend 명명 일관 | DB 컬럼명과 UI 명명 비대칭 (Javadoc 명시 의무) |

**권장 (Reviewer 추천)**: **옵션 (c)** — Plan 결정 그대로 유지하되 Frontend / API 응답 시 `category` 로 노출. DB 컬럼 `estimate_category` 는 legacy 명명 보존 (Flyway rename 부담 회피).
- Round 1 D1 (partner-service Feign 캐싱) + Round 2 D11 (Slip/Delivery 분리) 와 정합 — BFF 패턴으로 estimate-service / partner-order-service 가 product-service 호출 시 응답 transform.
- 운영 중 견적/주문 카테고리 분기 필요 시: 별도 `partnerOrderCategory enum nullable` 컬럼 추가 검토 (Phase 6 이후 회고 단계).

→ **사용자 확정 불필요** (Reviewer 추천 + Plan 결정 동일 동작). Frontend 명명 가드만 의무.

---

## §5. D18 — 인쇄 양식 ProductSpec 출력 순서 (`displayOrder` 우선 vs 카테고리 표준 순서 vs 둘 다 toggle)

### 분석 agent POV (모호 / 근거)

- `decisions/DOMAIN-EXTENSIONS.md:138` (§4 ProductSpec): "`displayOrder int | 화면 표시 순서 (사용자가 drag&drop 으로 조정 가능)`".
- `decisions/DOMAIN-EXTENSIONS.md:153` (§4 SpecKeyTemplate): "`displayOrder int | 추천 표시 순서`".
- 즉 ProductSpec.displayOrder (품목별 사용자 조정) 와 SpecKeyTemplate.displayOrder (카테고리 표준) 두 개 동시 보유.

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:476` (§2.3.2 EstimateLine): "Phase 4.5 보강 — EstimateLine 응답 직렬화 시 `productSpecs[]` 포함 ... ProductSpec displayOrder 순으로 렌더링".
- `04-migration-plan.md:518` (§2.3.6 API): "GET `/api/v1/estimates/{id}/pdf` — 견적서 PDF 생성 (ProductSpec displayOrder 순 출력)".
- 사유 (Plan): displayOrder 단일 사용 — 사용자가 drag&drop 으로 조정한 순서가 인쇄 순서와 일치 (UX 일관). SpecKeyTemplate.displayOrder 는 신규 추가 시 default 값만 결정.

### Reviewer POV (cross-review 발견)

- 누락 catch 1: 카테고리 표준 순서가 따로 의미 있을 수 있음 (예: 종합견적서 인쇄 시 모든 SKU 가 동일 카테고리 표준 순서로 나열되어 가독성 ↑). 사용자 drag&drop 결과는 SKU 별 다름 → 인쇄 시 SKU 마다 다른 순서.
- 누락 catch 2: 운영자 (관리자) 가 SKU 마다 displayOrder 조정한 것이 인쇄 양식에 무조건 반영되는 것이 의도인지 불명. 견적서 인쇄는 거래처 보기용 — 카테고리 표준 일관성 우선이 자연.
- 누락 catch 3: Round 2 D13 (인쇄 템플릿 2-tier 통합) 와 직결 — 통합 컴포넌트 안에서 spec 영역 정렬 정책 결정 의무.

### 합의 (또는 사용자 확정 필요)

| 옵션 | 출력 순서 | UX |
|---|---|---|
| (a) Plan 그대로 — displayOrder 우선 | 사용자 조정 반영 | SKU 마다 순서 다름 (가독성 ↓) |
| (b) 카테고리 표준 순서 우선 (SpecKeyTemplate.displayOrder) | 인쇄 가독성 우선 | 사용자 조정 무시 |
| (c) **사용자 toggle (운영 default = displayOrder, 인쇄 시 toggle 가능)** (Reviewer 추천) | 양쪽 trade-off 유연 | UI 추가 부담 |
| (d) 견적서 = 카테고리 표준 (b), 화면 라인 카드 = displayOrder (a) — 분기 정책 (분석 추가 제안) | 화면/인쇄 분리 / 의도 명확 | 코드 분기 필요 |

**권장 (Reviewer + 분석 합의)**: **옵션 (d)** — 화면/인쇄 분기 정책.
- 화면 라인 카드 (`EstimateLineCard.tsx` / `PartnerOrderLineCard.tsx`): ProductSpec.displayOrder 사용 (사용자 drag&drop 결과 즉시 반영)
- 인쇄 양식 (`EstimatePrintRenderer.tsx` 통합 컴포넌트 - Round 2 D13 결과): SpecKeyTemplate.displayOrder 사용 (카테고리 표준 — 거래처 보기 일관성)
- API 응답: 양 displayOrder 모두 반환 (`{specs: [{specKey, specValue, unit, productSpecDisplayOrder, templateDisplayOrder}]}`) — Frontend 가 화면/인쇄 별로 정렬

→ **사용자 확정 불필요** (Reviewer + 분석 추천 합의). Plan §2.3.6 PDF endpoint 보강 의무 (templateDisplayOrder 사용 명시) — Round 3 §종합 매트릭스 등재.

---

## §6. D19 — 5-team 디스패치 우선순위 재조정 (M1 split: M1a + M1b)

### 분석 agent POV (모호 / 근거)

- `04-migration-plan.md:856` (§6.1 단계 표 M1): "product-service 확장 + 시드 (10 시트 → 8 entity, ~3000 SKU + ~5500 PriceHistory + 1885 BundleComponent + 28 MaterialPrice + 99 BranchPipe + 24 OduRecommend + ~16,500 ProductSpec + 53 SpecKeyTemplate) + ProductMaster 신규 2 컬럼 + admin spec UI".
- 즉 M1 = 8 entity + ~25,000 시드 row + admin UI + Flyway + IT — 단일 PR 분량 초과 위험.

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:856` (§6.1): M1 단일 단계 + 5-team + "예상 PR 수 1".
- `04-migration-plan.md:869` (§6.2 책임 매트릭스 M1): BACKEND (ProductSpec/SpecKeyTemplate Repository + 시드 + admin endpoint 5건 + usage PATCH + spec-key-templates GET) + FRONTEND (동적 스펙 UI + 카테고리 모달 + usageScope form) + DESIGN (동적 스펙 mockup + 카테고리 dropdown UX) + QA (시드 검증 IT + usageScope 가드 + SpecKeyTemplate 정합성) + DEVOPS (신규 entity Flyway + composite index).
- 사유 (Plan): 단일 PR 1건 — 통합 검증 단순. 단 분량 부담 인정.

### Reviewer POV (모순 / 누락 catch)

- 누락 catch 1: `04-migration-plan.md:1149` (R13 위험): "ProductSpec 시드 누락 시 견적 인쇄 양식 spec 영역 빈 칸" — 시드 변환 룰 (splitBar/splitSlash/joinCols ERV) 복잡 → 단일 PR 안에서 검증 부담 ↑.
- 누락 catch 2: `feedback_print_design_iteration.md` (PR #21 회고): 인쇄 양식 3-5 iteration 의무 — M1 admin UI 가 인쇄 직접 영향 X 이나 동적 스펙 UI mockup 도 iteration 의무 가능.
- 누락 catch 3: `feedback_multi_agent_team_pattern.md`: "5-team Designer parallel + TEAMLEAD 검토 (PR #19 회고 후 Designer 추가)" — 5-team 디스패치 + 단일 PR = TEAMLEAD 검토 부담. PR split 시 부담 분산 가능.
- 누락 catch 4: M1 의존성 0 (Plan §6.1) → split 시 M1a (ProductMaster + PriceHistory + Bundle + Material + lookup = 6 entity) 와 M1b (ProductSpec + SpecKeyTemplate + admin UI = 2 entity + UI) 분리 가능. M1b 가 M1a 의존만 있음.

### 합의 (또는 사용자 확정 필요)

| 옵션 | 분량 | PR 수 | 위험 |
|---|---|---|---|
| (a) Plan 그대로 — M1 단일 5-team 1 PR | 8 entity + 25,000 row + admin UI 단일 PR | 1 PR | TEAMLEAD 검토 부담 ↑ / 회귀 위험 ↑ |
| (b) **M1 split — M1a (6 entity 시드) + M1b (ProductSpec + SpecKeyTemplate + admin UI)** | 분산 / iteration 분리 | 2 PR | M1b 가 M1a 시드 검증 후 진행 (의존 직렬) |
| (c) M1 split (a) + M1c (분기관 lookup 별도) | 더 세분화 | 3 PR | 운영 비용 ↑ |

**권장 (Reviewer + 분석 합의)**: **옵션 (b) — M1 split (M1a + M1b)**.
- **M1a (BACKEND/QA/DEVOPS 3-team)**: ProductMaster 10 컬럼 + PriceHistory + BundleComponent + MaterialPrice + BranchPipeLookup + OduRecommendationLookup (6 entity, ~9,500 row 시드) + Flyway + 카탈로그 endpoint 7건. FRONTEND/DESIGN 불요 (admin UI 는 M1b).
- **M1b (5-team)**: ProductSpec + SpecKeyTemplate (2 entity, ~16,500 row 시드 + 53 SpecKeyTemplate) + admin spec CRUD endpoint 5건 + `PATCH usage` + `GET spec-key-templates` + 동적 스펙 UI + 카테고리 모달 + DESIGN mockup. 의존: M1a.
- 의존성: M1a → M1b (ProductSpec FK to ProductMaster 의무).
- TEAMLEAD 검토 부담 분산 / Phase 6 진행 단계 명확 / R13 위험 완화 (M1b 단계에서 spec 변환 룰 집중 검증).

→ **사용자 확정 필요 (정보 제공 — split 채택 통보)**. 권장 (b). M2~M5 단계는 Plan §6.1 그대로.

**보강 산출 PR 수**: Plan §6.1 의 "6 PR" → **7 PR** (M1 split 으로 +1).

---

## §7. D20 — 라운드 1+2 합의 종합 검증 (Phase 6 구현 시 충돌 cross-validation)

### 분석 agent POV (모호 / 근거)

라운드 1 D1~D6 + 라운드 2 D7~D13 합의 = 13 결정.

### Plan agent POV (Plan 결정 + 사유)

라운드 1+2 합의 모두 Plan 결정 또는 보강 — 충돌 사전 검증 의무.

### Reviewer POV (cross-validation)

| Round 1 합의 | Round 2 합의 | Round 3 신규 | 충돌 검증 결과 |
|---|---|---|---|
| D1 partner-service 단일 sub-domain | D11 slip/delivery 분리 | D17 BFF 패턴 | ✅ 일관 — service 분리 정책 모두 일치 |
| D2 PW lazy upgrade (DelegatingPasswordEncoder) | D9 historical Slip 시드 운영 전환 동기화 | — | ✅ 일관 — 운영 전환 freeze 24h 동시 |
| D3 거래처 그룹 매핑 (혼합값 첫 토큰 우선) | D12 고정DC 시드 변환 룰 | — | ✅ 충돌 없음 (도메인 분리) |
| D4 EmployeeMaster 신규 사번 EMP-NNNN | — | — | ✅ 충돌 없음 |
| D5 Slip listener 책임 분리 (partner-order EXPAND, slip 단순 저장) | D11 자동 Delivery 생성 X | D14 ProductSpec 시드 splitBar 분리 | ✅ 일관 — partner-order 책임 명확 / Spec 시드는 product-service 단독 |
| D6 long-pending sub-domain | D10 LONG_PENDING Draft 즉시 정리 | — | ✅ 일관 — sub-domain 책임 |
| — | D7 MaterialPriceCalculator service | D14 splitBar/splitSlash/joinCols 변환 | ✅ 충돌 없음 (양 service 별도) |
| — | D8 BranchPipeLookup spot-check | D19 M1 split | ✅ 일관 — M1a 안에서 BranchPipeLookup 처리 |
| — | D13 인쇄 템플릿 2-tier 통합 | D18 인쇄 = SpecKeyTemplate.displayOrder | ✅ 일관 — 통합 컴포넌트 안에서 정렬 정책 일관 |
| — | — | D15 specKey 충돌 409 strict + UI 가드 | ✅ 충돌 없음 |
| — | — | D16 SpecKeyTemplate 운영 추가 admin trigger | ✅ 충돌 없음 (D10 cron 인프라 재활용) |

**충돌 0 확인 ✅**. Round 1+2+3 합의 13+7 = 20 결정 모두 정합.

**추가 cross-validation (Phase 3 §9 14건)**:

| Phase 3 §9 # | 항목 | Discussion 처리 # | 합의 결과 |
|---|---|---|---|
| 1 | 분기계산 폐기/시드 | D8 (G13) | 시드 — Phase 6 dry-run spot-check |
| 2 | 상업멀티 구성_단가인상 사용 비대칭 | DECISIONS Phase 3 G2 | 양 시트 시드 (PriceHistory) |
| 3 | 마스터 4 충돌 PriceHistory 분리 | DECISIONS Phase 3 G3 | PriceHistory 분리 |
| 4 | PRICE_INC_DATE 상수 | DECISIONS Phase 3 G4 | `2026-04-01` 확정 |
| 5 | 거래처 그룹 enum | D3 (G10) | SF/GENERAL/OTHER 매핑 표 |
| 6 | 거래처 싱글 할인 컬럼 | DECISIONS Phase 3 G6 | 활성 보존 |
| 7 | 거래처 여신한도 1 row | (Plan §2.2.1) | 보존 (단순 컬럼) |
| 8 | 장비스펙/부속품스펙 라벨 | D13 (G16) | i18n 통합 → SpecModal |
| 9 | 종합견적서 H3 K2 수식 | D13 (G16) | 폐기 — 통합 컴포넌트가 동적 계산 |
| 10 | 전표생성폼 자격증명 | DECISIONS Phase 3 G7 | Vault + 폐기 |
| 11 | setMaterialKey enum D4 | DECISIONS Phase 3 G8 | `{D4, D7, D8}` 확장 |
| 12 | EmployeeMaster 코드 비표준 | D4 (G11) | 신규 사번 EMP-NNNN |
| 13 | 거래처 빈 그룹 2800 row | D3 (G10) | GENERAL default |
| 14 | 추천실외기 row 1 그룹 헤더 | (Plan §2.1.6) | recommendationType enum 분리 |

**Phase 3 §9 14건 누락 0 ✅**. 모두 Discussion 또는 DECISIONS 에서 처리.

### 합의 (cross-validation 결론)

| 결정 | 합의안 |
|---|---|
| **D20 cross-validation** | **Round 1+2+3 합의 20 결정 + Phase 3 §9 14건 = 34 항목 모두 충돌 0 / 누락 0** |
| **Phase 6 진입 가능 시점** | 사용자 확정 게이트 G9~G19 (11 게이트) 통과 후 |

→ **사용자 확정 불필요** (검증 결과 자체는 Reviewer 산출). 단 게이트 통과 의무.

---

## §8 종합 결정 매트릭스 (D1~D20 + Phase 3 §9 14건 통합)

> **누락 0 의무** — 모든 항목 등재.

| # | 영역 | 항목 | 합의 결정 | 출처 / 게이트 | 라운드 |
|---|---|---|---|---|---|
| D1 | 도메인 | partner-service 단일 vs 분리 | partner-service 단일 + Auth/LongPending sub-domain (package 분리) | Plan §1.2/§2.2 + cross-review §8.2 | R1 |
| D2 | 인증 | PartnerAuth PW 정책 | lazy upgrade (DelegatingPasswordEncoder `{bcrypt}/{sha256}`) + 6개월 후 잔존 reset 옵션 | Plan §2.2.2 + Round 1 §2 / **G9** | R1 |
| D3 | 시드 | 거래처 그룹 14 → 3 enum | SF/GENERAL/OTHER 매핑 표 (Round 1 §3) + 혼합값 "첫 토큰 우선" + 빈 → GENERAL | Plan §2.2.1 + Round 1 §3 / **G10** | R1 |
| D4 | 시드 | EmployeeMaster 19 row 코드 정규화 | 신규 사번 `EMP-NNNN` + `legacyEccountEmpCode` 보존 | Plan §2.2.4 + Round 1 §4 / **G11** | R1 |
| D5 | 도메인 | Slip 자동 생성 listener 책임 | partner-order = EXPAND/KEEP + Event 발행 / slip = 단순 저장 + 역 SlipCreatedEvent | Plan §2.4.6/§2.5.2 + Round 1 §5 / **G12** | R1 |
| D6 | 도메인 | long-pending sub-domain 분리 | partner-service sub-domain 흡수 (분리 X) | Plan §1.2/§2.6 + cross-review §8.1 | R1 |
| D7 | 시드 | MaterialPrice singletons vs entity | 별도 entity (Plan §2.1.4) + `MaterialPriceCalculator @Service` 신규 | Plan §2.1.4 + Round 2 §1 | R2 |
| D8 | 시드 | BranchPipeLookup A열 코드 의미 | G1 시드 + Phase 6 dry-run spot-check | DECISIONS G1 + Plan §11 #5 + Round 2 §2 / **G13** | R2 |
| D9 | 시드 | Slip MANUAL historical 시드 | 신규 default MANUAL + historical row D11 결정 후 + Round 1 D2 운영 전환 동기화 | Plan §2.5.1 + Round 2 §3 / **G14** | R2 |
| D10 | 데이터 | PartnerOrderDraft 30일 expiry | soft delete 30일 default + cron + LONG_PENDING 거래처 즉시 정리 | Plan §2.4.3 + Round 2 §4 | R2 |
| D11 | Notion | TOKEN_004 SHIPPING 분리 | slip Slip + delivery Delivery + Notion property spot-check + 자동 Delivery 생성 X | Plan §4.1 + Round 2 §5 / **G15** | R2 |
| D12 | 시드 | 고정DC 컬럼 활용 | 시드 변환 룰 (% / decimal / `-` → NULL) + admin UI + 우선순위 (fixed > legacy > variable) | Plan §2.1.1 + Round 2 §6 | R2 |
| D13 | UI | 인쇄 템플릿 11 통합 | 2-tier 통합 (EstimatePrintRenderer + SlipPrintRenderer + SpecModal = 3 컴포넌트) | Plan §5/§11 #6 + Round 2 §7 / **G16** | R2 |
| D14 | 시드 | ProductSpec multi-value 시드 | splitBar 분리 + splitSlash 분리 + ERV joinCols 통합 (이중 표준 + Phase 6 QA 가드 보강) | Plan §3.1.2 + Round 3 §1 / **G17** | R3 |
| D15 | UI | SpecKeyTemplate 추천 vs 자유 충돌 | 409 strict + Frontend 가드 (disabled) + 카테고리 변경 시 confirmation modal | Plan §11 #14 + Round 3 §2 / **G18** | R3 |
| D16 | 운영 | SpecKeyTemplate 추가 시 기존 ProductMaster 자동 처리 | admin trigger only (`POST /spec-key-templates/{id}/apply-to-existing` + dry-run) | Plan §11 #15 + Round 3 §3 / **G19** | R3 |
| D17 | UX | usageScope=BOTH 카테고리 명명 | DB `estimate_category` 보존 + Frontend `category` 명명 통일 (BFF transform) | DOMAIN-EXTENSIONS §3 + Round 3 §4 | R3 |
| D18 | 인쇄 | ProductSpec 출력 순서 | 화면 = ProductSpec.displayOrder / 인쇄 = SpecKeyTemplate.displayOrder (분기 정책) | DOMAIN-EXTENSIONS §4 + Round 3 §5 | R3 |
| D19 | 우선순위 | M1 split | M1 → M1a (6 entity, BACKEND/QA/DEVOPS 3-team) + M1b (ProductSpec/SpecKeyTemplate + admin UI, 5-team) | Plan §6.1 + Round 3 §6 | R3 |
| D20 | 검증 | Round 1+2+3 cross-validation | 충돌 0 / 누락 0 / Phase 3 §9 14건 모두 처리 확인 | Round 3 §7 | R3 |
| — | (DECISIONS) | Phase 3 G1 분기계산 시드 | BranchPipeLookup entity (D8 와 동일 결정) | DECISIONS G1 | (DECISIONS) |
| — | (DECISIONS) | Phase 3 G2 상업멀티 구성_단가인상 | 양 시트 시드 (PriceHistory) | DECISIONS G2 | (DECISIONS) |
| — | (DECISIONS) | Phase 3 G3 마스터 4 충돌 | PriceHistory 분리 (effectiveDate 과거/2026-04-01) | DECISIONS G3 | (DECISIONS) |
| — | (DECISIONS) | Phase 3 G4 PRICE_INC_DATE | `2026-04-01` 확정 | DECISIONS G4 | (DECISIONS) |
| — | (DECISIONS) | Phase 3 G5 거래처 그룹 enum | D3 와 동일 (SF/GENERAL/OTHER) | DECISIONS G5 + R1 D3 | (DECISIONS+R1) |
| — | (DECISIONS) | Phase 3 G6 거래처 싱글 할인 | 활성 보존 (singleDiscountRate) | DECISIONS G6 | (DECISIONS) |
| — | (Plan §2.2.1) | Phase 3 §9 #7 거래처 여신한도 | 단순 컬럼 보존 (creditLimit numeric nullable) | Plan §2.2.1 | (Plan) |
| — | (DECISIONS) | Phase 3 G7 전표생성폼 자격증명 | Vault 1회 이전 + 시트 폐기 | DECISIONS G7 | (DECISIONS) |
| — | (DECISIONS) | Phase 3 G8 setMaterialKey enum | `{D4, D7, D8}` 확장 | DECISIONS G8 | (DECISIONS) |
| — | (Plan §2.1.6) | Phase 3 §9 #14 추천실외기 row 1 그룹 | recommendationType enum (MULTI_HEATING_COOLING / HOME_MULTI) | Plan §2.1.6 | (Plan) |
| — | (D13) | Phase 3 §9 #8 장비스펙/부속품스펙 라벨 | i18n 통합 → SpecModal (D13 통합 컴포넌트) | D13 / G16 | R2 |
| — | (D13) | Phase 3 §9 #9 종합견적서 H3 K2 수식 | 통합 컴포넌트 동적 계산 — 시트 수식 폐기 | D13 / G16 | R2 |
| — | (D4) | Phase 3 §9 #12 EmployeeMaster 코드 비표준 | D4 와 동일 (EMP-NNNN) | D4 / G11 | R1 |
| — | (D3) | Phase 3 §9 #13 거래처 빈 그룹 2800 row | GENERAL default (DECISIONS G5 + D3 일관) | D3 / G10 | R1 |

**총 34 항목 = Discussion 20 (D1~D20) + DECISIONS Phase 3 G1~G8 (8) + Plan 직접 결정 (G7 여신한도 / G14 추천실외기 = 2) + Phase 3 §9 #8/#9 (D13 흡수) / #12 (D4 흡수) / #13 (D3 흡수) = 14 매핑**. **누락 0 확인 ✅**.

---

## §9 Phase 6 입력 명세 (5-team 디스패치 사전 결정 사항)

### §9.1 단계별 의존성 + 5-team 책임 (M1 split 반영)

| 단계 | 5-team 구성 | BACKEND 책임 | FRONTEND 책임 | DESIGN 책임 | QA 책임 | DEVOPS 책임 | 의존 |
|---|---|---|---|---|---|---|---|
| **M1a** | 3-team (BE/QA/DEVOPS) | ProductMaster 10 컬럼 + PriceHistory + BundleComponent + MaterialPrice + `MaterialPriceCalculator` (D7) + BranchPipeLookup (D8) + OduRecommendationLookup + 7 카탈로그 endpoint + 시드 스크립트 + IT | (불요 — admin UI 는 M1b) | (불요) | 시드 row count + sample 30 견적 1:1 비교 + dry-run 99 BranchPipe 매핑 표 (G13) | Flyway 마이그 + Docker compose | 없음 |
| **M1b** | 5-team | ProductSpec + SpecKeyTemplate + 시드 변환 (splitBar/splitSlash/joinCols D14) + 5 admin spec CRUD + `PATCH /usage` + `GET /spec-key-templates` + `POST /spec-key-templates/{id}/apply-to-existing` (D16) + 409 strict (D15) | 동적 스펙 UI (`react-beautiful-dnd`) + 카테고리 dropdown (`category` 명명 D17) + ProductPickerModal (`usageScope` 필터) + 자동 추가 추천 키 disabled 가드 (D15) + 카테고리 변경 confirmation modal (D15) | 동적 스펙 mockup + 카테고리 dropdown UX + admin trigger UI (D16) | ~16,500 ProductSpec 시드 row 검증 + Apps Script `getSpecDetailMap_()` ↔ Java sample 30 SKU 1:1 (D14 multi-value 양 케이스 fixture) + 53 SpecKeyTemplate 정합성 + `usageScope=NONE` ~2200 row 모달 미노출 가드 (R14) | 신규 entity Flyway + composite index `(usage_scope, estimate_category)` | M1a |
| **M2** | 5-team | PartnerMaster + PartnerAuth (DelegatingPasswordEncoder D2) + EmployeeMaster (EMP-NNNN D4) + Notion DC 마이그 + 그룹 매핑 (D3) | 거래처 관리 admin UI | PartnerAuth 인증 modal mockup | 6924 row 정합성 + status 분포 + 그룹 매핑 14 → 3 검증 + 19 EmployeeMaster 사번 검증 | Notion export 스크립트 운영 | M1a |
| **M3** | 5-team | EstimateMaster + Line + Snapshot (무한 보존 D10) + PDF (인쇄 = SpecKeyTemplate.displayOrder D18) | 견적 작성 SPA + 인쇄 미리보기 + ProductPickerModal | EstimatePrintRenderer 통합 컴포넌트 mockup (D13 — 7 layout 분기) + 3-5 iteration 의무 | sample 30 견적 1:1 비교 (Apps Script ↔ Java) + ProductSpec 인쇄 양식 가드 (R13) | estimate-service deploy | M1b + M2 |
| **M4** | 5-team (양 service 동시) | PartnerOrderMaster + Line + Draft (30일 cron D10) + ActionLog + Slip.sourceType + PartnerOrderConfirmedEvent + Outbox/`@TransactionalEventListener` (D5/G12) + Delivery 분리 (D11) | 거래처 주문 SPA + 인증 게이트 + 임시저장 + ProductPickerModal | SlipPrintRenderer 통합 컴포넌트 mockup (D13 — 2 layout) + 3-5 iteration 의무 | 주문 → Slip 자동 생성 IT + EXPAND/KEEP 분기 + historical Slip 시드 sample 5 (G14) + SHIPPING DB 매핑 (G15) | partner-order + slip-service 동시 deploy + Outbox 인프라 | M1b + M2 + M3 |
| **M5** | 3-team (BE/QA/DEVOPS) | LongPendingScheduler + ApprovalStatus enum + LONG_PENDING Draft 즉시 정리 (D10) + Notion AUTH/LOG 1회 export | (불요) | (불요) | sample 30 거래처 status 전환 검증 + cron timezone | cron schedule 운영 모니터링 | M1a + M2 + M4 |

**총 PR 수**: 7 (Plan §6.1 의 6 → +1 = M1 split).

### §9.2 게이트 통과 시점 매트릭스

| 게이트 | 차단 단계 | 차단 시점 |
|---|---|---|
| G9 | M2 | M2 BACKEND 디스패치 직전 (PartnerAuth 마이그 정책 결정) |
| G10 | M2 | M2 시드 직전 (그룹 매핑 표 사용자 검토) |
| G11 | M2 | M2 시드 직전 (19 사번 부여 사용자 검토) |
| G12 | M4 | M4 BACKEND 디스패치 직전 (Outbox vs `@TransactionalEventListener` 결정) |
| G13 | M1a | M1a 시드 dry-run 직전 (BranchPipeLookup 99 row 매핑 표) |
| G14 | M4 | M4 시드 dry-run 직전 (historical Slip sample 5 비교) |
| G15 | M4 | M4 BACKEND 디스패치 직전 (SHIPPING DB 컬럼 매핑) |
| G16 | M3 | M3 DESIGN mockup 단계 (인쇄 통합 옵션 a/b/c) |
| G17 | M1b | M1b BACKEND 디스패치 직전 (ProductSpec multi-value 시드 정책) |
| G18 | M1b | M1b BACKEND 디스패치 직전 (specKey 충돌 정책) |
| G19 | (M1b 이후 운영 단계) | M1b 완료 후 운영 시점 (admin trigger only 결정 — Phase 6 이후 회고에서 admin UI mockup 의무) |

---

## §10 사용자 확정 필요 게이트 표 (라운드 1+2+3 종합)

> Phase 6 진입 의무 게이트 11건. **누락 0 의무**.

| 게이트 | 라운드 | 영역 | 차단 항목 | 옵션 | 권장 | 차단 단계 |
|---|---|---|---|---|---|---|
| **G9** | R1 | 인증 | PartnerAuth PW 마이그 정책 (D2) | (a) lazy upgrade / (b) 사전 일괄 + temp PW / (c) 혼합 6개월 후 잔존 reset | (a) lazy + DelegatingPasswordEncoder | M2 BACKEND |
| **G10** | R1 | 시드 | 거래처 그룹 매핑 표 (D3) | (a) Round 1 §3 표 그대로 (MAIN/VIP → SF, 혼합값 "첫 토큰 우선") / (b) MAIN/VIP 별도 enum / (c) 사용자 직접 매핑 | (a) | M2 시드 |
| **G11** | R1 | 시드 | EmployeeMaster 19 row 사번 부여 (D4) | (a) 신규 `EMP-0001~0019` / (b) 시트 코드 보존 / (c) Google 이메일 ID | (a) 신규 사번 | M2 시드 |
| **G12** | R1 | 도메인 | Slip 자동 생성 트랜잭션 패턴 (D5) | (a) Outbox 패턴 / (b) `@TransactionalEventListener(phase=AFTER_COMMIT)` / (c) 단일 `@Transactional` | (b) — Outbox 인프라 부담 회피 | M4 BACKEND |
| **G13** | R2 | 시드 | BranchPipeLookup A열 코드 의미 (D8) | (a) 분기관 SKU + 99 row 매핑 표 / (b) 인쇄 라벨 / (c) lookup key 만 | (a) — 매핑 표 사용자 제공 | M1a 시드 dry-run |
| **G14** | R2 | 운영 | historical Slip 시드 sample 5 검토 (D9) | (a) sample 5 비교 후 마이그 / (b) row 전수 검토 / (c) 마이그 안 함 (cutover 시점부터만) | (a) | M4 시드 dry-run |
| **G15** | R2 | Notion | SHIPPING DB Slip/Delivery 컬럼 매핑 (D11) | Notion property 목록 spot-check 후 매핑 표 사용자 검토 | spot-check 결과 사용자 검토 | M4 BACKEND |
| **G16** | R2 | UI | 인쇄 템플릿 통합 옵션 (D13) | (a) 11 분리 / (b) 단일 / (c) 2-tier 3 컴포넌트 (EstimatePrintRenderer + SlipPrintRenderer + SpecModal) | (c) — 2-tier 통합 | M3 DESIGN mockup |
| **G17** | R3 | 시드 | ProductSpec multi-value 시드 정책 (D14) | (a) Plan §3.1.2 그대로 — splitBar 분리 + splitSlash 분리 + ERV joinCols 통합 (이중 표준) / (b) 모두 분리 / (c) 모두 단일 row | (a) — Plan 그대로 + Phase 6 QA 가드 보강 | M1b BACKEND |
| **G18** | R3 | UI | SpecKeyTemplate 추천 vs 자유 입력 충돌 (D15) | (a) 409 strict / (b) auto-merge / (c) 409 strict + Frontend 가드 (disabled) + 카테고리 변경 confirmation modal | (c) | M1b BACKEND |
| **G19** | R3 | 운영 | SpecKeyTemplate 운영 추가 시 기존 ProductMaster 자동 처리 (D16) | (a) 자동 추가 (`isRecommended=TRUE`) / (b) 신규 등록 품목부터만 / (c) admin trigger only (`POST /spec-key-templates/{id}/apply-to-existing` + dry-run) | (c) admin trigger only | M1b 완료 후 운영 단계 |

**총 11 게이트** — 모두 권장 옵션 명시 + 차단 단계 명시.

---

## §11 회고 가드 적용 검증 (라운드 3)

| 가드 | 본 라운드 적용 |
|---|---|
| `feedback_pm_integration_build_check.md` Layer 4 (도메인 메서드 의미 정렬) | D14 `ProductSpecSeedService.expandSplitBar()` = "splitBar `\|` 좌측=cool / 우측=heat 분리하여 ProductSpec 2 row 생성, specKey suffix 추가" 명시 의무 / D18 `EstimatePrintRenderer.sortSpecsForPrint()` = "SpecKeyTemplate.displayOrder 사용 (인쇄 가독성 우선)" 명시 의무 / D16 `SpecKeyTemplateService.applyToExistingProducts()` = "해당 카테고리 ProductMaster 전체에 NULL specValue ProductSpec INSERT, dry-run mode 지원" 명시 의무 |
| `feedback_pm_integration_build_check.md` Layer 5 (시드 검증) | D14 ProductSpec sample 30 SKU 1:1 비교 의무 / D8 BranchPipeLookup 99 row dry-run / D12 고정DC 채움 row 카운트 / R14 `usageScope=NONE` ~2200 row 모달 미노출 가드 |
| `feedback_print_design_iteration.md` (PR #21 회고) | D13 + D18 인쇄 양식 — EstimatePrintRenderer/SlipPrintRenderer 통합 컴포넌트 모두 사용자 이미지 → mock → Edge 캡처 → 3-5 iteration 의무 |
| `feedback_uuid_no_user_visibility.md` | D17 BFF 패턴 — Frontend `category` 명명 통일 + `productSpecs[]` 응답 시 modelCode/specKey/specValue/unit 만 노출 (UUID 미노출) |
| `feedback_multi_agent_team_pattern.md` (PR #19 회고) | D19 M1 split — M1a (3-team) + M1b (5-team Designer) 패턴 적용. TEAMLEAD 검토 부담 분산 |
| `feedback_function_documentation.md` (3-layer) | D14/D15/D16 신규 메서드 모두 한국어 Javadoc 의무 + dev-reports/product-spec.md 누적 (Plan §10 #3 보강) |
| `feedback_korean_commits.md` | 본 라운드 한국어 작성 ✅ / Phase 6 commit/PR/Issue 한국어 의무 |
| `feedback_role_naming_full.md` | 본 라운드 5-team 표기 시 풀네임 (BACKEND/FRONTEND/DESIGN/QA/DEVOPS) 의무 |
| `feedback_powershell_utf8_writes.md` | 본 라운드 산출 Write 도구 사용 ✅ / Phase 6 PR body Write 도구만 |
| `feedback_it_mockbean_external_clients.md` | M1b/M3/M4 IT — ProductClient/PartnerClient/SlipClient 모든 Feign client `@MockBean` 의무 |
| `feedback_github_pr_workflow.md` | M1 split 후 7 PR 모두 TEAMLEAD → PM → 대표 승인 체인 |
| `feedback_pr_qa_screenshots.md` | 7 PR 모두 QA 스크린샷 1장 이상 인라인 첨부 |
| `feedback_testcontainers_windows_docker.md` | M4 IT — DOCKER_HOST=tcp://localhost:2375 우회 |
| `feedback_gradlew_exec_bit.md` | Phase 6 commit `git update-index --chmod=+x gradlew` 의무 |
| `feedback_korean_path_jdk.md` | CI 영문 path 강제 (현 `c:\dev\SamhanLogis` OK) |

---

## §12 라운드 3 누락 0 가드 (최종 검증)

- D14~D20 7 항목 모두 처리 ✅
- 각 항목 분석 / Plan / Reviewer 3 perspective 발언 모두 등재 ✅
- 각 perspective 발언에 출처 (파일:라인) 명시 ✅
- Round 1 §7.1 / Round 2 §8.1 합의 표 명시적 인용 ✅
- §8 종합 결정 매트릭스 — D1~D20 + Phase 3 §9 14건 모두 등재 (총 34 항목) ✅
- §9 Phase 6 입력 명세 — M1 split (M1a/M1b) + M2~M5 단계별 5-team 책임 + 게이트 통과 시점 매트릭스 ✅
- §10 사용자 확정 필요 게이트 표 — G9~G19 11 게이트 모두 등재 + 권장 옵션 + 차단 단계 ✅
- 회고 가드 14건 적용 검증 ✅
- D20 cross-validation 결과 — 충돌 0 / 누락 0 확인 ✅

---

## §13 종합 결론 (Phase 5 Discussion 3 라운드 산출)

### 합의 결정 (사용자 확정 불필요)

| 영역 | 결정 |
|---|---|
| 도메인 분할 | partner-service 단일 (Auth/LongPending sub-domain) / slip-service ↔ delivery-service 분리 / partner-order-service 신규 / estimate-service 신규 |
| 시드 변환 | MaterialPriceCalculator service 신규 / 고정DC 변환 룰 / 추천실외기 recommendationType enum / 거래처 빈 그룹 GENERAL default |
| 운영 | PartnerOrderDraft 30일 + LONG_PENDING 거래처 즉시 정리 / EstimateSnapshot 무한 보존 / Notion 1회 export 후 폐기 |
| UI | Frontend `category` 명명 통일 (BFF transform) / 화면 = ProductSpec.displayOrder / 인쇄 = SpecKeyTemplate.displayOrder |
| 우선순위 | M1 split (M1a + M1b) — 7 PR / 5-team Designer 패턴 적용 / TEAMLEAD 검토 부담 분산 |

### 사용자 확정 필요 (Phase 6 진입 게이트 11건)

| 단계별 게이트 | 차단 게이트 |
|---|---|
| **M1a** (BACKEND/QA/DEVOPS) | G13 (BranchPipeLookup) |
| **M1b** (5-team) | G17 (ProductSpec multi-value), G18 (specKey 충돌), G19 (운영 추가 정책 — M1b 완료 후) |
| **M2** (5-team) | G9 (PartnerAuth PW), G10 (그룹 매핑), G11 (사번 부여) |
| **M3** (5-team) | G16 (인쇄 통합 옵션) |
| **M4** (5-team 양 service) | G12 (Slip listener 트랜잭션), G14 (historical Slip), G15 (SHIPPING DB 매핑) |
| **M5** (3-team) | (게이트 없음) |

### Phase 6 진입 가능 시점

사용자 확정 게이트 11건 중 차단 단계별로 순차 통과 → M1a 진입 (G13 only) → M1b 진입 (G17/G18) → M2 진입 (G9/G10/G11) → M3 진입 (G16) → M4 진입 (G12/G14/G15) → M5 진입 (게이트 없음).

각 단계 5-team 디스패치 시 PM (Claude) 통합 풀빌드 가드 (`feedback_pm_integration_build_check.md`) 적용 의무 — BACKEND+QA 사전 컴파일 검증 + Docker 가용 IT + Layer 4 도메인 메서드 의미 정렬.

---

_생성: Phase 5 Discussion Round 3 (최종) / Reviewer agent perspective driver / 2026-05-05 / 단일 산출 파일 / 한국어 / 출처 명시 / 추측 금지 / Round 1+2 인용 / 누락 0 검증 / 종합 매트릭스 + 게이트 표 + Phase 6 입력 명세 완성_
