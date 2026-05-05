# Product 도메인 확장 결정 사항 (마이그 사전 합의)

> 본 문서는 사용자가 마이그 작업 전 명시한 product-service 도메인 확장 요건을 기록.
> Phase 1 분석 agent + Phase 4 Migration Plan + Phase 6 BE/FE 구현 시 반드시 반영.

---

## 1. 변동DC 자동 감지 → boolean 사전 계산

### 배경
- 기존 Apps Script 가 시트의 일부 수식/단어를 **runtime 감지**하여 변동DC (Variable Discount) 여부 판정
- 동일 로직을 매 견적/주문마다 반복 실행 → 성능 ↓ + 룰 변경 시 산재된 코드 수정 부담

### 결정 (Phase 2 cross-review 후 4-컬럼 안 확정)

**ProductMaster 신규 4 컬럼** (Flyway 마이그레이션):

| 컬럼 | 타입 | 의미 | 출처 룰 |
|---|---|---|---|
| `hasVariableDiscount` | boolean | 변동DC 적용 여부 (마스터 시트에 단가 수식 절대참조 포함) | 룰 1: `$L$2` (홈/상업 멀티) |
| `fixedDiscountRate` | decimal(5,2) nullable | 고정 할인율 (legacy 50% 등) | 룰 3: F열 수식의 `$I$1` → 50% (구형) |
| `setMaterialKey` | enum `{D4, D7, D8}` nullable | 세트 자재 옵션 키 (싱글 세트/싱글 구성품) | 룰 2: `$D$4` (자재 합계 default master, 245 hits) / `$D$7` (자재 미포함, 45 hits) / `$D$8` (자재 포함, 10 hits) — Phase 3 §4.2 formulas.json grep 결과 D4 신규 발견 → enum 확장 |
| `legacyDiscountFlag` | boolean | 구형 모델 여부 (FLOW: legacy DC 트리거 조건) | 룰 3: 구형 모델 prefix 매칭 |

- 마이그 시점에 시트의 모든 품목을 일괄 스캔 → 4 룰 적용 → 4 컬럼으로 사전 계산하여 시드
- 신규 품목 등록 시에도 동일 룰을 backend service (`VariableDiscountDetector`) 에서 자동 판정
- estimate.md 의 단일 enum 안 대비 우월 — 룰 1/2/3 분리 표현 가능 (Phase 2 cross-review §4 결정)

### Phase 1 분석 agent 의무
- Apps Script 의 변동DC **감지 룰** (수식 패턴 / 키워드 매칭 / 셀 위치 등) 을 **함수 단위로 정확히 추출**
- 감지 룰을 Java 로 포팅 가능한 형태로 명세화 (`migration/analysis/01-script-analysis-{name}.md` §변동DC 섹션)

### Phase 4 Migration Plan 의무
- ProductMaster entity 에 `hasVariableDiscount` 컬럼 추가 + 시드 데이터에 boolean 채움
- 신규 등록 endpoint 에 자동 판정 service 메서드 (`VariableDiscountDetector.detect(product)`)

---

## 2. 세트(Set) 품목 처리

### 배경
- 일부 품목은 **세트(Bundle)** 구조 — 1개 SKU 가 여러 sub-품목으로 구성
- 예시 추정: 시스템에어컨 4Way 1세트 = 본체 + 유선 리모컨 + WIFI 판넬 + 배관 자재 (각각 별도 SKU 였을 수 있음)

### 결정 (Phase 2 cross-review 후 옵션 A + bundleMode 확정)

**옵션 A 채택 + bundleMode 추가** (3 옵션 중 사용자 확정):
- product 에 `productType: enum SINGLE/BUNDLE` 추가
- BUNDLE 인 경우 `bundleComponents: List<BundleComponent>` (componentProductCode + qty)
- **`bundleMode: enum EXPAND/KEEP`** 추가 — 견적/주문 라인 처리 분기:
  - **EXPAND** (default): 견적/주문 시 BUNDLE 선택하면 자동으로 component 라인 펼침 (재고 차감도 component 단위)
  - **KEEP**: BUNDLE SKU 그대로 유지 (펼치지 않음). SEND_AS_SET_IDS 화이트리스트 (4 SKU: 발통원형/발통평형/유선보드/천장펌프) 가 KEEP 으로 시드.
- partner-order Code.js 의 SEND_AS_SET_IDS 룰 (Phase 1 partner-order.md §6) 을 Java 로 포팅 시 bundleMode=KEEP 으로 마이그.

