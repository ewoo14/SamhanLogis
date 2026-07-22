# S7 도달가능 3 — 주문 거래처 정체성 분리 설계

## 배경

`partner_orders`는 현재 `partner_code`와 `biz_code`만 보존한다. 거래처 soft-delete 후 동일 `partner_code`를 재사용할 수 있으므로, `PartnerOrderMergeConvertService`가 `partnerCode` 문자열만 비교하면 서로 다른 거래처의 주문을 한 전표로 발행할 수 있다.

## 불변식

- I1: 병합 판정은 주문에 저장된 거래처 UUID(`partner_id`)로 한다.
- I2: 기존 주문도 병합 시 동일 판정을 받는다. UUID가 없는 기존 주문은 성공시키지 않는다.
- I3: 기존 행의 UUID를 migration이 추측해 확정하지 않는다. `partner_id IS NULL`을 미해결 상태로 보존하고 병합에서 명시적으로 거부한다.
- I4: `partner_code`와 `biz_code`는 표시용 snapshot으로 유지하며 UUID를 대체하거나 화면에 노출하지 않는다.

## 설계

### 스키마

partner-order-service의 새 Flyway migration에 `partner_orders.partner_id UUID NULL`을 추가한다. 기존 적용 migration은 수정하지 않는다. 기존 행은 backfill하지 않으며, null 자체가 운영자가 확인·재조정해야 하는 미해결 상태다.

새 주문에는 partner-service internal lookup의 `partnerId`를 저장한다. `partnerCode`로 조회한 결과의 코드와 사업자번호가 주문 입력/snapshot과 일치하지 않거나 UUID가 없으면 주문 생성 자체를 거부한다.

### 병합

`PartnerOrderMergeConvertService`는 주문 조회와 상태 검증 직후 다음을 검사한다.

1. 모든 주문의 `partnerId`가 존재하는지 확인한다.
2. 첫 주문의 UUID와 나머지 UUID가 모두 같은지 확인한다.
3. null 또는 불일치면 409를 반환하고 reserve/slip 호출을 하지 않는다.

`partnerCode`/`bizCode` 비교는 정체성 판정에서 제거한다. 응답·인쇄·목록의 표시 필드는 기존 snapshot을 그대로 사용한다.

병합 요청은 검증된 `partnerId`를 slip-service까지 전달한다. slip-service도 `partnerCode`를
재조회해 UUID를 대체하지 않고 전달받은 UUID를 전표의 정체성으로 저장한다. 그렇지 않으면
코드 X가 UUID-A에서 UUID-B로 재사용된 뒤 partner-order-service의 검증을 통과한 UUID-A
주문이 최종 전표에서 UUID-B로 다시 귀속될 수 있다. `partnerId`가 없는 내부 병합 요청은
400으로 거부한다.

### 신규 주문 경로

- 거래처 confirm: `X-Partner-Code`로 partner-service를 조회하고 `X-Biz-Code`와 lookup의 `bizNo`를 검증한다.
- 견적→주문: estimate snapshot의 `partnerCode`로 partner-service를 조회하고 snapshot `bizCode`와 `bizNo`를 검증한다.
- 조회 실패, UUID 누락, 코드/사업자번호 불일치는 fail-soft하지 않고 주문 생성을 중단한다.
- 기존 seed/legacy factory는 null identity를 허용하되, 해당 주문은 병합 시 미해결 상태로 거부된다.

## backfill 정책

이번 migration은 외부 partner DB에 접근할 수 없고, 주문 row의 문자열만으로 과거 UUID를 확정할 수 없다. 따라서 자동 backfill을 실행하지 않는다. 동일 코드의 삭제 이력과 활성 거래처가 존재하거나, partner DB의 과거 시점 매핑이 제공되지 않은 행은 모두 null로 남긴다. 운영자가 독립적인 감사자료로 1:1 매핑을 확인한 행만 별도 승인된 후속 작업에서 명시 UUID를 채울 수 있다.

null 행을 조용히 현재 활성 거래처에 연결하지 않는 이유는 코드 재사용 시 과거 주문을 신규 거래처에 영구 귀속시키는 데이터 손상이 되돌리기 어렵기 때문이다. 현재 동작은 병합 409와 명시 로그로 미해결 상태를 드러낸다.

## 검증

- RED: 실 Postgres에서 동일 `partnerCode`·상이 UUID 주문 병합이 기존 문자열 비교로 성공한다.
- GREEN: `partner_id`가 다른 주문은 409이며 reserve/slip가 호출되지 않는다.
- GREEN: 같은 UUID 주문은 기존 성공 경로를 유지한다.
- GREEN: `partner_id IS NULL` 기존 주문은 미해결 409로 거부된다.
- mutation RED: 병합 비교를 다시 `partnerCode` 문자열로 바꾸면 동일 코드·상이 UUID 테스트가 다시 성공해 테스트가 RED가 된다.
- fresh Postgres probe: DROP/CREATE한 별도 PostgreSQL에 Flyway 전체 적용, `psql -v ON_ERROR_STOP=1`로 컬럼·null backfill·제약을 확인한다.
