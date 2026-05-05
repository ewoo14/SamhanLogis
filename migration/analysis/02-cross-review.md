# Phase 2 — Cross-review 리포트

> 입력: `01-script-analysis-estimate.md` (498 lines), `01-script-analysis-partner-order.md` (564 lines), `01-script-analysis-long-pending.md` (227 lines)
> spot-check 원본: `migration/source/scripts/{estimate,partner-order,long-pending}/Code.js`, `index.html`, `migration/source/sheet/workbook.json`
> 작성일: 2026-05-05 / 원칙: 무손실 / 추측 금지 / 토큰 placeholder 보존 / 단일 산출 파일

---

## §1. 함수 inventory 누락 검증

### §1.1 카운트 검증 (grep `^\s*(async\s+)?function [a-zA-Z_]`)

| 파일 | 분석문서 카운트 | 실측 grep 카운트 | 차이 | 판정 |
|---|---|---|---|---|
| estimate/Code.js | 76 (top 70 + nested 6) | **76** | 0 | OK |
| estimate/index.html | 358 + 1 named expr = 435 | **358** (named expr 별도) | 0 | OK |
| partner-order/Code.js | **81** | **87** | **+6** | **누락 6** |
| partner-order/index.html | 12 RPC site 만 (인라인 함수 inventory 없음) | **256** | **244+** | **inventory 미수행** |
| long-pending/Code.js | 5 | **5** | 0 | OK |

### §1.2 partner-order Code.js 누락 함수 표