**옵션 B — flat composite 키 SKU**
- BUNDLE SKU 자체로 별도 product (component 정보 메타 텍스트만)
- 재고/단가 모두 BUNDLE 단위로만 관리
- 단순하지만 component 재고 추적 불가

**옵션 C — 견적 라인 자동 생성 매크로**
- product 자체는 SINGLE 만 — BUNDLE 은 견적 단계의 "템플릿" 으로 별도 관리
- product domain 깨끗하지만 견적 UI 복잡

### Phase 1 분석 agent 의무
- Apps Script 가 세트 품목을 어떻게 처리하는지 식별 (시트의 별도 탭? 특정 컬럼 마커? 공식 펼침?)
- 세트 품목의 데이터 구조 명세 (`migration/analysis/01-script-analysis-{name}.md` §세트품목 섹션)

### Phase 4 Migration Plan 의무
- 위 3 옵션 중 사용자 추천 안 + 의사결정 표 제공
- 채택 옵션에 따라 product domain 스키마 + 마이그 매핑 명세

---

## 3. 품목 노출 분류 (견적/주문서 가시성 제어) — 사용자 명시 (2026-05-05)

### 배경
- 사용자 명시: "품목 데이터에서 견적/주문서용 품목 (견적서 중에서도 어디로 분류할지 선택 가능) 을 선택할 수 있게 분류"
- 사용자 명시: "분류되지 않은 품목은 견적서 및 주문서에 나타나지 않음" (default 미노출)
- ProductMaster 약 3000 SKU 중 일부만 견적/주문 라인에 직접 노출 — 나머지 (자재/구성품/lookup) 는 backend 만 사용

### 결정 — ProductMaster 신규 2 컬럼

| 컬럼 | 타입 | 의미 | default |
|---|---|---|---|
| `usageScope` | enum `{NONE, ESTIMATE, PARTNER_ORDER, BOTH}` | 어느 화면에서 라인으로 직접 선택 가능한지 제어 | **`NONE`** (분류되지 않은 품목 미노출 — 사용자 명시) |
| `estimateCategory` | enum nullable `{HOME_MULTI, SINGLE_SET, COMMERCIAL_MULTI, LEGACY, OTHER}` | 견적서 안에서 카테고리 분류 (사용자가 견적서 작성 시 카테고리 선택) | NULL (`usageScope ∈ {ESTIMATE, BOTH}` 인 경우에만 채움) |

### 시드 시점 자동 분류 룰 (시트 출처 기반)

| 시트 | usageScope | estimateCategory | 사유 |
|---|---|---|---|
| `홈멀티` (+ `_단가인상`) | BOTH | HOME_MULTI | 견적/주문 양쪽 직접 라인 |
| `싱글 세트` (+ `_단가인상`) | BOTH | SINGLE_SET | 동상 (BUNDLE 부모, EXPAND/KEEP 분기) |
| `상업멀티` (+ `_단가인상`) | BOTH | COMMERCIAL_MULTI | 동상 |
| `구형` | BOTH | LEGACY | 구형 50% DC 적용 |
| `싱글 구성품` (+ `_단가인상`) | NONE | NULL | BUNDLE component — backend 만 (직접 라인 미노출) |
| `상업멀티 구성` (+ `_단가인상`) | NONE | NULL | 동상 |
| `싱글 자재가격` | NONE | NULL | 자재 단가 마스터 (backend 합계 계산용) |
| `추천실외기` | NONE | NULL | OduRecommendationLookup (lookup table) |
| `분기계산` | NONE | NULL | BranchPipeLookup (lookup table) |

### 비즈니스 룰
- 견적/주문 화면 품목 선택 모달은 `WHERE usageScope IN ('ESTIMATE', 'BOTH')` (견적서) / `WHERE usageScope IN ('PARTNER_ORDER', 'BOTH')` (주문서) 로 자동 필터링
- 견적서 작성 시 사용자가 **카테고리 선택** UI (HOME_MULTI / SINGLE_SET / COMMERCIAL_MULTI / LEGACY / OTHER) → 해당 카테고리의 품목만 모달에 노출
- product 등록 화면 (admin) 에서 `usageScope` + `estimateCategory` 수동 변경 가능 (시드 후 운영 중 분류 재조정)
- `usageScope = NONE` 품목은 backend service 가 자동 참조 (자재 합계 / Bundle component 펼침 / lookup) — 사용자 화면엔 절대 직접 노출 안됨

### Phase 4 Migration Plan 의무
- ProductMaster 시드 SQL 에 위 시트→enum 매핑 자동 적용
- estimate-service / partner-order-service API 가 품목 검색 시 위 필터 자동 적용
- product-service admin endpoint `PATCH /products/{code}/usage` (운영 중 분류 변경)
- DB index: `(usageScope, estimateCategory)` composite index — 검색 성능

