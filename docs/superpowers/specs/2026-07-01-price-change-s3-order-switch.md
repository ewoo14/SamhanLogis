# #17 단가변동 S3 — 주문서 카테고리별 변동일 자동전환 (설계)

> 2026-07-01 야간 자율. S1(price_change_schedule endpoint)·S2(견적 배선) 머지 후속. 정찰 add3834e. **🔴 가격(돈) 로직 — D4/D5 권장방향 채택, 오전 개발책임자 확인 필수.**

## Goal
order-app 주문서가 카테고리별 변동일(S1 schedule)에 따라 인상 전/후 단가 자동전환. 현행 `PRICE_INC_DATE` 전역 하드코딩 제거 + `*_INC` no-op 해소.

## 정찰 결론 (no-op 근본)
- order-app `index.html`: `due >= PRICE_INC_DATE('2026-04-01')` → `*_INC`(5 사이트: homeUnitPrice 2552·partUnitPrice 2580·singleUnitPrice 2600·commUnitPrice 2666·setBasePriceRightFirst 3058; 2곳은 리터럴 2553/2667). `due`=`#due` `<input type=date>` `YYYY-MM-DD` **문자열 사전식 비교**(KST 캘린더, new Date 미사용).
- `*_INC` 출처=`BootstrapService.incPriceMap()`=현행 Product(=base catalog와 동일=인상후) → **no-op**(`BootstrapServiceTest:275-279` 락인: homeInc=releasePrice·`verify priceBaseline never`).
- 전가격=`price_history@2000-01-01`(`/price-baseline`, `EstimateCatalogClient.priceBaseline()` **존재·미사용**). estimate-app(S2): `PRICE_INC`=전(baseline), 기본=후/체크=전.

## 결정 (D4/D5 권장 — 가격 정책, 오전 확인)
- **D5 (전/후 통일) = 모델 B 권장**: base=현행(후) **유지** + `incPriceMap()` 입력을 `priceBaseline()`(전)로 전환 + order-app 조건 **반전** `due < 변동일 → *_INC(전)`, `due >= 변동일 → base(후)`. estimate-app `PRICE_INC`(전) 의미 1:1 통일·base 무변경·변경 최소. (모델 A[base→전] 비권장: 구형/구성품/자재 구동·인상지난 시점 구가격 표시 역행.)
- **D4 (비교/주입)**: schedule 카테고리별 변동일 주입, `due >= 변동일 = 인상후`(KST 캘린더 **문자열 사전식 비교**, `new Date()` 금지). **fallback**: 키 결측/빈맵 = 변동없음 = 항상 후(현행, 안전).
- ⚠️ **oldProducts**: order-app `OLD_INC` 맵·전환 **없음** → 구형 자동전환 **S3 범위 외**(후속 별 슬라이스). schedule `oldProducts` 키는 order-app 미소비(무시).

## 구현
**BE (partner-order-service):**
1. `EstimateCatalogClient.priceChangeSchedule()` 추가(`GET /products/internal/price-change-schedule`, `priceBaseline()` 동형, baseUrl=product-service).
2. `BootstrapService`: 17번째 payload `"priceChangeSchedule"`(raw category→effectiveDate 맵) append(`BootstrapResponse`/CACHE_KEYS 갱신, `@Cacheable("bootstrap")` evict) + **[모델 B] `incPriceMap()` 입력을 `priceBaseline()`로 전환**(=전가격; home/comm=releasePrice, single/parts=deliveryPrice). `BootstrapServiceTest:271-279`·주석 398-401 의도적 갱신(priceBaseline expect로).
3. ⚠️ **baseline 커버리지 fallback(필수)**: `priceBaseline` 결측 모델(구성품/구형)은 `*_INC[model]` 부재 → FE fallthrough 시 base(후) 적용. `due<변동일`인데 후=오류 가능 → **정책: baseline 결측 모델은 *_INC=base(후) 유지 명시**(즉 변동전 데이터 없으면 후 유지, 오과금보다 안전)·로그 경고. (또는 BE에서 baseline 결측 시 현행가 채움.)
**FE (order-app):**
4. `index.html`: `PRICE_CHANGE_SCHEDULE = J(__BS.priceChangeSchedule, {})` 읽기(head XHR/main.ts는 BE 키 그대로 실음 — FE fetch 변경 불요). `PRICE_INC_DATE` 전역(1387)+리터럴(2553/2667) 제거 → `incActive(categoryKey, due)` 헬퍼(카테고리별 변동일·문자열 비교). **[모델 B] 5 사이트 조건 `due < 변동일 → *_INC` 반전**. 매핑 home→homemulti/comm→commercialMulti/single·parts→singleSets.
5. `qa-gas-parity-sim.mjs`(schedule DOM stub 주입) + vitest: due 전/후 케이스(미래 변동일로 전환 실증).

## 검증
BE: `BootstrapServiceTest` 갱신(priceBaseline 소비 assert)·`PartnerOrderBootstrapIT`·(신규)`EstimateCatalogClientTest`. FE: vitest + `qa-gas-parity-sim`(due<변동일=전·due>=변동일=후). 라이브: order-app 실 렌더 + **미래일 schedule seed 임시 주입**해 날짜전환 실증(현 시드 2026-04-01 과거라 미래일 필요). ci.yml partner-order/web 잡 확인.

## 리스크
🔴 금액 정합(D5 오선택=오과금)·baseline 커버리지(구성품 결측 fallback 정책)·oldProducts 갭·KST 문자열비교(Date 금지)·`BootstrapServiceTest` 락인 갱신·비-useK2 sheet 분기(2555/2669 deliveryPrice→releasePrice 올림 재검토).
