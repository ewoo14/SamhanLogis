# #17 단가변동 S2 — 견적 렌더 토글(estimate-app) endpoint 배선 (설계)

> 2026-07-01 야간 자율. #17 S1(price_change_schedule #686) 머지 후속. 정찰 a55b6275. 에픽 spec=2026-07-01-price-change-epic-design.md.

## Goal
estimate-app(종합견적서)이 S1 신규 `GET /products/internal/price-change-schedule`(category→effectiveDate 맵)을 소비. **D3 권장=(a) 렌더 기본 동작 불변(인상후 기본 + 수동 토글 유지) + endpoint 데이터 배선**. 변동일 기반 자동 기본체크(경량 c)는 **PR 옵션으로 제시·D3 확인 후 적용**(현 시드 전부 과거라 가시 no-op이므로 미적용해도 회귀 0).

## 정찰 결론
- 현행 토글: index.ejs `chkHomeInc`(L7696)·`chkCommInc`(L6519)·`chkSingleInc`(L7735) — client-side 수동, 기본 미체크=인상후(현행), 체크=인상전(price_history@2000-01-01). `getBaseListPrice`(L2259) + 싱글 price(L4285/4297/5033). **구형(oldProducts)=토글/baseline 경로 없음**(db-catalog L202 default break).
- 데이터흐름: product-service `/price-baseline` → db-catalog `priceIncData()` → code.js bootstrap `t.priceInc` → EJS `PRICE_INC`.
- 배선: db-catalog.js=axios + PRODUCT_BASE(L24) + INTERNAL_TOKEN(L30). 신규 endpoint=estimate-catalog BASE(L34) 하위 아님 → 전용 fetcher 필수. 응답=객체 맵(배열 아님). 토큰 거부 401.

## 구현 (estimate-app)
1. `lib/db-catalog.js`: `priceChangeSchedule()` fetcher 추가(`${PRODUCT_BASE}/products/internal/price-change-schedule`, X-Internal-Token, `resp.data.data || {}`) + module.exports 등재.
2. `lib/code.js`: bootstrap(L1890 DB 모드 / L1900 sheet 모드 인접)에 `t.priceChangeSchedule = JSON.stringify(await dbCatalog.priceChangeSchedule())`(try/catch fallback '{}').
3. `views/index.ejs`: L2256 직후 `const PRICE_CHANGE_SCHEDULE = J(<%- priceChangeSchedule %>, {});` 노출. **렌더 기본 동작 불변(D3=a).**
4. (옵션 c, D3 확인 후) onload 카테고리별 1회: `getKstToday() < effectiveDate` 면 해당 토글 기본 체크(인상전), 경과면 미체크(현행). 매핑 homemulti→chkHomeInc/commercialMulti→chkCommInc/singleSets→chkSingleInc, oldProducts 무시. **현 시드(과거)에선 4종 미체크 유지=회귀 0.**
5. `test/db-catalog.test.js`: axios mock(L52 패턴)에 `/price-change-schedule` 추가 + priceChangeSchedule() 단위 테스트.

## 결정 (PR 명시·오전 확인)
- **D3**: (a) 토글만+데이터배선(권장·회귀0) vs 경량(c) 변동일 초기 기본체크. (c) 채택 시 비교기준=견적일(getKstToday) vs 납기일(due). oldProducts 변동일 estimate 무시 확정?

## Testing
jest `test/db-catalog.test.js`(fetcher mock). 라이브: `npm run dev`(PORT 5183) + product-service:8084 기동, qa:capture(playwright) 실 렌더. 변동일 효과는 미래일 시드 임시 주입 시 확인(현 시드 과거).
