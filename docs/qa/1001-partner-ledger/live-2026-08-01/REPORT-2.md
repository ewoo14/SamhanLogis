# PR #1003 / Issue #1001 — 라이브 QA 2회차

- 일자: 2026-08-01
- 담당: 라이브 QA 2회차
- 작업 규율: 코드 수정 금지, Git 쓰기 금지, 주문·확정·발행 픽스처는 실 API만 사용
- 기준 브랜치/HEAD: `feat/1001-partner-ledger-spec` / `36dbfc92ac2c23c07ab816d79533adf7bbdbd772`
- 대상 서비스: 이미 배포된 `slip-service`, `partner-order-service` 실행·검증만 수행

## 진행 로그

### 시작

- `REPORT-2.md`를 라이브 QA 시작 전에 생성함.
- 목표: ② 배송주소의 주문 생성→확정→단건/병합 발행→`slips.delivery_address` 전달 확인, ③ 발행 멱등 재시도 및 배송주소별 구분 확인.
- 모든 명령·응답 코드·응답 요지·DB 실측·정리 결과를 이 문서에 append한다.

### 배포·포트 및 초기 오염 확인

명령:

```powershell
docker ps --format '{{.Names}}\t{{.Ports}}\t{{.Status}}' | Sort-Object
Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in 18086,18088,8086,8088}
docker exec samhan-postgres psql -U samhan -d partner_order_db -At -F '|' -c "SELECT ... WHERE order_no LIKE 'QA2-1001-%'"
docker exec samhan-postgres psql -U samhan -d slip_db -At -F '|' -c "SELECT ... WHERE slip_no LIKE 'QA2-1001-%'"
docker exec samhan-postgres psql -U samhan -d inventory_db -At -F '|' -c "SELECT ... WHERE reference_no LIKE 'QA2-1001-%'"
```

결과:

- `samhan-slip-service`: `127.0.0.1:18086->8086`, healthy, 약 10분 전 기동.
- `samhan-partner-order-service`: `127.0.0.1:18088->8088`, healthy, 약 10분 전 기동.
- `samhan-api-gateway`: `127.0.0.1:8080->8080`, 재기동하지 않음.
- `influxd` 포트 우회 조건은 그대로 확인됨. 허용된 두 서비스 외에는 재빌드·재기동하지 않는다.
- 전용 prefix `QA2-1001-%` 초기 주문/라인/전표/audit는 모두 `0`.
- 첫 SQL에서 잘못된 DB에 `slips`를 조회하고 inventory 테이블명을 추정하여 오류가 났으나 데이터 변경은 없었다. 실제 테이블 목록은 read-only로 확인했고, 이후 올바른 DB/테이블명을 사용한다.

판정: QA 환경 사용 가능. 위 오류는 검사 명령 오류이며 제품 응답 오류가 아니다.

### ② 실 API 주문 생성·확정

선행 데이터는 DB INSERT가 아니라 다음 실 API로 생성했다.

1. `POST http://127.0.0.1:18088/api/v1/partner-orders/drafts`
   - body: `{"label":"QA2-1001-S-20260801","payloadJson":"{\"source\":\"live-qa-1001\"}"}`
   - 응답: HTTP `201`, `success=true`, `draftSeq=1`, draft 생성 성공.
2. `POST /api/v1/partner-orders/{draftId}/confirm`
   - body: `{"lines":[{"productId":"d7f488a5-6259-379c-8035-ed551e75a102","categoryKey":"singleSets","quantity":1,"remark":"QA2-1001"}],"deliveryAddress":"QA2-1001-S-ADDRESS"}`
   - 응답: HTTP `200`, `success=true`, 주문번호 `2026/08/01-1`, `status=DRAFT`, `slipNo=null`.
