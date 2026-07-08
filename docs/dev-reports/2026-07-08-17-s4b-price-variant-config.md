# #17 단가변동 S4b — "인상 전 단가" 기본값 FE 배선 (dev-report)

- **연관 이슈**: #17 (단가변동 관리) · 슬라이스 **S4b** (FE)
- **PR**: #776 · 브랜치 `feat/17-price-variant-s4b`
- **선행**: S4a (#774, `11a86c4c`) — product-service `PriceChangeSchedule.default_pre_change` + admin write API + 내부 default-variant GET
- **운영모드**: SONNET 대체 (Codex Jul11 한도) — Sonnet 5 서브에이전트 = 구현·5-agent 리뷰·라이브 QA / Opus(PM) = 기획·STEP4 독립 적대검증·점검·commit 대행·머지
- **일자**: 2026-07-08 (회사PC 세션)

## 1. 개요·범위

단가변동(#17)은 카테고리별 적용일 전후 "인상 전/후 단가"를 전환하는 견적 로직이다. S4a에서 BE(저장소·admin write API·내부 조회)를 완비했고, 본 슬라이스(S4b)는 **순수 FE** 로 두 소비처를 배선한다:

1. **estimate-app** — 견적 "인상 전 단가" 체크박스 3종(홈멀티/상업멀티/싱글) **초기 상태 + 리셋**을 하드코딩 `false`에서 카테고리별 config 기본값으로 전환.
2. **desktop 관리 UI** — `EstimatePricingConfigPage`(`/sales/estimate-config`)에 "카테고리별 단가변동" 자립 섹션 신설(적용일 + 기본값 토글, oldProducts=날짜만) + admin GET/PUT 배선.

**범위 밖(무변경)**: product-service(S4a 완료)·estimate-app 단가 전환 계산 로직(초기값 소스만 교체). 일마감 재계산 토글은 별도 대규모 #773.

## 2. 결정 기록

- **Q5/Q7 (개발책임자, S4a)**: 권한 = MANAGER+ACCOUNTANT VIEW+UPDATE(V86)·전환로직 무변경.
- **H1 옵션A (개발책임자, 본 세션)** — R1 QA가 "ACCOUNTANT가 V86 권한 보유하나 페이지 게이트(`sales.estimate-config`=MASTER+MANAGER·V58)로 도달 불가(死文)"를 포착 → **옵션A 채택**: 라우트 가드/사이드바를 `sales.estimate-config` OR `products.price-schedule`로 확대 + 기존 estimateConfig '옵션 기본값' 폼은 `sales.estimate-config` 보유자에게만 표시. ACCOUNTANT는 단가변동 섹션만. auth 마이그 불요·FE만.
- **4-카테고리 admin 레이아웃 = PM 자율**(FE config UI). oldProducts=날짜만.

## 3. 구현

### estimate-app
- `lib/db-catalog.js`: `priceDefaultVariant()` 신설(`priceChangeSchedule()` 정확 대칭·`PRODUCT_BASE`+X-Internal-Token·`/products/internal/price-change-default-variant`).
- `lib/code.js`: `bootstrap()` 양 분기에 `t.priceDefaultVariant` 주입.
- `views/index.ejs`: `PRICE_DEFAULT_VARIANT` 선언 + 체크박스 3종 초기값(chkHomeInc/chkCommInc/chkSingleInc) + **리셋 3종**(resetHome/resetComm/resetSingle)을 `!!PRICE_DEFAULT_VARIANT.<category>`로 배선. 전환 계산 코드(getBaseListPrice·납품가) 무변경.

### desktop
- `api/productCatalogApi.ts`: `getPriceChangeScheduleAdmin()`/`updatePriceChangeSchedule(category, patch)` admin 훅(null-keep PUT).
- `routes/EstimatePricingConfigPage.tsx`: "카테고리별 단가변동" 자립 섹션(자체 useQuery/useMutation·estimateConfig 폼과 분리). H1 옵션A로 estimateConfig 폼을 `canViewEstimateConfig` 게이팅.
- `components/PermissionGuard.tsx`: `pageCode: PageCode | PageCode[]` 배열 OR 확장(단일 backward-compat).
- `components/AppLayout.tsx`·`routes/index.tsx`: 사이드바/라우트 OR 게이트.
- `api/mock.ts`: `products.price-schedule` mock 권한(SP_D1_PAGES/DEFAULT_VIEW/EDIT/MOCK_ACTION_ONLY_PAGES) V86 parity(VIEW+UPDATE만).

## 4. 리뷰 (2라운드 5-agent + STEP4 · 캐논 준수)

### R1 (구현 `48ff3783d`)
- 🔴 H1(ACCOUNTANT 도달 불가→옵션A) · 🔴 H2(테스트 tautology→RTL 6종) · 🟡 FE-MED-1(stale-flash→setQueryData) · 🟡 BE-MED(mock 과다부여→ACTION_ONLY) · 🟡 Design×3(토큰·위계) · 🟢 다수.
- → R1-fix `eeb4b79f3`. Opus diff 점검 + genuine 재실행(vitest 681) 후 커밋.

### R2 (fix `eeb4b79f3`) — 재검·backward-compat 중점
- BE 0 · DevOps 0(CI 32/32 green·PermissionGuard 131 사용처 backward-compat) · FE LOW 1 · QA MED 5(전부 테스트 커버리지·코드버그 0) · **Design 🔴 HIGH 1**.
- **Design HIGH(회귀)**: R1의 `#b45309`→`var(--color-warning-700, #b45309)` 토큰화가 실제 렌더 `#B47A1F`(토큰값≠fallback) → AA 5.02:1→3.66:1 회귀. **재검이 R1 fix 유발 회귀를 포착**(단축금지 정당성 실증).
- → R2-fix `70b234776`: raw `#b45309` 복원(AA·형제 정합) + PermissionGuard 직접 유닛테스트 6 + RTL 하드닝 5. Opus 점검 + genuine 재실행(vitest 688) 후 커밋.

### STEP4 (Opus 독립 적대검증)
- 코드 적대검증 PASS(결함 0): ACCOUNTANT 경로 미변경 코드(form-sync useEffect `if(query.data)` 가드·isDirty null-safe·hooks 무조건 호출) 전부 안전.
- 실서버 스택 검증: product getDefaultVariant 200·auth V86(MANAGER+ACCOUNTANT view+update)·dev_accountant materialized 권한·dev_master bypass 정확.

## 5. 검증

- **CI** (`70b234776`): **32/32 green**(JUnit×9·빌드+테스트×9·Frontend DS/Desktop/Mobile-Public/Mobile-Staff/Order-App·Detox×2·Playwright·Desktop Playwright mock 회귀 hard gate·Notion/Credential/Config-Audit/GitGuardian).
- **로컬 genuine**(캐시 배제): desktop typecheck 0 · vitest 100 files/**688 tests** green(신규 PermissionGuard 6 + priceSchedule RTL 하드닝) · estimate-app jest 97.
- **BE 무변경**: `git diff 940399233 70b234776 -- services/` = 0.
- **라이브 QA**: _(스크린샷 — 아래 §6)_

## 6. 라이브 QA (Docker 실서버·mock OFF·:8080·fresh jar)

전건 PASS. 스크린샷 `docs/qa/17-s4b-price-variant/` (10장·실 캡처). real-qa: `clients/desktop/playwright/17-s4b-price-variant-real-qa/`(-real-qa 접미사=CI mock 잡 제외), estimate-app capture: `clients/web/estimate-app/scripts/qa-capture-17-s4b-price-variant.mjs`.

| # | 화면 | 관찰 |
|---|---|---|
| 01 | dev_master `/sales/estimate-config` | "견적 가격 설정"(요율+옵션 기본값) + "카테고리별 단가변동" 4행 동시 노출. 구형=날짜만("대상 아님")·나머지=날짜+토글. h2/16 위계·badge 정상 |
| 02·03 | dev_master PUT 왕복 | 홈멀티 토글 ON+날짜 2026-08-01→저장 PUT 200(`{effectiveDate,defaultPreChange:true}`)→재조회 반영·DB 영속 |
| 04·05 | **dev_accountant (H1 옵션A)** | 사이드바 "견적 가격 설정" 링크 노출(products.price-schedule OR) → 진입 시 **단가변동 섹션만**·estimateConfig 폼 미표시·`GET /api/v1/estimate-config` 네트워크 0요청(query enabled=false) |
| 06·07 | dev_sales (네거티브) | 사이드바 링크 부재 + 직접 진입 시 홈 redirect |
| 08·09·10 | **estimate-app 체크박스 E2E** | 홈멀티 "인상 전 단가" 초기 **CHECKED**(admin PUT→product DB→estimate fetch) / 싱글 UNCHECKED 대조(config false). 주입 상수 `PRICE_DEFAULT_VARIANT={homemulti:true,singleSets:false,...}` 실 fetch 확인 |

### QA 관찰 (개발책임자 참고 — S4b 무관·별건)
1. **dc-config-service 미기동**(estimate-config 상단 폼 BE)이 docker 스택에 없었음 → QA가 `docker compose -f ... -f docker-compose.local-all.yml up -d dc-config-service`로 기동. 기본 기동 목록 포함 여부 판단 필요.
2. **dev_manager sales.estimate-config 갭(pre-existing)**: 실 권한판정(group_page_permissions)에 MANAGER의 `sales.estimate-config` 행 부재(legacy V58 role_page_permissions만 존재·미반영) → 현재 estimateConfig '옵션 기본값' 폼은 사실상 MASTER 전용. **H1 옵션A OR-게이트가 무해하게 커버**(MANAGER도 단가변동 섹션은 정상 진입). S4b 유발 아님·S4b 게이팅은 정확. MANAGER의 요율 폼 편집 권한 필요 여부는 별도 정책.
3. estimate-app 1440px에서 mobile-mode 오탐지(legacy·실사용 흐름 무지장)·공유 DB `homemulti.defaultPreChange=true` 영속(QA 의도).

## 7. 교훈

- **CSS `var(--token, #fallback)`는 토큰 정의 시 fallback을 무시하고 토큰값을 렌더** — "raw hex를 토큰+fallback으로 치환 = 값 불변"은 **토큰 실제값 == fallback일 때만** 참. `--color-warning-700`(#B47A1F) ≠ 의도한 #b45309라 조회전용 안내가 AA 회귀. 토큰화 fix는 **토큰 실제값을 tokens.css에서 확인**하고 대비 재계산 후 주장할 것. (neutral-600은 실제값=fallback이라 정상.) R2 재검이 포착.
- **재검(R2)이 R1 fix가 유발한 신규 회귀를 포착** — "fix 후 재리뷰·단축금지" 규율의 직접적 가치 실증.
- SONNET 대체 모드에서도 캐논(2라운드 5-agent+STEP4·genuine 재실행·전지적 disposition) 유지로 결함 수렴.
