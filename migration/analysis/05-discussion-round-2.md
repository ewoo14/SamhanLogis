# Phase 5 — Discussion Round 2 (데이터 / 시드 perspective)

> **참여 perspective**: 분석 agent POV (이번 라운드 driver) + Plan agent POV + Reviewer agent POV
> **입력**: `04-migration-plan.md` §11 #4/#5/#6/#8/#9/#11/#12 + Phase 3 §9 #1/#7/#9/#13/#14 + Round 1 §7.1 합의 표 (D2/D5 연계) + DECISIONS Phase 3 G1~G8 + DOMAIN-EXTENSIONS §1 (변동DC 컬럼)
> **처리 주제**: D7~D13 (시드 + 데이터 마이그 + Notion DB + 인쇄 템플릿)
> **단일 산출 파일** — 다른 파일 수정/생성 금지
> 작성일: 2026-05-05 / 한국어 / 추측 금지 / 출처 (파일:라인) 명시 의무

---

## §0 라운드 메타

| 항목 | 값 |
|---|---|
| 라운드 번호 | 2 / 3 |
| 주 perspective | 분석 agent (driver) — Phase 1+3 분석문서 출처로 Plan 시드/데이터 처리 누락을 catch |
| 보조 perspective | Plan agent (Plan 결정 사유 인용) + Reviewer (cross-review 모순/누락 catch) |
| 처리 항목 | D7~D13 (7건) |
| 이전 라운드 인용 | Round 1 §7.1 (D2 PW 정책 → D9 Slip MANUAL 운영 전환 동기화 / D5 listener 책임 → D11 TOKEN_004 분리 연계) |
| 후속 입력 | 라운드 3 (D14~D20 UX/우선순위 perspective + 종합 매트릭스) |
| 회고 가드 | `feedback_function_documentation.md` (한국어 Javadoc + dev-reports) / `feedback_pm_integration_build_check.md` Layer 4/Layer 5 / `feedback_print_design_iteration.md` (인쇄 3-5 iteration) |

---

## §1. D7 — MaterialPrice singletons table vs ProductMaster sub-type=MATERIAL

### 분석 agent POV (모호 / 근거)