| # | 라인 | 함수명 | 종류 | 분석문서 누락 사유 추정 |
|---|---|---|---|---|
| 1 | 281 | `extractSingleIncreasePrices_` | top-level helper | top-level 임에도 §1 표 누락 (인접 `extractIncreasePrices_` 일반화 헬퍼와 혼동) |
| 2 | 332 | `extractIncreasePrices_` | top-level helper | 동일 — 분석문서 §1 #11 라인 332 표기는 이름만 있고 시그니처 별도 라인 매핑 누락 |
| 3 | 1169 | `scan` | nested in `getSpecMap_` | 중첩 inner 함수 — estimate.md 는 nested `scan` 별도 inventory(§1.1 #35) 했으나 partner-order.md 는 미등재 |
| 4 | 1241 | `scanHome` | nested in `getSpecDetailMap_` | 동일 |
| 5 | 1318 | `scanSingle` | nested in `getSpecDetailMap_` | 동일 |
| 6 | 1412 | `scanComm` | nested in `getSpecDetailMap_` | 동일 |

→ partner-order.md §1 합계는 **81 → 87** 로 보정 필요. inner 카운트 정책을 estimate.md (nested 포함) 와 일치시켜야 inventory 누락 0 가드 충족.

### §1.3 partner-order index.html 256 함수 inventory 부재

partner-order.md §1 은 **`google.script.run` 호출 site 12개** 만 표기 (분석문서 line 104-119). 그러나 실측 256개 인라인 SPA 함수 (예: `explodeSendSets_`, `analyzeSingleSetDiscountFlags`, `getModelFlags`, `applyConfigFromServer`, `startExpirationPolling`, `playWelcomeAnimation`, `restoreSnapshot`, `applySnapshot`, `buildSendRows` 등 — partner-order.md 본문에서 위치 line 만 인용되고 별도 inventory 행 없음) 은 분류·라인 매핑 누락. estimate.md 가 §1.2 에서 358개 카테고리 A~GG 압축 inventory 를 제공한 것과 비대칭.

**조치 권장**: partner-order.md 에 §1.3 (index.html 256 함수 카테고리 압축 inventory) 보강. Phase 3 진입 전 Phase 1 보강 PR 1건 발행.

### §1.4 long-pending — OK

5 함수 (1 entry + 4 private) 모두 분석문서 §1 표 등재. 누락 0 확인.

---

## §2. 시트 read/write 매트릭스 정합성

### §2.1 워크북 27개 탭 분석문서 커버리지

workbook.json 탭 (실측): `전표생성폼, 종합견적서, 전표업로드목록, 홈멀티, 홈멀티_단가인상, 싱글 세트, 싱글 세트_단가인상, 싱글 구성품, 싱글 구성품_단가인상, 상업멀티, 상업멀티_단가인상, 싱글 자재가격, 상업멀티 구성, 상업멀티 구성_단가인상, 분기계산, 구형, 장비스펙, 부속품스펙, 홈멀티_템플릿, 거래처, 전표생성폼_템플릿, 싱글 세트_템플릿, 상업멀티_템플릿, 분기계산_템플릿, 구형_템플릿, 담당자, 추천실외기` (27개)

| 탭 | estimate 사용 | partner-order 사용 | long-pending 사용 | 판정 |
|---|---|---|---|---|
| 홈멀티 | ❌ | ✅ (`HOME_NAME`) | ❌ | **충돌** — §2.2 |
| 홈멀티_단가인상 | ✅ (`HOME_NAME`) | ✅ (보조 — 가격인상 lookup) | ❌ | **충돌** — §2.2 |
| 싱글 세트 | ❌ | ✅ (`SINGLE_NAME`) | ❌ | 동일 충돌 |
| 싱글 세트_단가인상 | ✅ (`SINGLE_NAME`) | ✅ (보조) | ❌ | 동일 충돌 |
| 싱글 구성품 | ❌ | ✅ | ❌ | 동일 |
| 싱글 구성품_단가인상 | ✅ | ✅ (보조) | ❌ | 동일 |
| 상업멀티 | ❌ | ✅ | ❌ | 동일 |
| 상업멀티_단가인상 | ✅ | ✅ (보조) | ❌ | 동일 |
| 상업멀티 구성 | ❌ | ✅ | ❌ | 동일 |
| 상업멀티 구성_단가인상 | ✅ | ❌ (확인 안됨) | ❌ | **비대칭** — partner-order 가 _단가인상 보조 사용 여부 불확실 |
| 싱글 자재가격 | ✅ | ✅ | ❌ | OK |
| 거래처 | ✅ | ✅ | ❌ | OK |
| 담당자 | ✅ | ✅ | ❌ | OK |
| 구형 | ✅ | ✅ | ❌ | OK |
| 추천실외기 | ✅ | ❌ | ❌ | estimate 전용 (견적서) |
| 장비스펙 | ❌ | ❌ (명시적 미사용) | ❌ | **고아 탭** |
| 부속품스펙 | ❌ | ❌ (명시적 미사용) | ❌ | **고아 탭** |
| 종합견적서 | ❌ | ❌ | ❌ | **고아 탭** (인쇄 양식 추정) |
| 전표생성폼 | ❌ | ❌ | ❌ | **고아 탭** |
| 전표업로드목록 | ❌ | ❌ | ❌ | **고아 탭** |
| 분기계산 | ❌ | ❌ | ❌ | **고아 탭** (estimate 분기관 페이지 클라이언트 계산 — 시트 미사용?) |
| *_템플릿 (6개) | ❌ | ❌ | ❌ | **고아 탭** (인쇄/복사 템플릿) |

**고아 탭 11개** 중 `장비스펙`/`부속품스펙` 은 partner-order.md §9-1 에서 명시적으로 미확정 등재. 나머지 9개 (인쇄 양식 + 분기계산) 는 두 분석문서 모두 언급 0건. Phase 3 (Sheet schema) 에서 용도/스키마 별도 분석 필수.

### §2.2 동일 시트의 다른 해석 — 마스터 시트 충돌

| 도메인 | estimate 마스터 | partner-order 마스터 | 의미 |
|---|---|---|---|
| 홈멀티 | `홈멀티_단가인상` | `홈멀티` | estimate 는 인상가 적용본을 1차 데이터로, partner-order 는 베이스 시트를 1차 데이터로 + `_단가인상` 을 PRICE_INC_DATE 이후 적용용 lookup 으로 분리 |
| 싱글 세트 | `싱글 세트_단가인상` | `싱글 세트` | 동상 |
| 상업멀티 | `상업멀티_단가인상` | `상업멀티` | 동상 |
| 싱글 구성품 | `싱글 구성품_단가인상` | `싱글 구성품` | 동상 |

**의미 분석**:
- estimate (견적서) 는 항상 최신 인상가 기준으로 견적 작성 → `_단가인상` 시트가 master.
- partner-order (주문서) 는 PRICE_INC_DATE (인상 시행일) 이전·이후 분기 발생 → 베이스 시트 + 인상가 시트 동시 보유, 클라이언트가 `*_INC[model]` 로 시점별 분기.

**Phase 4 Plan 영향**:
- product-service 시드 시 베이스 + 인상가 두 가지 가격 컬럼 (또는 시점별 PriceHistory entity) 필요. 단일 `price` 컬럼은 부족.
- 인상 적용일 (`PRICE_INC_DATE`) 상수가 어느 분석문서에도 명시되지 않음 — partner-order Code.js / index.html 추가 spot-check 필요.

### §2.3 헤더 행 위치 일관성

분석문서 3개 모두 **헤더 행이 1행** 인 것으로 암묵적 가정. 그러나:
- `getHomeDefaults` / `getSingleDefaults` 는 `A1:X2` 범위에서 1행=헤더, 2행=값 (default 옵션) 으로 처리 (partner-order.md §2). 이는 헤더가 1행이고 default 값이 2행에 inline 되어 있는 비정상 구조.
- `getRecommendOduData` 는 `A3:E{lastRow}` (estimate.md §2) → **3행이 데이터 시작**, 1-2행은 그룹 헤더.
- `구형` 시트는 `A2:I{lastRow}` (estimate.md §2) → 1행=헤더, 데이터 2행 시작.

**판정**: 사용자 강조 ("시트별로 열헤더 위치가 다름") 는 분석문서가 함수별 범위 설정 (A1:X2 / A2:I / A3:E) 으로 우회 처리. Phase 3 sheet-schema 분석 시 27개 탭 별 `header_row / data_start_row` 명시 의무 (workbook.json 만으로는 어느 행이 헤더인지 불명확 — 마스터 시트와 인쇄/템플릿 시트 구분 필요).

---

## §3. Notion DB 매핑 정합성

### §3.1 9개 토큰 cross-reference 매트릭스

| 토큰 placeholder | DB ID | estimate | partner-order | long-pending | 정합성 |
|---|---|---|---|---|---|
| `REDACTED_NOTION_AUTH_TOKEN_001` | `198a1006d65880ddb510e0d525c5e9da` | ✅ `checkUserAuth` (직원 OAuth 인증) | ❌ | ❌ | estimate 단독 — 직원 Google 계정 화이트리스트 |
| `REDACTED_NOTION_TOKEN_002` | `193a1006d6588161a02cc8f196d7102b` | ✅ `fetchNotionDcConfig_` (DC 설정 GET/POST) | ✅ `fetchNotionDcConfig_` (동일 DB) | ❌ | OK — 동일 DB/동일 함수명 |
| `REDACTED_NOTION_TOKEN_ORDER_003` | `2eca1006d65880109d91c2e56fab28f4` | **선언만** (estimate.md §3.2 #003 비활성) | ✅ `getOrderHistory`, `saveOrderToNotion` | ❌ | **불일치** — estimate 가 declare 만 하고 사용 0건. 정리 의무 |
| `REDACTED_NOTION_TOKEN_SHIPPING_004` | `2f8a1006d658803face6fdfe2b175780` | ✅ `saveOrderToNotion`, `getNotionHistory` (`NOTION_KEY_SEND` 변수명) | ✅ `getAccessExpiration` 인라인 (만료일 계산) | ✅ `getActiveBizNosFromShipping_` | **명명 불일치** — estimate 는 SHIPPING DB 를 "주문 저장 sink" 로 사용 (saveOrderToNotion), partner-order/long-pending 는 "출고 활동 source" 로 사용. **동일 DB 가 두 가지 역할** — Phase 4 에서 도메인 분리 필요 (출고 이력 vs 주문 미러) |
| `REDACTED_NOTION_TOKEN_BEARER_005` | `32ba1006d65880c4beb4fa1bdf65b676` | ✅ `logFrontEvent` (인라인 Bearer) | ❌ | ❌ | estimate 단독 — log DB 와 별개 (LOG_007 과 혼동 주의) |
| `REDACTED_NOTION_TOKEN_QUOTE_006` | `2fca1006d65880058f8af352f254bc67` | ✅ `saveQuoteSnapshot`, `getQuoteHistory` | ❌ | ❌ | estimate 단독 (견적 스냅샷) |
| `REDACTED_NOTION_TOKEN_LOG_007` | `2eda1006d65880d696b3da4a8d281ea2` | ❌ (estimate 의 logFrontEvent 는 005 사용) | ✅ `logActionToNotion`, `logFrontEvent`, `getAccessExpiration` | ✅ `getActiveBizNosFromLog_` | **로그 DB 분기** — estimate 는 005 (32ba…) , partner-order/long-pending 는 007 (2eda…) 두 DB 동시 운영. SECRETS-MAP 005 가 별도 토큰인 이유 명확화 |
| `REDACTED_NOTION_TOKEN_AUTH_008` | `2dda1006d6588047b1bbc7c2660203c0` | ❌ | ✅ `queryAuthDb_`, `createAuthRow_`, `updateAuthPage_` | ✅ `getTargetClients_`, `updateClientStatus_` | OK — 거래처 인증 DB (estimate 의 직원인증 001 과 별개) |
| `REDACTED_NOTION_TOKEN_SNAPSHOT_009` | `33aa1006d6588087810ffaa7dc7f315c` | ❌ | ✅ `saveOrderSnapshot`, `getOrderSnapshotHistory` | ❌ | OK — 주문 임시저장 (estimate QUOTE_006 과 별개) |

### §3.2 정정 의무

1. **TOKEN_003 (ORDER) 가 estimate Code.js line 85 에 declare 되었으나 호출 0건** — partner-order 와 공유 의도였으나 실제로는 partner-order 만 사용. Phase 6 구현 시 estimate-service 는 003 토큰 미주입 (보안 surface 축소).
2. **TOKEN_004 (SHIPPING) 의 이중 역할** — estimate `saveOrderToNotion` (전표 저장 sink) vs long-pending `getActiveBizNosFromShipping_` (출고 활동 source). 동일 Notion DB 인지, 같은 DB 를 다른 의미로 읽는지, 또는 estimate 시점에 `NOTION_KEY_SEND` 가 다른 DB ID 를 가리키는지 — **DB ID 일치 확인** (SECRETS-MAP 표기는 동일 ID). 동일 DB 라면 page schema 하나로 양쪽 역할 충족 가능한지 Phase 3 schema 분석 필수.
3. **TOKEN_005 vs TOKEN_007 (로그 DB 분기)** — 동일 시스템에서 두 로그 DB 운영. Phase 4 통합 시 audit-service 단일 DB 로 통합 가능한지 결정 필요. 현재 estimate 의 logFrontEvent 와 partner-order 의 logActionToNotion 페이지 schema 차이 확인 필수.

---

## §4. 변동DC 룰 정합성 (DOMAIN-EXTENSIONS §1)

### §4.1 룰 표기 정합성

| 룰 | estimate.md §5 | partner-order.md §5 | 동일 룰? |
|---|---|---|---|
| `$L$2` 절대참조 → useK2 (홈/상업) | ✅ Code.js 428, 851 (홈/상업) | ✅ Code.js 658, 1051 (홈/상업) — **함수명 동일 `getHomeMulti`/`getCommercialMulti`, 라인만 다름** | **동일 룰** — 룰 1 |
| `$D$7` / `$D$8` → matKey (싱글 세트 자재 옵션) | ✅ Code.js 556-559 | ✅ Code.js 780-783 | **동일 룰** — 룰 2 |
| `$I$1` → 구형 50% DC | ✅ Code.js 1742-1744 | ✅ Code.js 1906-1909 | **동일 룰** — 룰 3 |
| 고정DC 컬럼 (행별 override) | 부분 언급 (§5.2 의사코드에 없음) | ✅ §5 룰 1 보충 (`fixedDc` BigDecimal nullable) | **partner-order 가 더 정밀** — estimate 누락 보완 의무 |

→ 4종이 아니라 **실질 3종 + 1 보강 (고정DC 컬럼)**. partner-order.md 가 ProductMaster 컬럼 명세 (`hasVariableDiscount/fixedDiscountRate/setMaterialKey/legacyDiscountFlag`) 4컬럼으로 분해 → estimate.md 의 `discountSource: enum {L2_REF, D7, D8, I1, NONE}` 단일 컬럼 대안과 **충돌**.

### §4.2 권장 통합 명세 (Phase 4 사전 결정)

| 컬럼 | 타입 | 의미 | 출처 룰 |
|---|---|---|---|
| `hasVariableDiscount` | boolean | useK2 (홈/상업) | 룰 1 (`$L$2`) |
| `fixedDiscountRate` | numeric(5,4) nullable | 행별 고정DC override | 고정DC 컬럼 |
| `setMaterialKey` | enum {D4, D7, D8} nullable | 싱글 세트 자재 옵션 | 룰 2 |
| `legacyDiscountFlag` | boolean | 구형 50% DC | 룰 3 (`$I$1`) |

estimate.md `discountSource` 단일 enum 은 표현력 부족 (싱글 세트는 4가지 자재 옵션) — partner-order.md 4컬럼 안 채택 권장.

### §4.3 분석 한계 (workbook.json values-only)

estimate.md §9-1 명시: workbook.json 은 `values` 만 export. 변동DC 룰 검증은 `getFormulas()` 결과 별도 export 필수. partner-order.md 는 한계 미언급. **두 문서 공통 한계**.

→ **Phase 1.5 (formulas re-export) 필수**. 다음 시트 5개에 대해 `getFormulas()` 추가 dump:
- `홈멀티`, `홈멀티_단가인상` (룰 1 검증)
- `싱글 세트`, `싱글 세트_단가인상` (룰 2 검증)
- `상업멀티`, `상업멀티_단가인상` (룰 1 검증)
- `구형` (룰 3 검증)

검증 후 ProductMaster 시드 데이터에 boolean/enum 사전 계산.

---

## §5. 세트(Bundle) 처리 정합성 (DOMAIN-EXTENSIONS §2)

### §5.1 두 분석문서 일관성

| 항목 | estimate.md §6 | partner-order.md §6 | 정합 |
|---|---|---|---|
| 채택 옵션 | A (단일 SKU + bundle 메타) | A | ✅ 일치 |
| FK 컬럼 | 싱글 구성품의 `세트` 컬럼 = 부모 setModel | 동일 | ✅ |
| 펼침 함수 | `partsForSetStrict_` + `explodeSetParts` (싱글), `explodeCommSets_` (상업) | `explodeSendSets_` (싱글, 분해 분기), `explodeCommSets_` (상업) | ✅ — partner-order 가 SEND_AS_SET_IDS 분기 추가 |
| 모델 prefix DC 매트릭스 | `getModelFlags` 7 prefix (estimate.md §6 표) | `getModelFlags` 7 prefix (partner-order.md §6.3 표) | ✅ 7개 룰 일치 |
| 단가 계산 | `calcSetUnitPrice` = base + panelDelta + remoteDelta + materialsSum | `analyzeSingleSetDiscountFlags` + 클라이언트 단가 산정 | ✅ — 동일 알고리즘, 함수 분리만 다름 |

### §5.2 SEND_AS_SET_IDS 화이트리스트 (partner-order 누락 §9-2 보완)

partner-order index.html line 2585 spot-check 결과:
```javascript
const SEND_AS_SET_IDS=new Set([SS_FOOT_ROUND_ID,SS_FOOT_FLAT_ID,SS_WIRED_BOARD_ID,SS_CEILING_PUMP_ID].filter(Boolean));
```

→ 화이트리스트 4 항목: 발통(원형), 발통(평형), 유선보드, 천장펌프. 이 4개 부자재 SET 은 분해 안 하고 원형 SET 단위 그대로 e-Count 전송 (라인 4678, 5359, 5450 사용).

**Phase 4 Plan 명세**:
- product 도메인에 `bundleMode: enum {EXPAND, KEEP}` 컬럼 추가 (partner-order.md §6.4 권장)
- 위 4 SKU 는 `bundleMode=KEEP` 시드
- 나머지 BUNDLE 은 default `EXPAND`

### §5.3 통합 product-service 컬럼 명세 (Phase 4 사전 결정)

| 컬럼 | 타입 | 출처 | 의미 |
|---|---|---|---|
| `productType` | enum {SINGLE, BUNDLE} | 옵션 A | 단품/세트 구분 |
| `bundleMode` | enum {EXPAND, KEEP} nullable | partner-order §6.2 | BUNDLE 의 e-Count 전송 단위 |
| `bundleComponents` | List<{componentProductCode, qty, isDefault, kind, spec}> | 싱글 구성품 / 상업멀티 구성 시트 | 펼침 시 컴포넌트 라인 |
| `setMaterialKey` | enum {D4, D7, D8} nullable | 룰 2 | 싱글 세트 자재 옵션 (§4.2) |
| `discountFlags` | bitset (is360/is4way/is1way/isStand/isDeluxe/isGrade1) | `getModelFlags` 모델 prefix 정규식 | Phase 1 시드 시점 사전 계산 |

→ 옵션 A + bundleMode + setMaterialKey + discountFlags 통합 가능. 두 분석문서 모두 동일 결론 도달 (충돌 없음).

---

## §6. 인증/보안 정합성

### §6.1 인증 시스템 분리

| 영역 | 인증 방식 | 사용 분석문서 | DB |
|---|---|---|---|
| 직원 (estimate 견적서) | Google OAuth 이메일 화이트리스트 | estimate | NOTION_AUTH_001 |
| 거래처 (partner-order 주문서) | 사업자번호 + 4자리 PW (SHA-256, 5 history, 3-fail LOCKED) | partner-order, long-pending | NOTION_AUTH_008 |

→ 두 인증 시스템은 **완전 분리** (DB / 토큰 / 인증 방식 모두 다름). long-pending 는 partner 인증 DB 의 상태만 갱신 — estimate 의 직원 인증과 무관.

**Phase 4 Plan 매핑**:
- 직원 인증 → 기존 SamhanLogis iam-service / auth-service (Google OAuth + 직원 매핑)
- 거래처 인증 → 신규 partner-order-service `PartnerAuth` (bcrypt + status enum + 5 history)

### §6.2 평문 자격증명 노출

| 위치 | 자격증명 | 위험 |
|---|---|---|
| estimate Code.js 1551-1559 (`getScriptCreds_`) | COM_CODE=174539, USER_ID=11840720103, KEY=117d1e405a25…, EMP_CD=250102 | e-Count ERP 풀 권한 |
| partner-order Code.js 1755-1763 (`getScriptCreds_`) | 동일 4종 | 동일 |

→ **두 스크립트가 동일한 e-Count 자격증명 평문 default** 보유. PropertiesService 우선이나 default 가 코드에 노출. Vault/AWS Secrets Manager 이전 의무 (estimate.md §9-4 + partner-order.md §9-8 양쪽 동의).

### §6.3 e-Count proxy endpoint 정합성

| Endpoint | estimate | partner-order | 동일? |
|---|---|---|---|
| `/proxy/ecount/zone` | ✅ `callZoneApi` | ✅ `callZoneApi` | OK |
| `/proxy/ecount/login` | ✅ `getEcountSession` | ✅ `getEcountSession` | OK |
| `/proxy/ecount/sale` | ✅ `sendOrderFromUi` | — | estimate 만 (`/sale`) |
| `/proxy/ecount/saleorder` | — | ✅ `sendOrderFromUi` | partner-order 만 (`/saleorder`) |
| `/proxy/ecount/inventory` | ✅ `getInventoryTableHtml` | ❌ | estimate 만 |

**핵심 불일치**: estimate 는 `/sale`, partner-order 는 `/saleorder` — 두 다른 e-Count API endpoint. estimate `/sale` 은 판매전표 (즉시 발생), partner-order `/saleorder` 는 판매주문 (사전 단계). 이카운트 도메인 정합 — Phase 4 에서 Slip vs SalesOrder 도메인 분리 매핑 필수. ecount-gateway 가 두 endpoint 모두 노출.

---

## §7. 외부 의존 매트릭스

| 서비스 | 함수 (분석문서 출처) | endpoint / API | 인증 방식 | 통합 권장 |
|---|---|---|---|---|
| e-Count zone | `callZoneApi` (e/po) | `POST 152.69.228.109:3000/proxy/ecount/zone` | API_CERT_KEY | **ecount-gateway 흡수** |
| e-Count login | `getEcountSession` (e/po) | `POST .../proxy/ecount/login` | zone+API_CERT_KEY | 동상 |
| e-Count sale | `sendOrderFromUi` (e) | `POST .../proxy/ecount/sale` | sessionId | 동상 |
| e-Count saleorder | `sendOrderFromUi` (po) | `POST .../proxy/ecount/saleorder` | sessionId | 동상 |
| e-Count inventory | `getInventoryTableHtml` (e) | `POST .../proxy/ecount/inventory` | sessionId | 동상 |
| Notion API | 토큰 9종 (§3.1) | `https://api.notion.com/v1/{databases,pages,data_sources}/...` | Bearer | **마이그 후 폐기** (PostgreSQL 이전) |
| Drive (이미지) | `getGateImages`, `getLogoImage` (e/po) | `DriveApp.getFolderById(...)` | OAuth | **files-service 또는 S3 마이그** |
| MailApp | `sendOrderFromUi` (po) | `MailApp.sendEmail samhan00@daum.net` | Apps Script 한도 | **mail-service or Spring Mail** |
| GmailApp | `forceAuthCheck` (po) | createDraft/deleteDraft | OAuth | **권한 부여용 — 마이그 시 불요** |

→ 통합 권장:
- **ecount-gateway 신규 서비스** (5 endpoint 흡수, sessionId 캐시 50분) — 두 분석문서 모두 동일 권장
- Notion 5 토큰 → PostgreSQL 마이그 후 폐기
- Drive 이미지 2 폴더 → files-service / S3 마이그
- MailApp → application.yml `samhan00@daum.net` 외부화 후 Spring Mail

---

## §8. Java 포팅 권장 구조 정합성

### §8.1 service 분할 충돌

| 분석문서 | 권장 service | 의존 |
|---|---|---|
| estimate.md §8 | **estimate-service 신규** (8 컴포넌트) + product-service 확장 + partner-service 확장 (PartnerDiscountConfig) + slip-service 의존 + ecount-gateway 신규 | product/partner/slip 의존 |
| partner-order.md §8 | **partner-order-service 신규** (PartnerAuth/PartnerOrder/PartnerOrderDraft/PartnerOrderActionLog/DiscountResolver 5 도메인) + slip-service 가 listen | product/partner 의존 |
| long-pending.md §8 | **partner-service 확장** (PartnerLongPendingService + ApprovalStatus enum) — 신규 service 거부 | slip-service / delivery-service 의존 |

**충돌 분석**: partner 도메인이 3 분석문서 모두에서 영향 받음.
- estimate: partner-service 에 `PartnerDiscountConfig` (Notion DC 9필드 이전) 추가
- partner-order: 신규 partner-order-service 에 `PartnerAuth` (인증) — partner-service 와 분리
- long-pending: partner-service 에 `ApprovalStatus` enum + `PartnerLongPendingService` 추가

### §8.2 partner 도메인 분할 권장 안

| 신규/확장 | service | 책임 |
|---|---|---|
| 확장 (partner-service) | `Partner` (기존) + `PartnerDiscountConfig` (새 entity) + `ApprovalStatus` enum + `PartnerLongPendingService` 배치 | 거래처 마스터 + DC override + 활성 상태 분류기 |
| 신규 (partner-order-service) | `PartnerAuth` (bcrypt + status enum + 5 history) + `PartnerOrder` + `PartnerOrderLine` + `PartnerOrderDraft` + `DiscountResolver` | 거래처 자체 인증 + 주문 라이프사이클 |
| 신규 (estimate-service) | `Estimate` + `EstimateLine` + `EstimateSnapshot` + `BundleExpansionPolicy` + `EstimateSubmissionService` | 직원 견적 라이프사이클 |
| 신규 (ecount-gateway) | 5 endpoint proxy + sessionId 캐시 | e-Count 통합 |

→ partner 도메인 분할 정책: **마스터 / DC / 활성도 = partner-service**, **자체 인증 / 주문 = partner-order-service**, **결재선 + 회계 = slip-service**. 충돌 해소.

### §8.3 product-service 확장 통합 (§4.2 + §5.3 합본)

신규 컬럼 종합 (Phase 4 Flyway 마이그 1회):
- `hasVariableDiscount: boolean`
- `fixedDiscountRate: numeric(5,4) nullable`
- `setMaterialKey: enum {D4, D7, D8} nullable`
- `legacyDiscountFlag: boolean`
- `productType: enum {SINGLE, BUNDLE}`
- `bundleMode: enum {EXPAND, KEEP} nullable`
- `bundleComponents: jsonb` (또는 별도 BundleComponent entity)
- `discountFlags: bitset` (is360/is4way/is1way/isStand/isDeluxe/isGrade1)

---

## §9. 모호/누락 항목 통합 (Phase 4 Plan 입력)

### §9.1 사용자(개발책임자) 확정 필요

| # | 항목 | 분석문서 출처 | 확정 형태 |
|---|---|---|---|
| 1 | 장기미발주 30일 임계값 정책 (60일/90일?) | long-pending.md §9-3 | 정책 선언 → application.yml |
| 2 | "주문 성공" 외 추가 성공 메시지 패턴 존재? | long-pending.md §9-4 | 로그 DB 샘플 검토 후 답변 |
| 3 | 거래처 시트 `그룹` 컬럼 활용 정책 (메뉴 분기 / 단가 일괄?) | partner-order.md §9-3, §11.1 | 향후 기능 여부 |
| 4 | 거래처 시트 `singleDiscount` (싱글 할인) 컬럼 deprecated 여부 | partner-order.md §9-4 | 폐기 또는 보존 |
| 5 | `getRecommendOduData` 의 `homeEx` (홈멀티 확장) 의미 | estimate.md §9-10 | 헤더 의미 확정 |
| 6 | dead code 제거 가능성 (12종) — `detectHomeOrder/extractRowsFromFormula_/normalizeTel_/toYmd_` 등 | estimate.md §9-5 | 제외 승인 |
| 7 | `_triggerAuth/forceAuth/forceAuthCheck` 권한 부여용 더미 폐기 | partner-order.md §9-7 | 폐기 승인 |
| 8 | 세트 옵션 변경 시 6 카테고리 DC 중복 적용 가능 여부 (1way+grade1 동시 등) | estimate.md §9-3 | UI 동작 확정 |
| 9 | 트리거 등록 형태 (long-pending) — 콘솔 스크린샷 | long-pending.md §9-1 | 사용자 캡처 제공 |
| 10 | `userEmail samhan00@daum.net` 환경별 분기 정책 | partner-order.md §9-10 | application.yml 매핑 |

### §9.2 코드 spot-check 로 해결 (Phase 1.5 보강)

| # | 항목 | 출처 | 조치 |
|---|---|---|---|
| 1 | partner-order Code.js 누락 함수 6개 (§1.2) | 본 §1.2 | partner-order.md §1 보강 PR |
| 2 | partner-order index.html 256 함수 inventory 부재 (§1.3) | 본 §1.3 | partner-order.md §1.3 신설 PR (estimate.md §1.2 카테고리 압축 양식 차용) |
| 3 | SEND_AS_SET_IDS 정의 — 4 화이트리스트 (§5.2) | 본 §5.2 | partner-order.md §9-2 → 해소 (본 cross-review 에 등재) |
| 4 | PRICE_INC_DATE 상수 위치 | 본 §2.2 | partner-order Code.js + index.html grep |
| 5 | TOKEN_004 (SHIPPING) DB schema — estimate sink vs long-pending source 동일 schema 가능? | 본 §3.2-2 | Phase 3 sheet schema 단계 |
| 6 | estimate logFrontEvent (TOKEN_005) vs partner-order logActionToNotion (TOKEN_007) page schema 차이 | 본 §3.2-3 | Phase 3 |
| 7 | 상업멀티 구성_단가인상 시트 partner-order 사용 여부 (§2.1 비대칭) | 본 §2.1 | partner-order Code.js spot-check |
| 8 | `상업 ERV layout 자동 감지` (3-segment vs 2-segment) 휴리스틱 회귀 | estimate.md §9-8 | 시트 표본 검증 |

### §9.3 Phase 1.5 (formulas re-export) 필요성 종합

§4.3 + §9.2 #4-7 종합 → **Phase 1.5 필수**. 산출:
1. `getFormulas()` dump — 7 시트 (홈멀티 ×2, 싱글세트 ×2, 상업멀티 ×2, 구형) + workbook.json 에 `formulas` 키 추가
2. PRICE_INC_DATE 상수 grep
3. NOTION_TOKEN_004 + 005 vs 007 page schema spot-check (Notion API 1회 호출 확인)
4. 상업멀티 구성_단가인상 partner-order 사용 여부 spot-check

---

## §10. 회고 가드 적용 검증

| 가드 | estimate.md | partner-order.md | long-pending.md | 보강 의무 |
|---|---|---|---|---|
| `feedback_function_documentation.md` (한국어 Javadoc + dev-reports) | §10 명시 | §10 명시 | §10 명시 | 모두 OK |
| `feedback_pm_integration_build_check.md` Layer 4 (도메인 메서드 의미 정렬) | §10 명시 (QA 1:1 비교) | §10 명시 | §10 명시 | 모두 OK |
| `feedback_uuid_no_user_visibility.md` | §10 명시 | §10 명시 (사업자번호+거래처코드) | §10 명시 | 모두 OK |
| `feedback_korean_commits.md` | §10 명시 | §10 명시 | §10 명시 | 모두 OK |
| `feedback_role_naming_full.md` | 미언급 | 미언급 | §10 명시 | estimate/partner-order 보강 의무 (Phase 6 진입 전) |
| `feedback_powershell_utf8_writes.md` | 미언급 | 미언급 | §10 명시 | estimate/partner-order 보강 의무 |
| `feedback_it_mockbean_external_clients.md` | 미언급 | 미언급 (sendOrderFromUi 분해 시 Layer 권고만) | §8.2 명시 (SlipClient/DeliveryClient @MockBean) | estimate/partner-order 보강 의무 — Phase 6 IT 작성 시 EcountClient/ProductClient/PartnerClient 모두 @MockBean |
| `DOMAIN-EXTENSIONS §1 (변동DC)` | §5 표 | §5 표 | "해당 없음" 명시 | OK |
| `DOMAIN-EXTENSIONS §2 (Bundle)` | §6 표 | §6 표 | "해당 없음" 명시 | OK |

→ **Phase 6 구현 단계 진입 전 보강 의무**: estimate.md / partner-order.md 의 §10 회고 가드에 (1) role 풀네임 (2) PowerShell UTF-8 (3) IT @MockBean 3건 추가 인용.

---

## 다음 단계 권장

### Phase 1.5 — formulas re-export + spot-check (선행 의무)
1. workbook.json 에 `formulas` 키 추가 (7 마스터 시트 — `getFormulas()` 결과)
2. PRICE_INC_DATE 상수 grep + 두 분석문서 §2 보강
3. partner-order.md §1 카운트 81 → 87 정정 + index.html 256 함수 카테고리 압축 inventory 추가
4. Notion DB schema spot-check 4건 (TOKEN_004 동일 DB 양면, 005/007 로그 schema 차이, 상업멀티 구성_단가인상 사용 여부)
5. 산출: `analysis/01-script-analysis-{estimate,partner-order}.md` PR 보강 + `workbook-formulas.json` 추가

### Phase 3 (Sheet schema) 진입 시 주의사항
1. **27개 탭 모두 header_row / data_start_row 명시 의무** — 사용자 강조 ("시트별로 열헤더 위치가 다름") 직접 충족
2. **고아 탭 11개** (장비스펙/부속품스펙/종합견적서/전표생성폼/전표업로드목록/분기계산/*_템플릿 6) — 인쇄 양식인지 dead 시트인지 분류 필수
3. **마스터 시트 vs `_단가인상` 시트** — 두 시트의 컬럼 구조 차이 (인상 적용일 컬럼 추가 등) 명세
4. **`getHomeDefaults`/`getSingleDefaults`** A1:X2 범위 의미 — 1행=헤더, 2행=default 값. 정상 데이터와 분리 처리

### Phase 4 (Migration Plan) 사전 결정 항목
1. **product-service 8 컬럼 추가** (§8.3) — Flyway 단일 마이그
2. **partner 도메인 3-way 분할** (§8.2): partner-service 확장 / partner-order-service 신규 / slip-service 확장
3. **ecount-gateway 신규 서비스** (5 endpoint, sessionId 캐시 50분)
4. **Notion 5 토큰 → PostgreSQL 마이그 후 폐기** (TOKEN_002/003/004/005/006/007/008/009 — 001 직원 인증만 별도 iam-service)
5. **Slip vs SalesOrder 도메인 분리** — `/sale` (estimate) vs `/saleorder` (partner-order) endpoint 분리 매핑
6. **사용자 확정 10건** (§9.1) 사전 답변 수신 (Phase 4 Plan agent 디스패치 전)

### 누락 0 가드 결과
- estimate Code.js 76, partner-order Code.js **87 (분석문서 81 → 6 보강)**, long-pending Code.js 5 — 누락 6 (partner-order 만)
- partner-order index.html 256 함수 inventory 부재 — Phase 1.5 보강 의무
- 시트 매핑 충돌 1건 (마스터 vs 단가인상) — 본 §2.2 명세
- 토큰 매핑 불일치 3건 (TOKEN_003 declare-only, TOKEN_004 dual-role, TOKEN_005/007 분기) — 본 §3.2 명세

---

_생성: Phase 2 Cross-review / 무손실 / 추측 금지 / 단일 산출 파일 / 한국어_