### Phase 6 QA 의무
- 시드 후 `usageScope = NONE` 품목 ~2200 row 가 견적/주문 모달에 절대 노출 안되는지 IT
- `usageScope = BOTH` ProductMaster ~800 SKU 가 양쪽 화면에서 정확히 보이는지 fixture

---

## 4. 품목 동적 스펙 (key-value, 추가/삭제 가능) — 사용자 명시 (2026-05-05)

### 배경
- 사용자 명시: "스펙의 경우 품목마다 종류가 다르므로 동적으로 스펙을 선택 추가 및 삭제 가능하도록 조정"
- 기존 (legacy Apps Script): 마스터 시트의 **정해진 컬럼** (`규격`/`냉방성능`/`전기성능` 등) 을 `getSpecMap_()` / `getSpecDetailMap_()` (partner-order Code.js 1159 / 1211) 로 추출 — 정적 컬럼 방식
- 한계: 카테고리/품목마다 의미 있는 스펙이 다름 (예: 홈멀티 = 냉방성능 / 자재 = 길이·재질 / 부속품 = 전압) → 정적 컬럼은 NULL 다수

### 결정 — ProductSpec entity 신규 (1:N)

**ProductSpec entity**:

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `id` | bigint PK | |
| `productMasterId` | bigint FK | ProductMaster |
| `specKey` | varchar(50) | 스펙 키 (예: `냉방성능`, `전기성능`, `규격`, `재질`, `소비전력`) |
| `specValue` | varchar(255) | 스펙 값 (예: `5.6kW`, `220V/60Hz`, `Φ6.35×Φ12.7`) |
| `unit` | varchar(20) nullable | 단위 (값에 단위 포함되지 않은 경우만 — 예: `kW`, `mm`) |
| `displayOrder` | int | 화면 표시 순서 (사용자가 drag&drop 으로 조정 가능) |
| BaseEntity 7 audit fields | | |

unique constraint: `(productMasterId, specKey)` — 동일 품목에 같은 키 중복 금지

### SpecKeyTemplate entity 신규 (카테고리별 추천 키)

**SpecKeyTemplate entity** — 카테고리별 표준 스펙 키 (사용자가 동적 추가 시 자동 제안):

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `id` | bigint PK | |
| `estimateCategory` | enum `{HOME_MULTI, SINGLE_SET, COMMERCIAL_MULTI, LEGACY, OTHER}` | §3 estimateCategory 와 일치 |
| `specKey` | varchar(50) | 표준 키 |
| `defaultUnit` | varchar(20) nullable | 단위 default |
| `displayOrder` | int | 추천 표시 순서 |
| `isRecommended` | boolean | TRUE = "추천 스펙" 으로 자동 추가 (사용자는 삭제 가능) |

unique constraint: `(estimateCategory, specKey)`

### UI 동작

품목 등록/편집 화면 (product-service admin):

```
┌─ 스펙 (동적) ─────────────────────────────────┐
│ [+ 스펙 추가]                                   │
│                                                │
│ 냉방성능   [5.6 kW        ]  [▲][▼][삭제]    │
│ 전기성능   [220V / 60Hz    ]  [▲][▼][삭제]    │
│ 규격       [Φ6.35×Φ12.7    ]  [▲][▼][삭제]    │
│                                                │
│ + 스펙 추가 → 모달:                            │
│   - 추천 스펙 (카테고리 기반):                  │
│     [냉방성능] [난방성능] [소비전력] [규격] ... │
│   - 직접 입력: [_______________]                │
└────────────────────────────────────────────────┘
```

- 신규 품목 등록 시 카테고리 (estimateCategory) 선택 → SpecKeyTemplate 의 `isRecommended=TRUE` 키들이 자동 추가됨 (값은 빈 칸, 사용자가 채움)
- 사용자는 추천 키를 삭제하거나, 추천 외 키를 자유 입력 가능
- displayOrder 는 drag&drop UI 로 조정 (Frontend `react-beautiful-dnd` 등)

### 마이그 시드 룰 (legacy 시트 → ProductSpec) — **출처: estimate Code.js `getSpecDetailMap_()` (line 1006-1364)**

estimate Code.js 의 `scanHome()` / `scanSingle()` / `scanComm()` 3개 nested 함수가 카테고리별 spec 컬럼을 명시적으로 추출. **표준 specKey 목록은 본 함수의 `idx(H, [...])` 호출 인자 = 시트 헤더 컬럼명** 을 그대로 채택.

