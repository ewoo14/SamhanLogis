# 슬라이스 D2 — 다중 주문 → 단일 출고전표 병합 전환 (Phase 2.6b ②)

> 2026-05-31. spec `docs/superpowers/specs/2026-05-31-order-merge-to-slip-design.md` / plan `docs/superpowers/plans/2026-05-31-order-merge-to-slip.md` / 결정 DECISIONS D-MRG-01~06.
> Codex 6/1 12:00 복구 전 → 구현 + dual 리뷰 모두 Claude 에이전트.

## 1. 목적

같은 거래처(`partnerCode`)의 DRAFT/ON_HOLD 주문 여러 개를 선택해 **단일 출고전표**로 병합 발행한다. 출고정보(배송지/납기 등) 충돌 시 FE 가 선택 또는 `/` 병기한 최종 헤더를 전송한다. 라인별 부분수량 전환을 지원하며(단일주문 전환과 동일), 전량 전환된 주문은 각각 `CONVERTED` 가 된다.

## 2. 아키텍처

- **partner-order-service**(오케스트레이션): N개 주문 조회 → 같은 거래처 검증 → 라인 잔여 검증 → 재고 reserve → slip 병합 발행 → 실패 시 release 보상 → 성공 시 라인 `convert` 누적 + 주문 status 갱신. 단일 `@Transactional`(partner_order_db 단일 DB).
- **slip-service**(병합 수신): 단일 출고전표 발행 + `slip_source_orders` N행 기록(N:1 추적). 기존 `publishFromPartnerOrder`(단일) 공통부 재사용.
- **desktop**(FE): 주문목록 다중선택 → 병합 모달(라인별 수량 + 창고 + 충돌헤더) → 발행.

```
[desktop 주문목록 다중선택]
   → POST /api/v1/partner-orders/convert-to-slip-merge  (orders[].items[], warehouseCode, shippingInfo)
      → PartnerOrderMergeConvertService.convertMerge
         ① N주문 resolve(PartnerOrderIdResolver) + requireConvertible + partnerCode 동일 검증
         ② 라인 잔여 검증 + slip payload(lines[].sourceOrderLineId) 빌드
         ③ 결정적 convertKey(PO-MRG, 전 주문/라인 스냅샷)
         ④ warehouseCode → warehouseId (inventory by-code)
         ⑤ 라인별 inventory reserve (ref=PARTNER_ORDER_MERGE_CONVERT) — 가용부족 409 → 보상+중단
         ⑥ slip POST /from-orders-merge → SlipPublishService.publishFromOrdersMerge
              · Slip.createOutbound + 채번 + applyEcountSchema + partner_code snapshot
              · assignPublishSource(PARTNER_ORDER, 대표주문, key)
              · slip_source_orders N행 INSERT
              · PARTNER_ORDER 전표 SENT 불변 전이
              · SlipPublishAudit 1행
         ⑦ slip 실패 → 보상(release) 후 전파
         ⑧ 성공 → 각 주문 라인 convert(qty) 누적 + markConvertedIfComplete + saveAll
      → { slipNo, convertedOrders:[{orderNo, orderStatus, fullyConverted}] }
```

## 3. 데이터 (slip-service V30)

`V30__create_slip_source_orders.sql` — `slip_source_orders`(id, slip_id FK→slips, partner_order_id, order_no, BaseEntity 7 audit + soft delete). 인덱스 2개(slip_id, partner_order_id). CREATE TABLE 단독 신설(무중단). partner-order 측 신규 마이그레이션 불필요(converted_quantity V8 재사용).

## 4. 함수 단위 문서 (3-layer)

### slip-service
- `SlipSourceOrder.of(slipId, partnerOrderId, orderNo)` — 병합 출처 1건 기록 정적 팩토리(필수값 검증).
- `SlipSourceOrderRepository.findAllBySlipId / findAllByPartnerOrderId` — @SQLRestriction soft-delete 자동 필터.
- `SlipPublishService.publishFromOrdersMerge(req, key, requesterId)` — 병합 발행. 기존 `publishFromPartnerOrder` 공통부(resolveLines/채번/applyEcountSchema/SENT 불변/audit) 재사용 + 대표주문 sourceId + slip_source_orders N행 + 병합 fingerprint.
- `SlipPublishService.findBySource(type, id)` — 기존 source_id 직접매칭 ∪ `slip_source_orders` 역조회(배치 findAllById, N+1 제거, PARTNER_ORDER 한정·UUID 예외 안전).

