# PR #1003 / Issue #1001 라이브 QA 3회차

- 일시: 2026-08-01 (Asia/Seoul)
- 담당: 라이브 QA 3회차
- 작업 원칙: 코드 수정 없음, git 쓰기 없음, 전용 throwaway 데이터만 사용
- 대상: 이미 배포된 `slip-service`, `partner-order-service` 실행 환경

## 시작 기록

본 보고서는 QA 시작 전에 생성했으며, 이후 관찰 결과를 append한다.

이번 라운드는 1·2회차 조사 결과에 따라 창고 매핑 우회를 사용한다. 정상 사용자 경로는 `warehouseCode`이나, 이 환경의 `WarehouseCodeMapper`는 legacy 코드만 받고 `HQ-001`을 매핑하지 않아 막혀 있다. 따라서 발행 요청에 실제 본사창고 UUID `11111111-1111-1111-1111-000000000001`을 `warehouseId`로 직접 전달한다. 이는 정상 경로 검증이 아닌 발행 경로 검증을 위한 우회다.

## 검증 범위

- ② 실 API 주문 생성 → 배송주소 입력 → 확정 → 발행: 단건 및 병합
- ③ 동일 요청 멱등 재시도 및 배송주소만 다른 요청의 분리 전표
- `slips.delivery_address` DB 실측
- 정리 후 주문·라인·전표·재고 예약·audit 행 수 대조

## 진행 로그

- [시작] 보고서 생성 완료.

## 사전 확인 및 주문 API 시도

사용 명령:

```powershell
docker ps --format "{{.Names}}`t{{.Image}}`t{{.Ports}}"
docker exec samhan-postgres psql -U samhan -d partner_order_db -At -F '|' -c "SELECT ..."
```

`samhan-slip-service`는 `127.0.0.1:18086->8086`, `samhan-partner-order-service`는 `127.0.0.1:18088->8088`로 실행 중이었다. `influxd` 충돌 우회 포트를 사용했으며, 재빌드·재기동은 하지 않았다.

주문 생성은 다음 실 API로 시도했다(헤더는 `X-Partner-Code: P-2026-0002`, `X-Biz-Code: 1068689215`, MASTER 테스트 호출자).

```text
POST http://127.0.0.1:18088/api/v1/partner-orders/drafts
{"label":"QA3-1001-S-20260801","payloadJson":"x"}
→ HTTP 201, draftId=b69b57f4-29c4-469c-a9b3-2761dfc89085, draftSeq=2

POST http://127.0.0.1:18088/api/v1/partner-orders/{draftId}/confirm
{"lines":[{"productId":"d7f488a5-6259-379c-8035-ed551e75a102","categoryKey":"singleSets","quantity":1,"remark":"QA3-1001-S"}],"deliveryAddress":"QA3-1001-S-ADDRESS"}
→ HTTP 200, orderNo=2026/05/31-3, status=CONVERTED, slipNo=null
```

같은 방식으로 M1/M2 주문도 시도했다.

```text
M1 confirm → HTTP 200, orderNo=2026/05/31-4, status=CONVERTED, slipNo=null
M2 confirm → HTTP 200, orderNo=2026/06/08-9, status=DRAFT, slipNo=null
```

그러나 DB에서 `QA3` 배송주소 주문은 0건이었고, 반환된 주문번호는 기존 `PO-CONF-P-2026-0002-{draftSeq}` 멱등키에 이미 존재하는 기존 주문을 반환한 결과였다. 다른 테스트 거래처 코드 `000011111111`은 confirm 시 `거래처 정체성을 확인할 수 없습니다`(HTTP 400)로 거절됐다. 따라서 이번 라운드에서 실 API 주문→확정으로 새 throwaway 주문을 확보하지 못했다.

## ② 발행 경로 및 배송주소 — 직접 warehouseId 우회

정상 사용자 경로는 `warehouseCode`이다. 그러나 이 환경의 `WarehouseCodeMapper`에는 `HQ-001`이 없고 legacy 코드/placeholder만 있어 해당 경로는 막혀 있다. 이에 `SlipPublishService.resolveWarehouseId(req.warehouseId(), req.warehouseCode())`의 우선 분기를 검증하기 위해 `warehouseId=11111111-1111-1111-1111-000000000001`을 직접 전달했다. 이는 정상 사용자 경로가 아닌 우회이며, 위 주문 confirm 경로 전체의 성공을 의미하지 않는다.

단건 직접 발행 명령:

```text
POST http://127.0.0.1:18086/api/v1/slips/from-partner-order
Idempotency-Key: QA3-1001-S-IDEM
{"partnerOrderId":"QA3-1001-S-DIRECT","partnerCode":"P-2026-0002","partnerName":"한국공조시스템(주)","warehouseCode":"HQ-001","warehouseId":"11111111-1111-1111-1111-000000000001","shippingAddress":"QA3-1001-S-SHIPPING","deliveryAddress":"QA3-1001-S-ADDRESS","lines":[{"lineNo":1,"productCode":"AR09TXEAAWKNEU-04","productName":"삼성 윈드프리 9평형","qty":"1","unitPriceExVat":818181,"unitPriceVat":900000,"supplyAmount":818181,"vatAmount":81819}]}
→ HTTP 201, slipNo=2026/08/01-1, status=SENT, idempotentReplay=false
```

