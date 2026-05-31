# 배포 런북 — D2 다중주문 병합 전환 (feat/d2-order-merge-to-slip)

> 브랜치 `feat/d2-order-merge-to-slip` 적용 배포 시 의무 절차.
> DevOps 리뷰 `docs/qa/slice-d2-order-merge/claude-devops-cycle1.md` 기반 작성.
> 대상 환경: Phase 11 AWS (단일 환경 — production only).

---

## 핵심 위험: 배포 순서 위반 시 동작

신규 병합 전환 기능은 아래 의존 방향을 가진다.

```
partner-order-service.PartnerOrderConvertController
  POST /api/v1/partner-orders/convert-to-slip-merge
    → SlipServiceClient.publishFromOrdersMerge
       → slip-service POST /api/v1/slips/from-orders-merge  (V30 필요)
```

**partner-order-service 를 먼저 배포하면** — slip-service 에 `/from-orders-merge` 엔드포인트가 아직 없어 `404` 반환 → `BusinessException(INTERNAL_ERROR)` → 병합 전환 전체 실패.

> 기존 단일전환(`/from-partner-order`) 및 주문 confirm 경로는 **별도 코드 경로**이므로 배포 순서 위반 시에도 영향 없음. D2 병합 전환 기능만 장애.

---

## 전제조건 (배포 착수 전 확인)

| 항목 | 확인 방법 |
|---|---|
| Docker 이미지 빌드 완료 | `slip-service:d2`, `partner-order-service:d2`, `desktop:d2` 이미지 존재 |
| AWS RDS slip DB — V30 미적용 | `SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;` → 29 이하 |
| CI 전 잡 green | `gh pr checks <PR번호>` 모두 pass |
| 배포 시간대 | 업무 종료 후 또는 사용량 최저 시간대 권장 |

---

## 배포 순서 (의무)

### 1단계 — slip-service 선행 배포

Flyway V30(`CREATE TABLE slip_source_orders`) + `/from-orders-merge` 엔드포인트를 먼저 활성화한다.

```bash
# EC2 접속 후
docker pull <registry>/slip-service:d2
docker-compose -f /opt/samhan/docker-compose.yml up -d slip-service
```

**Flyway V30 DDL (참조)**

```sql
-- V30__create_slip_source_orders.sql
CREATE TABLE slip_source_orders (
    id            UUID        NOT NULL PRIMARY KEY,
    slip_id       UUID        NOT NULL REFERENCES slips(id),
    partner_order_id UUID     NOT NULL,
    order_no      VARCHAR(64) NOT NULL,
    created_at    TIMESTAMP   NOT NULL,
    created_by    VARCHAR(50) NOT NULL,
    modified_at   TIMESTAMP,
    modified_by   VARCHAR(50),
    deleted_at    TIMESTAMP,
    deleted_by    VARCHAR(50),
    is_deleted    BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX ix_slip_source_orders_slip   ON slip_source_orders(slip_id);
CREATE INDEX ix_slip_source_orders_order  ON slip_source_orders(partner_order_id);
```

V30 은 CREATE TABLE + CREATE INDEX 순수 신설이므로 기존 테이블 락 없이 10초 미만 완료.

**1단계 헬스 확인**

```bash
curl -s http://localhost:8086/actuator/health | jq .status
# 기대값: "UP"
```

### 2단계 — 게이트웨이 라우팅 스모크 검증

`/api/v1/slips/from-orders-merge` 는 기존 `SlipPublishController`(`@RequestMapping("/api/v1/slips")`) 와 **동일 컨트롤러·동일 prefix** 에 소속된다. 기존 `/from-partner-order`, `/by-source` 경로가 이미 동일 게이트웨이 라우트로 운영 중이므로 **신규 게이트웨이 라우트 추가는 불필요**하다.

그러나 배포 후 라우팅 정상 동작을 명시적으로 확인한다.

