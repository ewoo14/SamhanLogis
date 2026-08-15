# 이슈 #999 축①·축② 구현 상태 정찰

- 측정: 2026-08-15, `main` `61c641f573c7d4ced398d1b5ac0203ede5a86db8`
- 범위: 축①·축②만 조사. 축③은 조사하지 않음.

## 판정

| 축 | 판정 | 되는 것 | 안 된 것 / 확인 불가 |
|---|---|---|---|
| ① 노출용 시리얼키 | **완료** | V26이 `serial_key VARCHAR(9) NOT NULL`과 unique index를 추가·소급 발급한다(`services/inventory-service/src/main/resources/db/migration/V26__add_stock_instance_serial_key_and_quality.sql:3-5,14-38,44-50`). 신규 발급은 `SI-` + 혼동방지 6자다(`services/inventory-service/src/main/java/com/samhanair/logis/inventory/domain/StockInstance.java:51-53,136,181-188`). 품목 화면은 UUID 없는 DTO와 `serialKey`를 쓴다(`services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/StockInstanceListResponse.java:7-13`; `clients/desktop/src/renderer/routes/warehouse/StockInstanceListModal.tsx:59-63`). QR·인쇄 라벨도 `serialKey`를 payload/표시값으로 쓴다(`clients/desktop/src/renderer/routes/components/SlipQrScanPanel.tsx:127-131`). | 별도 일반 전표/PDF 본문에 개체 시리얼을 싣는 경로는 **확인 불가**. 확인된 문서 출력은 QR 라벨이다. |
| ② 재고상황/품질 2축 | **부분** | V26이 `quality VARCHAR(20) NOT NULL DEFAULT 'NORMAL'`을 별도 추가한다(`services/inventory-service/src/main/resources/db/migration/V26__add_stock_instance_serial_key_and_quality.sql:3-5,40-46,50`). 재고상황 enum은 `AVAILABLE/RESERVED/SHIPPED/RECALLED`(`services/inventory-service/src/main/java/com/samhanair/logis/inventory/domain/StockInstanceStatus.java:18-28`), 품질 enum은 `NORMAL/USED/DAMAGED/REPACKAGED/BOX_DEFECT`(`services/inventory-service/src/main/java/com/samhanair/logis/inventory/domain/StockInstanceQuality.java:6-21`). 품목리스트에서 품질을 선택하고 `serialKey` 기준 PATCH하는 수동 경로가 있다(`clients/desktop/src/renderer/routes/warehouse/StockInstanceListModal.tsx:69-76`; `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/StockInstanceController.java:367-380`; `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:607-619`). | 신규 입고는 품질을 무조건 `NORMAL`로 둔다(`services/inventory-service/src/main/java/com/samhanair/logis/inventory/domain/StockInstance.java:136-140`). 입출고 QR 요청은 `slipNo`, `serialKey`, `productCode`만 받고 품질을 받지 않는다(`services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/QrScanRequest.java:9-18`). 따라서 **입출고 확정 시점의 품질 분류 경로는 없음**; 별도 품목리스트에서 사후/사전 수동 변경만 가능하다. |

## `inventory_db` READ ONLY 실측

`BEGIN; SET TRANSACTION READ ONLY; ... ROLLBACK;`로 조회했다. Flyway V15·V26 모두 `success=true`였다.

```text
stock_instances 컬럼(22)
id, product_id, product_code, warehouse_id, status, inbound_type,
received_at, unit_cost, inbound_slip_no, outbound_partner_code,
outbound_slip_no, outbound_at, created_at, created_by, modified_at,
modified_by, deleted_at, deleted_by, is_deleted, recall_slip_no,
serial_key, quality

전체 24행
serial_key: non-null 24 / blank 0 / 형식오류 0 / 중복 0
status: AVAILABLE 1 / SHIPPED 23
quality: NORMAL 24
```

DB에서도 두 컬럼은 실재하지만 품질 값은 전부 기본값 `NORMAL`이라, 비정상 품질의 실제 운영 분류 표본은 **0건**이다.