DB 실측 직후:

```text
slips.slip_no | slips.source_id          | slips.delivery_address       | source_warehouse_id
2026/08/01-1 | QA3-1001-S-DIRECT       | QA3-1001-S-ADDRESS           | 11111111-1111-1111-1111-000000000001
2026/08/01-2 | QA3-1001-S-DIRECT-2     | QA3-1001-S-ADDRESS-2         | 11111111-1111-1111-1111-000000000001
2026/08/01-3 | a300...0001 (merge)     | QA3-1001-MERGE-ADDRESS       | 11111111-1111-1111-1111-000000000001
2026/08/01-4 | a300...0003 (merge)     | QA3-1001-MERGE-ADDRESS-2     | 11111111-1111-1111-1111-000000000001
```

판정: `slips.delivery_address`에 단건·병합 주소가 실제 저장되는 것은 PASS. 다만 주문 생성→확정→발행의 end-to-end 판정은 주문 멱등키 충돌 때문에 **미완료**다.

## ③ 멱등 재시도 및 주소 분리

단건 동일 요청 2회:

```text
1회: HTTP 201, slipId=52167778-30ea-47e5-9316-1c6c00545947, slipNo=2026/08/01-1, idempotentReplay=false
2회: HTTP 200, 동일 slipId/slipNo, idempotentReplay=true
```

배송주소만 다른 별도 요청:

```text
Idempotency-Key=QA3-1001-S-IDEM-2,
deliveryAddress=QA3-1001-S-ADDRESS-2
→ HTTP 201, slipId=37de5e88-54fa-481c-b633-c20c8366f088, slipNo=2026/08/01-2,
  delivery_address=QA3-1001-S-ADDRESS-2
```

병합 직접 발행도 `warehouseId`를 직접 전달했다.

```text
POST /api/v1/slips/from-orders-merge
→ 1회 HTTP 201, slipNo=2026/08/01-3, delivery_address=QA3-1001-MERGE-ADDRESS
→ 동일 요청 2회 HTTP 200, 동일 slipId/slipNo, idempotentReplay=true
→ 주소 변경 + 새 키 HTTP 201, slipNo=2026/08/01-4, delivery_address=QA3-1001-MERGE-ADDRESS-2
```

판정: 직접 slip 발행 API 기준 멱등 재시도 PASS, 주소 변경 시 별도 전표 PASS. 병합 API는 `sourceOrders.partnerOrderId`에 UUID가 필요하여 UUID 형식의 전용 throwaway source ID를 사용했다.

## 정리 및 행 수 대조

생성한 단건/병합 전표 4건은 `slip_publish_audit`, `slip_source_orders`, `slip_lines`를 먼저 삭제한 뒤 전표를 삭제했다. 주문 draft는 `label LIKE 'QA3%'` 조건으로 soft delete했다. 주문 API가 새 주문을 만들지 않았으므로 주문·라인 삭제 대상은 없었다.

정리 후 read:

```text
slip_db: slips=0, slip_lines=0, slip_publish_audit=0, slip_source_orders=0
inventory_db: stock_movements(reference_id QA3/a300...)=0, inventory_audit_logs(created_by live-qa-1001)=0
partner_order_db: QA3 drafts active=0, QA3 drafts all=5(soft-deleted), QA3 orders=0, QA3 lines=0
```

`partner_order_audit_logs actor_name=live-qa-1001`의 3행은 1·2회차 QA2 주문 삭제 audit(`entity_id`가 QA2 주문 UUID, `field_name=DELETE`)로 이번 라운드 생성분이 아니다. 현재 git 상태는 보고서 신규 파일만 untracked이며 HEAD는 `13b1697e062ad2852ac58fa73f1a98eded31f2dc` 그대로다.

## 확인하지 못한 것

- 실제 새 주문 1건 및 실제 새 주문 2건을 실 API로 생성한 뒤 그 주문의 confirm 결과가 발행으로 이어지는 end-to-end.
- `partner-order-service`의 `convert-to-slip`/`convert-to-slip-merge`가 직접 warehouseId를 받아 정상 경로로 완료되는지. 해당 요청 DTO/서비스는 warehouseCode를 요구하고, 이 환경에서는 HQ-001 매핑에서 400으로 막힌다.
- 새 주문의 `partner_order_lines`가 `slip_lines.source_order_line_id`로 연결되는지와 주문별 재고 예약 행. 이번 직접 slip 우회는 주문·재고 예약을 만들지 않는다.
- 정상 사용자 `warehouseCode=HQ-001` 경로의 성공. 본 라운드는 의도적으로 실제 warehouse UUID 직접 전달 우회만 검증했다.

## 최종 판정

- 배송주소 저장(`slips.delivery_address`) 직접 발행 경로: **PASS**
- 단건/병합 직접 발행 멱등 재시도: **PASS**
- 배송주소만 변경 시 별도 전표: **PASS**
- 주문 생성→주소 입력→확정→발행 전체 체인: **미완료/BLOCKED** — 기존 주문 멱등키 충돌 및 정상 warehouseCode 매핑 부재
- 데이터 정리 및 throwaway 잔존 전표/라인/audit/재고 movement: **PASS**