3. 같은 절차로 병합용 주문 2건을 생성·확정했다.
   - M1 draft: HTTP `201`, `draftSeq=2`; confirm: HTTP `200`, 주문번호 `2026/08/01-2`, `status=DRAFT`, 주소 `QA2-1001-M1-ADDRESS`.
   - M2 draft: HTTP `201`, `draftSeq=3`; confirm: HTTP `200`, 주문번호 `2026/08/01-3`, `status=DRAFT`, 주소 `QA2-1001-M2-ADDRESS`.

DB 읽기 확인:

```text
order_no          status  slip_publish_status  delivery_address       quantity converted_quantity
2026/08/01-1      DRAFT   NOT_REQUIRED         QA2-1001-S-ADDRESS      1        0
2026/08/01-2      DRAFT   NOT_REQUIRED         QA2-1001-M1-ADDRESS     1        0
2026/08/01-3      DRAFT   NOT_REQUIRED         QA2-1001-M2-ADDRESS     1        0
```

`confirm` API가 성공했지만 현재 계약상 주문 상태는 `DRAFT`로 남는다. 소스 문서의 `DRAFT/ON_HOLD → convert-to-slip` 경로와 일치하므로 이를 발행 전 차단 사유로 판단하지 않고 계속 발행을 시도했다.

### ② 단건 발행

명령:

```powershell
POST http://127.0.0.1:18088/api/v1/partner-orders/5490bd9d-f764-4a65-9637-ea1e5db3c281/convert-to-slip
X-User-Id: dev_master
X-User-Name: live-qa-1001
X-User-Role: MASTER
X-Is-System-Master: true
X-Internal-Token: dev-internal-token-change-me
body: {"items":[{"orderLineId":"fc728701-8330-4c92-bff9-97321abfd319","quantity":1}],"warehouseCode":"HQ-001"}
```

응답:

```text
HTTP 400
{"success":false,"code":"INVALID_INPUT","message":"요청 본문이 유효하지 않습니다","data":null}
```

응답 본문에 상세 원인이 포함되지 않았다. `partner_orders`는 `DRAFT`, `slip_no` 공란으로 유지됐고 `slip_db.slips`에는 해당 source 전표가 생성되지 않았다. 재고는 보상 경로 후 `reserved_qty`가 초기값으로 돌아갔는지 정리 단계에서 재확인한다.

### ② 병합 발행

명령:

```powershell
POST http://127.0.0.1:18088/api/v1/partner-orders/convert-to-slip-merge
X-User-Id: dev_master
X-User-Name: live-qa-1001
X-User-Role: MASTER
X-Is-System-Master: true
X-Internal-Token: dev-internal-token-change-me
body: {
  "orders":[
    {"partnerOrderId":"2026/08/01-2","items":[{"orderLineId":"8c4d1d5e-9020-4060-8603-e0da69bdb9b3","quantity":1}]},
    {"partnerOrderId":"2026/08/01-3","items":[{"orderLineId":"f7a02dce-9ae4-4fc8-80a5-db5488a9a92f","quantity":1}]}
  ],
  "warehouseCode":"HQ-001",
  "shippingInfo":{"deliveryAddress":"QA2-1001-MERGE-ADDRESS"}
}
```

응답:

```text
HTTP 400
{"success":false,"code":"INVALID_INPUT","message":"요청 본문이 유효하지 않습니다","data":null}
```

응답 본문은 단건과 동일하게 상세 원인을 주지 않았다. 병합 대상 주문·라인은 변하지 않았고 병합 전표도 생성되지 않았다.

원인 조사(read-only): partner-order-service는 단건/병합 모두 `slip-service` 4xx를 `INVALID_INPUT`으로 일반화한다. 현재 `slip-service` 배포 환경에는 `app.publish.warehouse-code-map` 설정이 없고 컨테이너 환경변수에도 warehouse 매핑이 없다. 코드 주석/설정상 기본 매핑 키는 `00003`, `2`, `14`, `1`인데 inventory DB의 실제 창고 코드는 `HQ-001`, `CS-001`, `VH-001`, `VR-001`이다. 따라서 `HQ-001`은 partner-order의 재고 예약 단계는 통과하더라도 slip-service 매핑 경계에서 400으로 막히는 환경 문제 신호다. 서비스 재배포·설정 변경은 이번 QA 범위와 금지사항상 수행하지 않았다.