- `03-sheet-schema.md:282-309` (§2.12 싱글 자재가격): 28 row 자재 단가 마스터. D2 (유선리모컨), D4 (자재 합계 master cell), D7/D8 (자재 미포함/포함). C 컬럼 (`옵션`), D 컬럼 (`계산값`) 별도 의미 — 단순 자재 SKU 가 아닌 **옵션 + master cell + 계산값** 복합 구조.
- `03-sheet-schema.md:286-294`: D5/D6 row 가 `=IF($D$4>400000, $B$7, 0)` 수식 보유 — 자재 합계 (D4) 가 400,000 초과 시 계산 분기. 즉 시트 자체에 **자기참조 비즈니스 룰** 내장.
- `01-script-analysis-estimate.md` §6 / `01-script-analysis-partner-order.md` §6: 싱글 세트의 H 컬럼 수식이 `'싱글 자재가격'!$D$4` 등 직접 참조 — 자재가격 시트는 단순 마스터가 아닌 **단가 산정 로직의 핵심 master cell** 보유.

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:220-230` (§2.1.4 MaterialPrice entity): 단일 entity (28 row 시드) + `materialKey enum {D2, D3, D4, D5, D6, D7, D8, ...}` + `computedFormula text nullable` 컬럼 ("D4 = master cell 의미 보존").
- `04-migration-plan.md:1184` (§11 #4): "MaterialPrice singletons vs entity — (a) 28 row entity (b) 환경설정 singleton — 자재 단가 변경 빈도 spot-check 후 결정".
- `04-migration-plan.md:679` (§3.1 #9 시드 매트릭스): "MaterialPrice (ProductMaster `usageScope=NONE`)" — Phase 4.5 보강 시 ProductMaster 와 별도 entity 유지. usageScope=NONE 으로 견적/주문 모달 미노출.
- 사유 (Plan): 28 row + 자기참조 수식 + master cell 의미 보존 → 단순 KV singleton 부족. entity 채택.

### Reviewer POV (cross-review 발견)

- `02-cross-review.md:170-205` (§5.3 product-service 8 컬럼) 에 MaterialPrice 단독 entity 명세 없음 — Plan §2.1.4 가 신규 보강. 일관성 OK.
- 누락 catch 1: D5/D6 의 `=IF($D$4>400000, $B$7, 0)` 수식 → Java 포팅 시 `MaterialPriceCalculator` service 메서드 의무 (`feedback_pm_integration_build_check.md` Layer 4 의미 정렬). Plan §2.1.4 의 `computedFormula text` 만으로는 비즈니스 룰 실행 불가 — 별도 service 명세 누락.
- 누락 catch 2: ProductMaster sub-type=MATERIAL 옵션이 검토조차 안 됨 → Plan §2.1.1 (10 컬럼) 의 `category enum {..., MATERIAL}` 이 이미 있음. 즉 ProductMaster 에 흡수 가능했으나 Plan 은 별도 entity 채택. 사유 명시 필요.

### 합의 (또는 사용자 확정 필요)

| 옵션 | 장점 | 단점 |
|---|---|---|
| (a) 별도 MaterialPrice entity (Plan 결정) | master cell 의미 보존 / 자기참조 수식 보존 / `materialKey` enum 비즈니스 룰 직결 | ProductMaster 와 별도 schema 유지 부담 |
| (b) ProductMaster sub-type=MATERIAL 흡수 | schema 일원화 / Bundle component 와 동일 추적 | 자기참조 수식 표현 불가 / `materialKey` enum 보존 어려움 |
| (c) (a) + 별도 `MaterialPriceCalculator` service (Reviewer 추가) | (a) 장점 + 비즈니스 룰 실행 가능 | service 추가 부담 |

**권장 (분석 + Plan + Reviewer 합의)**: **옵션 (c) — 별도 MaterialPrice entity (Plan §2.1.4 그대로) + `MaterialPriceCalculator @Service` 신규 (D5/D6 수식 Java 포팅) + `computedFormula` 컬럼은 reference 만 (실 계산은 service 가 수행)**. ProductMaster `category=MATERIAL` 별도 row 시드 안 함 (schema 분리 유지).

→ **사용자 확정 불필요** (Plan 결정 + Reviewer service 보강만 추가). Phase 6 M1 디스패치 시 BACKEND 가 MaterialPriceCalculator 신규 의무.

---

## §2. D8 — BranchPipeLookup 99 row A열 코드 의미 spot-check

### 분석 agent POV (모호 / 근거)

- `03-sheet-schema.md:337-356` (§2.15 분기계산): 99 row, lastCol=105 (이중 컬럼: 실외기 1~50 = 50 × 2). A 컬럼 sample: `1509, 2512, 2812, 2815, 3419, 4119, ...`.
- `03-sheet-schema.md:343-352`: 컬럼 명세 — A=분기관 코드 (lookup key), B=합계 수량, C/D=수동 추가, E=선택 실내기 표시, F~DD=실외기 1~50 (각 2 컬럼).
- `03-sheet-schema.md:354`: "분석문서 직접 read 0건 (분석문서). index.html 의 `분기계산` 페이지 (estimate.md 라인 1908, partner-order index.html 라인 922) 는 클라이언트 자체 계산. **본 시트는 lookup table 추정**".
- 코드 패턴 추정: `1509` → 9/15 mm 분기관 (액관 9mm × 가스관 15mm) 또는 SKU 코드. 현 분석으로는 확정 불가.

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:233-241` (§2.1.5 BranchPipeLookup): `branchCode varchar(8)` + `description varchar(128) nullable` + `summaryQty int nullable`. **주석**: "분기관 사양 (사용자 spot-check 후 채움 — Phase 5 Discussion §11 #3)".
- `decisions/DECISIONS.md:39` (Phase 3 G1): "분기계산 시트 (~99 row, A열 코드 lookup) → 시드 — `BranchPipeLookup` entity (product-service sub-domain). A열 코드 의미는 Phase 6 시드 스크립트 작성 시 추가 spot-check".
- `04-migration-plan.md:1185` (§11 #5): "BranchPipeLookup A열 코드 의미 spot-check — A열 1509/2512/2812 등 코드가 분기관 SKU 인지 vs 단순 인쇄 라벨인지 사용자 확정 (G1 추천대로 시드 결정 후 재검증)".
- 사유 (Plan): G1 으로 시드 결정 됐으나 description/summaryQty 정확한 의미는 미확정 — Phase 6 시드 dry-run 시 사용자 spot-check 의무.

### Reviewer POV (cross-review 발견)

- `02-cross-review.md:74-77` (§2.1): "분기계산 — 두 분석문서 모두 read 0건 — Phase 3 (Sheet schema) 에서 용도/스키마 별도 분석 필수" — Phase 3 가 lookup table 추정으로 spot-check 의무 등재.
- 누락 catch 1: 105 컬럼 중 F~DD (실외기 1~50, 각 2 컬럼 = 100 컬럼) 의 데이터가 **runtime 채움** 인지 **시드 데이터** 인지 불명. workbook.json sample 추가 spot-check 필요.
- 누락 catch 2: index.html 의 분기계산 페이지 클라이언트 계산 알고리즘이 본 lookup table 을 어떻게 사용하는지 정확한 매핑 누락 — partner-order index.html line 922 / estimate index.html line 1908 의 함수 spot-check 의무.
- 누락 catch 3: 실내기 capacity (kW or HP) → A열 코드 매핑 룰 미명시 — Phase 6 BE 시드 시 description 채움 정책 모호.

### 합의 (또는 사용자 확정 필요)

| 결정 | 합의안 | 사유 |
|---|---|---|
| **D8-1 시드 정책** | **G1 그대로 시드 (99 row BranchPipeLookup entity)** | DECISIONS Phase 3 G1 + Plan §2.1.5 + 분석 추정 일치 |
| **D8-2 description 채움** | **Phase 6 시드 dry-run 시 사용자 spot-check** — A열 코드 → 분기관 사양 매핑 표 사용자 제공 의무 | Plan §11 #5 명시 |
| **D8-3 105 컬럼 처리** | **F~DD 실외기 1~50 컬럼 = runtime 채움 추정 → 시드 안 함** | workbook.json 추가 spot-check 후 확정 (Phase 6 시드 스크립트 dry-run 단계) |
| **사용자 확정 필요 (G13 신규 게이트)** | A열 코드 의미 (분기관 SKU vs 인쇄 라벨) 1차 답변 + Phase 6 dry-run 시 99 row 매핑 표 제공 | Phase 6 진입 전 의무 |

→ **사용자 확정 필요 (G13)** — Phase 6 M1 시드 dry-run 직전.

---

## §3. D9 — Slip sourceType MANUAL 시드 (legacy 운영 데이터 historical Slip 재현 정책)

### 분석 agent POV (모호 / 근거)

- `01-script-analysis-estimate.md` §3 (TOKEN_004 SHIPPING) + `01-script-analysis-long-pending.md` §3: Notion DB SHIPPING_004 가 estimate `saveOrderToNotion` 결과 sink + long-pending `getActiveBizNosFromShipping_` source 양쪽 사용.
- 즉 SHIPPING_004 = **legacy 출고 이력 운영 DB**. 마이그 시점에 historical Slip 데이터 재현 정책 결정 필요.
- `04-migration-plan.md:36-37` (§1.3): "Notion API (9 DB / 9 토큰) — SamhanLogis PostgreSQL 5 entity 흡수 (Phase 2 결정, 마이그 1회 export 후 폐기)".

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:633-639` (§2.5.1 Slip entity 확장): `source_type VARCHAR(16) NOT NULL DEFAULT 'MANUAL'` + CHECK constraint `('MANUAL','ESTIMATE','PARTNER_ORDER')`.
- `04-migration-plan.md:644-647` (§2.5.2 자동 생성 흐름): MANUAL = 사용자 직접 입력, ESTIMATE/PARTNER_ORDER = Event listener 자동 생성.
- `04-migration-plan.md:1189` (§11 #9): "slip-service Slip.sourceType MANUAL 호환성 — 기존 직원 작성 Slip 모두 MANUAL 시드 OK? 아니면 NULL 보존?".
- `04-migration-plan.md:775` (§4.1 토큰 매핑): "TOKEN_SHIPPING_004 → slip-service `Slip` + delivery-service `Delivery` (이중 역할 분리)" — D11 과 직접 연계.
- 사유 (Plan): 신규 컬럼 default MANUAL 안전. 기존 직원 작성 row → MANUAL 시드 자연스러움. 단 Notion SHIPPING_004 의 historical row 마이그 정책은 미결정.

### Reviewer POV (cross-review 발견)

- `02-cross-review.md:116` (§3.1 TOKEN_004): "**명명 불일치** — estimate 는 SHIPPING DB 를 '주문 저장 sink' 로 사용, partner-order/long-pending 는 '출고 활동 source' 로 사용. 동일 DB 가 두 가지 역할 — Phase 4 에서 도메인 분리 필요".
- `02-cross-review.md:127` (§3.2 #2): "TOKEN_004 의 이중 역할 — DB ID 일치 확인. 동일 DB 라면 page schema 하나로 양쪽 역할 충족 가능한지 Phase 3 schema 분석 필수".
- 누락 catch: SHIPPING_004 의 historical row 가 Slip 인지 Delivery 인지 분리 정책이 D11 과 직결 — D9 시드 결정은 D11 결정 후 확정 가능. 라운드 2 안에서 D11 과 동시 처리.
- Round 1 §7.1 D2 (PW 정책) 와 운영 전환 시점 동기화 의무 — historical Slip 시드 시점 = 운영 전환 freeze 24h 안에 완료 필요.

### 합의 (또는 사용자 확정 필요)

| 결정 | 합의안 | 사유 |
|---|---|---|
| **D9-1 신규 row default** | **`source_type DEFAULT 'MANUAL'`** (Plan §2.5.1 그대로) | 신규 직원 작성 Slip 안전 |
| **D9-2 historical row 마이그** | **D11 결정 후 확정** — TOKEN_004 의 row 가 Slip 인지 Delivery 인지 분리 후 Slip row 만 `sourceType=MANUAL` 시드 | D11 과 직결 |
| **D9-3 운영 전환 시점** | **Round 1 D2 PW lazy upgrade 와 동시 freeze (운영 전환 24h 전 공지)** + Plan §4.2 운영 전환 절차 적용 | 시점 동기화 의무 |
| **사용자 확정 필요 (G14 신규 게이트)** | historical Slip 시드 row 수 + sample 5 비교 결과 사용자 검토 (Phase 6 M4 시드 dry-run 직전) | M4 진입 전 |

→ **사용자 확정 필요 (G14)** — D11 결정 후 Phase 6 M4 디스패치 직전.

---

## §4. D10 — partner-order Draft 자동 expiry 30일 vs 무한 보존 (estimate Snapshot 과 다름)

### 분석 agent POV (모호 / 근거)

- `01-script-analysis-partner-order.md` §7.x (saveOrderSnapshot): partner-order Apps Script 의 임시저장 = Notion SNAPSHOT_009 → 명시적 만료 정책 코드 내 0건 발견. 무한 보존 추정.
- `01-script-analysis-estimate.md` §7.x (saveQuoteSnapshot): estimate 견적 스냅샷 = Notion QUOTE_006 → 동일 명시적 만료 0건. 무한 보존 추정.
- 두 도메인 모두 legacy 는 무한 보존이나 SamhanLogis 마이그 시 운영 비용 / DB 부피 증가 위험.

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:561-571` (§2.4.3 PartnerOrderDraft): `expiresAt timestamp` 컬럼 + 주석 "**자동 폐기 30일**".
- `04-migration-plan.md:478-489` (§2.3.3 EstimateSnapshot): expiresAt 컬럼 명시 X — **무한 보존**. 두 도메인 정책 비대칭.
- `04-migration-plan.md:1188` (§11 #8): "PartnerOrderDraft 자동 폐기 30일 정책 — 30일 default OK? 거래처별 override 가능?".
- 사유 (Plan): 거래처 Draft 는 단순 임시저장 (재진입 시 작성 중 데이터 복구) — 30일 충분. estimate Snapshot 은 직원 작성 견적 스냅샷 (이력/재현 목적) — 무한 보존 정당화.

### Reviewer POV (cross-review 발견)

- `02-cross-review.md` 의 §3.1 (TOKEN_006 vs TOKEN_009): QUOTE_006 (견적 스냅샷) vs SNAPSHOT_009 (주문 임시저장) — 의미 분리 명확. Plan 정책 비대칭 정당화.
- 누락 catch 1: partner-order Draft 30일 expiry 동작 정의 누락 — soft delete (BaseEntity `deleted_at`) vs hard delete? Plan §2.4.3 미명시.
- 누락 catch 2: 거래처별 override 정책 검토 안 됨. PartnerMaster 에 `draftRetentionDays int nullable` 컬럼 추가 옵션 vs 시스템 default 30일 고정 — 사용자 결정 필요.
- 누락 catch 3: estimate Snapshot 무한 보존 정당화는 OK 하나, 거래처 inactive (LONG_PENDING_NO_ORDER) 상태일 때 Draft 정리 정책 누락 — Round 1 D6 long-pending 와 연계 검토.

### 합의 (또는 사용자 확정 필요)

| 결정 | 합의안 | 사유 |
|---|---|---|
| **D10-1 PartnerOrderDraft 30일 expiry** | **soft delete 30일 default + Spring `@Scheduled` cron 일일 정리** | Plan §2.4.3 그대로 + Reviewer soft delete 보강 (BaseEntity 일관성) |
| **D10-2 EstimateSnapshot 무한 보존** | **Plan §2.3.3 그대로 (만료 없음)** | 견적 이력 재현 목적 정당 |
| **D10-3 거래처별 override** | **시스템 default 30일 고정 (PartnerMaster 컬럼 추가 X)** | 운영 단순성 / 거래처 부담 X |
| **D10-4 long-pending 거래처 Draft** | **LONG_PENDING_NO_ORDER 상태 거래처는 Draft 즉시 정리 (cron 추가 룰)** — Round 1 D6 연계 | 데이터 정합성 + DB 부피 |

→ **사용자 확정 불필요** (Plan 결정 + Reviewer 보강만 추가). Phase 6 M4 BACKEND 디스패치 시 `PartnerOrderDraftCleanupScheduler` 신규 의무.

---

## §5. D11 — TOKEN_004 (SHIPPING) 이중 역할 분리 (slip-service Slip vs delivery-service Delivery)

### 분석 agent POV (모호 / 근거)

- `02-cross-review.md:113-127` (§3.1 + §3.2 #2): TOKEN_004 동일 Notion DB ID (`2f8a1006d658803face6fdfe2b175780`) 가 estimate `saveOrderToNotion` (sink) + long-pending `getActiveBizNosFromShipping_` (source) 양쪽 사용.
- `01-script-analysis-estimate.md` §3 / `01-script-analysis-long-pending.md` §3: 동일 DB ID 사용 확인. 즉 동일 DB row 가 양쪽 의미.
- `01-script-analysis-long-pending.md` §6: `getActiveBizNosFromShipping_` 가 SHIPPING DB 의 row 에서 `사업자번호` + `created_time` 추출 → 활동성 평가. estimate 의 `saveOrderToNotion` 은 새 row 추가 (전표 저장).

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:775` (§4.1): "TOKEN_SHIPPING_004 → slip-service `Slip` + delivery-service `Delivery` (이중 역할 분리)".
- `04-migration-plan.md:1191` (§11 #11): "TOKEN_004 (SHIPPING) 이중 역할 분리 정책 — estimate sink (saveOrderToNotion) + long-pending source (활동성). slip-service `Slip` 와 delivery-service `Delivery` 가 동일 sink 인지 분리인지 — Phase 5 round 2 확정".
- 사유 (Plan): MSA 도메인 분리 — 출고전표 (회계 / 단가 / 라인) = slip-service, 배송/감리 (배송지 / 인수자 / 배송 상태) = delivery-service. 단일 Notion DB → 2 entity 분할.

### Reviewer POV (cross-review 발견)

- `02-cross-review.md:127` (§3.2 #2): "동일 DB 라면 page schema 하나로 양쪽 역할 충족 가능한지 Phase 3 schema 분석 필수" — Phase 3 schema 분석 결과 명시적 답변 누락. Notion API 1회 호출 spot-check 의무 (cross-review §9.2 #5).
- `02-cross-review.md:243` (§6.3): "estimate `/sale` 은 판매전표 (즉시 발생), partner-order `/saleorder` 는 판매주문 (사전 단계)" — 양 endpoint 분리. SHIPPING DB 는 estimate `/sale` 결과 sink → Slip 도메인.
- 누락 catch 1: SHIPPING DB row schema (Notion property 목록) 확인 안 됨 → Slip vs Delivery 컬럼 분리 매핑 표 누락. Phase 6 M4 BACKEND 디스패치 차단.
- 누락 catch 2: long-pending 의 `getActiveBizNosFromShipping_` 이 SHIPPING DB 의 어느 컬럼을 활동성 source 로 보는지 (예: `created_time` vs `updated_time`) 명시 안 됨 → LongPendingScheduler `collectActiveBizNos` 구현 차단.
- Round 1 D5 (listener 책임) 와 연계: Slip listener 가 Delivery 도 자동 생성하는지, 아니면 별도 사용자 입력인지 결정 의무.

### 합의 (또는 사용자 확정 필요)

| 결정 | 합의안 | 사유 |
|---|---|---|
| **D11-1 도메인 분리** | **slip-service `Slip` (회계/단가/라인) + delivery-service `Delivery` (배송지/감리/인수자)** — Plan §4.1 그대로 | MSA 도메인 분리 정당 |
| **D11-2 SHIPPING DB row 분할 매트릭스** | **Notion property 목록 spot-check 후 컬럼 매핑 표 작성** — Phase 6 M4 BACKEND 디스패치 사전 의무 | cross-review §9.2 #5 미해결 |
| **D11-3 long-pending source 컬럼** | **`created_time` 가 활동성 source (Notion default property)** — partner-order Code.js spot-check 결과 (Phase 6 dry-run 시 재검증) | LongPendingScheduler 구현 의무 |
| **D11-4 자동 Delivery 생성 정책** | **slip-service Slip 생성 시 delivery-service `Delivery` 자동 생성 X** (사용자 직접 입력 단계 분리) | Round 1 D5 listener 책임 분리 일치 |
| **사용자 확정 필요 (G15 신규 게이트)** | SHIPPING DB property 목록 spot-check 결과 + Slip/Delivery 컬럼 매핑 표 사용자 검토 | Phase 6 M4 진입 전 의무 |

→ **사용자 확정 필요 (G15)** — Phase 6 M4 BACKEND 디스패치 사전.

---

## §6. D12 — 고정DC 컬럼 (홈/상업 L 컬럼) 활용 정책 (시드 NULL vs 활성 보존)

### 분석 agent POV (모호 / 근거)

- `03-sheet-schema.md:120-141` (§2.4 홈멀티 col L): "고정DC | string/decimal | T | `fixedDiscountRate` (cross-review §4.2) | 대부분 '-'".
- `03-sheet-schema.md:255-275` (§2.10 상업멀티 col L): 동일.
- `03-sheet-schema.md:319-330` (§2.13 상업멀티 구성 col J): "고정DC | string ('-' 대부분) | `fixedDiscountRate`".
- 시트 마스터 ~3000 SKU 중 고정DC 컬럼 채움 row 수 정확히 미측정 (대부분 "-" 라는 정성적 표기만).

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:71` (§2.1.1 ProductMaster): `fixedDiscountRate numeric(5,4) nullable` + 주석 "룰 3 (구형 50%) + 행별 고정DC 컬럼 (홈/상업 L 컬럼)".
- `04-migration-plan.md:1192` (§11 #12): "고정DC 컬럼 (홈/상업 L 컬럼) 활용 빈도 — 시트 대부분 '-' — 시드 시 NULL 처리 OK? 신규 입력 시 UI 노출 정책?".
- 사유 (Plan): 채움 row 가 적어도 보존 정당. 신규 등록 시 UI 노출 (admin form) 정책은 미결정.

### Reviewer POV (cross-review 발견)

- `02-cross-review.md:140-153` (§4.1, §4.2): cross-review 가 "고정DC 컬럼 (행별 override)" 를 partner-order 분석문서가 명시적 보강 → 4-컬럼 안 채택. Plan §2.1.1 일치.
- 누락 catch 1: 채움 row 정확 수 미측정 → Phase 6 시드 dry-run 시 카운트 의무. 채움 row 가 0~10 수준이면 deprecated 검토 가능.
- 누락 catch 2: 시트 값 형식 불일치 — 채움 row 가 percent (`5%`) 인지 decimal (`0.05`) 인지 string 인지 미명시 → 시드 변환 룰 누락.
- 누락 catch 3: admin UI 노출 정책 미결정 → Phase 6 FRONTEND 디스패치 차단.

### 합의 (또는 사용자 확정 필요)

| 결정 | 합의안 | 사유 |
|---|---|---|
| **D12-1 시드 정책** | **시트 값 → `fixedDiscountRate numeric(5,4)` 변환 (채움 row 만, 나머지 NULL)** | Plan §2.1.1 그대로 |
| **D12-2 변환 룰** | **시트 값 percent (`5%`) → 0.05 / decimal (`0.05`) → 0.05 / `-` → NULL** + 시드 dry-run 시 채움 row 카운트 보고 | Reviewer 형식 불일치 catch |
| **D12-3 admin UI 노출** | **admin form 에 노출 (optional 입력) + 신규 등록 시 default NULL** | UI 단순성 |
| **D12-4 비즈니스 룰 우선순위** | `fixedDiscountRate` (행별) > 룰 3 (`legacyDiscountFlag` 50%) > 룰 1 (`hasVariableDiscount` 옵션) — 하위 룰 무효화 | 비즈니스 의미: 명시적 fixed 가 룰 1/3 override |

→ **사용자 확정 불필요** (Plan + Reviewer 합의). Phase 6 M1 시드 dry-run 시 카운트 보고 의무.

---

## §7. D13 — 인쇄 템플릿 6개 통합 vs 분리 (단일 PrintTemplate vs entity 별 분리)

### 분석 agent POV (모호 / 근거)

- `03-sheet-schema.md:421-477` (§2.19/§2.21~§2.25): `*_템플릿` 6개 시트 모두 마스터 시트의 축약 사본 (col 일부 제거). 데이터 동기화 방식 (수동/ARRAYFORMULA) 미명시.
- `03-sheet-schema.md:736` (§7 표): 12 고아 탭 중 인쇄 템플릿 6 + 인쇄 양식 5 (장비스펙/부속품스펙/종합견적서/전표생성폼/전표업로드목록) = **11 인쇄 관련 시트**.
- `04-migration-plan.md:818-829` (§5 Frontend 이전): 11 시트 → 11 Frontend 컴포넌트 1:1 매핑 (`HomeMultiPrintTemplate.tsx` / `SingleSetPrintTemplate.tsx` / ...).

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:1186` (§11 #6): "인쇄 템플릿 11건 통합 가능성 — 11 템플릿을 단일 `PrintTemplateRenderer` 컴포넌트 + 카테고리별 layout 으로 통합 vs 개별 컴포넌트 — Designer + Frontend 협의".
- `04-migration-plan.md:817` (§5 표): 11 컴포넌트 별도 명시 (현 default 결정).
- 사유 (Plan): default = 분리 (11 컴포넌트). 통합 검토는 Discussion 입력.

### Reviewer POV (cross-review 발견)

- `feedback_print_design_iteration.md` (회고 가드): "인쇄 양식은 단번 완성 가정 금지, 사용자 이미지 → mock → Edge 캡처 → CSS-only 미세 조정 3~5회 iteration (PR #21 회고)" — 11 컴포넌트 × 3-5 iteration = 33~55 PR 부담. 통합 시 단일 컴포넌트 × N layout = 운영 효율.
- 누락 catch 1: 6 템플릿 (홈멀티/싱글 세트/상업멀티/구형 + 분기계산 + 전표생성폼) 의 layout 차이 정량화 안 됨 — 통합 가능성 판단 근거 부족.
- 누락 catch 2: i18n / 다크모드 / 인쇄 vs 화면 출력 분기 미설계 → 통합 시 분기 복잡도 증가 위험.
- 누락 catch 3: 11 시트 중 5 (장비스펙/부속품스펙/종합견적서/전표생성폼/전표업로드목록) = 인쇄 양식 (스펙 모달 제외), 6 = 마스터 사본 인쇄 템플릿 — 두 종류 분리 필요.

### 합의 (또는 사용자 확정 필요)

| 옵션 | 장점 | 단점 |
|---|---|---|
| (a) 11 컴포넌트 분리 (Plan default) | 각 layout 독립 / 단순 | 33~55 PR 부담 / 코드 중복 |
| (b) 단일 `PrintTemplateRenderer` + `templateType` enum 11개 분기 | DRY / iteration 단축 | 분기 복잡도 / 1 PR 회귀 위험 |
| (c) **2-tier 통합** (Reviewer 추천): `EstimatePrintRenderer` (종합견적서 + 마스터 사본 6 템플릿) + `SlipPrintRenderer` (전표생성폼 + 전표업로드목록) + `SpecModal` (장비스펙 + 부속품스펙 i18n) | 도메인별 응집 + iteration 부담 분산 | 3-tier 분류 의무 |

**권장 (분석 + Plan + Reviewer 합의)**: **옵션 (c) 2-tier 통합** — 11 → 3 컴포넌트.
- `EstimatePrintRenderer.tsx` (종합견적서 + 6 마스터 사본 템플릿 = 7 layout, `category` enum 분기) — estimate-service Frontend
- `SlipPrintRenderer.tsx` (전표생성폼 + 전표업로드목록 = 2 layout) — slip-service Frontend
- `SpecModal.tsx` (장비스펙 + 부속품스펙 = i18n 키만, 기존 마스터 데이터 재사용) — estimate / partner-order Frontend

→ **사용자 확정 필요 (G16 신규 게이트)** — 옵션 (a) / (b) / (c) 중 선택. DESIGN team 디스패치 시 mockup 단계 의사결정.

---

## §8 라운드 2 종합 — 합의 표 + 사용자 확정 필요 항목 + 다음 라운드 입력

### §8.1 라운드 2 합의 결정 표

| # | 주제 | 합의 결정 | 출처 / 근거 | 라운드 3 연계 |
|---|---|---|---|---|
| D7 | MaterialPrice singletons vs entity | **별도 entity (Plan §2.1.4) + `MaterialPriceCalculator @Service` 신규 (Reviewer 보강)** | Plan §2.1.4 + cross-review §5.3 + Reviewer service 보강 | M1 BACKEND 디스패치 의무 |
| D8 | BranchPipeLookup A열 코드 의미 | **G1 시드 + Phase 6 dry-run 시 사용자 spot-check** → 사용자 확정 G13 | DECISIONS Phase 3 G1 + Plan §11 #5 | M1 시드 dry-run 차단 |
| D9 | Slip MANUAL 시드 historical | **신규 default MANUAL + historical row 마이그는 D11 결정 후 + 운영 전환 시점 Round 1 D2 와 동기화** → 사용자 확정 G14 | Plan §2.5.1/§11 #9 + Round 1 D2 연계 | M4 진입 전 |
| D10 | PartnerOrderDraft 30일 expiry | **soft delete 30일 default + cron + LONG_PENDING 거래처 Draft 즉시 정리 (Round 1 D6 연계)** | Plan §2.4.3 + Reviewer 보강 | M4 BACKEND 의무 |
| D11 | TOKEN_004 SHIPPING 분리 | **slip Slip + delivery Delivery 분리 + Notion property spot-check + 자동 Delivery 생성 X (Round 1 D5 책임 분리 일치)** → 사용자 확정 G15 | Plan §4.1/§11 #11 + cross-review §3.2 #2 | M4 진입 전 |
| D12 | 고정DC 컬럼 활용 | **시드 변환 룰 (% / decimal / `-` → NULL) + admin UI 노출 + 비즈니스 룰 우선순위 (fixed > legacy > variable)** | Plan §2.1.1/§11 #12 + Reviewer 변환 룰 보강 | M1 시드 dry-run 카운트 의무 |
| D13 | 인쇄 템플릿 11 통합 | **2-tier 통합 (Estimate + Slip + SpecModal = 3 컴포넌트)** → 사용자 확정 G16 | Plan §5/§11 #6 + 회고 가드 + Reviewer 추천 | M3/M4 DESIGN 디스패치 mockup |

### §8.2 사용자 확정 필요 신규 게이트 표 (라운드 2 산출)

| 게이트 | 차단 항목 | 옵션 | 권장 | 차단 시점 |
|---|---|---|---|---|
| **G13** | D8 BranchPipeLookup A열 코드 의미 | (a) 분기관 SKU / (b) 인쇄 라벨 / (c) lookup key 만 | (a) — Phase 6 dry-run 시 99 row 매핑 표 사용자 제공 | Phase 6 M1 시드 dry-run 직전 |
| **G14** | D9 historical Slip 시드 row 검토 | (a) sample 5 비교 후 마이그 / (b) row 전수 검토 / (c) 마이그 안 함 (cutover 시점부터만) | (a) sample 5 비교 | Phase 6 M4 시드 dry-run 직전 |
| **G15** | D11 SHIPPING DB Slip/Delivery 컬럼 매핑 | Notion property 목록 spot-check 후 매핑 표 사용자 검토 | spot-check 결과 사용자 검토 | Phase 6 M4 BACKEND 디스패치 직전 |
| **G16** | D13 인쇄 템플릿 통합 옵션 | (a) 11 분리 / (b) 단일 / (c) 2-tier 3 컴포넌트 | (c) — 2-tier 통합 | Phase 6 M3/M4 DESIGN mockup 단계 |

### §8.3 Round 1 합의와의 연계 검증 (Reviewer 의무)

| Round 1 합의 | Round 2 영향 | 정합성 |
|---|---|---|
| Round 1 D2 (PW lazy upgrade) | Round 2 D9 historical Slip 시드 시점 = 운영 전환 24h freeze 와 동기화 | ✅ 일관 |
| Round 1 D5 (Slip listener 책임 — partner-order = EXPAND/KEEP, slip = 단순 저장) | Round 2 D11 (자동 Delivery 생성 X) — listener 책임 단순화 일관 | ✅ 일관 |
| Round 1 D6 (long-pending sub-domain) | Round 2 D10 (LONG_PENDING 거래처 Draft 즉시 정리) — sub-domain 책임 일관 | ✅ 일관 |
| Round 1 G9~G12 | Round 2 G13~G16 — 게이트 번호 충돌 없음 | ✅ 일관 |

### §8.4 다음 라운드 (Round 3) 입력

라운드 3 (Reviewer agent POV — UX/우선순위 perspective) 처리 의무:

1. Round 1 + 2 합의 표 starting point — 종합 매트릭스에 D1~D13 모두 등재 의무.
2. Round 1 + 2 게이트 G9~G16 (8건) — 라운드 3 종합 게이트 표에 등재.
3. 라운드 3 신규 처리 항목 (Phase 4.5 신규 §11 #13/#14/#15 + DOMAIN-EXTENSIONS §3/§4 implementation 우선순위): D14 ProductSpec multi-value 시드 / D15 SpecKeyTemplate 추천 vs 자유 / D16 운영 중 SpecKeyTemplate 추가 / D17 usageScope=BOTH 카테고리 중복 UX / D18 인쇄 ProductSpec 출력 순서 / D19 M1 split (M1a/M1b) / D20 라운드 1+2 cross-validation.
4. 라운드 3 종합 결정 매트릭스 — D1~D20 + Phase 3 §9 14건 통합 표 누락 0 의무.

---

## §9 회고 가드 적용 검증

| 가드 | 본 라운드 적용 |
|---|---|
| `feedback_function_documentation.md` (3-layer) | D7 `MaterialPriceCalculator` 신규 service — 한국어 Javadoc 의무 + 출처 (시트 D5/D6 수식) 명시 / D11 `LongPendingScheduler.collectActiveBizNos()` 메서드 의미 = "SHIPPING DB `created_time` 컬럼 기반 30일 활성 거래처 사업자번호 set 추출" 명시 의무 |
| `feedback_pm_integration_build_check.md` Layer 4 (도메인 메서드 의미 정렬) | D7 `MaterialPriceCalculator.computeOptionalSurcharge(D4)` = "$D$4 > 400000 시 $B$7 추가 (D5 수식 Java 포팅)" 명세 의무 / D10 `PartnerOrderDraftCleanupScheduler.processDaily()` = "30일 expired Draft soft delete + LONG_PENDING 거래처 Draft 즉시 정리" 명세 의무 |
| `feedback_pm_integration_build_check.md` Layer 5 (시드 검증) | D8 dry-run 99 row 매핑 표 / D12 채움 row 카운트 / D14 ProductSpec spec 컬럼 NULL 비율 — Phase 6 시드 dry-run 보고서 의무 |
| `feedback_print_design_iteration.md` | D13 인쇄 템플릿 통합 — 2-tier 통합 시 1 컴포넌트 × 3-5 iteration 부담 분산 가능. 단 통합 컴포넌트 자체의 회귀 위험 증가 → DESIGN team mockup 우선 |
| `feedback_uuid_no_user_visibility.md` | D7 MaterialPrice / D8 BranchPipeLookup / D11 Slip / Delivery — 사용자 노출 식별자 (자재명/분기관코드/슬립번호/배송번호) 만 화면 노출 |
| `feedback_korean_commits.md` | 본 라운드 한국어 작성 ✅ |
| `feedback_multi_agent_team_pattern.md` | D13 의 통합 결정이 5-team Designer 디스패치 (DESIGN/FRONTEND 협의) 영향 |
| `feedback_it_mockbean_external_clients.md` | D11 Slip/Delivery 분리 후 IT 작성 시 양 service Feign client `@MockBean` 의무 |

---

## §10 라운드 2 누락 0 가드 (검증)

- D7~D13 7 항목 모두 처리 ✅
- 각 항목 분석 / Plan / Reviewer 3 perspective 발언 모두 등재 ✅
- 각 perspective 발언에 출처 (파일:라인) 명시 ✅
- Round 1 §7.1 합의 표 명시적 인용 (D2 / D5 / D6 연계) ✅
- 합의 또는 사용자 확정 게이트 명시 ✅
- 신규 게이트 G13~G16 표 작성 ✅
- Round 1 ↔ Round 2 정합성 검증 §8.3 ✅
- 다음 라운드 (Round 3) 입력 명시 ✅
- 회고 가드 적용 검증 ✅

---

_생성: Phase 5 Discussion Round 2 / 분석 agent perspective driver / 2026-05-05 / 단일 산출 파일 / 한국어 / 출처 명시 / 추측 금지 / Round 1 인용_
