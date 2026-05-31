# confirm 경로 복구 — DC price-calc 정식 연동 + FE res.ok (dev-report)

- **작성일**: 2026-05-31
- **브랜치**: `fix/confirm-recovery-dc-price-calc`
- **spec/plan**: `docs/superpowers/specs|plans/2026-05-31-confirm-recovery-dc-price-calc-*`
- **계기**: 슬라이스 D1(#329) Docker 실 QA 가 BLOCKED 로 드러낸 기존 버그 2건 복구.

## 1. 배경
D1 실 QA 에서 실 거래처 confirm 직접 호출이 BLOCKED. 근본원인 = D1 무관 기존 버그 2건:
1. `DcConfigClient.fetchDcConfig` 가 없는 경로 `GET /api/v1/dc-configs/{partnerCode}` 호출 → 403 → confirm 예외(fail-soft 미작동). 게다가 `applyDc`/`mapCategoryToDcKey` 의 기대 map 키가 어떤 실제 엔드포인트와도 불일치 → DC 적용은 죽은 스켈레톤.
2. order-app `sendOrderFromUi` 가 ApiResponse `{success}` 반환 → 레거시 핸들러는 `res.ok` 확인 → 항상 "전송 실패" 표시.

## 2. 결정 (DECISIONS D-CR-01~03)
- **D-CR-01**: confirm DC = `/internal/price-calculations` 정식 연동. 죽은 fetchDcConfig/applyDc/mapCategoryToDcKey 제거.
- **D-CR-02**: fail-soft 보존(404/5xx → listPrice).
- **D-CR-03**: order-app sendOrderFromUi 응답을 레거시 `{ok,orderNo,error}` 로 정규화.

## 3. 변경 (커밋)
| 커밋 | 영역 | 내용 |
|---|---|---|
| `e85f45f3` | partner-order BE | `DcConfigClient.calculatePrices`(POST /internal/price-calculations, ApiResponse<PriceCalculationResponse> 파싱, fail-soft) + confirm finalPrice 사용 + mapCategory + 죽은 메서드 제거. **VendorOrderService**: 죽은 fetchDcConfig 참조 제거(미리보기 dcRate=0, 실 DC는 confirm price-calc). confirm IT 2종 추가(finalPrice/fail-soft). |
| `70dacf5f` | order-app FE | sendOrderFromUi → `{ok:success, orderNo, error:message}` 정규화 |

## 4. 함수 단위 문서
- `DcConfigClient.calculatePrices(partnerCode, List<PriceLine>) → Map<lineId,finalPrice>`: POST /internal/price-calculations(X-Internal-Token), `data.lines[].{lineId,finalPrice}` 추출. 404/5xx/예외 → 빈 Map(fail-soft).
- `PartnerOrderConfirmService.confirm`: 라인 index 를 lineId 로 PriceLine 빌드 → calculatePrices → `finalPrices.getOrDefault(i, listPrice)` 를 priceVat 로. `mapCategory`(homemulti/homeDefaults→HOMEMULTI, commercialMulti→COMMERCIAL_MULTI, else OTHER). D1 의 DRAFT 생성/createFromConfirm/revision/history 유지.

## 5. 테스트
- confirm IT: `confirm_applies_dc_final_price_from_price_calc`(finalPrice=800000 → price_vat 800000) + `confirm_failsoft_uses_list_price_when_price_calc_empty`(빈 → listPrice 1500000). D1 IT 5종 회귀 유지. **225 tests PASS(skipped=0)**.
- order-app typecheck/lint 0 err.
- Docker 실 QA(머지 전): 실 confirm → price-calc 200 → DRAFT + DC 적용 price_vat psql + slip 0건 → order-app "전송이 완료되었습니다". D1 BLOCKED 였던 실 confirm happy-path 실증.

## 6. 배포 / 후속
- partner-order-service + order-app. Flyway 불필요. dc-config-service 변경 없음.
- 후속: confirm 라인 옵션 플래그(360/4way 등) → 옵션 정액 DC / estimate 경로 price-calc 점검 / vendor 미리보기 실 DC 필요 시 별도.