**카테고리별 표준 specKey 매트릭스** (estimate Code.js line 1036-1355 + partner-order Code.js `getSpecMap_()` line 1159-1210):

| specKey (표시명) | 홈멀티 (scanHome) | 싱글 세트 (scanSingle) | 상업멀티 (scanComm) | 단위 default | 시트 헤더 원문 (idx 호출 인자) |
|---|---|---|---|---|---|
| 모델명 | ✓ (모델키) | ✓ | ✓ | — | `모델명`/`모델`/`품목코드`/`기종` |
| 배관경 | ✓ | ✓ | ✓ | — | `배관경` |
| 냉매가스 | ✓ | ✓ | ✓ | — | `냉매가스` |
| 차단기 | ✓ | (전원/차단 통합) | ✓ | A | `차단기` (홈/상업) / `전원(mm²)/차단(A)` (싱글, splitSlash) |
| 전원선 | ✓ | (전원/차단 통합) | ✓ | mm² | `전원선` (홈/상업) |
| 제품크기 | ✓ | (실내/실외 분리) | ✓ | mm | `제품크기` |
| 제품중량 | ✓ | (실내/실외 분리) | ✓ | kg | `제품중량` |
| 포장치수 | ✓ | (실내/실외 분리) | ✓ | mm | `포장치수` |
| 포장중량 | ✓ | (실내/실외 분리) | ✓ | kg | `포장중량` |
| 최대장배관 | ✓ | (배관길이/고낙차 통합) | ✓ | m | `최대장배관`/`최대 장배관` |
| 최대고저차 | ✓ | (배관길이/고낙차 통합) | ✓ | m | `최대고저차`/`최대 고저차` |
| 에너지소비효율등급 | ✓ | (등급 통합) | ✓ | 1~5 | `에너지소비효율`/`에너지소비효율등급`/`소비효율등급` |
| 냉방성능(Kcal/h) | ✓ | ✓ | ✓ | Kcal/h | `냉방성능(정격)` (홈, coolCols[0]) / `성능(kcal/h)(최소/정격/최대)` (싱글) / `냉방성능` (상업, 다중 컬럼) |
| 냉방성능(kW) | ✓ | ✓ | ✓ | kW | `냉방성능(정격)` (홈, coolCols[1]) / `성능(kW)(최소/정격/최대)` (싱글) |
| 난방성능(Kcal/h) | | ✓ | ✓ | Kcal/h | `성능(kcal/h)` (싱글, splitBar heat) / `난방성능` (상업) |
| 난방성능(kW) | | ✓ | ✓ | kW | 동상 |
| 소비전력(정격) | ✓ | (cool/heat 분리) | ✓ | kW | `소비전력(정격)` (홈/상업) / `소비전력(kW)(최소/정격/최대)` (싱글, splitBar) |
| 등급(냉방/난방) | | ✓ | | — | `등급(냉방/난방)` |
| 실내기크기 | | ✓ | | mm | `실내기크기(mm)` |
| 실외기크기 | | ✓ | | mm | `실외기크기(mm)` |
| 실내기중량 | | ✓ | | kg | `실내기중량(kg)` |
| 실외기중량 | | ✓ | | kg | `실외기중량(kg)` |
| 실내기포장 | | ✓ | | mm | `실내기포장(mm)` |
| 실외기포장 | | ✓ | | mm | `실외기포장(mm)` |
| 실내기포장중량 | | ✓ | | kg | `실내기포장중량(kg)` |
| 실외기포장중량 | | ✓ | | kg | `실외기포장중량(kg)` |
| 배관길이 | | ✓ | | m | `배관길이/고낙차(m)` (싱글, splitSlash a) |
| 고낙차 | | ✓ | | m | `배관길이/고낙차(m)` (싱글, splitSlash b) |
| 덕트구경 | | | ✓ | mm | `덕트구경`/`덕트 구경` (상업) |

**상업멀티 ERV 레이아웃 분기 (scanComm line 1262-1276)**:
- 일반 layout: 냉방/난방/소비전력 각 단일 컬럼
- ERV3 layout: 냉방Cap/Pow + 난방Cap/Pow 각 3 컬럼 (터보/강/약, sub-row 라벨)
- ERV2 layout: 냉방Cap 2 + Pow 1 + 난방 동상
- 마이그 시: 다중 컬럼은 `joinCols(row, cols).join(' / ')` 그대로 specValue 에 저장 (예: `"3.5 / 5.0 / 6.5"`)

**Bundle (싱글 구성품 / 상업멀티 구성) — partner-order `getSpecMap_()` (line 1159-1210)**:
- 추가 키: `규격` (싱글 구성품 우선) / `비고` (상업 구성 우선) — `findIdx_(H, ['비고','규격'])` 양 시트 모두

