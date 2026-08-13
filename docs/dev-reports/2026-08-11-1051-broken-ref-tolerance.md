# #1051 끊긴 품목 참조 허용 범위 보고

- 일자: 2026-08-11
- 범위: `inventory-service` 재고 잔고 조회와 그 화면의 실제 QA
- 공유 DB: SELECT만 수행. RED/회귀 IT는 격리 Testcontainers PostgreSQL 사용.
- Git: 커밋·push·PR은 수행하지 않음.

## 결론과 짧은 설계

재고 잔고는 존재 검증 경로가 아니라 이미 저장된 `(product_id, warehouse_id)` 잔고 행을 보여주는 조회 경로다. 따라서 이 경로만 `lookupAllowMissing()`으로 바꾸고, 응답 조합 시 품목 메타데이터가 없으면 `참조 끊김` / `제품 마스터 없음`을 표시한다. 잔고 행과 수량은 제거하거나 0으로 대체하지 않는다. 입고·출고·조정·이동·감사처럼 품목 존재가 전제인 경로는 기존 strict `lookup()`/`requireExists()`를 유지한다.

`ProductClient.lookup()`의 부분 응답 strict 동작이 잔고에서 의도됐다는 테스트·문서는 찾지 못했다. 반대로 `ProductClientTest.lookup_partialResponse_throwsNotFound`는 공통 client의 strict 계약이고, 기존 라이브 관측 문서는 잔고 정상 조회 중 `요청 100, 응답 1`이 404가 된 것을 결함으로 기록한다. strict client 계약 자체는 유지했다.

## RED-A — 수정 전 원문

`StockBalanceBrokenReferenceIT`를 먼저 작성하고, Testcontainers PostgreSQL에 잔고 3행(존재 품목 2개 + 끊긴 참조 1개)을 저장한 뒤 실제 `ProductClient` 왕복 응답을 2개만 돌려주도록 했다. 수정 전 실패 원문은 다음과 같다.

```text
Status expected:<200> but was:<404>
response body:
{"success":false,"code":"NOT_FOUND","message":"일부 제품을 찾을 수 없습니다 (요청 3, 응답 2)",...}
```

실제 Testcontainers JDBC는 `jdbc:postgresql://localhost:63434/inventory_db`였고, 요청에는 `X-Internal-Token`이 포함됐다. 즉 순수 mock 서비스 테스트가 아니라 DB 저장 → HTTP → inventory controller → 실제 ProductClient(strict) 왕복에서 전체 화면이 막히는 재현이다.

## 변경 내용

| 위치 | 변경 |
|---|---|
| `StockService.findBalancePage` | 잔고 품목 bulk 조회만 `lookupAllowMissing()`으로 변경. 요청/응답 ID를 비교해 누락을 WARN으로 기록하고 모든 잔고 행을 계속 조합. 배치 step은 기존 100 유지. |
| `StockBalanceResponse` | 품목 메타데이터가 없을 때 `productCode=참조 끊김`, `productName=제품 마스터 없음`; warehouse/수량/version은 원래 잔고 값 유지. UUID는 화면에 넣지 않음. |
| `InventoryStockBalancePage` | 동일한 표시 marker 행이 여러 개여도 React key가 충돌하지 않도록 페이지 내 index를 보조 key로 사용. |
| 테스트 | Testcontainers RED-A/strict inbound RED-B, partial `lookupAllowMissing` client 계약, 기존 balance 테스트 stub을 추가·갱신. |

## inventory-service `productClient.lookup*` 전수표

| 호출부 | 현재 변형 | 끊긴 참조가 섞이면 | 맞는 선택과 근거 |
|---|---|---|---|
| `StockService.findBalancePage` | `lookupAllowMissing` (수정) | 행 전체 404가 아니라 누락 행도 marker와 수량으로 반환 | **관용**. 화면 조회이며 저장된 잔고의 존재가 품목 master 검증보다 우선. |
| `StockTransferService.createTransfer` | strict `lookup` | 이동 생성 전체 거부 | **strict 유지**. 존재하지 않는 품목을 이동시키면 안 됨. |
| `InventoryAuditService.createAudit` | strict `lookup` | 감사 생성 전체 거부 | **strict 유지**. 감사 snapshot의 품목 식별 무결성 전제. |
| `SafetyStockService.findAlerts` | `lookupAllowMissing` | 정상 alert는 반환, 누락 품목은 기존 fallback/WARN | **관용 유지**. 이미 누락 허용·fallback 계약이 있음. |
| `SafetyStockService.fireAlert` | 단건 strict `lookup` | 품목 확인 실패를 처리하지만 alert 발행 흐름은 기존 catch 계약 | **strict 유지**. 단건 존재/알림 metadata 확인이며 잔고 batch가 아님. |
| `StockExcelExportService.lookupChunk` | chunk별 strict `lookup`, 예외 catch | 해당 chunk 품목 code/name은 공란이 될 수 있으나 export는 계속 | **현 계약 유지**. 별도 export fail-soft 계약이며 이번 화면 변경 범위가 아님. |
| `ProductSeedIntegrityValidator` | `lookupForSeedIntegrity` 후 누락 set 검사 | seed integrity 실패 | **strict 유지**. seed 정합성 검증 전용 low-level 관용 조회 후 caller가 전건 검증. |

추가로 inventory의 `StockService.inbound/reserve/release/deduct/adjust`, `InboundInspectionService`, `StockInstanceService`의 `requireExists*`는 존재 검증 호출부이며 모두 strict 유지했다. `ProductClient.lookup()`의 `LOOKUP_BATCH_MAX=100`, X-Internal-Token 전송, partial strict 예외와 4xx/5xx mapping도 바꾸지 않았다.

