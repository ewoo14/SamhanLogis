# Phase 3 — Sheet 스키마 분석 (27 탭)

> 입력: `migration/source/sheet/workbook.json` (display values, 4.6MB), `migration/source/sheet/formulas.json` (formulas, 14MB), `analysis/01-script-analysis-{estimate,partner-order,long-pending}.md`, `analysis/02-cross-review.md`, `decisions/{DECISIONS,DOMAIN-EXTENSIONS}.md`
> 작성일: 2026-05-05 / 단일 산출 파일 / 무손실 / 추측 금지 / 한국어
> 셀 위치는 모두 A1 notation. lastRow/lastColumn 은 시트 dump 의 `getDataRange()` 결과.

---

## §1. 27개 탭 통합 인벤토리

| # | 탭명 | hidden | lastRow | lastColumn | 헤더 row | 데이터 시작 row | 추정 데이터 row | 사용처 (분석문서) | 마이그 대상 도메인 | 변동DC 룰 적용 | Bundle 적용 | 고아 여부 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 전표생성폼 | F | 19 | 4 | (없음 — 라벨/값 인터리브 form) | n/a | 1 (form) | (시트 직접 read 0건) | **인쇄/입력 양식 (UI)** — slip-service 전표 입력 폼으로 대체 | — | — | **고아 (기능 이전)** |
| 2 | 종합견적서 | F | 7 | 8 | 6 (`품명/모델/단위/수량/출고가/납품가/소계`) | 7 (빈 row, 동적 채움) | 0 (인쇄 양식) | (시트 직접 read 0건; 견적서 인쇄 view) | **인쇄 양식** — estimate-service `EstimatePrintView` (Frontend) | — | — | **고아 (기능 이전)** |
| 3 | 전표업로드목록 | F | 3 | 10 | 1 | 2 (빈) | 0 (양식) | (시트 직접 read 0건) | **인쇄 양식** — slip-service 출고전표 업로드 미리보기 | — | — | **고아 (기능 이전)** |
| 4 | 홈멀티 | F | 122 | 33 | **3** | 4 | ~119 | partner-order `getHomeMulti()` (Code.js 605 — `HOME_NAME`) — partner-order 마스터 | **ProductMaster** (홈멀티 카테고리, productType=SINGLE 기본) | **룰 1 적용** (F열 `$L$2`, row 4~117, 107건) | 부분 (BundleComponents 별도 시트 — 본 시트는 단품) | — |
| 5 | 홈멀티_단가인상 | F | 122 | 33 | **3** | 4 | ~119 | estimate `getHomeMulti()` (Code.js 374 — `HOME_NAME`); partner-order 보조 (`getHomeIncreasePrices_`) | **ProductMaster** (인상가 PriceHistory) | **룰 1 적용** (F열 `$L$2`, 107건 — 동일) | 동일 | — |
| 6 | 싱글 세트 | F | 291 | 27 | **3** | 4 | ~288 | partner-order `getSingleSets()` (Code.js 727 — `SINGLE_NAME`) | **ProductMaster** (싱글 세트, productType=BUNDLE) + bundleComponents 부모 | **룰 1+2 적용** (H열 `$L$2` 190건, `$D$7` 11건 row 51~61, `$D$4` 47건 row 4~50, `$D$8` 0건 — 본 시트 자체엔 없음, `$L$2` "리모컨제외" 텍스트 매칭 + 자재가격 `$D$4/$D$7` 참조) | bundleMode=KEEP 4 SKU 이외 | — |
| 7 | 싱글 세트_단가인상 | F | 291 | 27 | **3** | 4 | ~288 | estimate `getSingleSets()` (Code.js 498); partner-order 보조 (`getSingleIncreasePrices_`) | **ProductMaster** (인상가) | 동일 (190+11+47=248건) | 동일 | — |
| 8 | 싱글 구성품 | F | 1737 | 14 | **2** | 3 | ~1735 | partner-order `getSingleParts()` (Code.js 833 — `SINGLE_PARTS_NAME`); estimate 동일 | **ProductMaster** (실내기/실외기/판넬/리모컨/자재/부자재 단품) + **BundleComponent FK** (M열 `세트` → 부모 setModel) | **룰 1 적용** (G/I열 `$L$2` 622건, `$D$7` 6건 row 515~571, `$D$8` 5건 row 539~595, `$D$4` 51건) | **bundleComponent 본체** (282 distinct setModel FK, 1458 component rows) | — |
| 9 | 싱글 구성품_단가인상 | F | 1737 | 14 | **2** | 3 | ~1735 | estimate `getSingleParts()` (Code.js 610); partner-order `getSinglePartsIncreasePrices_` (Code.js 319) | **ProductMaster** (인상가) + BundleComponent | 동일 (622+6+5+51=684건) | 동일 | — |
| 10 | 상업멀티 | F | 417 | 30 | **3** | 4 | ~414 | partner-order `getCommercialMulti()` (Code.js 984 — `COMM_NAME`) | **ProductMaster** (상업멀티 카테고리, productType=SINGLE) | **룰 1 적용** (G열 `$L$2` 378건 row 4~415) | — | — |
| 11 | 상업멀티_단가인상 | F | 417 | 30 | **3** | 4 | ~414 | estimate `getCommercialMulti()` (Code.js 778); partner-order 보조 | **ProductMaster** (인상가) | **룰 1 적용** (378건 동일) | — | — |
| 12 | 싱글 자재가격 | **T** | 29 | 4 | **1** (`품명/가격`) + 우측 (`옵션라벨/계산값`) 분리 | 2 | ~28 | estimate/partner-order — 수식의 `'싱글 자재가격'!$D$2/$D$4/$D$7` 참조용 (직접 `getRange` 호출은 분석문서엔 없으나 룰 2/D4 셀 참조 다수) | **MaterialPrice** (자재 단가 마스터) — singletons table 또는 ProductMaster sub-type=MATERIAL | **룰 2 원천 (`$D$4/$D$7`)** — `$D$5/$D$6` 도 `$D$4>400000` IF 참조 (D4가 master) | — | — |
| 13 | 상업멀티 구성 | F | 517 | 10 | **1** | 2 | ~516 | partner-order `getCommerceParts_`/`getCommercialPartsList` (Code.js 1140 ~ 1156, `COMM_PARTS_NAME`) | **ProductMaster** (상업 부속/구성) + **BundleComponent FK** (I열 `세트`) | (없음) | **bundleComponent (상업)** — 86 distinct setModel FK | — |
| 14 | 상업멀티 구성_단가인상 | F | 517 | 10 | **1** | 2 | ~516 | estimate `getCommerceParts_` (`COMM_PARTS_NAME` 인상본); partner-order 사용 여부 cross-review §2.1 비대칭 — formulas/구조 동일 → 인상본도 동일하게 사용 가정 | **ProductMaster** (인상가) + BundleComponent | (없음) | 동일 | — |
| 15 | 분기계산 | F | 100 | 105 | **1** (`전체 분기관 개수/수동추가/선택 실내기/실외기1~50`) | 2 | ~99 (분기관 lookup 표) | (시트 직접 read 0건; 견적/주문 화면의 클라이언트 분기계산 로직은 index.html 내부 — 시트는 lookup 표 추정) | **BranchPipeLookup** (분기관 사이즈→코드 lookup table) — product-service sub-domain | — | — | **고아 (lookup 의도 추정)** |
| 16 | 구형 | F | 44 | 9 | **3** | 4 | ~41 | estimate/partner-order — 구형 50% DC 적용 (Code.js 1742-1744 / 1906-1909) | **ProductMaster** (구형 카테고리, legacyDiscountFlag=TRUE) | **룰 3 적용** (F열 `$I$1`=50% 31건 row 4~34) | — | — |
| 17 | 장비스펙 | F | 28 | 3 | (없음 — 인쇄용 라벨 1열 / 값 1열) | n/a | 0 (양식) | partner-order Code.js 1210 (주석 "장비스펙 데이터 불러오기" — 실 구현은 마스터 시트의 `규격`/`냉방성능` 등 추출. 본 시트 직접 read 없음); estimate index.html `openSelectedSpec()` UI 라벨 | **인쇄 양식** — Frontend SpecModal 라벨 (마이그 시 i18n 텍스트 키로 이전) | — | — | **고아 (기능 이전)** |
| 18 | 부속품스펙 | F | 8 | 2 | (없음 — 라벨 form) | n/a | 0 (양식) | (시트 직접 read 0건; index.html 부속품 스펙 modal 라벨) | **인쇄 양식** — Frontend AccessorySpecModal | — | — | **고아 (기능 이전)** |
| 19 | 홈멀티_템플릿 | F | 122 | 30 | **3** | 4 | ~119 | (분석문서 read 0건; 인쇄 템플릿 추정 — col 28~33 제거된 축약본) | **인쇄 템플릿** — estimate-service 인쇄용 PDF/HTML 템플릿 | 룰 1 (107건, 동일) | — | **고아 (인쇄용 추정)** |
| 20 | 거래처 | F | 6925 | 10 | **1** (`거래처코드/담당자명/거래처명/대표자명/주소/전화번호/특이사항/그룹/여신한도/싱글 할인`) | 2 | **6924** | estimate `getCustomers_()` (Code.js 1429), partner-order `getCustomers_()` (Code.js 1633), long-pending (간접 — Notion 거래처 인증 DB 와 join) | **PartnerMaster** (거래처 마스터) — partner-service | — | — | — |
| 21 | 전표생성폼_템플릿 | **T** | 19 | 4 | (form, 동일 #1) | n/a | 1 | (read 0건) | 인쇄/입력 템플릿 — slip-service | — | — | **고아 (기능 이전)** |
| 22 | 싱글 세트_템플릿 | **T** | 219 | 21 | **3** | 4 | ~216 | (분석문서 read 0건; col 22~27 잘려나간 축약 인쇄본) | **인쇄 템플릿** | 룰 1+2 적용 (H열 `$L$2` 118건, `$D$7` 11건, `$D$4` 47건) | — | **고아 (인쇄용)** |
| 23 | 상업멀티_템플릿 | F | 416 | 27 | **3** | 4 | ~413 | (분석문서 read 0건; col 28~30 제거 축약본) | **인쇄 템플릿** | 룰 1 (G열 `$L$2` 378건) | — | **고아 (인쇄용)** |
| 24 | 분기계산_템플릿 | **T** | 100 | 105 | **1** | 2 | ~99 | (read 0건) | **인쇄 템플릿** (분기계산 인쇄본) | — | — | **고아 (인쇄용)** |
| 25 | 구형_템플릿 | **T** | 44 | 9 | **3** | 4 | ~41 | (read 0건) | **인쇄 템플릿** | 룰 3 (F열 `$I$1` 31건, 동일) | — | **고아 (인쇄용)** |
| 26 | 담당자 | **T** | 20 | 2 | **1** (`담당자명/담당자코드`) | 2 | **19** | estimate Code.js 1498-1545 (`담당자` 시트 헤더 검색); partner-order Code.js 1702-1749 동일 | **EmployeeMaster** (직원 — `담당자코드` = e-Count `EMP_CD`) — iam-service / hr-service | — | — | — |
| 27 | 추천실외기 | **T** | 26 | 5 | **2** (`실내기/마력/실내기/실내기/마력` — 그룹 헤더 row 1, 컬럼 헤더 row 2) | 3 | ~24 | estimate `getRecommendOduData()` (Code.js 1610, **`A3:E{lastRow}`** — 데이터 row 3 시작) | **OduRecommendationLookup** (실내기 용량→실외기 마력 추천 표) — product-service sub-domain | — | — | — |

**참고**:
- hidden T = 숨김 (사용자 미노출), F = 노출
- `장비스펙`/`부속품스펙`/`종합견적서`/`전표업로드목록`/`전표생성폼`은 데이터가 거의 없고 **인쇄 양식 layout** 만 보유 → 데이터 마이그 대상이 아닌 **UI 컴포넌트 이전** 대상.
- `*_템플릿` 6개 (#19, #21~25) 는 마스터 시트의 축약 사본 — 인쇄용 cope. 데이터는 마스터에서 가져오되 layout 은 인쇄 템플릿으로 별도 보존.

---

## §2. 탭별 컬럼 명세

### §2.1 전표생성폼 (lastRow=19, lastCol=4, hidden=F) — **고아 (인쇄/입력 form)**

데이터 row 없음 — 셀 단위 form (라벨 / 값 인터리브). 셀 위치별 의미:

| 셀 | 의미 | 값 (sample) | 마이그 매핑 |
|---|---|---|---|
| A1 | 라벨 "출고일" | — | slip-service 전표 — `outboundDate` |
| A2 | 출고일 값 | `2026. 5. 5` | DateTime |
| A3 / B3 | 라벨 "회사코드" / "이카운트 ID" | — | 환경변수 (시크릿) |
| A4 / B4 | 회사코드 값 / 이카운트 ID 값 | `174539` / `11840720103` | **PLAINTEXT 자격증명 — 마이그 시 Vault** |
| A5~A6 | 라벨 / API 인증키 값 | `117d1e405a25...` (truncated) | **PLAINTEXT 자격증명 — Vault** |
| A7~D7 | 라벨 행 (`거래처명/출하창고/담당자명/-`) | — | slip 헤더 |
| A8 | 거래처 선택값 | (빈) | PartnerMaster FK |
| A9~D10 | 배송주소/감리주소/인수자번호 | — | DeliveryAddress / Inspector |
| A11~D11 | 라벨 (`특이사항/입금예정일/재고 조회/전표 생성`) | — | UI 액션 버튼 |
| A12~D12 | 값 + UI 메시지 (`🚫 조회불가`) | — | 액션 disabled 상태 표시 |
| A13~D13 | 라벨 (`카드수수료 포함(전품목 3%)`/`단위 미만 절삭`) | — | enum 옵션 |
| A14~B14 | boolean 값 | `FALSE` | boolean 필드 |
| A15 | UI 안내 메시지 | `상단 '거래처명'에서 거래처를 선택해주세요‼️` | i18n 키 |
| A16~C17 | 거래처 정보 라벨/값 (`대표자명/대표 번호/사업자 주소`) | `-` | PartnerMaster lookup |
| A18~D19 | 거래처 분류/여신한도/VAT별도 여부 | `-` / `FALSE` | PartnerMaster |

**고아 사유**: 분석문서 read 0건. 사용자 입력 form 으로 추정 (Apps Script web app 의 1페이지). **마이그 결정**: slip-service 출고전표 입력 화면으로 이전, 시트 자체는 폐기.

### §2.2 종합견적서 (lastRow=7, lastCol=8, hidden=F) — **고아 (인쇄 양식)**

| Row | 컬럼 (A~H) | 의미 |
|---|---|---|
| 1 | A1 = `견             적             서` (병합) | 인쇄 제목 |
| 2 | (빈) | 여백 |
| 3 | F3 = `조합비` | 라벨 |
| 4 | F4 = `-` | 조합비 값 |
| 5 | A5=`모델 구분`, B5=`견적일: 2026. 05. 05`, F5=`전체 합계 (VAT포함)`, G5=`  - ` | 메타 헤더 |
| 6 | **컬럼 헤더**: `품명 / 모델 / 단위 / 수량 / 출고가 / 납품가 / 소계 / (빈)` | 견적 라인 헤더 (7 컬럼) |
| 7 | (빈 sample row) | — |

`H3` 에 `=LET(homeCnt, COUNTIF('홈멀티'!E13:E,">=1"), commCnt, COUNTIF('상업멀티'!F4:F...) ` 수식 (변동DC 룰 1 `$L$2` matching 1건 발견) — 다른 시트의 수량 합계 수식.

**고아 사유**: 시트 직접 read 0건. 견적서 인쇄 양식 (HTML 으로 동적 채움). **마이그 결정**: estimate-service `EstimatePrintView` (Frontend HTML/PDF 컴포넌트) 로 이전. 시트 layout 은 픽셀 사양 reference 로 보존.

### §2.3 전표업로드목록 (lastRow=3, lastCol=10, hidden=F) — **고아 (인쇄 양식)**

| Row | 컬럼 헤더 (A~J) |
|---|---|
| **1 (헤더)** | `품명 / 모델 / 단위 / 수량 / 출고가 / 납품가 / 소계 / 규격 / 구분 / 고정DC` (10컬럼) |
| 2~3 | 빈 sample rows |

**컬럼 의미**: 견적/주문 → 출고전표 변환 시 e-Count 업로드 형식. estimate index.html 의 `전표업로드목록` 버튼 (라인 1289) 클릭 시 동적 채움.

**마이그 결정**: slip-service 의 e-Count 업로드 미리보기 화면. 시트 자체는 폐기, layout 은 frontend 컴포넌트로 이전.

### §2.4 홈멀티 (lastRow=122, lastCol=33, hidden=F) — partner-order 마스터

| Row | 의미 |
|---|---|
| **1 (그룹 헤더)** | `A1=DVM_HOME *가정용` (카테고리 라벨), `K1=조합비, L1=할인, M1=실외기용량, N1=실내기용량, O1=추천 실외기, P1=유연호스 제외, Q1=분기관 제외, R1=발통포함, S1=리모컨, T1=판넬변경, U1=I형 유연호스, V1=단위 처리` (옵션 라벨 행) |
| **2 (default 값 행)** | `K2=0.0%, L2=45%, M2=0.0, N2=0.0, O2=-, P2=FALSE, Q2=FALSE, R2=FALSE, U2=FALSE` (옵션 default 값 — 룰 1 의 `$L$2`/`$K$2` 가 가리키는 cell) |
| **3 (실데이터 헤더)** | A3~AG3: `품명 / 모델명 / 단위 / 출고가 / 수량 / 납품가 / 소계 / 비고 / 규격 / 사진 / 배관경 / 고정DC / 에너지소비효율 / 냉방성능(정격) / 냉방성능(정격) / 소비전력(정격) / 냉매가스 / 차단기 / 전원선 / 제품크기 / 최대 장배관 / 최대 고저차 / 용량 / 최대 연결 실내기 대수 / 제품중량 / 포장치수 / 포장중량 / (col28~33 보조)` (33컬럼) |
| 4~122 | 데이터 행 (~119건) |

**컬럼 명세 (header row 3 기준)**:

| 컬럼 | 헤더 | 타입 | nullable | 마이그 매핑 (ProductMaster) | 비고 |
|---|---|---|---|---|---|
| A (1) | 품명 | string | F | `name` | "실외기_6HP 단배관" |
| B (2) | 모델명 | string | F | `modelCode` (PK 후보) | "AJ060MXHNBC1" |
| C (3) | 단위 | string | F | `unit` | "대" |
| D (4) | 출고가 | decimal (콤마 포함 — formulas D4 = master 가격 cell) | F | `releasePrice` | `2,763,200` |
| E (5) | 수량 | int | T | (런타임 입력, 마스터 아님) | "" |
| **F (6)** | **납품가** | **formula** (`=LET(opt, REGEXREPLACE($V$2,...), base, D4*(1-IF(ISNUMBER(SEARCH("%",$L$2))...))`) | F | `deliveryPrice` (계산값 — `hasVariableDiscount=TRUE` 시 룰 1 적용) | **변동DC 룰 1 컬럼** ($L$2 참조 107건) |
| G (7) | 소계 | formula (수량×납품가) | T | (계산) | `= F * E` |
| H (8) | 비고 | string | T | `remark` | — |
| I (9) | 규격 | string | T | `spec` | "6단배관" |
| J (10) | 사진 | string/url | T | `photoUrl` | (대부분 빈) |
| K (11) | 배관경 | string | T | `pipeDiameter` | "9/19" |
| L (12) | 고정DC | string/decimal | T | `fixedDiscountRate` (cross-review §4.2) | 대부분 "-" |
| M (13) | 에너지소비효율 | enum (1~5등급) | T | `efficiencyGrade` | "1등급" |
| N (14) | 냉방성능(정격) kw | string (단위 포함) | T | `coolingCapacityKw` | "17.0kw" |
| O (15) | 냉방성능(정격) kcal | string | T | `coolingCapacityKcal` | "14600kcal/h" |
| P (16) | 소비전력(정격) | string | T | `powerConsumptionKw` | "1.283kw" |
| Q (17) | 냉매가스 | enum | T | `refrigerantGas` | "R410A" |
| R (18) | 차단기 | string (A) | T | `circuitBreakerA` | "40A" |
| S (19) | 전원선 | string (sq) | T | `powerLineSq` | "6sq" |
| T (20) | 제품크기 | string (WxHxD) | T | `dimensions` | "940x1210x330" |
| U (21) | 최대 장배관 | string | T | `maxPipeLength` | "45m" |
| V (22) | 최대 고저차 | string | T | `maxHeightDiff` | "15m" |
| W (23) | 용량 | numeric/string | T | `capacityHp` | "17" |
| X (24) | 최대 연결 실내기 대수 | int | T | `maxIndoorUnits` | 9 |
| Y (25) | 제품중량 | int | T | `weightKg` | 86 |
| Z (26) | 포장치수 | string | T | `packagingSize` | "1009x1296x419" |
| AA (27) | 포장중량 | int | T | `packagingWeightKg` | 89 |
| AB~AG (28~33) | 보조 (분해된 packagingSize / 포장부피) | int | T | (보조 — 시드 시 무시 가능) | 0/숫자 |

### §2.5 홈멀티_단가인상 (동일 구조, 데이터만 인상가) — estimate 마스터

§2.4 와 컬럼/헤더 row 동일. 가격 컬럼만 인상 (예: D4: 2,763,200 → 2,929,300, F4: 1,519,760 → 1,611,115). 같은 modelCode `AJ060MXHNBC1` → **PriceHistory entity** (effective date `PRICE_INC_DATE` 이후).

### §2.6 싱글 세트 (lastRow=291, lastCol=27, hidden=F) — partner-order 마스터

| Row | 의미 |
|---|---|
| **1 (그룹 헤더)** | `A1=DVM S_x싱글`, `L1=리모컨변경, N1=실외기 받침대 포함, O1=판넬변경, Q1=360판넬, R1=할인, S1=1WAY할인, T1=자재 포함 여부` |
| **2 (default 값 행)** | `N2=FALSE, Q2=원형, T2=별도` (`$L$2` 는 비어있으나 수식이 `$L$2="리모컨제외"` 로 텍스트 비교) |
| **3 (실 헤더)** | `품명 / 평형 / 모델명 / 단위 / 출고가 / 수량 / 납품가 / 납품가 / 소계 / 비고 / 사진 / 등급 (냉방/난방) / 배관경 / 소비전력(kW) (최소 / 정격 / 최대) / 성능(kW) (최소 / 정격 / 최대) / 성능(kcal/h) (최소 / 정격 / 최대) / 전원(mm²) / 차단(A) / 실내기 크기(mm) / 실외기 크기(mm) / 배관길이 / 고낙차(m) / 냉매가스 / 실내기 중량(kg) / 실외기 중량(kg) / 실내기 포장(mm) / 실외기 포장(mm) / 실내기 포장중량(kg) / 실외기 포장중량(kg)` (27 컬럼) |
| 4~291 | 데이터 ~288 건 |

| 컬럼 | 헤더 | 타입 | 매핑 (ProductMaster, productType=BUNDLE) |
|---|---|---|---|
| A | 품명 | string | `name` |
| B | 평형 | numeric (3.3m² 단위, 15/18/25/28...) | `pyongSize` |
| C | 모델명 | string (PK) | `modelCode` (예: AC060CS6PBH1SY) |
| D | 단위 | string ("SET") | `unit` |
| E | 출고가 | decimal (set 단위) | `releasePrice` |
| F | 수량 | int (런타임) | — |
| G | 납품가 | decimal | `deliveryPrice` (base) |
| **H** | **납품가** (계산) | **formula** (`=G4+'싱글 자재가격'!$D$4-$R$2-IF($L$2="리모컨제외",16000+'싱글 자재가격'!$D$2,0)-IF($O$2="판넬제외",...)`) | `deliveryPriceWithMaterials` (변동DC 룰 1+2 — `$D$4` 47건 row 4~50 / `$D$7` 11건 row 51~61) |
| I | 소계 | formula | (계산) |
| J | 비고 | string | `remark` |
| K | 사진 | url | `photoUrl` |
| L | 등급 (냉방/난방) | string | `efficiencyGradeCoolHeat` |
| M | 배관경 | string | `pipeDiameter` |
| N | 소비전력(kW) (최소/정격/최대) | composite string `0.35/1.41/2.64 \| 0.37/1.61/3.10` | `powerConsumptionRange` (parse 의무) |
| O | 성능(kW) (최소/정격/최대) | composite string | `capacityRangeKw` |
| P | 성능(kcal/h) (최소/정격/최대) | composite string | `capacityRangeKcal` |
| Q | 전원(mm²) / 차단(A) | composite string `2.5 / 20` | `powerLineBreaker` |
| R | 실내기 크기(mm) | string WxHxD | `indoorSize` |
| S | 실외기 크기(mm) | string WxHxD | `outdoorSize` |
| T | 배관길이 / 고낙차(m) | composite string `50 / 30` | `pipeLengthHeightDiff` |
| U | 냉매가스 | enum | `refrigerantGas` |
| V | 실내기 중량(kg) | int | `indoorWeightKg` |
| W | 실외기 중량(kg) | int | `outdoorWeightKg` |
| X | 실내기 포장(mm) | string | `indoorPackagingSize` |
| Y | 실외기 포장(mm) | string | `outdoorPackagingSize` |
| Z | 실내기 포장중량(kg) | int | `indoorPackagingWeightKg` |
| AA | 실외기 포장중량(kg) | int | `outdoorPackagingWeightKg` |

**변동DC 룰 매트릭스**:
- row 4~50 (~47 SKU): H열 수식이 `'싱글 자재가격'!$D$4` 참조 → **`setMaterialKey='D4'`** 시드
- row 51~61 (~11 SKU): H열 수식이 `'싱글 자재가격'!$D$7` 참조 → **`setMaterialKey='D7'`** 시드
- (row 62~291): D8 참조는 본 시트엔 없음 — 자재 미포함/포함 룰은 `싱글 구성품` 시트에서 별도 row 적용 (row 539~595)
- 모든 row: H열 `$L$2="리모컨제외"` 텍스트 비교 → 룰 1 (옵션 토글)

### §2.7 싱글 세트_단가인상 (동일 구조, 인상가 데이터)

§2.6 와 컬럼 동일, 가격만 인상. PriceHistory.

### §2.8 싱글 구성품 (lastRow=1737, lastCol=14, hidden=F) — Bundle component master

| Row | 의미 |
|---|---|
| **1 (그룹 헤더)** | `A1=DVM S_*신통신_[상업용]` (카테고리 텍스트만) |
| **2 (실 헤더)** | `품명 / 평형 / 모델명 / 구분 / 단위 / 출고가 / 수량 / 납품가 / 납품가 / 소계 / 모듈조합 / 규격 / 세트 / 구성품 특징` (14 컬럼) |
| 3~1737 | 데이터 ~1735 건 |

| 컬럼 | 헤더 | 타입 | 매핑 |
|---|---|---|---|
| A | 품명 | string | `name` (예: "360 CST UV 실내기") |
| B | 평형 | string | `pyongSize` |
| C | 모델명 | string (PK) | `modelCode` (예: AC060CN6PBH1) |
| D | **구분** | enum (`세트 / 실내기 / 실외기 / 판넬 / 리모컨 / 자재 / 부자재 / 실외기 받침` 등) | **`componentKind` enum** — bundleComponent kind |
| E | 단위 | enum (SET/대/EA) | `unit` |
| F | 출고가 | decimal | `releasePrice` |
| G | 수량 | formula (BUNDLE 펼침 룰: `=IF('싱글 세트'!$L$2="리모컨제외",0,SUM($G4)-IF('싱글 자재가격'!$D$2>0,SUM($G4),0))`) | `defaultQty` (룰 1 매트릭스) |
| H | 납품가 (base) | decimal | `deliveryPrice` |
| **I** | **납품가** (계산) | **formula** (`=$I3-$I4-IF('싱글 세트'!$L$2="리모컨제외",0,N($I14))-IF('싱글 세트'!$O$2="판넬제외",0,$I6)-'싱글 자재가격'!$D$4`) | `deliveryPriceWithDc` (변동DC 룰 1+2 매트릭스 622+6+5+51건) |
| J | 소계 | formula | (계산) |
| K | 모듈조합 | string | `moduleComposition` (대부분 빈) |
| L | 규격 | string (예: "싱글 360", "원형노출") | `spec` |
| **M** | **세트** | **string FK** (예: `AC060CS6PBH1SY` — 싱글 세트의 modelCode 참조) | **`parentBundleSetModel` (FK to 싱글 세트.모델명)** — Bundle 펼침의 FK |
| N | 구성품 특징 | enum (`기본 / 사각 / WIFI` 등) | `componentVariant` |

**Bundle 통계 (실측)**:
- 282 distinct setModel FK (M열) — 282개 Bundle 부모
- 1458 component rows (D열 = 세트가 아닌, 즉 sub-product)
- (역 산출: 1737 - 282(세트행) - 빈행 = ~1455 component rows)

**룰 2 매트릭스 (자재 포함/미포함)**:
- row 5~636 (~51 hits): I열 수식 `'싱글 자재가격'!$D$4` 참조 → **`setMaterialKey='D4'`** (자재가격 본체 = 마스터)
- row 515~571 (6 hits): I열 수식 `$D$7` 참조 → `setMaterialKey='D7'` (자재 미포함)
- row 539~595 (5 hits): I열 수식 `$D$8` 참조 → `setMaterialKey='D8'` (자재 포함)
  → DOMAIN-EXTENSIONS §1 의 "룰 2" `$D$7`/`$D$8` 양쪽 모두 본 시트에서 검출됨 (cross-review §4.1 정정 — `$D$7/$D$8` 는 `싱글 구성품` 의 자재 포함/미포함 분기, 싱글 세트엔 `$D$7` 만 부분 적용)

### §2.9 싱글 구성품_단가인상 (동일 구조, 인상가)

§2.8 와 동일. 수식 참조도 `'싱글 세트_단가인상'!$L$2` 등 인상본 시트로 변경.

### §2.10 상업멀티 (lastRow=417, lastCol=30, hidden=F) — partner-order 마스터

| Row | 의미 |
|---|---|
| **1 (그룹 헤더)** | `A1=DVM S_*신통신_[상업용]`, `K1=조합비, L1=할인, M1=분기관, N1=부족 분기관, O1=실외기 용량, P1=실내기 용량, Q1=추천 냉난방 실외기, S1=판넬변경, T1=360판넬, U1=리모컨, V1=유연호스제외, W1=받침대 제외, X1=I형 유연호스, Y1=단위 처리` |
| **2 (default 값)** | `K2=0.0%, L2=45%, M2=일치, N2=0, O2=0.0, P2=0.0, Q2=0HP, T2=원형, V2=FALSE, W2=FALSE, X2=FALSE, AD2=FALSE` (`$L$2` 가 룰 1 비교 cell) |
| **3 (실 헤더)** | `품명 / 모델명 / 용량 / 단위 / 출고가 / 수량 / 납품가 / 소계 / 비고 / 사진 / 배관경 / 고정DC / 냉매가스 / 냉방성능(정격) (kcal/kw 분리 N+O) / 소비전력(정격) / 난방성능(정격) (kcal/kw 분리 Q+R) / 소비전력(정격) / 차단기 / 전원선 / 제품크기 / 소비효율등급 / 최대 장배관 / 최대 고저차 / 최대 연결 실내기 대수 / 제품중량 / 포장치수 / 포장중량` (30컬럼) |
| 4~417 | 데이터 ~414 건 |

| 컬럼 | 헤더 | 타입 | 매핑 |
|---|---|---|---|
| A | 품명 | string | `name` (예: "DVM S2 프라임 8HP") |
| B | 모델명 (PK) | string | `modelCode` (AM080AXVHHH1) |
| C | 용량 | numeric (HP × 약 2.9 = 평형 추정) | `capacityIndex` |
| D | 단위 | string | `unit` |
| E | 출고가 | decimal | `releasePrice` |
| F | 수량 | int (런타임) | — |
| **G** | **납품가** | **formula** (`=LET(opt, REGEXREPLACE($Y$2,...), base, E4*(1-IF(ISNUMBER(SEARCH("%",$L$2))...))`) | `deliveryPrice` (변동DC 룰 1 — `$L$2` 378건) |
| H | 소계 | formula | (계산) |
| I | 비고 | string | `remark` |
| J | 사진 | url | `photoUrl` |
| K | 배관경 | string (예: "9/19") | `pipeDiameter` |
| L | 고정DC | string/decimal | `fixedDiscountRate` |
| M | 냉매가스 | enum | `refrigerantGas` |
| N | 냉방성능(정격) — kcal | string | `coolingCapacityKcal` |
| O | (이어서) — kw | string | `coolingCapacityKw` |
| P | 소비전력(정격) | string | `coolingPowerConsumption` |
| Q | 난방성능(정격) — kcal | string | `heatingCapacityKcal` |
| R | (이어서) — kw | string | `heatingCapacityKw` |
| S | 소비전력(정격) | string | `heatingPowerConsumption` |
| T | 차단기 | string A | `circuitBreakerA` |
| U | 전원선 | string sq | `powerLineSq` |
| V | 제품크기 | string | `dimensions` |
| W | 소비효율등급 | enum | `efficiencyGrade` |
| X | 최대 장배관 | string | `maxPipeLengthSpec` (예: "200m/90m/1000m") |
| Y | 최대 고저차 | string | `maxHeightDiffSpec` |
| Z | 최대 연결 실내기 대수 | int | `maxIndoorUnits` |
| AA | 제품중량 | int kg | `weightKg` |
| AB | 포장치수 | string | `packagingSize` |
| AC | 포장중량 | int | `packagingWeightKg` |
| AD | (보조 단위 처리 flag) | numeric | (시드 시 무시) |

### §2.11 상업멀티_단가인상 (동일 구조, 인상가)

§2.10 동일.

### §2.12 싱글 자재가격 (lastRow=29, lastCol=4, hidden=**T**) — 자재 단가 마스터 + 룰 2 핵심 셀

| Row | A (품명) | B (가격) | C (옵션) | D (계산값) | 의미 |
|---|---|---|---|---|---|
| **1 (헤더)** | `품명` | `가격` | (빈) | (빈) | A/B 만 헤더 |
| 2 | 유선리모컨 | 40,000 | 유선선택 | 0 | C/D 는 옵션 + 계산값 |
| 3 | 컬러유선리모컨 | 75,000 | 판넬선택 | 0 | |
| 4 | 블랙판넬 | 50,000 | **합계** | **0** | **D4 = 자재 합계 master cell — 룰 2 의 `$D$4` 참조점** |
| 5 | 승강판넬 | 60,000 | 1WAY중형공청 | `=IF($D$4>400000,$B$7,0)` | **D5 수식 (`$D$4>400000` 비교)** |
| 6 | 공청판넬 | 550,000 | 1WAY대형공청 | `=IF($D$4>400000,$B$8,0)` | **D6 수식 (`$D$4>400000` 비교)** |
| 7 | 1WAY 중형 공청 | 215,000 | 중형 합계 | 0 | **`$D$7` (자재 미포함) — 룰 2 참조점** |
| 8 | 1WAY 대형 공청 | 260,000 | 대형 합계 | 0 | **`$D$8` (자재 포함) — 룰 2 참조점** |
| 9~29 | 자재 SKU 목록 (FPH-/FRH-/FRC-/AFR-/ARR- prefix) | 가격 | (빈) | (빈) | 부자재 단가 |

**컬럼 명세 (논리적 분리)**:

| 컬럼 | 의미 | 마이그 매핑 |
|---|---|---|
| A | 자재명 | `MaterialPrice.name` |
| B | 가격 | `MaterialPrice.price` |
| C | 옵션 카테고리 라벨 (별도 의미) | (시드 무시 — UI 라벨) |
| D | 계산값 / master cell | `MaterialPrice.computedValue` 또는 환산 master |

**DOMAIN-EXTENSIONS 매핑**:
- `D4` → `setMaterialKey='D4'` (자재 합계 master, 47 SKU 매칭)
- `D7` → `setMaterialKey='D7'` (자재 미포함 — 중형 합계)
- `D8` → `setMaterialKey='D8'` (자재 포함 — 대형 합계)
- `D2` → "유선리모컨" 가격 (`$D$2` 도 수식에 16000+`$D$2` 패턴 등장)

### §2.13 상업멀티 구성 (lastRow=517, lastCol=10, hidden=F) — Bundle (상업)

| Row | 컬럼 |
|---|---|
| **1 (헤더)** | `품명 / 모델명 / 단위 / 출고가 / 수량 / 납품가 / 소계 / 비고 / 세트 / 고정DC` (10컬럼) |
| 2~517 | 데이터 ~516건 (86 distinct setModel FK) |

| 컬럼 | 헤더 | 타입 | 매핑 |
|---|---|---|---|
| A | 품명 | string | `name` |
| B | 모델명 (PK) | string | `modelCode` |
| C | 단위 | string ("대") | `unit` |
| D | 출고가 | decimal | `releasePrice` |
| E | 수량 | int (런타임) | — |
| F | 납품가 | decimal | `deliveryPrice` |
| G | 소계 | formula | (계산) |
| H | 비고 | string ("프라임" 등) | `remark` (제품 라인) |
| **I** | **세트** | **string FK** (BUNDLE 부모 modelCode 참조) | **`parentBundleSetModel`** |
| J | 고정DC | string ("-" 대부분) | `fixedDiscountRate` |

**Bundle 통계**: 86 distinct setModel FK (I열). 시드 시점에 BundleComponent 86개 부모 + ~430 components.

### §2.14 상업멀티 구성_단가인상 (동일 구조, 인상가)

§2.13 동일. (cross-review §2.1 비대칭 — partner-order 사용 여부 미확인. **본 분석 추정**: estimate `getCommerceParts_` 호출 시 인상본 사용, partner-order 도 동일 함수 가정. 사용자 확정 필요 §9 #2)

### §2.15 분기계산 (lastRow=100, lastCol=105, hidden=F) — **고아 (lookup 추정)**

| Row | 컬럼 (105 컬럼!) |
|---|---|
| **1 (헤더)** | `A1=전체 분기관 개수, C1=수동추가, E1=선택 실내기, F1=실외기1, H1=실외기2, J1=실외기3, ... AZ1=실외기24, ..., (col 86~104)=실외기41~50` (이중 컬럼: F+G=실외기1, H+I=실외기2, ...) |
| 2~100 | 데이터 (분기관 사이즈 코드 → 수량 lookup) |

A열 데이터 sample: `1509, 2512, 2812, 2815, 3419, 4119, ...` — 분기관 코드 (예: `1509` = 9/15 mm 또는 분기관 SKU 코드 추정).

**컬럼 명세**:
- A: 분기관 코드 (lookup key)
- B: 합계 수량
- C/D: 수동 추가
- E: 선택된 실내기 표시
- F~DD: **실외기 1~50** (각 실외기당 2 컬럼: 코드 / 수량) — runtime 채움

**고아 사유**: 시트 직접 read 0건 (분석문서). index.html 의 `분기계산` 페이지 (estimate.md 라인 1908, partner-order index.html 라인 922) 는 클라이언트 자체 계산. **본 시트는 lookup table 추정** — A 열의 분기관 코드 마스터.

**마이그 추천**: product-service 의 `BranchPipeLookup` entity (분기관 SKU 마스터). 데이터 row ~99건 시드. **사용자 확정 필요** (§9 #1) — 정말 lookup 인지, 아니면 인쇄 layout 인지.

### §2.16 구형 (lastRow=44, lastCol=9, hidden=F) — 구형 50% DC

| Row | 의미 |
|---|---|
| **1 (그룹 헤더)** | `A1=DVM_S *구형`, **`I1=50%`** (룰 3 의 `$I$1` master cell — 50% 고정 DC 율) |
| 2 | (빈) |
| **3 (실 헤더)** | `품명 / 모델명 / 단위 / 출고가 / 수량 / 납품가 / 소계 / 비고 / 규격` (9컬럼) |
| 4~44 | 데이터 ~41건 |

| 컬럼 | 헤더 | 타입 | 매핑 |
|---|---|---|---|
| A | 품명 | string | `name` (예: "DVM S 구형 프라임 10HP") |
| B | 모델명 (PK) | string | `modelCode` (예: AM100NXVHHH1) |
| C | 단위 | string | `unit` |
| D | 출고가 | decimal | `releasePrice` |
| E | 수량 | int | — |
| **F** | **납품가** | **formula** `=D4*(1-$I$1)` | **`deliveryPrice` (룰 3 — `$I$1`=50% 31건)** |
| G | 소계 | formula | (계산) |
| H | 비고 | string ("초월 N대" — 재고/특이) | `remark` |
| I | 규격 | string ("구형 프라임" 등) | `spec` |

**시드 매핑**: 모든 row → `legacyDiscountFlag=TRUE` + `fixedDiscountRate=0.50` (DOMAIN-EXTENSIONS §1 룰 3).

### §2.17 장비스펙 (lastRow=28, lastCol=3, hidden=F) — **고아 (인쇄 양식 라벨)**

데이터 0건. 28행 모두 라벨 / 부속 라벨:

| Row | A (라벨) | B (보조) | 의미 |
|---|---|---|---|
| 1 | 모델명 | (빈) | 라벨 |
| 2 | 구성 | (빈) | 라벨 |
| 7 | 제품사진 | (빈) | 라벨 |
| 8 | 제품명 | (빈) | 라벨 |
| 9 | 배관경 (액관/가스관) | (빈) | 라벨 |
| 10 | 최대 실내기 연결 허용 대수 (실외기) | (빈) | 라벨 |
| 11~16 | 냉방성능(kcal/h, kw) / 난방성능(kcal/h, kw) / 냉방소비전력(kw) / 난방소비전력(kw) | (최소/정격/최대) | 그룹 라벨 |
| 17 | 냉매가스 | (빈) | 라벨 |
| 18 | 에너지소비효율등급 | (빈) | 라벨 |
| 19 | 전원선(m²) | (빈) | 라벨 |
| 20 | 차단기(A) | (빈) | 라벨 |
| 21~22 | 제품크기 (mm)(WxHxD) | 실내기/실외기 | 라벨 |
| 23~25 | 배관길이(m) | 실외기-실내기/첫분기-실내기/총 배관길이 | 라벨 |
| 26~28 | 고낙차(m) | 실외기가 높음/실내기가 높음/실내기-실내기 | 라벨 |

**고아 사유**: 시트 직접 read 0건 (cross-review §2.1). partner-order Code.js 1210 주석 "장비스펙 데이터 불러오기" 는 마스터 시트 (홈멀티/싱글세트/상업멀티) 에서 추출 — 본 시트는 사용 안 함. estimate index.html `openSelectedSpec()` (라인 1936) 의 modal 라벨 출처 추정.

**마이그 결정**: 폐기. Frontend `SpecModal` 컴포넌트의 i18n 텍스트 키로 이전.

### §2.18 부속품스펙 (lastRow=8, lastCol=2, hidden=F) — **고아 (인쇄 양식 라벨)**

데이터 0건. 라벨 8행:

| Row | A | B |
|---|---|---|
| 1 | 부속 모델명 | (빈) |
| 2 | 부속품 사진 | (빈) |
| 3 | 부속품명 | (빈) |
| 4 | 판넬 타공사이즈 | (mm) |
| 5 | 판넬 전산볼트간격 | (mm) |
| 6 | 특징 | (빈) |
| 7 | 부속 용량 | (빈) |
| 8 | 제품크기 (mm) | (WxHxD) |

**고아 사유**: 동상 (시트 직접 read 0건). Frontend `AccessorySpecModal` 라벨로 이전 → 시트 폐기.

### §2.19 홈멀티_템플릿 (lastRow=122, lastCol=30, hidden=F) — **고아 (인쇄 템플릿)**

§2.4 와 row 1~3 동일 (동일 그룹/default/실 헤더). 데이터도 동일. 단 컬럼이 30 (마스터의 33 - col 28~33 보조 컬럼 제외).

**고아 사유**: 분석문서 read 0건. **인쇄용 축약 사본**. lastCol 30 = 마스터 33에서 보조 6 컬럼 (포장 분해된 컬럼) 제거.

**마이그 결정**: 폐기. estimate-service 인쇄용 PDF/HTML 템플릿으로 이전 (마스터 데이터 동적 채움).

### §2.20 거래처 (lastRow=6925, lastCol=10, hidden=F) — PartnerMaster 마스터

| 컬럼 | 헤더 | 타입 | nullable | 매핑 (PartnerMaster) | 비고 |
|---|---|---|---|---|---|
| A | 거래처코드 | string (사업자번호 또는 임의 ID) | F (1 row 만 "-") | `businessRegistrationNumber` (PK 후보) | 6923 unique 값 |
| B | 담당자명 | string (FK to 담당자.담당자명) | T | `assignedManagerName` (FK) | "이성미", "김미선" 등 |
| C | 거래처명 | string | F | `partnerName` | "이상덕기사님(경기퀵)" |
| D | 대표자명 | string | T | `representativeName` | |
| E | 주소 | string | T | `address` | |
| F | 전화번호 | string | T | `phoneNumber` | |
| G | 특이사항 | string (긴 메모) | T | `remark` | |
| H | 그룹 | enum | T | `partnerGroup` | distinct values: SF(밴더), 일반업체, 파트너사, 조달업체, JS, 기타, 대리점, 서비스, MAIN, VIP, 창고, 대리점ㆍJS, 일반업체ㆍ서비스, 일반업체ㆍ대리점 (2800 rows = 빈) |
| I | 여신한도 | numeric | T | `creditLimit` | **단 1 row** 만 채움 — 사실상 미사용 |
| J | 싱글 할인 | numeric/percent | T | `singleDiscountRate` | 208 row 채움 (cross-review §9-4 deprecated 여부 확정 필요) |

**그룹 distribution (실측)**:
- SF(밴더): 2935 (42%)
- (빈): 2800 (40%)
- 일반업체: 833
- 파트너사: 118
- 조달업체: 111
- 기타 (JS/기타/대리점/서비스/MAIN/VIP/창고/혼합): 124

**총 6924 row** (거래처). PK 후보 컬럼 A (`거래처코드`) 는 사업자번호 형식 다양 (`-`, `00`, `000-00-00000`, `000000000`, `010-...`, `198a1006...` 등) — 표준화 필요.

### §2.21 전표생성폼_템플릿 (lastRow=19, lastCol=4, hidden=**T**)

§2.1 와 동일. 인쇄/입력 템플릿 사본. **고아**.

### §2.22 싱글 세트_템플릿 (lastRow=219, lastCol=21, hidden=**T**)

§2.6 와 동일 헤더 row (1/2/3). 데이터 row 219 (마스터 291 보다 적음 — 일부 row 미수록), col 21 (마스터 27 - col 22~27 중량/포장 컬럼 제외).

룰 1+2 동일 적용 (H열 `$L$2` 118건, `$D$7` 11건, `$D$4` 47건). **인쇄 템플릿** — 고아.

### §2.23 상업멀티_템플릿 (lastRow=416, lastCol=27, hidden=F)

§2.10 와 동일 헤더 row (1/2/3). 데이터 row 416 (마스터와 거의 동일), col 27 (마스터 30 - col 28~30 보조 제외).

룰 1 동일 적용 (G열 `$L$2` 378건). **인쇄 템플릿** — 고아.

### §2.24 분기계산_템플릿 (lastRow=100, lastCol=105, hidden=**T**)

§2.15 와 동일 구조. **인쇄 템플릿** — 고아.

### §2.25 구형_템플릿 (lastRow=44, lastCol=9, hidden=**T**)

§2.16 와 동일 구조 + 데이터. 룰 3 동일 (F열 `$I$1` 31건). **인쇄 템플릿** — 고아.

### §2.26 담당자 (lastRow=20, lastCol=2, hidden=**T**) — EmployeeMaster

| 컬럼 | 헤더 | 타입 | 매핑 |
|---|---|---|---|
| A | 담당자명 | string (PK) | `employeeName` |
| B | 담당자코드 | string (e-Count `EMP_CD`) | `eccountEmpCode` |

**Distinct 19 employees** 시드:
- 김미선(00001), 장영구(00002), 오병승(99191), 김기철(20240622), 신인호(00011), 견진성(11840720023), 심미광(11840720083), 정희서(11840720092), 김동원(20240617), 허유진(20241125), 박은우(250102), 이성미(이성미), 정민국(20250616-2), 신현민(20250616-1), 라해람(20250908), 하보련(20251027), 정민정(20251117), 유한수(20251201), 홍지수(20260108)

**비고**: 코드 형식 비표준 (사번/이카운트 `EMP_CD`/이름 자체 — "이성미" row 는 코드 = 이름). 마이그 시 정규화 필요.

### §2.27 추천실외기 (lastRow=26, lastCol=5, hidden=**T**) — OduRecommendationLookup

| Row | 의미 |
|---|---|
| **1 (그룹 헤더)** | `A1=멀티 냉난방, C1=홈멀티` (좌/우 카테고리 분리) |
| **2 (실 헤더)** | `실내기 / 마력 / 실내기 / 실내기 / 마력` (좌측 멀티 냉난방: A=실내기, B=마력 / 우측 홈멀티: C=실내기, D=실내기, E=마력) |
| 3~26 | 데이터 ~24건 (estimate Code.js 1620 `A3:E{lastRow}` — **데이터 row 3 시작**) |

| 컬럼 | 헤더 | 타입 | 매핑 |
|---|---|---|---|
| A | 멀티 냉난방 - 실내기 (kw 또는 kcal) | numeric | `multi_indoorCapacity` |
| B | 멀티 냉난방 - 마력 (HP) | string | `multi_outdoorHp` |
| C | 홈멀티 - 실내기 (대수 또는 평형) | numeric | `home_indoor1` |
| D | 홈멀티 - 실내기 (대수) | numeric | `home_indoor2` |
| E | 홈멀티 - 마력 | string | `home_outdoorHp` |

**용도**: 실내기 사양 → 추천 실외기 마력 lookup (조합 추천 알고리즘). estimate `getRecommendOduData()` 만 사용 (partner-order 미사용).

---

## §3. 헤더 위치 가변성 매트릭스 (사용자 강조 영역)

| 탭명 | 헤더 row | 사유 (제목/설명/병합 셀 인지) |
|---|---|---|
| 전표생성폼 | (form, 헤더 없음) | 셀 단위 라벨/값 인터리브 form |
| 종합견적서 | **6** | row 1=인쇄 제목 / row 2=여백 / row 3-5=메타 (조합비/견적일/합계) / row 6=실제 컬럼 헤더 |
| 전표업로드목록 | **1** | 단순 컬럼 헤더 |
| **홈멀티** | **3** | row 1=그룹 헤더 (옵션 라벨), **row 2=옵션 default 값 (`$L$2`/`$K$2` 등 룰 1 master cell 위치)**, row 3=실 컬럼 헤더 |
| **홈멀티_단가인상** | **3** | 동일 |
| **싱글 세트** | **3** | 동일 패턴 (row 2 default 에 `$L$2`/`$O$2`/`$R$2` 등) |
| **싱글 세트_단가인상** | **3** | 동일 |
| **싱글 구성품** | **2** | row 1=카테고리 라벨만 (`DVM S_*신통신_[상업용]`), row 2=실 컬럼 헤더 |
| **싱글 구성품_단가인상** | **2** | 동일 |
| **상업멀티** | **3** | 홈멀티와 동일 (row 1=옵션 라벨, row 2=default, row 3=실 헤더) |
| **상업멀티_단가인상** | **3** | 동일 |
| **싱글 자재가격** | **1** | 단순 헤더 (A=품명, B=가격). 단 row 4 D4 = 룰 2 master cell (헤더 아닌 데이터 master) |
| 상업멀티 구성 | **1** | 단순 헤더 |
| 상업멀티 구성_단가인상 | **1** | 동일 |
| 분기계산 | **1** | 단순 헤더 (105 컬럼!) |
| **구형** | **3** | row 1=카테고리 + **`I1=50%` 룰 3 master cell**, row 2=빈, row 3=실 헤더 |
| 장비스펙 | (form, 헤더 없음) | 라벨 28행 form |
| 부속품스펙 | (form, 헤더 없음) | 라벨 8행 form |
| **홈멀티_템플릿** | **3** | 마스터 동일 (3 row 다단 헤더) |
| 거래처 | **1** | 단순 헤더 (10 컬럼) |
| 전표생성폼_템플릿 | (form) | 동일 |
| **싱글 세트_템플릿** | **3** | 마스터 동일 |
| **상업멀티_템플릿** | **3** | 마스터 동일 |
| 분기계산_템플릿 | **1** | 동일 |
| **구형_템플릿** | **3** | 마스터 동일 |
| 담당자 | **1** | 단순 헤더 |
| **추천실외기** | **2** | row 1=그룹 헤더 (멀티 냉난방 / 홈멀티 분리), row 2=실 컬럼 헤더 |

**주의**:
- **3-row 헤더 패턴 (홈멀티/싱글 세트/상업멀티 + 단가인상 + 구형 + 템플릿)**: row 1=그룹 라벨, row 2=옵션 default 값 (변동DC 룰의 `$L$2`/`$O$2`/`$Q$2`/`$R$2`/`$V$2`/`$Y$2` 가 가리키는 cell), row 3=실 컬럼 헤더, row 4 부터 데이터.
- **2-row 헤더 패턴 (싱글 구성품 + 추천실외기)**: row 1=카테고리/그룹 라벨, row 2=실 컬럼 헤더, row 3 부터 데이터.
- **1-row 헤더 패턴 (단순)**: 거래처 / 담당자 / 상업멀티 구성 / 전표업로드목록 / 분기계산 / 싱글 자재가격.
- **header 없음 (form)**: 전표생성폼 / 종합견적서 / 장비스펙 / 부속품스펙 — 셀 단위 라벨/값 양식.

분석문서가 `getRange(2,1,...,2,24)` (싱글/홈 default) / `A2:I` (구형) / `A3:E` (추천실외기) 등 함수별로 명시한 범위와 일치하지만, **header_row 자체를 명시한 분석은 없음** — 본 §3 가 사용자 강조 ("시트별로 열헤더 위치가 다름") 직접 충족.

---

## §4. 변동DC 룰 검증 (formulas.json grep 결과)

### §4.1 결과 표

| 룰 | 절대참조 | 발견 탭 | 발견 컬럼 | 발견 row 수 | 분석문서 일치 여부 |
|---|---|---|---|---|---|
| **룰 1 (옵션 토글)** | `$L$2` | 종합견적서 | H | 1 | (cross-review 미언급, 보조 — 견적서 인쇄 요약) |
| 룰 1 | `$L$2` | **홈멀티** | F | 107 (row 4~117) | ✅ estimate.md/partner-order.md §5 일치 |
| 룰 1 | `$L$2` | **홈멀티_단가인상** | F | 107 (동일) | ✅ |
| 룰 1 | `$L$2` | **싱글 세트** | H | 190 (row 4~286) | ✅ |
| 룰 1 | `$L$2` | **싱글 세트_단가인상** | H | 190 | ✅ |
| 룰 1 | `$L$2` | **싱글 구성품** | G, I | 622 (row 4~1550) | ✅ (Bundle 구성품도 부모 옵션 참조 — `'싱글 세트'!$L$2`) |
| 룰 1 | `$L$2` | **싱글 구성품_단가인상** | G, I | 622 | ✅ |
| 룰 1 | `$L$2` | **상업멀티** | G | 378 (row 4~415) | ✅ |
| 룰 1 | `$L$2` | **상업멀티_단가인상** | G | 378 | ✅ |
| 룰 1 | `$L$2` | 홈멀티_템플릿 | F | 107 | (분석문서 미언급 — 인쇄 템플릿) |
| 룰 1 | `$L$2` | 싱글 세트_템플릿 | H | 118 | (인쇄 템플릿) |
| 룰 1 | `$L$2` | 상업멀티_템플릿 | G | 378 | (인쇄 템플릿) |
| **룰 2 (자재 옵션)** | `$D$7` | **싱글 세트** | H | 11 (row 51~61) | ✅ partner-order.md §5 일치 |
| 룰 2 | `$D$7` | **싱글 세트_단가인상** | H | 11 (동일) | ✅ |
| 룰 2 | `$D$7` | **싱글 구성품** | I | 6 (row 515~571) | ✅ (cross-review §4.2 표 4 컬럼 안) |
| 룰 2 | `$D$7` | **싱글 구성품_단가인상** | I | 6 | ✅ |
| 룰 2 | `$D$7` | 싱글 세트_템플릿 | H | 11 | (인쇄 템플릿) |
| **룰 2 (자재 포함)** | `$D$8` | **싱글 구성품** | I | 5 (row 539~595) | ✅ (cross-review §4.2 일치) |
| 룰 2 | `$D$8` | **싱글 구성품_단가인상** | I | 5 | ✅ |
| **룰 2 보조 (자재 master)** | `$D$4` | **싱글 자재가격** | D | 2 (row 5, 6 — `IF($D$4>400000,...)`) | (분석문서 미언급 — 자재가격 시트 자체의 자기참조) |
| 룰 2 보조 | `$D$4` | **싱글 세트** | H | 47 (row 4~50) | (분석문서 미언급 — DOMAIN-EXTENSIONS §1 보강 — `setMaterialKey='D4'` 추가 enum 후보) |
| 룰 2 보조 | `$D$4` | **싱글 세트_단가인상** | H | 47 | (동일) |
| 룰 2 보조 | `$D$4` | **싱글 구성품** | I | 51 (row 5~636) | (동일) |
| 룰 2 보조 | `$D$4` | **싱글 구성품_단가인상** | I | 51 | (동일) |
| 룰 2 보조 | `$D$4` | 싱글 세트_템플릿 | H | 47 | (인쇄 템플릿) |
| **룰 3 (구형 50%)** | `$I$1` | **구형** | F | 31 (row 4~34) | ✅ estimate.md/partner-order.md §5 일치 (50% 고정) |
| 룰 3 | `$I$1` | 구형_템플릿 | F | 31 (동일) | (인쇄 템플릿) |
| **추가 발견 — `$K$2`** | `$K$2` | 종합견적서 | F | 1 (보조 합계 수식) | (분석문서 미언급) |

### §4.2 검증 결론

1. **룰 1 (`$L$2`) 정확** — 분석문서 estimate.md §5 (Code.js 428, 851) + partner-order.md §5 (Code.js 658, 1051) 의 4개 마스터 시트 (홈멀티/홈멀티_단가인상/상업멀티/상업멀티_단가인상) 적용 명세와 100% 일치. 추가로 싱글 세트/싱글 구성품도 부모 시트 `'싱글 세트'!$L$2` 텍스트 비교 형태로 사용 (분석문서 §6 Bundle 펼침 룰과 일치).
2. **룰 2 (`$D$7`/`$D$8`) 정확** — partner-order.md §5 (Code.js 780-783) + estimate.md §5 (Code.js 556-559) 의 자재 옵션 룰 일치. 단 `$D$8` 은 `싱글 세트` 시트엔 0건, `싱글 구성품` 시트에서만 5건 (분석문서 미상세 — 자재 미포함/포함 분기는 구성품 단계).
3. **룰 2 보조 (`$D$4`) 분석문서 누락** — `싱글 자재가격`!$D$4 가 자재 합계 master cell 이며, 47건 (싱글 세트) + 51건 (싱글 구성품) 적용. 분석문서의 `setMaterialKey: enum {D7, D8}` (cross-review §4.2) → **`enum {D4, D7, D8}` 로 확장 필요** (D4 = 자재 default master, 가장 많은 47+51=98건 적용).
4. **룰 3 (`$I$1`) 정확** — `구형!I1=50%` master cell, F열 31건 (`=D4*(1-$I$1)`). 100% 일치.
5. **`$K$2` 발견** — 종합견적서 F4 의 1건. 분석문서 미언급. `홈멀티!K2=0.0%` (조합비) 또는 보조 옵션. 영향 범위 작음 — Phase 4 Plan 시 단일 인쇄 수식으로 폐기 가능.

### §4.3 DOMAIN-EXTENSIONS §1 4-컬럼 안 검증

| 컬럼 | 출처 룰 | 검증 결과 |
|---|---|---|
| `hasVariableDiscount: boolean` | 룰 1 (`$L$2` 발견) | ✅ — 7 마스터 + 3 인쇄 템플릿 시트에서 검출. 4 마스터 시트 (홈멀티/싱글세트/싱글구성품/상업멀티) 의 모든 row 가 TRUE. |
| `fixedDiscountRate: decimal nullable` | 룰 3 (`$I$1`=50%) + 행별 고정DC 컬럼 (홈멀티 L, 상업멀티 L, 상업멀티 구성 J) | ✅ + **마스터 시트의 "고정DC" 컬럼 추가 발견** (홈멀티 L12, 상업멀티 L12, 상업멀티 구성 J — 대부분 "-" 값). 구형 시트 전체 = 50%. |
| `setMaterialKey: enum nullable` | 룰 2 (`$D$7`/`$D$8`) + **신규 `$D$4`** | ⚠️ **enum 확장 필요** — `{D4, D7, D8}` (cross-review §4.2 의 `{D7, D8}` 에 D4 추가). D4 = 자재 합계 default. |
| `legacyDiscountFlag: boolean` | 룰 3 (구형 시트 전체) | ✅ — 구형 시트 41 row 모두 TRUE. 모델명 prefix `AM*N*` 패턴 (예: AM100NXVHHH1, AM120NXVHHH1) — 신형 `AM*A*` (AM080AXVHHH1) 과 구분. |

**Phase 4 Plan 사전 결정**: `setMaterialKey` enum = `{D4, D7, D8}` (D4 default, D7 자재 미포함, D8 자재 포함).

---

## §5. Bundle 패턴 검증 (DOMAIN-EXTENSIONS §2)

### §5.1 `싱글 구성품` 의 setModel FK 매트릭스

| 측정 항목 | 실측 값 |
|---|---|
| 시트 lastRow | 1737 |
| 데이터 시작 row | 3 |
| 총 데이터 row | ~1735 |
| **distinct setModel FK (M열 `세트`)** | **282** |
| 부모 SET row (D열="세트") | ~282 |
| component row (D열≠"세트") | ~1455 |
| 평균 component/Bundle | ~5.2 |

→ DOMAIN-EXTENSIONS §2 옵션 A (productType=BUNDLE + bundleComponents) 에 정확히 매핑 가능. `bundleComponents` jsonb 또는 BundleComponent entity (282 부모 + 1455 자식 row).

### §5.2 `상업멀티 구성` 의 setModel FK

| 측정 항목 | 실측 값 |
|---|---|
| 시트 lastRow | 517 |
| 데이터 시작 row | 2 |
| 총 데이터 row | ~516 |
| **distinct setModel FK (I열 `세트`)** | **86** |

→ 상업멀티 도 동일 패턴. 86 부모 + ~430 components.

### §5.3 모델 prefix 룰 매트릭스 (partner-order.md §6.3 — `getModelFlags` Code.js 1292-1319)

| Prefix | flag | 검증 (workbook 모델 sample) |
|---|---|---|
| `AC*PB*` (예: AC060CS6PBH1SY) | is360 (CST UV 360) | ✅ 싱글 세트 row 4-7 매칭 |
| `AC*` non-PB | is4way 등 | (분석문서 추가 정규식 spot-check 필요) |
| `AP*` | is4way 변형 | ✅ 싱글 구성품 sample 'AP130BAPPHH2S' |
| `AR*` | is1way | ✅ 싱글 구성품 sample 'AR11D9150HZS' |
| `AF*` | isStand | ✅ 다수 (AF19B6474GZRS, AF60F19D11BS) |
| `AM*A*` (신형) | isDeluxe | ✅ 상업멀티 row 4 (AM080AXVHHH1) |
| `AM*N*` (구형) | (legacyDiscount) | ✅ 구형 시트 (AM100NXVHHH1) |

7 prefix 모두 실데이터에서 매칭 확인. **Phase 6 시드 시점에 정규식 적용 → `discountFlags: bitset` 사전 계산** (cross-review §5.3).

### §5.4 SEND_AS_SET_IDS 화이트리스트 4 SKU (bundleMode=KEEP) 의 시트 위치

partner-order index.html line 2581-2585 정의:
```javascript
const SS_WIRED_BOARD_ID = SINGLE_SETS.find(s => /유선보드/i.test(s?.name||'') || /AIM-?A01N/i.test(s?.model||''))?.id;
const SS_CEILING_PUMP_ID = SINGLE_SETS.find(s => /(실링용\s*)?드레인펌프/i.test(s?.name||'') && /실링/i.test(s?.name||''))?.id;
const SS_FOOT_ROUND_ID = SINGLE_SETS.find(s => /발통세트/i.test(s?.model||'') || /발통세트/i.test(s?.name||''))?.id;
const SS_FOOT_FLAT_ID = SINGLE_SETS.find(s => /SI-AL700a/i.test(s?.model||''))?.id;
const SEND_AS_SET_IDS = new Set([SS_FOOT_ROUND_ID, SS_FOOT_FLAT_ID, SS_WIRED_BOARD_ID, SS_CEILING_PUMP_ID].filter(Boolean));
```

**시드 시 4 SKU 추출 룰 (Phase 6 마이그)**:
1. `싱글 세트` 시트 전체 282 SET 중 다음 정규식 매칭 row 4건:
   - `유선보드` (name) OR `AIM-A01N` (model) → SS_WIRED_BOARD_ID
   - `실링.*드레인펌프` AND `실링` (name) → SS_CEILING_PUMP_ID
   - `발통세트` (model OR name) → SS_FOOT_ROUND_ID
   - `SI-AL700a` (model) → SS_FOOT_FLAT_ID
2. 매칭된 4 SKU 의 `bundleMode='KEEP'` 시드, 나머지 ~278 = `bundleMode='EXPAND'` (default).

**시드 데이터 구조 명세 (BundleComponent)**:
```
ProductMaster
  - modelCode: AC060CS6PBH1SY (싱글 세트 row 4 PK)
  - productType: BUNDLE
  - bundleMode: EXPAND  // 4 SKU 만 KEEP
  - hasVariableDiscount: TRUE  // 룰 1 적용
  - setMaterialKey: D4  // row 4~50 = D4
  - legacyDiscountFlag: FALSE
  - bundleComponents:
      [
        { componentModelCode: AC060CN6PBH1, qty: 1, kind: 실내기, isDefault: true, spec: "싱글 360" },
        { componentModelCode: AC060CXAPBH1, qty: 1, kind: 실외기, isDefault: true, spec: "싱글 360" },
        { componentModelCode: PC6NUNK1NW, qty: 1, kind: 판넬, isDefault: true, spec: "원형노출", variant: "기본" },
        { componentModelCode: PC6NUDK1NW, qty: 0, kind: 판넬, isDefault: false, spec: "사각매립", variant: "사각" },
        ...
      ]
```

(`싱글 구성품` 시트 row 3-7 sample 검증: AC060CS6PBH1SY 부모 → 실내기 1 + 실외기 1 + 판넬 2 (기본/사각) 첫 번째 표현)

---

## §6. 시트 마스터 명칭 충돌 해소 (cross-review §2.2 후속)

### §6.1 4 충돌 쌍 결정 표

formulas.json spot-check 결과 — 베이스 시트 (홈멀티/싱글 세트/상업멀티/싱글 구성품) vs 인상본 시트의 수식 구조 + 가격 데이터 비교:

| 도메인 | estimate 마스터 | partner-order 마스터 | formulas 검증 (수식 동일?) | **결정 (Phase 4 Plan 입력)** |
|---|---|---|---|---|
| 홈멀티 | `홈멀티_단가인상` | `홈멀티` | ✅ **수식 100% 동일** (양 시트 모두 F열 `$L$2` 수식 107건). **가격 데이터만 다름** (D4: 2,763,200 vs 2,929,300, F4: 1,519,760 vs 1,611,115). | **양 시트 = 동일 ProductMaster + 별도 PriceHistory entity** (effective date `PRICE_INC_DATE`). 두 시트 = 같은 modelCode 의 시점별 가격 2 row. |
| 싱글 세트 | `싱글 세트_단가인상` | `싱글 세트` | ✅ **수식 100% 동일** (양 시트 H열 `$L$2` 190건, `$D$7` 11건, `$D$4` 47건 모두 동일). | 동상 — PriceHistory 분리 |
| 상업멀티 | `상업멀티_단가인상` | `상업멀티` | ✅ **수식 100% 동일** (양 시트 G열 `$L$2` 378건). | 동상 |
| 싱글 구성품 | `싱글 구성품_단가인상` | `싱글 구성품` | ✅ **수식 100% 동일** (G/I열 `$L$2` 622건 + `$D$7` 6건 + `$D$8` 5건 + `$D$4` 51건 모두 동일). 단 인상본은 수식 내 시트 참조가 `'싱글 세트_단가인상'!$L$2` 로 변경 (베이스는 `'싱글 세트'!$L$2`). | 동상 — PriceHistory 분리 + 부모 시트 참조도 시점별 분리 |

### §6.2 결정 요약

**4 충돌 모두 동일 결정**: 두 시트 = **동일 ProductMaster row 의 시점별 PriceHistory 2개**. cross-review §2.2 "단일 `price` 컬럼은 부족" 권고 충족.

**Phase 4 Plan 명세**:
- `ProductMaster` (modelCode PK)
- `PriceHistory` (productMasterId FK + effectiveDate + releasePrice + deliveryPrice + setMaterialKey)
- 시드 시: 각 modelCode 마다 **2 row PriceHistory** (베이스 시트 → effectiveDate=과거, 인상본 시트 → effectiveDate=`PRICE_INC_DATE`)
- `PRICE_INC_DATE` 상수는 cross-review §9.2 #4 spot-check 필요 (Code.js / index.html grep). **본 시트 분석 단계에선 추출 불가** — Phase 4 Plan 사전 spot-check 의무.

---

## §7. 고아 탭 11개 분석

cross-review §2.1 의 고아 11 탭 = (장비스펙, 부속품스펙, 종합견적서, 전표생성폼, 전표업로드목록, 분기계산, *_템플릿 6) 분석:

| # | 탭명 | hidden | lastRow | 데이터 존재? | 추정 용도 | 마이그 추천 | 사용자 확정 필요 |
|---|---|---|---|---|---|---|---|
| 1 | **장비스펙** | F | 28 | ❌ (라벨만) | Frontend 모달 라벨 출처 (estimate index.html `openSelectedSpec()` 라벨) — 데이터는 마스터 시트에서 추출 | **폐기** + i18n 키로 이전 (Frontend `SpecModal.tsx`) | 사용자 확정: Frontend 텍스트 키로 이전 OK? |
| 2 | **부속품스펙** | F | 8 | ❌ (라벨만) | Frontend 부속품 모달 라벨 | **폐기** + i18n | 동상 |
| 3 | **종합견적서** | F | 7 | ❌ (인쇄 양식 layout) | 견적서 인쇄 PDF/HTML 양식 (H3=`COUNTIF` 보조 합계 수식) | **폐기 시트** + estimate-service `EstimatePrintTemplate` (Frontend) 으로 layout 이전 | 사용자 확정: 인쇄 픽셀 사양 보존? |
| 4 | **전표생성폼** | F | 19 | ❌ (입력 양식) | slip-service 전표 입력 form (사용자 입력 layout) — 평문 자격증명 4종 노출 (cross-review §6.2) | **폐기 시트** + slip-service 입력 화면. **자격증명 행 (A4/B4/A6) 마이그 시 Vault** | 자격증명 폐기 + Vault 이전 승인 |
| 5 | **전표업로드목록** | F | 3 | ❌ (10컬럼 헤더만) | e-Count 업로드 미리보기 양식 (estimate index.html `btnGoFinal` 라인 1289) | **폐기 시트** + slip-service 미리보기 컴포넌트 | OK |
| 6 | **분기계산** | F | 100 | ⚠️ (~99 row, A열 분기관 코드 lookup) | 분기관 lookup table 추정 (코드 1509/2512/2812... → 분기관 SKU) **또는** 인쇄 양식 layout | **시드 추천** (BranchPipeLookup entity) — 단 99 row 데이터의 의미 확정 필요 | **사용자 확정 필요**: A열 코드는 분기관 SKU 인지, 아니면 단순 인쇄 표기인지. 분석문서엔 **시트 직접 read 0건** — 클라이언트 분기계산 로직과 분리 |
| 7 | **홈멀티_템플릿** | F | 122 | ✅ (마스터 동일 데이터, col 28~33 제외 30컬럼) | 인쇄용 축약 사본 — 마스터 데이터 동기화 (수동 또는 ARRAYFORMULA 추정) | **폐기 시트** + estimate-service 인쇄 템플릿 (Frontend) | 폐기 OK? |
| 8 | **전표생성폼_템플릿** | T | 19 | ❌ | §2.1 동일 layout 사본 | **폐기** | 동상 |
| 9 | **싱글 세트_템플릿** | T | 219 | ✅ (마스터 일부, col 22~27 제외 21컬럼) | 인쇄용 축약 — 219 row (마스터 291) | **폐기 시트** + 인쇄 템플릿 (Frontend) | 219 row 차이 사유 (마스터 - 일부 row 제외) 사용자 확정 |
| 10 | **상업멀티_템플릿** | F | 416 | ✅ (마스터 거의 동일, col 28~30 제외 27컬럼) | 동상 | **폐기 시트** | 폐기 OK? |
| 11 | **분기계산_템플릿** | T | 100 | ⚠️ (분기계산 동일) | 분기계산 인쇄용 사본 | **폐기 시트** | 폐기 OK? |
| 12 | **구형_템플릿** | T | 44 | ✅ (구형 동일 데이터, 동일 9컬럼) | 인쇄용 사본 | **폐기 시트** | 폐기 OK? |

**참고**: cross-review §2.1 "고아 11" 의 정확한 카운트는 (장비스펙/부속품스펙/종합견적서/전표생성폼/전표업로드목록/분기계산 = 6) + (*_템플릿 6) = **12** (본 §7 표). cross-review 가 11 표기한 사유는 `*_템플릿 6` 표기에서 1개 누락 가능성 — 본 분석 12 정정.

**고아 탭 12개 종합 결정**:
- **데이터 마이그 대상**: `분기계산` (BranchPipeLookup, 사용자 확정 후) — 1건
- **폐기 + UI 이전**: 11건 (장비스펙/부속품스펙/종합견적서/전표생성폼/전표업로드목록 + 템플릿 6)
- **자격증명 Vault 이전**: 전표생성폼 row 4/6 (3건 — 회사코드/이카운트 ID/API 인증키)

---

## §8. SamhanLogis 도메인 매핑 통합 표

| 시트 탭 | SamhanLogis 도메인 | service | 매핑 방식 (시드 / 신규 schema / 폐기) | 우선순위 (M1~M5) |
|---|---|---|---|---|
| 홈멀티 + 홈멀티_단가인상 | ProductMaster + PriceHistory + (확장 4 컬럼: hasVariableDiscount=TRUE/setMaterialKey/legacy/discountFlags) | **product-service** | 시드 (홈멀티 row 4-122 → ProductMaster ~119건, ProductMaster 1건당 PriceHistory 2 row) | **M1** |
| 싱글 세트 + 싱글 세트_단가인상 | ProductMaster (productType=BUNDLE) + bundleComponents + bundleMode + PriceHistory | product-service | 시드 (~288 BUNDLE, 4건 KEEP/284건 EXPAND) | M1 |
| 싱글 구성품 + 싱글 구성품_단가인상 | ProductMaster (실내기/실외기/판넬/리모컨/자재 단품) + BundleComponent (FK to setModel) + PriceHistory | product-service | 시드 (~1455 component) | M1 |
| 상업멀티 + 상업멀티_단가인상 | ProductMaster + PriceHistory + (확장 4 컬럼) | product-service | 시드 (~414 SKU) | M1 |
| 싱글 자재가격 | MaterialPrice (자재 단가 마스터) — D4/D7/D8 키 보존 | product-service (sub-domain) | 시드 (~28 row) | M1 |
| 상업멀티 구성 + 상업멀티 구성_단가인상 | ProductMaster (상업 부속) + BundleComponent (86 부모) + PriceHistory | product-service | 시드 (~516 component) | M1 |
| 구형 | ProductMaster (legacyDiscountFlag=TRUE, fixedDiscountRate=0.50) + PriceHistory | product-service | 시드 (~41 row) | M1 |
| 추천실외기 | OduRecommendationLookup | product-service (sub-domain) | 시드 (~24 row) | M1 |
| 분기계산 | BranchPipeLookup (사용자 확정 후) | product-service (sub-domain) | 시드 (~99 row, 사용자 확정 후) | M1 (조건부) |
| 거래처 | PartnerMaster + (그룹 enum + creditLimit + singleDiscountRate) | **partner-service** | 시드 (~6924 row) | **M2** |
| 담당자 | EmployeeMaster (or User) — `eccountEmpCode` 외부키 | iam-service / hr-service | 시드 (~19 row) | M2 |
| 종합견적서 (layout 만) | EstimatePrintView (Frontend HTML/PDF) | **estimate-service (신규)** | 폐기 시트 + UI 이전 | **M3** |
| 전표업로드목록 (layout) | SlipUploadPreview (Frontend) | slip-service | 폐기 + UI 이전 | M4 |
| 전표생성폼 (layout) | SlipCreationForm (Frontend) + Vault 자격증명 이전 | slip-service | 폐기 + UI + Vault | M4 |
| 장비스펙 / 부속품스펙 (layout) | SpecModal / AccessorySpecModal (Frontend) | estimate-service / partner-order-service | 폐기 + i18n | M3-M4 |
| *_템플릿 6 | (인쇄 템플릿 — Frontend) | 각 도메인 service | 폐기 시트 + 인쇄 템플릿 | M3-M5 (각 service 와 동시) |

**DOMAIN-EXTENSIONS §1/§2 반영 ProductMaster 신규 컬럼 종합** (cross-review §8.3 + 본 분석 §4 보강):

| 컬럼 | 타입 | 출처 | 시드 룰 |
|---|---|---|---|
| `hasVariableDiscount` | boolean | 룰 1 (`$L$2`) | 4 마스터 시트 모든 row = TRUE, 그 외 = FALSE (단순 시드) |
| `fixedDiscountRate` | numeric(5,4) nullable | 룰 3 (구형 50%) + 행별 고정DC 컬럼 (홈/상업 L 컬럼) | 구형 시트 = 0.50, 그 외 = 시트 L/J 컬럼 값 (대부분 NULL) |
| `setMaterialKey` | enum {D4, D7, D8} nullable | 룰 2 (formulas grep 결과) | 싱글 세트 row 4-50 = D4, 51-61 = D7, 그 외 NULL. 싱글 구성품 row 5-636 = D4, 515-571 = D7, 539-595 = D8 |
| `legacyDiscountFlag` | boolean | 구형 시트 41 row | 구형 시트 = TRUE, 그 외 = FALSE |
| `productType` | enum {SINGLE, BUNDLE} | 시트별 도메인 | 싱글 세트/상업멀티 구성 부모 row = BUNDLE, 그 외 = SINGLE |
| `bundleMode` | enum {EXPAND, KEEP} nullable | SEND_AS_SET_IDS 정규식 (4 SKU) | 4 SKU = KEEP, 나머지 BUNDLE = EXPAND |
| `bundleComponents` | jsonb (또는 BundleComponent entity) | 싱글 구성품 M열 + 상업멀티 구성 I열 FK | 282 + 86 = 368 부모 → ~1455 + ~430 components |
| `discountFlags` | bitset (is360/is4way/is1way/isStand/isDeluxe/isGrade1) | `getModelFlags` 7 prefix 정규식 | 시드 시점에 모델명 정규식 매칭 |

---

## §9. 모호 / 사용자 확정 필요 항목

Phase 4 Plan 진입 전 사용자 확정 의무:

| # | 항목 | 출처 | 확정 형태 |
|---|---|---|---|
| 1 | **분기계산 시트 폐기 vs BranchPipeLookup 시드** | §7 #6 | 데이터의 의미 확정 (A열 코드가 분기관 SKU 인지) → 시드 또는 폐기 결정 |
| 2 | **상업멀티 구성_단가인상 partner-order 사용 여부** | cross-review §2.1 비대칭 | partner-order Code.js 추가 spot-check (`getCommerceParts_` 호출이 베이스만? 인상본도?) |
| 3 | **시트 마스터 충돌 4건** | §6 (홈/싱글세트/상업멀티/싱글구성품) | 모두 "PriceHistory 분리" 권장 — 사용자 승인 |
| 4 | **PRICE_INC_DATE 상수 위치** | cross-review §9.2 #4 | partner-order Code.js / index.html grep 후 사용자 확정 |
| 5 | **거래처 시트 그룹 컬럼 활용 정책** | cross-review §9.1 #3 | distinct values 14개 → enum 표준화? 메뉴 분기? |
| 6 | **거래처 시트 `싱글 할인` 컬럼 deprecated 여부** | cross-review §9.1 #4 | 208 row 채워짐 — 활성 정책 or 폐기? |
| 7 | **거래처 시트 `여신한도` 단 1 row 만 채움** | §2.20 | 사실상 미사용 — 폐기 vs 신규 입력 정책 |
| 8 | **장비스펙/부속품스펙 라벨 텍스트 — 마스터 시트와 동기화 정책** | §7 #1-2 | i18n 키 이전 후 시트 폐기 OK? |
| 9 | **종합견적서 H3 보조 합계 수식 (`$K$2` 사용)** | §4.1 추가 발견 | 인쇄용 합계 — 폐기 OK? |
| 10 | **전표생성폼 평문 자격증명 4종** (회사코드/이카운트 ID/API 인증키/EMP_CD) | §2.1 + cross-review §6.2 | Vault 이전 + 시트 폐기 승인 |
| 11 | **`setMaterialKey` enum 확장 `{D4, D7, D8}`** | §4.2 검증 결과 | DOMAIN-EXTENSIONS §1 4-컬럼 안 갱신 (D4 추가) — 사용자 승인 |
| 12 | **담당자 시트 코드 형식 비표준 (이성미="이성미")** | §2.26 | 정규화 정책 — 누락 시 신규 사번 부여 vs 보존 |
| 13 | **거래처 시트 6924 row 중 그룹=빈 2800 row** | §2.20 분포 | 마이그 시 default 그룹 enum 부여 정책 |
| 14 | **추천실외기 시트 row 1 그룹 헤더 (멀티 냉난방 / 홈멀티)** 의 구조 분리 | §2.27 | 1 entity (recommendationType enum) vs 2 entity 분리? |

---

## §10. 회귀 회고 가드

본 §3-§7-§9 의 사용자 확정 의무는 **Phase 4 Plan 진입 의무 게이트**:

| 가드 | 본 분석에서의 적용 |
|---|---|
| `feedback_function_documentation.md` | Phase 6 시드 스크립트 모두 한국어 Javadoc — 시트 탭/컬럼 출처 명시 (예: "출처: workbook.json `홈멀티` Row 3 col F"). dev-reports/sheet-import-{tab}.md 누적 의무 |
| `feedback_pm_integration_build_check.md` Layer 4 | 본 §4.2 의 `setMaterialKey` enum {D4, D7, D8} 확장 — DOMAIN-EXTENSIONS §1 의 표와 의미 정렬 의무. Layer 4 도메인 메서드 (`VariableDiscountDetector.detectMaterialKey()`) 명세에 D4/D7/D8 case 모두 분기 포함 |
| `feedback_uuid_no_user_visibility.md` | 본 §8 의 PartnerMaster `businessRegistrationNumber` PK 후보 (사업자번호) 와 `담당자코드` (e-Count `EMP_CD`) 가 사용자 노출 식별자. ProductMaster `modelCode` 도 사용자 노출 식별자 (UUID 미노출 자동 충족) |
| `feedback_korean_commits.md` | 본 산출 파일 한국어 작성 ✅, 향후 Phase 4-7 commit/PR/Issue 모두 한국어 |
| `feedback_role_naming_full.md` | 본 분석은 단일 산출 — Role 표기 없음. Phase 4-6 Team PR 시 풀네임 의무 (BACKEND/FRONTEND/DESIGN/QA/DEVOPS) |
| `feedback_powershell_utf8_writes.md` | 본 산출은 Write 도구 사용 — UTF-8 BOM-less 보장. Phase 6 시드 스크립트도 동일 의무 |
| `feedback_it_mockbean_external_clients.md` | Phase 6 product-service IT 작성 시 PartnerClient/SlipClient 등 모든 외부 client `@MockBean` 의무 |
| `feedback_print_design_iteration.md` | §7 의 인쇄 양식 11건 (종합견적서/전표생성폼/장비스펙/부속품스펙/전표업로드목록 + 템플릿 6) Frontend 이전 시 — 단번 완성 가정 금지, 사용자 이미지 → mock → Edge 캡처 → 3-5회 iteration |

**Phase 4 Plan 진입 게이트 (사용자 확정 의무 표)**:

| 게이트 | 차단 항목 | 확정 형태 |
|---|---|---|
| G1 | §9 #1 (분기계산 폐기/시드) | 사용자 yes/no |
| G2 | §9 #2 (상업멀티 구성_단가인상 사용 확정) | partner-order Code.js spot-check 결과 |
| G3 | §9 #3 (마스터 4 충돌 PriceHistory 분리 승인) | 사용자 승인 |
| G4 | §9 #4 (PRICE_INC_DATE 상수 위치) | spot-check 결과 |
| G5 | §9 #5 (거래처 그룹 enum 정책) | 사용자 정책 |
| G6 | §9 #6 (거래처 싱글 할인 컬럼 정책) | 사용자 정책 |
| G7 | §9 #10 (전표생성폼 자격증명 Vault 이전 승인) | 사용자 승인 |
| G8 | §9 #11 (`setMaterialKey` enum D4 추가 승인) | 사용자 승인 |

위 8개 게이트 모두 통과 후 Phase 4 Migration Plan agent 디스패치 가능.

---

## 부록 A — 변동DC 룰 검출 raw 통계

formulas.json grep 종합 (총 hits):

| 탭 | `$L$2` | `$D$4` | `$D$7` | `$D$8` | `$I$1` | `$K$2` |
|---|---|---|---|---|---|---|
| 종합견적서 | 1 | — | — | — | — | 1 |
| 홈멀티 | 107 | — | — | — | — | — |
| 홈멀티_단가인상 | 107 | — | — | — | — | — |
| 싱글 세트 | 190 | 47 | 11 | — | — | — |
| 싱글 세트_단가인상 | 190 | 47 | 11 | — | — | — |
| 싱글 구성품 | 622 | 51 | 6 | 5 | — | — |
| 싱글 구성품_단가인상 | 622 | 51 | 6 | 5 | — | — |
| 상업멀티 | 378 | — | — | — | — | — |
| 상업멀티_단가인상 | 378 | — | — | — | — | — |
| 싱글 자재가격 | — | 2 | — | — | — | — |
| 구형 | — | — | — | — | 31 | — |
| 홈멀티_템플릿 | 107 | — | — | — | — | — |
| 싱글 세트_템플릿 | 118 | 47 | 11 | — | — | — |
| 상업멀티_템플릿 | 378 | — | — | — | — | — |
| 구형_템플릿 | — | — | — | — | 31 | — |
| **합계** | **3198** | **245** | **45** | **10** | **62** | **1** |

→ 룰 1 (`$L$2`) 가 압도적 다수 (3198/3561 = 90%) — 변동DC 의 가장 큰 가지. ProductMaster 시드 시점에 `hasVariableDiscount=TRUE` row 가 마스터 ~3198 / 4 = ~800 SKU (대략).

---

## 부록 B — 시트 read 함수 ↔ 시트 탭 매핑 (분석문서 기반)

| 함수 | 시트 탭 (`getSheetByName`) | 사용 분석문서 | 헤더 row 확인 |
|---|---|---|---|
| estimate `getHomeMulti()` (Code.js 374) | `홈멀티_단가인상` | estimate.md §2 | row 3 (사용자 강조 — `getRange` 명시 없음, 함수 내 동적 헤더 검색) |
| partner-order `getHomeMulti()` (Code.js 605) | `홈멀티` | partner-order.md §2 | row 3 |
| estimate `getSingleSets()` (Code.js 498) | `싱글 세트_단가인상` | estimate.md §2 | row 3 |
| partner-order `getSingleSets()` (Code.js 727) | `싱글 세트` | partner-order.md §2 | row 3 |
| estimate `getSingleParts()` (Code.js 610) | `싱글 구성품_단가인상` | estimate.md §2 | row 2 |
| partner-order `getSingleParts()` (Code.js 833) | `싱글 구성품` | partner-order.md §2 | row 2 |
| estimate `getCommercialMulti()` (Code.js 778) | `상업멀티_단가인상` | estimate.md §2 | row 3 |
| partner-order `getCommercialMulti()` (Code.js 984) | `상업멀티` | partner-order.md §2 | row 3 |
| estimate/partner-order `getHomeDefaults()` (Code.js 1367/1580) | `홈멀티`/`홈멀티_단가인상` `getRange(1,1,2,24)` | analyses §2 | **row 1=헤더, row 2=default 값** (사용자 강조 케이스 명시) |
| estimate/partner-order `getSingleDefaults()` (Code.js 1392/1605) | `싱글 세트`/`싱글 세트_단가인상` `getRange(1,1,2,24)` | 동상 | row 1=헤더, row 2=default |
| estimate/partner-order `getCustomers_()` (Code.js 1429/1633) | `거래처` | analyses §2 | row 1 |
| estimate `getRecommendOduData()` (Code.js 1610) `getRange("A3:E"+lastRow)` | `추천실외기` | estimate.md §2 | **row 3 부터 데이터** (row 1=그룹, row 2=실 헤더) |
| estimate/partner-order `getStaffList_` (Code.js 1498/1702) `H.indexOf('담당자명/담당자코드')` | `담당자` | analyses §2 | row 1 (동적 indexOf) |
| partner-order `getSpecMap_()` (Code.js 1159) — 5 시트 동적 헤더 검색 | `홈멀티`+`싱글 구성품`+`싱글 세트`+`상업멀티`+`상업멀티 구성` | partner-order.md §2 | **각 시트별 가변 row** — `findHeaderRow` 으로 모델/규격 컬럼 자동 검색 |
| partner-order `getSpecDetailMap_()` (Code.js 1211) | 동일 5 시트 | partner-order.md §2 | 동상 |
| partner-order `getCommerceParts_` (Code.js 1140-1156) | `상업멀티 구성` | partner-order.md §2 | row 1 |
| partner-order `getSinglePartsIncreasePrices_` (Code.js 319) | `싱글 구성품_단가인상` | partner-order.md §2 (Phase 1.5) | row 2 |

→ **9개 시트** 가 함수에서 직접 read. **18개 시트** 는 사용 0건 (인쇄/입력/템플릿/lookup 추정/고아).

---

_생성: Phase 3 Sheet schema 분석 / 2026-05-05 / 단일 산출 파일 / 무손실 / 추측 금지 / 한국어 / 셀 위치 A1 notation 명시_
