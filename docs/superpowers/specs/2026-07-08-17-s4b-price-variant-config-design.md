# #17 단가변동 S4b — "인상 전 단가" 기본값 배선 (FE) · 설계/브리프

> 연관 이슈: **#17** (단가변동 관리) · 슬라이스 **S4b** (FE)
> 선행: **S4a (#774, mergeSHA `11a86c4c`)** — product-service `PriceChangeSchedule.default_pre_change` + admin write API + 내부 default-variant GET 완료.
> 운영모드: **SONNET 대체** — Sonnet 5 서브에이전트 = 구현/5-agent 리뷰/라이브 QA, Opus(PM) = 기획/STEP4 독립 적대검증/점검/commit 대행/머지.
> 작성: 2026-07-08 (회사PC 이어받기 세션, Opus/PM)

---

## 1. 배경 · 범위

**단가변동(#17)** = 카테고리별로 특정 적용일 전후에 "인상 전 단가 / 인상 후 단가"를 전환하는 견적 로직. S4a(#774)에서 **BE 저장소 + admin write API + 내부 조회 endpoint** 를 완비했다. 본 슬라이스(S4b)는 **순수 FE** 로, 두 소비처를 배선한다:

1. **estimate-app** — 견적 작성 화면의 "인상 전 단가" 체크박스 **초기 상태**를 하드코딩(`false`)에서 **카테고리별 config 기본값**으로 전환.
2. **desktop 관리 UI** — `EstimatePricingConfigPage` 에 **카테고리별 단가변동** 섹션(적용일 + 기본값 토글)을 신설하여 admin GET/PUT 배선.

> ⚠️ **범위 밖(무변경)**: `product-service` 전면 무변경(S4a 완료). estimate-app **단가 전환 계산 로직 무변경**(체크박스가 이미 소비 중 — 초기값 소스만 교체). 일마감 재계산 토글은 별도 대규모 슬라이스 **#773**.

---

## 2. BE 계약 (S4a 완료 — 본 세션 실코드 검증)

카테고리 4종 = `PriceChangeSchedule.CATEGORY_KEYS` = **`homemulti` / `singleSets` / `commercialMulti` / `oldProducts`** (order-app `PartnerOrderLine.categoryKey` 와 동일).

| 소비처 | 메서드/경로 | 응답 shape | 인증 | 검증 위치 |
|---|---|---|---|---|
| estimate-app (신규 배선) | `GET /products/internal/price-change-default-variant` | `ApiResponse<Map<String,Boolean>>` (category → defaultPreChange) | `X-Internal-Token` | `PriceChangeScheduleInternalController.getDefaultVariant()` L82-101 |
| desktop admin (신규 배선) | `GET /api/v1/products/admin/price-change-schedule` | `ApiResponse<List<{category, effectiveDate, defaultPreChange}>>` | RBAC `products.price-schedule` **VIEW** | `PriceChangeScheduleAdminController.list()` L58-78 |
| desktop admin (신규 배선) | `PUT /api/v1/products/admin/price-change-schedule/{category}` | body `{effectiveDate?, defaultPreChange?}` (null-keep 부분수정) → `ApiResponse<{...}>` | RBAC `products.price-schedule` **UPDATE** | `PriceChangeScheduleAdminController.update()` L98-108 |

- **게이트웨이**: 기존 `product-admin-v1` 라우트(`Path=/api/v1/products/admin/**`, no-strip)가 admin 경로를 이미 커버 — 신규 라우트 불필요.
- **권한 page-code = `products.price-schedule` (kebab 확정)**. MANAGER + ACCOUNTANT 양 그룹 VIEW+UPDATE(V86 시드). FE `permissionsApi.ts` PageCode union + `PermissionMatrixPage` PAGE_LABEL 은 S4a(#774)에서 이미 추가됨 — **구현 시 존재 재확인 후 사용**(누락 시 parity 테스트 RED).

---

## 3. 작업 1 — estimate-app FE 배선

### 3-1. `clients/web/estimate-app/lib/db-catalog.js`
- 기존 `priceChangeSchedule()` (L210-217, `PRODUCT_BASE` + `/products/internal/price-change-schedule` + `X-Internal-Token`, `resp.data.data || {}` 반환)를 **정확히 대칭**하여 `priceDefaultVariant()` 신설:
  - 경로만 `/products/internal/price-change-default-variant` 로 교체.
  - **반드시 `PRODUCT_BASE` 사용**(`BASE`/`DC_CONFIG_BASE` 아님), `X-Internal-Token` 헤더 유지, `resp.data.data || {}` 반환.
  - 모듈 `module.exports` (L238~) 에 `priceDefaultVariant` 등재.

### 3-2. `clients/web/estimate-app/views/index.ejs`
- 하드코딩 초기값 3곳 → config 기본값 배선. 체크박스 생성 헬퍼 `chk(label, initialChecked, id)`:
  - `chkCommInc` (~L6591, category=`commercialMulti`)
  - `chkHomeInc` (~L7768, category=`homemulti`)
  - `chkSingleInc` (~L7807, category=`singleSets`)
  - 각 `chk('인상 전 단가', false, ...)` 의 `false` → 해당 카테고리 config 기본값.
- **⚠️ 리셋 함수 3곳도 반드시 함께 처리**(현재 `false` 하드코딩): `#chkHomeInc`(~L10003), `chkCommInc`(~L10084), `#chkSingleInc`(~L10185). 초기값만 config화하고 리셋을 `false` 로 두면 폼 리셋 시 config 기본값이 소실됨(불일치).
- config 기본값은 서버 렌더 시점 주입(예: EJS locals) 또는 클라이언트 부팅 fetch — **기존 `priceChangeSchedule` 소비 패턴과 동일한 경로**로 로드(라우트 핸들러에서 `catalog.priceDefaultVariant()` 호출 → 뷰 locals 주입이 자연스러움). 구현 에이전트가 실제 index 라우트/부팅 흐름을 재정찰하여 최소 침습으로 결정.
- **oldProducts = 체크박스 없음**(estimate-app에 대응 체크박스 부재) → 배선 대상 아님. `defaultPreChange` 맵에 존재해도 무시.
- **전환 계산 로직 무변경**: `getBaseListPrice`(~L2260), 납품가(~L4357/4369/5105) 등 체크박스를 **읽는** 코드는 손대지 않음.

> 라인번호는 스냅샷 — 구현 시 **grep 재탐색**(`chkHomeInc|chkCommInc|chkSingleInc`).

---

## 4. 작업 2 — desktop 관리 UI

### 4-1. `clients/desktop/src/renderer/api/productCatalogApi.ts`
- admin GET/PUT 훅 신설(기존 파일의 admin 호출 패턴·react-query 컨벤션 미러):
  - `getPriceChangeScheduleAdmin()` → `GET /api/v1/products/admin/price-change-schedule` → `PriceChangeScheduleAdminItem[]` (`{category, effectiveDate, defaultPreChange}`).
  - `updatePriceChangeSchedule(category, {effectiveDate?, defaultPreChange?})` → `PUT .../{category}`.
  - react-query 사용 시 mutation 성공 후 목록 invalidate.

### 4-2. `clients/desktop/src/renderer/routes/EstimatePricingConfigPage.tsx` (`/sales/estimate-config`)
- 기존 "옵션 기본값" 섹션(L295, single 전용)과 **별개**로 **"카테고리별 단가변동"** 섹션 신설.
- **자립 섹션**: 마운트 시 자체 GET, 저장 시 카테고리별 PUT. **기존 estimateConfig 폼 submit 과 데이터 소스·저장 경로 분리**(엮지 말 것 — BE가 다름).
- 4 카테고리 행 렌더(BE GET 응답 그대로):
  - `homemulti`(홈멀티) / `singleSets`(싱글) / `commercialMulti`(상업멀티): **적용일(date input) + "인상 전 단가" 기본값 토글**.
  - `oldProducts`(구형): **적용일만**(체크박스 대응 없음 → 토글 미표시).
- 카테고리 한국어 라벨 표기(홈멀티/싱글/상업멀티/구형). design-system 컴포넌트 우선.
- `canAccess('products.price-schedule')` (kebab) 로 섹션/저장 가드. VIEW 없으면 섹션 미표시, UPDATE 없으면 저장 비활성.

---

## 5. STEP4 감시 엣지 (Opus 독립 적대검증 예약 항목)

1. **estimate-app 리셋 함수**(10003/10084/10185)가 config 기본값을 반영하는가, 아니면 `false` 로 되돌려 초기값과 불일치를 만드는가.
2. `priceDefaultVariant()` 가 `PRODUCT_BASE`(not BASE/DC_CONFIG_BASE) + `X-Internal-Token` 을 쓰는가, 모듈 export 되었는가.
3. desktop admin 섹션이 estimateConfig 저장과 **분리**되어 서로 덮어쓰지 않는가.
4. `products.price-schedule` **kebab** 일관(BE @RequirePermission ↔ FE canAccess ↔ PAGE_LABEL).
5. PUT null-keep 시맨틱 준수(부분수정 — 미변경 필드 null 전송이 기존값 유지).
6. 전환 계산 로직 진짜 무변경(diff에 getBaseListPrice/납품가 계산 미포함).
7. 변경모듈 **전체** 스위트(desktop vitest 전체·estimate-app 테스트) — slice-only 는 P0 누락(S4a 교훈).

---

## 6. 결정 기록

- **Q5/Q7 확정**(개발책임자, S4a 세션): 권한 = MANAGER+ACCOUNTANT VIEW+UPDATE(V86 완료). 전환로직 무변경(기본값만 배선).
- **4-카테고리 admin 레이아웃 = PM 자율**(FE config UI·비즈정책 아님). BE 계약이 4종 고정 → 섹션은 GET 응답 4종을 렌더, oldProducts 는 날짜만.

## 7. 캐논 절차 (SONNET 대체)

조기 PR(연관 #17·OPEN) → Sonnet 구현 → **2라운드 5-agent(FE/BE/Design/DevOps/QA) + Opus STEP4 0수렴** → 라이브 QA(estimate-app mock off 실 GUI 체크박스 초기상태 + desktop admin GET/PUT 스샷·SendUserFile+PR SHA-pinned) → dev-report → PM 9-게이트 → CI green → 머지.