## inventory 밖의 같은 모양 — 조사만, 수정하지 않음

| 서비스/호출부 | 현재 계약과 부분 응답 시 영향 | 판단 |
|---|---|---|
| `slip-service`: `SlipService`, `SlipUpdateService`, `SalesSlipUpdateService`(line/parent), `EstimateService`(create/update/bundle), `MobileQuotationService`, `MobilePartnerOrderService` | strict batch. 입력 line의 품목 검증 또는 가격·bundle 계산·snapshot 생성이 전건 실패 | **strict가 맞음**. 전표/견적에 없는 품목을 저장하면 안 되며, 이번 잔고 화면과 다른 도메인. |
| `slip-service`: `EstimateToSlipConverter`, `BundleProductGuard`, `SlipSeeder` | strict batch. 변환/부모 bundle/seed 정합성 실패 | **strict 유지**, 이번 PR에서 수정하지 않음. |
| `slip-service`: `SlipPublishService`, `SlipLookupController`, `InOutAnalysisService`의 model/model-name 단건·검색 조회 | 단건 미존재 404 또는 검색 결과 부분 응답 계약 | 존재 확인/검색 경로이므로 **strict 또는 기존 부분 검색 계약 유지**. |
| `partner-order-service`: `PartnerOrderConfirmService.lookup(productIds)`, `Mig8OrderImportService.lookup(productIds)` | 확인/수입 batch의 품목 누락 시 해당 작업 거부 | **strict 유지**. 주문 확정·수입의 입력 검증. |
| `partner-order-service`: `lookupByModelCodes`, `lookupFixedDiscountRates` 및 `PartnerOrderQuery/UpdateService` | model-code/할인율은 caller가 부분 결과와 fallback을 처리하는 별도 계약 | **기존 계약 유지**. `lookup()` 일괄 완화와는 다른 API. |
| `accounting-service.MonthEndCloseService.lookup(chunk)` | 월말 마감 batch에서 strict client 오류 가능 | **범위 밖 조사 결과로만 기록**. 회계 마감 정책과 별도 검토가 필요해 고치지 않음. |

따라서 inventory 밖에서도 strict batch 모양은 확인됐지만, 모두 입력 검증·snapshot·변환·회계 마감이라는 별도 의미다. 이번 변경에서 전역 `lookup()` 완화는 하지 않았다.

## 새로 허용되는 상태의 의미

- 화면에는 끊긴 실제 잔고 행이 그대로 남고 `참조 끊김` / `제품 마스터 없음`으로 구별된다. 실제 행의 `availableQty`, `reservedQty`, `totalQty`, warehouse, version을 보존한다.
- `totalElements`와 페이지 행 수에는 그 행이 포함된다. 정렬은 기존 잔고 row 기준(product UUID, warehouse code)을 유지하고, metadata 누락 여부 때문에 행 순서가 바뀌지 않는다. 페이지 계산도 반환 행 전체에 적용된다.
- unknown 수량을 0으로 채우지 않는다. 실제 잔고 행은 저장된 수량을 사용하며, VIRTUAL 합성 행의 0/대시는 기존 “수량 없음” 표현이다. 이 API에는 별도 합계 필드가 없으므로 화면 summary도 행 수를 임의로 줄이거나 누락품목을 합계에서 숨기지 않는다.
- 사용자가 누락 행을 입고·예약·해제·차감·조정하거나 이동을 만들면 `requireExists*`/strict lookup에서 `NOT_FOUND`로 거부된다. 품목 master가 복구되지 않은 상태에서 재고를 조용히 변경하지 않는다.

## RED-B 및 검증

- `StockBalanceBrokenReferenceIT`: 2 tests passed — RED-A partial balance 반환, missing inbound strict 404.
- targeted regression: `ProductClientTest`, `StockServiceVirtualWarehouseVisibilityTest`, `StockBalanceQueryLazyIT`, `StockBalanceBrokenReferenceIT` passed.
- inventory full suite: `616 tests`, `0 failures`, `0 errors`, `1 skipped`; Gradle `BUILD SUCCESSFUL`.
- `:services:inventory-service:bootJar --no-daemon`: `BUILD SUCCESSFUL`.
- strict client partial-response test와 `LOOKUP_BATCH_MAX` 검증은 유지됐고, X-Internal-Token·4xx/5xx 경로를 건드리지 않았다.
- desktop `eslint`는 변경 TSX 오류 없이 종료했다. 전체 web TypeScript는 기존 `@samhan/design-system` dist 미생성 상태에서 실행해 다수 기존 module/type 오류가 발생했으며, design-system을 별도 build한 뒤 실제 Vite/Playwright는 통과했다.

## 실제 Playwright QA

스펙과 디렉터리 모두 `-real-qa` 접미사를 사용했다.

```text
clients/desktop/playwright/1051-broken-ref-real-qa/1051-broken-ref-real-qa.spec.ts
```

직접 실행 결과 `1 passed`.

- Chromium: Playwright 설치본 `chromium-1217`
- URL: `http://127.0.0.1:5175/#/inventory/stock-balance?realQa=1051`
- 캡처 전 전용 `재고 현황` 제목과 조회 버튼을 assertion
- 조회 후 grid, `참조 끊김`, `제품 마스터 없음`, summary, UUID 비노출 assertion
- 결과: `docs/qa/2026-08-11-1051-real-qa/1051-broken-reference-balance-screen.png`
- QA 중 띄운 Vite renderer와 수정 image로 재기동했던 `samhan-inventory-service` 컨테이너를 종료했다. 다른 compose 서비스와 공유 DB는 건드리지 않았다.