```bash
# 게이트웨이 경유 스모크 (내부 토큰 헤더 포함)
# 빈 바디로 호출 — 200 또는 400/422 (비즈니스 에러) 이면 정상
# 절대 404 가 나오면 안 됨

curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8080/api/v1/slips/from-orders-merge \
  -H "Content-Type: application/json" \
  -H "X-Internal-Token: ${INTERNAL_TOKEN}" \
  -H "X-User-Role: MASTER" \
  -H "X-User-Id: 00000000-0000-0000-0000-000000000000" \
  -d '{}'

# 기대값: 400 또는 422 (바디 검증 실패) — 404 이면 배포 중단 후 원인 조사
```

> 배포 전 기존 경로(`/from-partner-order`)로 동일 검증을 수행하여 기준선 확보 권장.

### 3단계 — partner-order-service 배포

slip-service 헬스 green + 게이트웨이 스모크 200/4xx 확인 후 진행.

```bash
docker pull <registry>/partner-order-service:d2
docker-compose -f /opt/samhan/docker-compose.yml up -d partner-order-service

# 헬스 확인
curl -s http://localhost:<PARTNER_ORDER_PORT>/actuator/health | jq .status
# 기대값: "UP"
```

### 4단계 — Desktop FE 배포

```bash
# nginx static 파일 교체 (번들 경로 환경별 상이)
docker pull <registry>/desktop:d2
docker-compose -f /opt/samhan/docker-compose.yml up -d desktop
```

---

## 스모크 테스트 절차 (전체 기능 검증)

배포 완료 후 아래 순서로 병합 전환 기능 전체를 검증한다.

### 준비

1. 동일 거래처 `DRAFT` 상태 주문 2건 확인 (또는 신규 생성).
2. 주문 UUID, 거래처 UUID 메모.

### 검증 단계

```bash
# 1. 병합 전환 요청
curl -s -X POST http://localhost:8080/api/v1/partner-orders/convert-to-slip-merge \
  -H "Authorization: Bearer <MASTER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "orders": [
      {"partnerOrderId": "<주문1번호 또는 UUID>", "items": [{"orderLineId": "<주문1라인UUID>", "quantity": 10}]},
      {"partnerOrderId": "<주문2번호 또는 UUID>", "items": [{"orderLineId": "<주문2라인UUID>", "quantity": 5}]}
    ],
    "warehouseCode": "<창고코드>",
    "shippingInfo": {"shippingAddress": "서울/부산"}
  }'
# 기대값: 200 + { slipNo, convertedOrders:[{orderNo, orderStatus, fullyConverted}] }
# 참고: partner-order 요청은 orders[].items[](orderLineId/quantity) + warehouseCode + shippingInfo 구조.
#       slip-service(/from-orders-merge)의 sourceOrders/lines 구조와 다름(내부 변환).

# 2. slip DB 적중 확인 (psql — slip DB)
psql -h <RDS_HOST> -U samhan -d samhan_slip -c "
  SELECT sso.slip_id, sso.partner_order_id, sso.order_no
  FROM   slip_source_orders sso
  WHERE  sso.slip_id = (SELECT id FROM slips WHERE slip_no = '<응답 slipNo>')
  ORDER BY sso.created_at;
"
# 기대값: 2행 (주문1, 주문2 각각 1행) + order_no 채워짐

psql -h <RDS_HOST> -U samhan -d samhan_slip -c "
  SELECT s.source_id, s.status,
         (SELECT count(*) FROM slip_lines sl WHERE sl.slip_id = s.id AND sl.source_order_line_id IS NOT NULL) AS traced_lines
  FROM   slips s
  WHERE  s.slip_no = '<응답 slipNo>';
"
# 기대값: source_id = 대표주문UUID (첫 번째 주문), status = 'SENT', traced_lines = 라인 수

# 3. 각 주문의 converted_quantity 확인 (partner_order DB — slip DB 아님)
psql -h <RDS_HOST> -U samhan -d samhan_partner_order -c "
  SELECT pol.partner_order_id, pol.quantity, pol.converted_quantity
  FROM   partner_order_lines pol
  WHERE  pol.partner_order_id IN ('<주문1UUID>', '<주문2UUID>')
  ORDER BY pol.partner_order_id;
"
# 기대값: 전환 라인의 converted_quantity 가 요청 수량만큼 누적, 전량 전환 시 주문 status=CONVERTED
```

