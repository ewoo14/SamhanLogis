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

> **실행 위치**: 위 두 명령은 **Prometheus 에 직접 접근 가능한 호스트**에서 실행한다. 로컬 dev
> 스택(docker-compose)은 호스트에서 `http://localhost:9090` 이 바로 열려 있지만, **prod 에는
> Prometheus 컨테이너 자체가 없다**(모니터링 = CloudWatch 일원화, `infrastructure/terraform/CUTOVER.md`
> M-20). prod 조사는 아래 "CloudWatch에서는" 문단과 `CUTOVER.md` M-20 의 `aws logs
> filter-log-events`/`aws cloudwatch describe-alarm-history` 명령을 사용한다. 원격 dev 조사가
> 필요하면 해당 호스트로 SSH/포트포워딩해 `localhost:9090` 을 먼저 확보한다.

최근 terminal 실패와 사유를 확인한다.

```promql
sum by (reason) (increase(partner_order_slip_publish_terminal_total{job="partner-order-service",reason=~"invalid_input|conflict|max_retry_exhausted"}[5m]))
```

CloudWatch에서는 `/samhanlogis/production/docker` 로그 그룹에서 `Outbox FAILED_PERMANENT`를 검색하고,
같은 시각의 partner-order-service 로그에서 `orderId`, `errorCode`, `error`를 확인한다. 주문 UUID는
사용자에게 노출하지 말고 운영 로그/DB 내부 상관관계 확인에만 사용한다.

## 조치 순서

1. `invalid_input`이면 주문의 거래처 코드와 partner-service 등록 여부를 확인한다. 원인이 "거래처
   코드가 partner-service 에 아직 등록되지 않음"처럼 **outbox 의 저장된 요청 본문 내용과는 무관한
   외부 조건**이면, 아래 "재발행 절차 (1)"이 유효한 대상이다. 원인이 "주문 자체에 잘못된 거래처
   코드가 입력되어 있음"처럼 **저장된 요청 본문 내용 자체를 바꿔야 하는 경우**는 아래 "재발행 절차
   (2)"로 넘어간다. 실패 주문을 무조건 재실행하지 않는다.
2. `conflict`이면 멱등 키와 요청 본문이 의도적으로 같은지 확인하고, 원 요청과 다른 본문을 같은 키로
   재사용하지 않도록 수정한다. slip-service 가 이미 같은 멱등 키로 다른 본문을 커밋했다면, 이
   outbox 의 고정된 본문으로 재시도해도 다시 충돌한다 — 이 경우도 "재발행 절차 (2)"로 넘어간다.
3. `max_retry_exhausted`이면 slip-service 및 partner-service의 5xx/연결/타임아웃, DB 지연, 결과
   writer 트랜잭션 실패를 해당 시각 로그와 함께 확인한다. 다운스트림이 이미 복구되어 있다면 저장된
   요청 본문을 바꿀 필요가 없는 전형적인 "재발행 절차 (1)" 대상이다.
4. 원인이 해결되면 아래 "재발행 절차"에 따라 처리하고, 전표가 생성된 경우 주문의
   `slipPublishStatus`, 연결 전표 번호, 전표 source 정합을 함께 확인한다.
5. 재발행 전에는 동일 요청의 기존 전표와 멱등 키를 확인해 중복 전표를 만들지 않는다(재발행 절차
   (1)의 사전 확인 SELECT 참조). producer 재배선은 이 runbook 범위가 아니다.

## 재발행 절차