### partner-order-service
- `PartnerOrderMergeConvertService.convertMerge(req, actorId, actorName)` — 병합 오케스트레이션(상기 ①~⑧). 결정적 멱등키 + reserve/보상.
- `SlipServiceClient.publishFromOrdersMerge(payload, key)` — slip `/from-orders-merge` 호출(200/409 성공, 5xx 예외). 내부 헤더(X-Internal-Token/X-User-Role:MASTER) 일관.
- `MergeConvertToSlipRequest`(orders[].items[] + warehouseCode @NotBlank + shippingInfo) / `MergeConvertResultResponse`(slipNo + orderNo/orderStatus/fullyConverted, UUID 비공개).

### desktop
- `mergeConvertToSlip(orders, warehouseCode, shippingInfo)` — ApiResponse wrapper.
- `MergeConvertDialog` — 주문별 라인 펼침 + 라인별 수량(useEffect 초기화) + WarehouseAutocomplete(autoFocus) + 충돌헤더(주문값 라디오 + 직접입력 라디오/'/' 병기) + 비가역 danger 경고("재고가 예약됩니다" + 품목수) + 4-AND 제출(수량/창고/충돌확정/busy). 성공 → 단건+목록 캐시 invalidate + 토스트.
- `SalesPartnerOrderListPage` — 체크박스 다중선택(DRAFT/ON_HOLD + 같은 거래처만 활성).

## 5. 테스트 / QA

- slip `SlipPublishMergeIT` 6종(실 Postgres): 2주문 병합+slip_source_orders 2행 / '/'병기 저장 / 멱등 replay(audit 1건 유지) / 같은키 다른본문 409 / findBySource 비대표 / SENT 불변. + slip.sourceId 대표주문·slip_lines.source_order_line_id·partner_code 단언.
- partner-order 단위 8 + IT 12(실 Postgres): partnerCode 불일치 409 / 가용부족→전체409+보상 / slip실패→보상 / 멱등(publish 1회+converted 1회) / 부분수량+잔여추적(3/5, DRAFT 유지) / ON_HOLD 병합 / reserve captor / 잔여초과 409.
- desktop Playwright 9: 다중선택→병합→수량/창고/헤더 → 발행, 혼합거래처 비활성, 재고부족 409 에러배너. skipped=0.
- **5-team 사이클 N=2 전원 APPROVE**(BE/FE/Designer/QA/DevOps). 사이클 1: BE P0-2(V30 컬럼)/P1(findBySource N+1·@NotBlank) + FE/Designer(danger 토큰·4-AND·라디오패턴·카피) + QA(IT 단언 9종 추가) + DevOps(런북). 사이클 2 수렴.
- **Docker 실 QA**: (PR 단계 수행 — 실 gateway+JWT+렌더러, slip_source_orders/converted_quantity/source_order_line_id psql 실적중, [[no-fake-data-ever]]).

## 6. 배포

순서 **slip-service(V30+수신) → partner-order-service(오케스트레이션) → desktop FE**. 런북 `docs/runbooks/d2-order-merge-deploy.md`(게이트웨이 404-금지 스모크, V30 무중단, 롤백). 기존 단일전환/confirm 경로 무영향(회귀 0).

## 7. 후속 (비차단)

- 병합 성공 후 목록 전환완료/잔여 배지 갱신 E2E(invalidate 로직은 구현·존재).
- discountInfo 충돌헤더(PartnerOrderDetail 미보유 — BE 보강 필요).
- D2 Playwright CI(frontend-desktop 잡) 자동실행 게이트.
- Testcontainers skipped=0 강제 게이트(require_tests true).
- 공용 `AsyncAutocomplete<T>` 추출(별도 리팩터).
