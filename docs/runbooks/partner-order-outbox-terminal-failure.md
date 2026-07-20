# partner-order-service 전표 발행 outbox 영구실패 runbook

## 증상

- Prometheus `PartnerOrderSlipPublishTerminalFailure` 경보가 발생한다.
- 주문은 `FAILED_PERMANENT`로 표시되고 연결 전표가 없을 수 있다.
- CloudWatch에서는 `PartnerOrderOutboxFailedPermanent` 지표가 증가한다.

## 원인 후보

1. `invalid_input`: 등록되지 않았거나 복구할 수 없는 거래처 코드 입력.
2. `conflict`: 같은 멱등 키에 다른 요청 본문이 들어온 충돌.
3. `max_retry_exhausted`: 검증 불가·다운스트림 장애 또는 결과 저장 실패가 최대 재시도 시간을 넘김.
4. partner-order-service와 slip-service 사이의 5xx, 연결 실패, 타임아웃.

## 확인 쿼리

먼저 경보와 런타임 rule이 실제로 존재하는지 확인한다.

```powershell
curl.exe -s http://localhost:9090/api/v1/rules
curl.exe -s 'http://localhost:9090/api/v1/query?query=partner_order_slip_publish_terminal_total'
```

최근 terminal 실패와 사유를 확인한다.

```promql
sum by (reason) (increase(partner_order_slip_publish_terminal_total{job="partner-order-service",reason=~"invalid_input|conflict|max_retry_exhausted"}[5m]))
```

CloudWatch에서는 `/samhanlogis/production/docker` 로그 그룹에서 `Outbox FAILED_PERMANENT`를 검색하고,
같은 시각의 partner-order-service 로그에서 `orderId`, `errorCode`, `error`를 확인한다. 주문 UUID는
사용자에게 노출하지 말고 운영 로그/DB 내부 상관관계 확인에만 사용한다.

## 조치 순서

1. `invalid_input`이면 주문의 거래처 코드와 partner-service 등록 여부를 확인하고, 입력을 정정한 뒤 새 발행 요청을 만든다. 실패 주문을 무조건 재실행하지 않는다.
2. `conflict`이면 멱등 키와 요청 본문이 의도적으로 같은지 확인하고, 원 요청과 다른 본문을 같은 키로 재사용하지 않도록 수정한다.
3. `max_retry_exhausted`이면 slip-service 및 partner-service의 5xx/연결/타임아웃, DB 지연, 결과 writer 트랜잭션 실패를 해당 시각 로그와 함께 확인한다.
4. 원인이 해결되면 운영 절차에 따라 해당 주문을 재발행하고, 전표가 생성된 경우 주문의 `slipPublishStatus`, 연결 전표 번호, 전표 source 정합을 함께 확인한다.
5. 재발행 전에는 동일 요청의 기존 전표와 멱등 키를 확인해 중복 전표를 만들지 않는다. producer 재배선은 이 runbook 범위가 아니다.

## 복구 확인

- Prometheus에서 해당 `reason` 증가가 멈췄다.
- 주문 응답에 `slipPublishStatus`가 실제 상태로 반환된다.
- 발행 성공 시 연결 전표 번호와 전표 source가 동일 주문을 가리킨다.