**partner-order-service 에는 수동 재발행 API·버튼이 없다.** 표준 "출고전표 전환"(convert)
화면·API 도 대안이 될 수 없다 — 도메인 가드 `PartnerOrder.requireConvertible()` 이 이 outbox 가
다루는 정확한 상태(`status=CONFIRMED`)의 주문을 **이중 발행 방지 목적으로 명시적으로 차단**한다
(코드 주석: "이 가드가 CONFIRMED + slipNo=null(PENDING_RETRY 재시도 대기) 주문의 이중발행을
원천 차단한다" — `PartnerOrder.java`). 즉 재발행의 실제 수단은 **아래 (1) DB 직접 조작뿐**이며,
그마저도 조건이 맞을 때만 안전하다.

### 사전 판단 — (1)과 (2) 중 선택

`slip_publish_outbox.request_payload` 는 최초 실패 시점에 고정된 JSON이며, 이후 이를 갱신하는
애플리케이션 기능은 없다(엔티티에 payload setter 자체가 없음). 따라서:

- 근본 원인이 **저장된 요청 본문 내용과 무관**(예: 다운스트림이 이제 막 복구됨 / 거래처 코드가
  `partner-service` 마스터에 새로 등록되어 같은 본문이 이제는 성공할 것으로 기대됨) →
  **(1) DB 재큐잉**이 안전하다.
- 근본 원인이 **저장된 요청 본문 내용 자체가 틀림**(주문에 잘못된 거래처 코드가 입력된 채로 이미
  outbox 가 만들어짐 등) → **(2) 현재 수동 재발행 수단 없음 — 개발팀 에스컬레이션**이 정답이다.
  같은 본문을 재시도해도 동일하게 실패하거나, `permanent-error-min-attempts`(기본 2)가 부여하는
  유예 1회를 소진하고 곧바로 재종결된다.

판단이 어려우면 아래 사전 확인 SELECT ③으로 `request_payload` 내용을 직접 확인한 뒤 결정한다.

### (1) DB 재큐잉 — 저장된 요청 본문을 바꾸지 않고 재시도만으로 성공 가능할 때

> ⚠️ 이 조작은 애플리케이션을 거치지 않고 운영 DB에 직접 쓰는 것이다. 대상을 반드시 아래 SELECT
> 로 먼저 확정하고, UPDATE 의 `WHERE` 절 상태 조건을 생략하지 않는다(사전 확인과 다른 상태의 행을
> 실수로 되돌리는 것을 막는 안전장치). 주문 UUID는 운영 로그/DB 내부 상관관계 확인에만 사용하고
> 사용자에게 노출하지 않는다.

**사전 확인**:

```sql
-- ① outbox row 상태 — status 가 FAILED 인지, attempt_count/last_error 확인
SELECT id, partner_order_id, idempotency_key, status, attempt_count,
       first_attempted_at, last_attempted_at, next_attempt_at, last_error
  FROM slip_publish_outbox
 WHERE partner_order_id = '<ORDER_UUID>'
   AND is_deleted = false;

-- ② 연결 주문 상태 — status=CONFIRMED, slip_no IS NULL, slip_publish_status=FAILED_PERMANENT 인지 확인
SELECT id, status, slip_no, slip_publish_status
  FROM partner_orders
 WHERE id = '<ORDER_UUID>'
   AND is_deleted = false;

-- ③ 저장된 요청 본문 — 실패 원인이 이 값 자체와 무관한지 확인(사전 판단 참조)
SELECT request_payload
  FROM slip_publish_outbox
 WHERE partner_order_id = '<ORDER_UUID>'
   AND is_deleted = false;
```

①이 `status = 'FAILED'`가 아니거나 ②의 조건이 다르면 즉시 중단하고 원인을 다시 조사한다(예:
`PROCESSING`이면 스케줄러가 이미 처리 중 — 5분 뒤 재확인). 원래 실패 진단(사유·시각·오류 상세)은
이 UPDATE 로 지워지지 않는다 — `partner_order_history` 의 `SLIP_FAILED_PERMANENT` 이벤트에
영구 보존되어 있다.

**원자 재큐잉 트랜잭션** (위 사전 확인이 모두 일치하고, 사전 판단이 "(1)"일 때만 실행):

아래 블록은 두 행을 같은 트랜잭션에서 `FOR UPDATE`로 잠근 뒤 조건을 다시 검증한다. 어느
검증이든 실패하거나 UPDATE 영향 행 수가 정확히 1이 아니면 예외를 발생시켜 전체 트랜잭션을
중단한다. `partner_orders.lock_version`은 V5 `@Version` 낙관락 컬럼이므로 직접 SQL에서도
반드시 증가시킨다. 오류가 발생하면 `COMMIT`하지 말고 `ROLLBACK`한다.

```sql
BEGIN;

DO $$
DECLARE
    locked_outbox slip_publish_outbox%ROWTYPE;
    locked_order partner_orders%ROWTYPE;
    outbox_updated integer;
    order_updated integer;
BEGIN
    -- 항상 outbox → order 순서로 잠가 다중 운영자 재큐잉의 교차 잠금을 피한다.
    SELECT * INTO locked_outbox
      FROM slip_publish_outbox
     WHERE partner_order_id = '<ORDER_UUID>'::uuid
       AND is_deleted = false
     FOR UPDATE;

    IF NOT FOUND OR locked_outbox.status <> 'FAILED' THEN
        RAISE EXCEPTION '재큐잉 중단: outbox가 정확히 1건의 FAILED 행이 아님';
    END IF;

    SELECT * INTO locked_order
      FROM partner_orders
     WHERE id = '<ORDER_UUID>'::uuid
       AND is_deleted = false
     FOR UPDATE;

    IF NOT FOUND
       OR locked_order.status <> 'CONFIRMED'
       OR locked_order.slip_no IS NOT NULL
       OR locked_order.slip_publish_status <> 'FAILED_PERMANENT' THEN
        RAISE EXCEPTION '재큐잉 중단: 주문 상태가 CONFIRMED + slip 미연결 + FAILED_PERMANENT가 아님';
    END IF;

    UPDATE slip_publish_outbox
       SET status = 'PENDING',
           attempt_count = 1,
           first_attempted_at = now(),
           next_attempt_at = now(),
           last_error = 'MANUAL REQUEUE - <근본원인 요약>',
           modified_at = now(),
           modified_by = '<운영자 계정>'
     WHERE id = locked_outbox.id
       AND is_deleted = false
       AND status = 'FAILED';
    GET DIAGNOSTICS outbox_updated = ROW_COUNT;
    IF outbox_updated <> 1 THEN
        RAISE EXCEPTION '재큐잉 중단: outbox UPDATE 영향 행 수가 %', outbox_updated;
    END IF;

    UPDATE partner_orders
       SET slip_publish_status = 'PENDING_RETRY',
           lock_version = lock_version + 1,
           modified_at = now(),
           modified_by = '<운영자 계정>'
     WHERE id = locked_order.id
       AND is_deleted = false
       AND status = 'CONFIRMED'
       AND slip_no IS NULL
       AND slip_publish_status = 'FAILED_PERMANENT';
    GET DIAGNOSTICS order_updated = ROW_COUNT;
    IF order_updated <> 1 THEN
        RAISE EXCEPTION '재큐잉 중단: partner_orders UPDATE 영향 행 수가 %', order_updated;
    END IF;
END $$;

COMMIT;
```

각 필드를 바꾸는 이유:

- `idempotency_key`와 `request_payload`는 **그대로 둔다** — 바꾸지 않는 것이 안전의 핵심이다.
  slip-service는 같은 키로 재시도가 오면 200 replay로 응답하도록 설계돼 있어(설계서 §6), 원 요청이
  실제로는 부분 성공했더라도 이 재시도가 중복 전표를 만들지 않는다.
- `first_attempted_at = now()`는 **필수**다 — 그대로 두면 스케줄러가 claim 직후
  `expireIfExhausted`로 즉시 재종결한다(경과 시간이 이미 max-retry-hours(기본 24h)를 넘겼을 수
  있다).
- `attempt_count = 1`은 `permanent-error-min-attempts`(기본 2) 판정을 "새 시도"로 되돌린다 —
  그대로 두면 같은 사유로 한 번만 더 실패해도 유예 없이 즉시 재종결된다.
- 두 `SELECT ... FOR UPDATE`의 상태 재검증과 두 UPDATE의 영향 행 수 검사, WHERE 절의 상태 조건은
  **생략하지 않는다**. 하나라도 어긋나면 두 전이를 모두 롤백해야 하며, outbox만 PENDING이거나
  주문만 PENDING_RETRY인 부분 전이를 남겨서는 안 된다.
- `lock_version = lock_version + 1`은 이미 로드된 JPA `@Version` 엔티티가 수동 복구 결과를
  오래된 값으로 덮어쓰지 못하게 하는 필수 조건이다.

재큐잉 후 최대 5분(스케줄러 cron 주기) 이내에 다음 시도가 실행된다. 아래 "복구 확인"으로 결과를
확인한다.

### (2) 현재 수동 재발행 수단 없음 — 개발팀 에스컬레이션

저장된 요청 본문 내용 자체를 바꿔야 하는 경우, partner-order-service 에는:

- `request_payload`를 갱신하는 API·스크립트가 없고,
- 표준 "출고전표 전환" 경로는 `requireConvertible()`이 이 정확한 상태(CONFIRMED +
  slipNo=null)를 이중 발행 방지 목적으로 명시 차단하며,
- outbox row 를 soft-delete 하고 새 row 를 만드는 것도 애플리케이션 코드 밖의 임의 조작이라
  idempotency-key 재사용 계약을 우회하는 위험이 있어 권장하지 않는다.

**정직한 결론: 안전한 셀프서비스 재발행 수단이 없다.** 개발팀에 주문 UUID(내부 상관관계용)·근본
원인·정정된 값을 전달해, 코드 변경 또는 개발자 감독 하에 이뤄지는 데이터 정정을 요청한다. 이
경로를 runbook만으로 반복 처리해야 하는 빈도가 늘면, "정정 후 outbox 재발행"을 위한 정식
애플리케이션 수단(예: 관리자 API) 신설을 별도 슬라이스로 제안한다.

## 복구 확인

- Prometheus에서 해당 `reason` 증가가 멈췄다.
- 주문 응답에 `slipPublishStatus`가 실제 상태로 반환된다.
- 발행 성공 시 연결 전표 번호와 전표 source가 동일 주문을 가리킨다.
- (1) DB 재큐잉을 수행한 경우: `slip_publish_outbox.status`가 `PENDING → PROCESSING →
  COMMITTED`(성공) 또는 다시 `FAILED`(재실패)로 전이하는지 다음 스케줄러 tick(최대 5분) 이후
  확인한다. `FAILED`로 재전이하면 사전 판단이 틀렸다는 뜻이며 — 재시도하지 말고 "재발행 절차 (2)"로
  넘어간다.
