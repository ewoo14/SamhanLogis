# §7 전역 협업 슬라이스 2 — 주문(PARTNER_ORDER) 협업

> 에픽 [[project_global_collab_epic]] · 레퍼런스: 슬라이스 0(slip #474) + 슬라이스 1(회계전표 #475 `4e644241c`)
> 작성 2026-06-13 · 구현 = **Codex**, 통합/리뷰 = Claude(Opus) PM

## 0. 목표
slip/journal 의 collab-core 패턴(수정완료 1-인 + 코멘트 + diff + 알림)을 partner-order-service 의 `PartnerOrder`(주문)에 복제.

## 1. 도메인 사실 (정찰 확정)
- 엔티티 `PartnerOrder`(`domain/PartnerOrder.java`): `orderNo`(**슬래시 yyyy/MM/dd-N 이미 표준**), `partnerCode`, **`memo`(1000)**, **`dueDate`(LocalDate, 납기)**, `totalAmount`, status. 라인 `PartnerOrderLine`: `productId`·`modelName`·`productName`·`quantity`·`priceVat`·`subtotal`·**`remark`(500)**·`convertedQuantity`.
- 상태 ENUM: DRAFT·ON_HOLD·CONFIRMING·CONFIRMED·CANCELED·CONVERTED. 확정/완료=**CONFIRMED**, 물리종결=**{CANCELED, CONVERTED}**, 전이중=CONFIRMING.
- 결재자 개념 **없음**(EditRequest/Revision 모델). → 알림=기여자만.
- `partner_order_revisions`(V7) 존재. Flyway 최신 **V8** → 신규 **V9**.
- RealtimeBroker 빈 보유(`PartnerOrderRealtimeBroker`, user-config) → collab publisher 배선 OK. collab-core 의존 **미보유**(build.gradle 추가).
- controller base `/api/v1/partner-orders`, page-code `sales.partner-order.*`(confirm=`sales.partner-order.confirm`, history view=`sales.partner-order.history.view`).
- FE: `routes/SalesPartnerOrderDetailPage.tsx`(협업 패널 삽입), `SalesPartnerOrderListPage.tsx`, `api/sales.ts`(getPartnerOrder).

## 2. 정책 (PM 결정 — slip/journal 패턴 일관, 개발책임자 확인 가능)
1. **수정완료 편집 범위 = 보조 필드만**: 주문 `memo` + `dueDate`(납기) + 라인 `remark`. **핵심(품목·수량·단가priceVat·금액·convertedQuantity) 불변**(변경=취소 후 재주문 / 정식 편집). overlay 외 키 400.
2. **COLLAB_LOCKED = {CANCELED, CONVERTED, CONFIRMING}** → 409. CONFIRMED 가 주 수정완료 대상(DRAFT/ON_HOLD 는 기존 정식 편집).
3. **알림 = 기여자만**(다음 결재자 없음): `createdBy` + PartnerOrderRevision actorId + PartnerOrderCollabSuggestion proposer/decider + PartnerOrderCollabComment author. self-skip, username→UUID resolve, 인-트랜잭션 동기.
4. **page-code = 기존 `sales.partner-order.*` 재사용**(reads→VIEW, writes→UPDATE; 실제 PartnerOrder controller @RequirePermission 와 정확 일치 — Codex 대조).

## 3. BE 구현 (partner-order-service) — slip/journal 미러
- build.gradle: `implementation project(':shared:collab-core')`.
- `collab/PartnerOrderCollabComment(+Repository)`, `PartnerOrderCollabSuggestion(+Repository, @Version)` — BaseEntity 7 audit + Soft Delete.
- `collab/PartnerOrderDocumentCollaborationPort`: documentType=PARTNER_ORDER, loadSnapshot(orderNo/dueDate/memo/status/lines[productId/modelName/quantity/priceVat/remark]), applyChangeSet→service.applyOverlayPatchBatch, restoreSnapshot(memo/dueDate/라인 remark 만), canPropose/canDecide(무효 actor 가드), resolveNotificationRecipients(기여자), validate/enrich/parseChangeSet. overlay 키: `memo`·`dueDate`·`line.{lineKey}.remark`(라인 식별 = lineNo 있으면 lineNo, 없으면 line index — Codex 확인).
- `service`: `applyOverlayPatchBatch(UUID, Map<String,Object>, actor)` — memo/dueDate/라인 remark 만 적용·guardCollabModifiable(COLLAB_LOCKED 409)·핵심키 400·단일 audit·도메인 메서드 체인.
- `collab/PartnerOrderCollabEditService.commitEdit`(6단계, slip 미러).
- `collab/PartnerOrderCollabConfig`(빈 배선).
- `web/collab/PartnerOrderCollabController`(base `/api/v1/partner-orders/{orderId}/collab`, 7 엔드포인트+SSE, page-code sales.partner-order).
- `client/UserIdResolver`+`AuthAccountLookupClient`+`NotificationClient`(slip 미러, 주문서비스에 없으면 복제).
- Flyway **V9**: partner_order_collab_comments + partner_order_collab_suggestions(V44/V36 미러, document_type CHECK, 인덱스).

## 4. FE 구현 (clients/desktop)
- `api/partnerOrderCollab.ts`(slipCollab/journalCollab 미러, 엔드포인트 `/partner-orders/{id}/collab/*`).
- `components/collab/PartnerOrderCollaborationPanel.tsx`(overlay=memo+dueDate+라인 remark, 코멘트·diff·SSE).
- `realtime/PartnerOrderCollabRealtimeClient.ts`.
- `routes/SalesPartnerOrderDetailPage.tsx`: 협업 패널 + 수정 버튼(canAccess sales.partner-order UPDATE && status∉{CANCELED,CONVERTED,CONFIRMING}).
- ⚠️ **FE↔BE 필드 정합**(journal 교훈): 주문 라인 BE DTO 필드명(priceVat 등) ↔ FE 모델 정확 매핑, mock 이 실 BE DTO 형태와 일치. dueDate date/datetime 형식 주의.
- `api/mock.ts` 핸들러(3원칙) + `playwright/partner-order-collab/*.spec.ts`.

## 5. 테스트
- BE: PartnerOrderCollabIT(실 Postgres — 코멘트 CRUD·CONFIRMED 수정완료(memo/dueDate/remark)+이력·{CANCELED,CONVERTED,CONFIRMING} 409·핵심키 400·알림 기여자 resolve·username→UUID·GET edits·빈 changeSet 400·다중라인 불변·CHECK), Config/Port 단위, UserIdResolverTest.
- CI: partner 잡(`빌드+테스트 (accounting+partner)` 에 partner-order 포함?) 신규 패키지 실행 확인([[feedback_ci_test_filter_false_green]]).
- FE: playwright partner-order-collab(mock 회귀).
- 마이그 V9 fresh Postgres probe([[feedback_migration_fresh_postgres_probe]]).

## 6. Docs: dev-report 신설 + README §7 + overview + handoff.

## 7. 가드: BaseEntity 7 audit·Soft Delete·한국어 Javadoc·도메인 메서드 체인·UUID 비노출·알림 인-트랜잭션(afterCommit 금지)·Codex 파일만(git 금지). collab-core `@AutoConfigureAfter` 이미 적용(broker 순서).
