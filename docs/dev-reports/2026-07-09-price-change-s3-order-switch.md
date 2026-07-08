# #17 단가변동 S3 — 주문서 카테고리별 변동일 자동전환 (dev-report)

- **연관 이슈**: #17 (단가변동) · 슬라이스 **S3** (order-app + partner-order-service) · **PR #688**
- **선행**: S1(#686 price_change_schedule 모델)·S2(#687 견적 렌더 배선)·S4a(#774 admin API)·S4b(#776 estimate FE). 🔴 **가격(돈) 로직**.
- **운영모드**: SONNET 대체 — Sonnet 5 서브에이전트 = 구현/5-agent 리뷰/라이브 QA, Opus(PM) = 기획·STEP4 독립 적대검증·점검·commit 대행·머지.
- **일자**: 2026-07-09 (회사PC 세션 — 2026-06-30 구현·2026-07-01 보류 후 D5 확정으로 재개)

## 1. 개요·범위

주문서(order-app)가 **카테고리별 변동일(effectiveDate)에 따라 인상 전/후 단가를 자동 전환**한다. 견적(S2)은 "인상 전 단가" 체크박스로 사용자 수동 선택이지만, 주문서(S3)는 **납기희망일(due) 기준 자동 전환**이다. estimate-app과 order-app은 Node bootstrap 비공유라 별도 배선(partner-order-service `BootstrapService` 경로).

## 2. 결정 기록

- **D5 (전/후 통일) = Model B** (개발책임자 2026-07-08 확정): base=현행(후) **유지** + `BootstrapService.incPriceMap()` 입력을 `priceBaseline()`(전, price_history@2000-01-01)로 전환 + order-app 조건 **반전** — **`due < 변동일 → *_INC(전)`, `due >= 변동일 → base(후)`**. estimate-app(S2) `PRICE_INC`(전) 의미 1:1 통일·base 무변경.
- **D4**: 카테고리별 변동일 주입·`due >= 변동일 = 인상후`(**KST 문자열 사전식 비교, `new Date()` 금지**)·**fallback 키결측/빈맵 = 항상 후**(오과금 회피 안전 기본값).
- **evict/캐시 staleness = 옵션 A** (개발책임자 2026-07-09): `BootstrapService` bootstrap 캐시는 TTL 없음·evictAll 미배선 → **관리자가 변동일 수정 시 partner-order-service 재기동 필요**(운영 SOP). evict-on-write/TTL는 **후속 이슈**.
- **known limitations (문서화)**: ①**구성품(singleParts/commercialParts)**은 `estimateCategory=null`로 `ProductEstimateExposure` 미생성 → `priceBaseline()` exposure-gated 조회서 배제 → `SINGLE_PARTS_INC` 상시 빈맵 → parts는 항상 후(데이터로 해결불가·후속=priceBaseline exposure-비의존). ②**oldProducts**는 order-app OLD_INC 부재 → 구형 자동전환 S3 범위 외.

## 3. 구현

### BE (partner-order-service)
- `EstimateCatalogClient.priceChangeSchedule()` 신설(`GET /products/internal/price-change-schedule`, X-Internal-Token).
- `BootstrapService`: 17번째 payload `priceChangeSchedule`(category→effectiveDate) + `CACHE_KEYS`/`BootstrapResponse` 갱신. **[Model B] `incPriceMap()` 입력을 `priceBaseline()`로 전환**.

### FE (order-app)
- `index.html`: `PRICE_CHANGE_SCHEDULE` 읽기 + `incActive(categoryKey, due)`(`due < String(effectiveDate)` 문자열 비교·new Date 미사용) + **5 사이트 조건 반전**(`due<변동일→*_INC`). `PRICE_INC_DATE` 전역/리터럴 제거. 최소 고지 1줄("납기희망일 기준 카테고리별 단가가 자동 적용됩니다").

## 4. 리뷰 (2라운드 5-agent + STEP4 · SONNET 대체)

- **rebase**: 브랜치 129 커밋 stale → main 리셋 + S3 cherry-pick(0충돌·컴파일) + force-push(`73df54f10`).
- **블로커 fix `21ef958e4`**: **hasProductData 실버그**(빈 catalog가 schedule/baseline만으로 "데이터 있음" 오판→빈 배열 캐싱이 시트/seed fallback 영구 override·order-app 0행 회귀·genuine 재현 검증)·`@Column(32→30)` 정합.
- **R1 5-agent → fix `1707c6338`**: BE-2(priceBaseline/priceChangeSchedule 개별 try-catch — 예외 시 catalog 7종 폐기 차단)·QA 테스트 3(price≤0·!due·5xx)·jackson 계약·Design 고지·BE-1 구성품 gap 주석·"16→17종" sweep.
- **R2 5-agent 0수렴**: Design/BE/FE 0 blocking·QA H1=라이브 QA 게이트·DevOps docs-sync. **mutation test/RED-flip으로 Model B 정확성·회귀 포착력 실증**.
- **STEP4 Opus 독립**: order-app incActive+5사이트 직접 정독 — `due<변동일→전(*_INC=priceBaseline)`/`due>=변동일→후(base)` 방향 정확 확인. 코드 결함 0.

## 5. 검증

- **CI** (`1707c6338`): **32/32 green**(accounting+partner 1957 tests·user+product 1288 tests 0 fail 포함).
- **로컬 genuine**(--rerun-tasks --no-build-cache): partner-order 357·product 449·order-app vitest 15 green.
- **BE 무변경 마이그** 0(V22/V23 불변·엔티티만 length 정합).

## 6. 라이브 QA (Docker 실서버·mock OFF·미래일 시드) — 전건 PASS

스크린샷 `docs/qa/price-change-s3/r2-*.png`(현 HEAD, 기존 stale 2장과 구분). 투명 QA seed(`created_by='QA_R2_SEED'`·실 product TEST-BUNDLE-SET-01·롤백 완료).

- **P0 bootstrap API**: `homeInc={TEST-BUNDLE-SET-01:700000}`(전)+`priceChangeSchedule.homemulti="2026-08-01"`(미래) — R1 시점 불가능했던 조합. BE가 미래일+전가격 제공 실증.
- **P1 실 GUI 전/후**(실 BizGate 로그인부터 완주): 동일 제품·수량1, **납기희망일만 변경** → due `2026-07-09`(변동일 전)=**700,000(전)** / due `2026-08-15`(이후)=**900,000(후)**. Design 고지 노출 확인.
- **SQL 금액대조 100% 일치**(화면=API=DB). 롤백(QA_R2_SEED 삭제+재기동→homeInc={}) 완료.
- 미실측: `useK2=true`(고정DC% 분기)의 전/후는 해당 실 product 부재로 GUI 미실측(스위치 선택 로직은 동일 `incActive && *_INC`·계산 분기만 상이 — 후속 seed 시 실증 가능).

## 7. 후속 이슈 (등록 필요)

1. **evict-on-write / 캐시 TTL** — bootstrap 캐시 staleness(dev-lead A=현재 재기동 SOP). product-service admin write → partner-order-service evict 배선 또는 유계 TTL.
2. **priceBaseline exposure-비의존 전환** — 구성품(singleParts/commercialParts) 자동전환 활성화(현재 known limitation·항상 후).
3. **oldProducts 자동전환** — 구형 order-app OLD_INC 배선(S3 범위 외).

## 8. 교훈

- **hasProductData 캐시 오염**: 부가 메타데이터(priceBaseline/schedule)를 "데이터 존재" 게이트에 포함하면 빈 catalog가 유효 fallback을 영구 override. genuine 재현(revert→RED)으로 확정.
- **useK2=false 표시단가 상호작용**: 라이브 QA 초기 seed(900k/900k)가 표시단가(currentSheetPrice) 로직과 우연히 일치해 전/후 무구분 → baseline 700k로 조정. 금액 QA는 seed 값이 표시 경로와 시각적으로 구분되는지 확인 필요.
- SONNET 대체 모드에서도 2라운드 5-agent+STEP4+라이브 QA(mutation test·RED-flip·실 GUI 금액대조) 캐논 규율로 돈 로직 결함 수렴.
