# slip-service

Samhan Public 전표(출고/입고), 견적, 배송 첨부, 발행, 감사 이력, realtime SSE 를 담당하는 서비스다.

- 포트: **8086**
- DB: PostgreSQL `slip_db`
- 주요 의존: inventory-service, product-service, partner-order-service, partner-service, notification/SMS provider

## 주요 공개 API

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/v1/slips/from-estimate` | 견적 기반 전표 발행 |
| POST | `/api/v1/slips/from-partner-order` | 주문 기반 전표 발행 |
| GET | `/api/v1/slips/by-source` | 발행 source 기반 전표 조회 |
| GET | `/api/v1/slips/{id}/revisions` | 전표 revision 조회 |
| POST | `/api/v1/slips/{id}/revisions/{n}/restore` | revision 기반 복원 |

## #809 거래처+품목 최근 수동단가 조회

`partner_product_price_memory` 는 전표와 견적 라인 저장 후 `(partnerId, productId)` 별 최근 사용 단가를 기억한다. 저장 basis 는 VAT 포함 입력단가이며, 수정 화면처럼 VAT 제외 단가를 입력받는 경로는 저장 전에 `×1.1` 로 정규화한다.

| Method | Path | 권한 |
|---|---|---|
| GET | `/api/v1/slips/price-memory?partnerId={uuid}&productId={uuid}` | `sales.slip.create` CREATE 또는 `purchases.slip.edit` UPDATE 또는 `estimates.list` CREATE/UPDATE |
| POST | `/api/v1/slips/price-memory/bulk` | 단건과 동일. 요청당 1회 판정 |

응답은 hit 시 `200 { unitPrice, source, updatedAt }`, miss 시 `204 No Content` 다. 이 endpoint 는 브라우저 호출용 사용자 대면 endpoint 이므로 `/internal` 과 `X-Internal-Token` 을 사용하지 않는다.

bulk 요청은 `{"partnerId":"uuid","productIds":["uuid", ...]}`(최대 100개)다. 응답 `data` 는
`[{productId, unitPrice, source, updatedAt}]` hit 배열이며 miss 는 생략하고 전체 miss 도 `200 data=[]`다.
`updatedAt` 은 flush/audit 시각이 아니라 원 전표/견적 저장 시각인 `remembered_at` 이다.

## 내부 API

| Method | Path | 설명 |
|---|---|---|
| POST | `/internal/slips/{slipId}/signatures` | APP source 전자서명 등록 |
| GET | `/internal/slips/by-partner/{partnerId}/recent` | partnerId 기준 최근 활성 전표 조회 |
| POST | `/internal/slips/backfill-committed-partners?dryRun={bool}` | committed 거래처 null 전표 보정(#853 cutover) |

내부 API 는 `InternalTokenFilter` 와 `ROLE_MASTER` 전제를 사용한다. 브라우저에서 호출해야 하는 사용자 기능은 내부 API 로 추가하지 않는다.

## #853 전표 거래처 필수화 — 생명주기 전이 가드

committed 단계(SENT 이후)로 전이한 전표는 반드시 거래처(`partner_id`)를 가져야 한다. 거래처 없는 committed 전표는 #823 배분 원천·세금계산서·분개 오귀속의 뿌리이므로 도메인 레벨에서 원천 차단한다.

- **불변식**: `status ∈ REQUIRED_PARTNER_STATUSES ⟹ partner_id != null`. `REQUIRED_PARTNER_STATUSES` = 전 `SlipStatus` − {`DRAFT`, `SAVED`, `CANCELED`} = {SENT, ACCEPTED, PROCESSING, INSPECTING, COMPLETED, SHIPPING, DELIVERED, CONFIRMED, REJECTED}. 완결성 테스트(`requiredPartnerStatuses_areExactlyAllStatusesExceptDraftSavedCanceled`)로 enum 추가 시 fail-open 을 막는다.
- **3중 도메인 가드**: `send()`(SAVED→SENT, `requireStatus` 먼저) + `restoreFromSnapshot()`(committed + `snapshot.partnerId == null` 복원 거부·표준 + 협업 revision 공통) + forward 전이(accept/process/complete/inspect/ship/deliver/confirm/reject 8종 `requirePartnerForCommitted()`). 불변식을 데이터/cutover 의존이 아닌 **코드 강제**로 둔다.
- **발행 fail-closed**: 주문→전표 발행은 `SlipPublishService.resolveCommittedPartnerId` 가 `PartnerInternalClient` 결과 `FOUND + partnerId` 만 성공으로 보고 `NOT_FOUND`/`SERVER_ERROR(5xx)`/`SKIPPED`/`FOUND-empty` 는 전부 차단한다(strict-off·5xx fail-open 우회 폐쇄, 회계 무결성 > 가용성). estimate/mobile 발행은 DRAFT 로 끝나 미적용.
- **DRAFT/SAVED 는 거래처 null 허용**(편집 단계). 컬럼은 nullable 유지(NOT NULL 비채택). FE `SlipDetailPage` 전송 preflight 는 사용자 안내용이며 권위 backstop 은 이 BE 가드다.
- **위반 보정 cutover**: `POST /internal/slips/backfill-committed-partners` 가 9개 committed 상태의 거래처 null 전표를 재조회해 `partner_code → partner_id`(FOUND) 로 멱등 해소한다. `dryRun=true` 는 무변경 조회, 미해소(코드 無/NOT_FOUND)는 리포트로 반환, 감사 `modified_by = system-internal`. 배포 순서 = 신버전 배포 + 구버전 drain → 보정 → 검증쿼리 0.
