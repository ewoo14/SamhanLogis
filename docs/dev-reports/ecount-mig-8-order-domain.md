# Ecount MIG-8 Order 도메인 신규 + 주문서 staging 변환

> 2026-05-20 / branch `spec/2026-05-20-mig-8-order-domain`

## 범위

- accounting-service V28: `orders`, `order_lines` 도메인 테이블 신규.
- MIG-4 `staging.ecount_order_raw` 재사용: `PENDING` 주문서 row를 Order + OrderLine으로 변환.
- `progress_status='완료'` 주문은 `SalesAccountingSlip.slip_no`와 cross-link를 시도하고, 실패는 warning sample로 남긴다.
- auth-service V21: `ecount.mig8.order` PageCode seed (MASTER/MANAGER edit).
- shared/common: MIG8 ErrorCode 7종 + `EcountMig8TransformResult`.

## 구현 메모

- 변환 endpoint: `POST /admin/accounting/orders/transform-from-staging`
- 권한: `ROLE_MASTER`, `ROLE_MANAGER` + 동적 RBAC pageCode `ecount.mig8.order`
- 트랜잭션: `REQUIRES_NEW + READ_COMMITTED`
- 동시성: `pg_advisory_xact_lock` namespace 1개
- 멱등 키: Order `external_ref = source_file_hash + '-' + source_row_no` (group head row 기준)
- 동일 `order_no` 다중 row는 1 Order + N OrderLine으로 group 처리하며 line_no는 1부터 부여한다.
- MIG-4 주문 staging에는 `partner_id`가 없으므로 transform 단계에서 `PartnerLookupClient.findByPartnerNameStrict`로 보강한다. miss/ambiguous는 `MIG8_LOOKUP_MISS` row-level reject.
- soft-delete 복구는 Order와 OrderLine 모두 CTE(`restored` + `upserted`)로 처리한다.

## 검증

- 단위 테스트: `Mig8OrderTransformServiceTest` 13 cases
  - 정상 단일 line, 다중 line group, staging 0건, lookup miss, amount invalid, date invalid, status invalid, duplicate, source row 보존, status update, soft-delete 복구, slip link 성공, slip miss warning
- Controller IT: `EcountMig8OrderTransformControllerIT` 5 cases
  - 200 / 401 / 403 / 400 / 422
- ErrorCode 등록 테스트: `ErrorCodeMig8Test`

## 이연

- aging snapshot view + Journal 자동 생성은 D-MIG-7-04 옵션 C에 따라 MIG-9+로 유지한다.