판정: 실 API로 주문 생성·확정은 PASS. 단건·병합 발행은 HTTP 400 `INVALID_INPUT`으로 미완료. 배송주소가 전표까지 도달하는 성공 경로는 확인하지 못했다.

## ③ 멱등 재시도

최초 단건·병합 발행이 모두 400으로 끝나 새 전표가 생성되지 않았다. 따라서 같은 발행 요청 2회에 대한 기존 전표 replay 여부, 배송주소만 다른 요청의 전표 분리 여부는 확인하지 못했다.

## 정리 후 행 수 대조

정리는 실 API soft delete로 수행했다. 명령:

```powershell
DELETE /api/v1/partner-orders/5490bd9d-f764-4a65-9637-ea1e5db3c281
DELETE /api/v1/partner-orders/16129f14-3d40-4f38-b1d7-94f82388e415
DELETE /api/v1/partner-orders/94d20326-2716-4ef1-ad7e-2c77f9c8260f
```

각 응답: HTTP `204`.

정리 후 read-only DB 실측:

```text
partner_orders (QA 주문 3건): active 0 / soft-deleted 3 / all 3
partner_order_lines (QA 라인 3건): active 0 / soft-deleted 3 / all 3
slips (QA 주문 source_id 일치): 0
slip_publish_audit (QA 주문 source_id 일치): 0
```

재고 확인:

- 이번 QA 시각(`2026-08-01 01:03~01:05`)의 QA 주문 관련 신규 `stock_movements`: 없음.
- 같은 품목/HQ-001의 `reserved_qty=1`은 QA 시작 직전부터 존재한 기존 행이며, 이번 QA의 `reference_id`와 일치하는 movement는 0건이다. 실 데이터 오염 방지를 위해 기존 예약은 수정·삭제하지 않았다.
- 이 라운드 발행 실패에 따른 신규 예약 잔류는 확인되지 않았다.

판정: QA throwaway 주문·라인은 실 API soft delete로 비활성화했고, 전표·전표 발행 audit·이번 라운드 신규 재고 movement는 0건이다. Soft delete 특성상 DB 전체 행 수가 0이 되지는 않는다.

## 확인하지 못한 것

- 단건 성공 발행 후 `slips.delivery_address`에 `QA2-1001-S-ADDRESS`가 저장되는지.
- 병합 성공 발행 후 `slips.delivery_address`에 `QA2-1001-MERGE-ADDRESS`가 저장되는지.
- 성공 발행 동일 요청 2회 시 새 전표 없이 기존 결과가 replay되는지.
- 배송주소만 다른 두 발행 요청이 서로 다른 전표로 구분되는지.
- 발행 요청 400의 서비스 내부 상세 원문. 외부 응답은 `INVALID_INPUT / 요청 본문이 유효하지 않습니다`로 일반화되어 반환됐다.

## 최종 판정

- 실 API 주문 생성·배송주소 입력·confirm: **PASS** (3건 모두 HTTP 201/200, DB 주소 저장 확인).
- 단건·병합 발행: **미완료/BLOCK** (각 HTTP 400 `INVALID_INPUT`; 성공 전표 0건).
- `slips.delivery_address`: **측정 불가** (전표 미생성).
- 멱등 재시도 및 주소별 구분: **검증 불가** (최초 발행 실패).
- 환경 신호: `slip-service`의 정적 warehouse-code 매핑 키와 inventory 실제 코드가 불일치하며 컨테이너 환경변수 매핑도 없다. 이번 QA에서는 재배포·설정 변경을 하지 않았다.
