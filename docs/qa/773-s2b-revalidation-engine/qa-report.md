# #773 S2b 라이브 QA — 일마감 단가변동 재검증 엔진 (Opus R1)

- **일자**: 2026-07-13 · **환경**: Docker 실 스택(mock OFF) · accounting :8087 · product :8084 · postgres
- **배포**: 새 accounting jar + product jar(현재 main = S1b/S1c/S2a 포함) `docker cp`+restart(로컬 스택이 7/8 stale 이미지였음 — [[project_local_stack_qa_gotchas]]).
- **인증**: dev_accountant(`accounting.reports` VIEW 실보유·RBAC 무수정) X-User-* 헤더.

## 시나리오 A — 서비스품목 NOT_FOUND 배선 (실 데이터·2026-05-07)
`GET /accounting/closings/daily?date=2026-05-07` → 200. 실 세금계산서 라인(서비스품목):

| productName | releasePrice | verified | revalidationStatus |
|---|---|---|---|
| 육상운반료 | null | null | **NOT_FOUND** |
| 상하차 작업비 | null | null | **NOT_FOUND** |

→ resolveByLabel 실 HTTP 호출(product-service 404) → 엔진 단락 → 신규 필드 채움. **배선 완전 실증**(product 500→404 fix도 동반 확인 — 하단).

## 시나리오 B — AM160 상업멀티 VERIFIED 판정 (실 제품·2026-07-13)
실 dev 제품 `AM160NXVHHH1`("DVM S 구형 프라임 16HP"·상업멀티·fixedDc 50·price_history 보유)로 세금계산서 시드(단가 5,260,000 순액). `GET .../daily?date=2026-07-13` → 200:

| 필드 | 값 |
|---|---|
| releasePrice | 11,572,000 (price_history asOf) |
| deliveryPrice | 5,786,000 |
| expectedRate | **50** (fixedDc·멀티 분기) |
| actualRate | **50** |
| verified | **true** |
| revalidationStatus | **VERIFIED** |

### 🎯 H1·H2 fix 동시 라이브 실증
- **H2(멀티 라우팅)**: AM 상업멀티가 구형50% 오분류 없이 **멀티 분기**(expectedRate=fixedDc 50)로 판정.
- **H1(VAT 기준)**: actualRate=50은 **VAT포함 유효단가**((공급 5,260,000 + 세액 526,000)/1 = 5,786,000) / 출고가 11,572,000 = 50%. **순액(5,260,000) 코드였다면 45% → verified=false(false alarm)**. verified=true가 VAT fix 정확성을 확증.

## 부수 확인 — product-service lookup-by-label 500→404 (라이브 QA 포착)
- 최초 curl 시 product-service가 **모든 라벨에 500**(`NoResourceFoundException` — 7/8 stale 이미지에 S1b endpoint 부재). product jar 재배포 후 정상화: `AM160NXVHHH1`→200(productId)·서비스품목→404. IT(ProductClient mock)가 못 잡는 실 통합 이슈를 라이브 QA가 포착.

## GUI 증거
- `swagger-daily-product-line-schema.png` — 실서버 Swagger UI(`:8087/swagger-ui`)의 `DailyProductLine` 스키마에 신규 6필드 노출. `/v3/api-docs`에 `revalidationStatus` allowableValues(NOT_MEASURABLE·OUT_OF_SCOPE 등) 포함 확인(M4 @Schema 배포).

## genuine 자동 검증
- `./gradlew :services:accounting-service:test --rerun-tasks --no-build-cache` → **1200 tests·0 fail·0 error·2 skip**(무캐시). 멀티/구형/액세서리 판정 파리티는 실 레거시 라벨 IT로 검증(dev 카탈로그는 AM 상업멀티 존재해 라이브 멀티도 실증).
