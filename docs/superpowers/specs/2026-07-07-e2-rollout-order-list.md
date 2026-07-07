# E2 롤아웃 — 주문(order) 목록 라이브 동기화 + 취소선 삭제/복원

> E2 전역 라이브 동기화 에픽. 배차 파일럿(#699/#700)을 **주문 목록**에 이식.
> 대상 화면 `SalesPartnerOrderListPage.tsx`(현 30초 폴링) · 서비스 partner-order-service.

## 목표
주문 목록을 실시간 SSE 반영으로 전환 + 삭제 주문을 취소선·"삭제: {이름}" 배지·복원 버튼으로 노출.

## 구현 표면 (정찰 기반)
### BE (partner-order-service) — 기둥1 라이브 발화
- 신규 `realtime/PartnerOrderBoardRealtime.java` — `CHANNEL_ID = UUID.nameUUIDFromBytes("partner-order:list:changed")` + `EVENT_CHANGED` (배차 `DispatchBoardRealtime` 미러).
- 신규 `realtime/PartnerOrderBoardRealtimeController.java` — `GET /api/v1/partner-orders/board-realtime` SSE, `@RequirePermission(page="sales.partner-order.list", VIEW)`, 기존 broker 재사용.
- `CollectionRealtimePublisher` 주입 + `publishListChanged(changeType)` 헬퍼 → 8 mutating 경로 발화:
  - `PartnerOrderConfirmService.confirm`=CREATED · `PartnerOrderFromEstimateService.createFromEstimate`=CREATED · `PartnerOrderUpdateService.update`=UPDATED · `PartnerOrderHoldService.hold/release`=UPDATED · `PartnerOrderDeleteService.delete`=DELETED · `PartnerOrderConvertService.convert`=UPDATED · `PartnerOrderMergeConvertService.convertMerge`=UPDATED · `PartnerOrderRevisionService.restore`=RESTORED.

### BE — 기둥2 취소선 삭제/복원
- **V10** `partner_order_deleted_by_name.sql` — `partner_orders ADD COLUMN deleted_by_name VARCHAR(100)` (nullable additive, 배차 V55 미러).
- 목록 IncludingDeleted 조회: `PartnerOrderRepository` 목록 native/Specification 삭제행 포함 경로(현 단건 IncludingDeleted만 존재) + `PartnerOrderQueryService.list()` 삭제행 포함.
- `PartnerOrderSummaryResponse` 삭제메타 3(isDeleted/deletedAt/deletedByName) + `resolveActorName`(UUID 비노출·100자 truncate).
- 🐞 **버그 정정**: 현 `PartnerOrderDeleteService.delete()`가 `deleted_by`에 표시명 저장 중 → `deleted_by`=userId(감사)+`deleted_by_name`=표시명 분리.
- 인라인 복원: 신규 undelete 엔드포인트(`markRestored`+RESTORED 발화, `@RequirePermission RESTORE`) — 기존 revision restore와 별개 경량 경로 권장(배차 패턴 정합). auth RESTORE 시드(멱등).

### 상태별 삭제 정책 (현행 보존)
- CONFIRMED/CONVERTED(slipNo 보유=출고전표 전환) = **이미 도메인 차단** — 유지, 차단 사유 409 노출.
- DELETABLE = {DRAFT, CONFIRMING} (현행).
- ⚠️ **후순위 defer(개발책임자 결정)**: ON_HOLD 삭제 허용 여부(현재 삭제불가 갭) → **현행(ON_HOLD 삭제불가) 보존**하고 구현. 아침 보고.

### FE (clients/desktop)
- 신규 `realtime/PartnerOrderBoardRealtimeClient.ts`(`/api/v1/partner-orders/board-realtime`).
- `SalesPartnerOrderListPage.tsx`: `useCollectionRealtime` 구독(**⚠️ coarse queryKey `['partner-orders']` — 필터/페이지 미포함**, Track B FE HIGH 교훈)+30초 폴링 제거·취소선+복원버튼.
- `api/sales.ts`: `PartnerOrderSummary` 삭제메타3+`restorePartnerOrder`.
- 취소선 유틸: **공통 모듈 추출**(`realtime/deletedRowDisplay.ts` — Track B FE MED DRY 교훈, partnerDeletedRow 중복 회피) 재사용.
- **복원 무음실패 방지**: restore mutation `onError`+`role="alert"` 에러 배너(Track B FE/Design HIGH 교훈).
- **rowKey 합성**: orderNumber 재사용/모호 대비 `` `${orderNumber ?? partnerCode}:${isDeleted}` `` 합성키(Track B FE HIGH 교훈).
- mock 파리티(삭제행/복원, delete도 상태 mutate).

## 수용 기준
- 2세션 목록: 생성/수정/삭제/상태전이 → 반대편 무새로고침 SSE 반영(실캡처).
- 삭제행 취소선+배지+복원(권한게이트·onError 배너), 복원 원복. CONFIRMED/CONVERTED 삭제 409.
- coarse invalidate(다른 필터/페이지도 stale). 권한 deny 403. UUID 비노출.
- BE 모듈 전체 test 0 fail·FE typecheck/vitest 0·CI green.