### FE 시나리오 검증

1. 브라우저에서 주문 목록 진입.
2. 동일 거래처 DRAFT 주문 2건 체크박스 선택.
3. "병합 전환" 버튼 활성화 확인.
4. 클릭 → `MergeConvertDialog` 팝업 표시 확인.
5. 확인 → 성공 토스트 + 전표번호 표시 확인.

---

## 롤백 절차

이상(헬스 실패, 오류율 급등, 기능 장애) 발생 시 아래 순서로 롤백한다.

> **원칙**: partner-order-service 를 먼저 롤백하면 D2 병합 전환 호출 자체가 제거된다. slip-service 는 `slip_source_orders` 테이블을 기존 기능이 참조하지 않으므로 테이블 존재 자체는 무해.

### 롤백 순서

```
[1] partner-order-service → 이전 버전 재배포 (D2 병합 전환 엔드포인트 제거됨)
[2] desktop → 이전 번들 재배포 (MergeConvertDialog 제거됨)
[3] slip-service → 이전 버전 재배포 (slip_source_orders 테이블 미사용 상태로 복귀)
    - 단, slip_source_orders 에 실 데이터가 존재하는 경우:
        데이터 보존 필요 → 이전 이미지만 재배포(테이블 존재해도 무해)
        데이터 보존 불필요 → DROP TABLE slip_source_orders 후 이전 이미지 재배포
```

**V30 롤백 DDL (데이터 없음이 확인된 경우에만 실행)**

```sql
-- 배포 후 실 데이터가 없을 때만 실행 — 데이터 있으면 DROP 금지
DROP TABLE IF EXISTS slip_source_orders;
```

---

## CI 게이트 메모

| CI 잡 | D2 커버 범위 | 자동 실행 여부 |
|---|---|---|
| `slip-it-public` | `SlipPublishMergeIT` | 자동 실행됨 |
| `accounting+partner` | `PartnerOrderMergeConvertIT`, `PartnerOrderMergeConvertServiceTest` | 자동 실행됨 |
| `frontend-desktop` | typecheck + lint + build (`MergeConvertDialog.tsx`, `sales.ts`) | 자동 실행됨 |
| `frontend-desktop` (Playwright) | `d2-order-merge.spec.ts` | **자동 실행 안 됨** |

**D2 Playwright (`clients/desktop/playwright/d2-order-merge/d2-order-merge.spec.ts`) 는 현재 `frontend-desktop` 잡에 Playwright 실행 스텝이 없어 CI 자동 게이트 미포함이다.** `qa-e2e.yml` 대상 디렉토리가 `qa/playwright`로 한정되어 있어 동일하게 미포함. Phase 11 cutover 전 `frontend-desktop` 잡에 `clients/desktop/playwright` 실행 스텝 추가 또는 별도 e2e 잡 확장 검토 필요 (후속 게이트 검토 항목).

---

## 주의사항 (DevOps 리뷰 경고 인계)

1. **V30 `created_by`/`modified_by` VARCHAR(255)** — BaseEntity `length = 50` 과 불일치. 기능상 문제없으나, 추후 정합 마이그레이션(V31 `ALTER COLUMN ... TYPE VARCHAR(50)` + `SET NOT NULL`) 후속 티켓으로 등록 권장.
2. **Testcontainers skipped=0 gating 없음** — CI `require_tests: false` 현행 유지 중. Docker 미가용 시 IT 가 조용히 skip될 수 있음. Phase 11 cutover 이전 `require_tests: true` 전환 검토.