**구형 시트 spec**: estimate/partner-order 모두 `getSpecMap_()` 가 `규격`+`비고` 처리 → ProductSpec 1~2 row

**SpecKeyTemplate 시드 (estimateCategory × specKey 매트릭스)**:

| estimateCategory | 추천 specKey 수 (`isRecommended=TRUE`) |
|---|---|
| HOME_MULTI | 14 (모델명 제외) — 배관경, 냉매가스, 차단기, 전원선, 제품크기/중량/포장치수/포장중량, 최대장배관/고저차, 에너지소비효율등급, 냉방성능Kcal/h, 냉방성능kW, 소비전력 |
| SINGLE_SET | 21 — 등급(냉방/난방), 배관경, 냉매가스, 냉방성능Kcal/h+kW, 난방성능Kcal/h+kW, 소비전력(cool/heat), 전원(combined), 차단기, 실내/실외기 크기/중량/포장/포장중량, 배관길이, 고낙차 |
| COMMERCIAL_MULTI | 16 — HOME_MULTI 14개 + 난방성능(Kcal/h)+(kW) + 덕트구경 |
| LEGACY (구형) | 2 — 규격, 비고 |
| OTHER | 0 (사용자 자유 입력) |

총 SpecKeyTemplate seed row = 14 + 21 + 16 + 2 = **53 row**

**Phase 6 시드 스크립트 의무**:
1. 마스터 시트 (`홈멀티`/`싱글 세트`/`상업멀티`/`구형` + `*_단가인상`) 각 row 의 spec 컬럼 추출 시 estimate Code.js `scanHome/scanSingle/scanComm` 의 `idx(H, [...])` 호출 인자 매핑 그대로 사용
2. 싱글 세트 의 splitBar/splitSlash 룰은 시드 시점에 펼쳐서 별도 row 로 (예: `소비전력(kW)(최소/정격/최대)` 의 `"3 | 4"` → ProductSpec 2 row: `소비전력(냉방)`/`소비전력(난방)`)
3. 상업멀티 ERV 분기: `joinCols(...).join(' / ')` 결과를 단일 specValue 로 저장 + unit 에 `최소/정격/최대` 표기
4. NULL spec 컬럼은 ProductSpec row 생성 안함

### Phase 4 Migration Plan 의무
- ProductSpec + SpecKeyTemplate Flyway 마이그 SQL
- 마스터 시트 spec 컬럼 → ProductSpec row 변환 스크립트 명세
- product-service API `GET /products/{code}/specs` + `POST /products/{code}/specs` + `PATCH /products/{code}/specs/{id}` + `DELETE /products/{code}/specs/{id}` + `PATCH /products/{code}/specs/reorder`
- 견적/주문 화면 품목 라인 클릭 시 spec 표시 (카드 형식)
- 인쇄 양식 (종합견적서) 의 스펙 영역 — ProductSpec row 들을 displayOrder 순으로 출력

### Phase 5 Frontend 의무 (DESIGN team)
- 품목 등록/편집 화면 동적 스펙 UI (drag&drop + 추천/자유)
- 견적 라인 카드 spec 출력 (key: value 표 형식)
- `feedback_print_design_iteration.md` 가드 적용 (인쇄 spec 영역 3-5 iteration)

### Phase 6 QA 의무
- 시드 후 ProductMaster 1건당 ProductSpec row 수 분포 검증 (legacy 마스터 시트 spec 컬럼 NULL 비율 ↔ ProductSpec row 수 매트릭스)
- 동적 추가/삭제 IT (사용자 추가 spec 이 견적 라인 carousel 에 즉시 반영)
- 추천 spec 자동 추가 IT (카테고리 변경 시 SpecKeyTemplate 룰 적용)

---

## 5. 회고 가드 적용
- `feedback_pm_integration_build_check.md` Layer 4 (도메인 메서드 의미 정렬) — VariableDiscountDetector 룰은 명세 표 의무
- `feedback_function_documentation.md` — 한국어 Javadoc + 룰 출처 (Apps Script 함수명) 명시
- 무손실 이식 의무 — 변동DC 룰 누락 시 견적 산정 오차 발생 → QA 가 Apps Script 출력값 ↔ 신규 service 출력값 1:1 비교 (sample 30+ 품목)

---

## 4. 추후 확정 시점
- Phase 1 분석 완료 직후 (변동DC 룰 + 세트 패턴 inventory 확보 시)
- 사용자에게 세트 옵션 A/B/C 추천 후 확정 → Phase 4 Plan 에 반영
