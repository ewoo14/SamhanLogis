# SP-08-4-2 Partner Order direct PUT endpoint

작성일: 2026-05-17
브랜치: `feat/sp-08-4-2-partner-order-edit-put`

## 1. Gap 분석

| 항목 | 확인 결과 | 조치 |
|---|---|---|
| direct PUT endpoint | `services/partner-order-service/.../web` 내 `@(Put/Patch)Mapping` 검색 결과 주문 수정 endpoint 없음. `TutorialStateController`만 PUT/PATCH 보유. | `PartnerOrderEditController` 신규 추가 |
| EditRequest flow | `PartnerOrderEditRequestController`가 `POST /{id}/edit-request`, `approve`, `reject`, 목록/주문별 이력을 제공. | 기존 request → approve/reject flow 유지 |
| PartnerOrder update 메서드 | `addLine`, `recomputeTotal`, `incrementRevision`만 존재. 헤더 수정/라인 교체 메서드 없음. | `updateHeader`, `replaceLines` 도메인 메서드 추가 |
| audit log 자동 기록 | `PartnerOrderAuditLogService.recordBatch`가 revision 증가 + audit row + SSE publish 담당. | direct PUT 성공 시 변경 1 revision 기록 |
| soft delete | `PartnerOrder`는 `BaseEntity` + `@SQLRestriction("is_deleted = false")` 적용. | 삭제 주문 PUT은 repository 조회에서 제외되어 404 |

## 2. BE 변경

| 영역 | 변경 |
|---|---|
| Controller | `PUT /api/v1/partner-orders/{id}` 추가. 권한은 `SALES / MANAGER / MASTER`만 허용 |
| Service | `PartnerOrderUpdateService` 추가. 주문번호/UUID path 조회, `updatedAt` 낙관적 잠금, 라인 검증, audit 기록 |
| Domain | `PartnerOrder.updateHeader`, `PartnerOrder.replaceLines` 추가. `dueDate`, `memo` 컬럼 추가 |
| DTO | `PartnerOrderUpdateRequest` 추가. `@JsonInclude(NON_NULL)`와 Bean Validation 적용 |
| ErrorCode | `PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT` 409, `PARTNER_ORDER_UPDATE_INVALID_LINE` 422 추가 |
| Audit | 기존 audit endpoint가 주문번호 path도 처리하도록 `listByOrderIdentifier` 추가 |
| IT | `PartnerOrderUpdateIT` 6건 추가. outbox 선삭제, 외부 client 전체 `@MockBean` 격리 |

## 3. FE 변경

| 영역 | 변경 |
|---|---|
| API | `updatePartnerOrder`, `listPartnerOrderAuditLogs`, `PartnerOrderUpdateRequest` 추가 |
| 상세 화면 | `SALES / MANAGER / MASTER`만 `수정` 버튼 노출. `PARTNER`는 버튼 비노출 |
| 수정 UI | design-system `Input`, `Select`, `Modal`, `Button`으로 헤더/라인 수정 form 구성 |
| 충돌 처리 | 409 응답 시 한국어 충돌 안내와 `최신 내용 불러오기` 버튼 표시 |
| 감사 이력 | 기존 audit log endpoint로 변경자/일시/변경 필드 timeline 표시 |
| Mock | VITE mock mode에 주문 상세/PUT/audit fixture 추가 |

## 4. QA 스크린샷

| 파일 | 설명 |
|---|---|
| `docs/qa/sp-08-4-2-partner-order-edit-put/screenshots/01-edit-form.png` | 주문 수정 form |
| `docs/qa/sp-08-4-2-partner-order-edit-put/screenshots/02-reload.png` | 최신 내용 재확인 안내 |
| `docs/qa/sp-08-4-2-partner-order-edit-put/screenshots/03-audit-timeline.png` | 감사 이력 timeline |
| `docs/qa/sp-08-4-2-partner-order-edit-put/screenshots/04-role-guard-partner.png` | 거래처 권한 버튼 비노출 |

## 5. SP-08-4-1 회고 회피

| 회고 항목 | 적용 |
|---|---|
| outbox FK cleanup | IT `@BeforeEach`에서 `outboxRepository.deleteAll()` 선행 |
| reflection 최소 | fixture는 도메인 메서드 중심. 신규 수정은 production 도메인 메서드 사용 |
| DTO null 정책 | 신규 request DTO와 상세 응답은 `@JsonInclude(NON_NULL)` 명시 |
| design-system | 수정 form은 `Input / Select / Modal / Button` 사용 |
| 한국어 라벨 | 수정/충돌/이력/권한 안내는 한국어 운영 문구만 사용 |
| entity 부재 필드 | `partnerName`은 기존 정책대로 null 유지, JSON 직렬화 제외 |
| BaseEntity/Soft Delete | 신규 entity 없음. 기존 `PartnerOrder` BaseEntity + soft-delete 유지 |
| 외부 client 격리 | IT에서 7개 외부 client 전부 `@MockBean` |

## 6. Verification table

| 검증 | 명령 | 실제 결과 |
|---|---|---|
| Spring RED | `.\gradlew.bat :services:partner-order-service:test --tests "*PartnerOrderUpdateIT" --no-daemon --rerun-tasks` | RED 확인: 6 tests / 6 failed (direct PUT 미구현) |
| Spring targeted | `.\gradlew.bat :services:partner-order-service:test --tests "*PartnerOrderUpdate*" --tests "*PartnerOrderEdit*" --no-daemon --rerun-tasks` | PASS: 6 tests / 0 failed / 0 skipped |
| Desktop typecheck | `npm run typecheck` | PASS |
| Desktop lint | `npm run lint` | PASS: 0 errors / 2 existing warnings |
| Desktop build | `npm run build` | PASS (exit 0, 사이클 1.5 재실행 시 정상) |
| Playwright | `npx playwright test playwright/sp-08-4-2-partner-order-edit-put --reporter=line` | PASS — 4 passed, 0 skipped, 0 failed (3.3s) |
| QA PNG | `.\scripts\generate-sp-08-4-2-partner-order-edit-put-screenshots.ps1` | PASS: 4 PNG / non-zero |
| diff whitespace | `git diff --check` | PASS: whitespace error 0, CRLF warnings only |

## 7. 예외 catalog

| code | HTTP | 발생 조건 | IT case |
|---|---:|---|---|
| `PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT` | 409 | 요청 `updatedAt`과 현재 `modifiedAt` 불일치 | `update_optimistic_lock_conflict_returns_409` |
| `PARTNER_ORDER_UPDATE_INVALID_LINE` | 422 | 수량 0 이하 또는 납품가 음수 | `update_negative_quantity_returns_422` |
| `PARTNER_ORDER_NOT_FOUND` | 404 | 주문 없음 또는 soft-delete 제외 | `update_soft_deleted_order_returns_404` |
| `FORBIDDEN` | 403 | `PARTNER` role direct PUT 접근 | `update_partner_role_is_forbidden` |

## 8. EditRequest vs direct PUT 정책

| 흐름 | 사용자 | 권한 | 용도 | 감사 |
|---|---|---|---|---|
| direct PUT | 본사 운영자 | `SALES / MANAGER / MASTER` | legacy GAS 동등 즉시 주문 수정 | 즉시 `partner_order_audit_logs` 기록 |
| EditRequest | 거래처 또는 요청자 | `PARTNER / SALES / MANAGER / MASTER` 요청, `MANAGER / MASTER` 승인 | 거래처 수정/삭제 요청 → 본사 승인 | 기존 EditRequest 결정 이력 + SSE |

## 9. Cycle 2.5 통합 fix (PR #217)

### 9.1 Cycle 2 양쪽 10-reviewer 결과 요약

| 구분 | 결함 | 조치 |
|---|---|---|
| BE P2-1 | `updatedAt` 수동 비교만으로는 같은 timestamp 를 잡은 동시 PUT race 에서 last-write-wins 가능 | `PartnerOrder.lockVersion` JPA `@Version` 추가 + V5 Flyway + stale entity IT |
| BE P2-2 | `replaceLines()`의 `lines.clear()`가 `orphanRemoval=true`와 결합되어 기존 라인을 hard delete | 기존 라인은 `markDeleted`로 soft delete, 신규 라인 append, 합계 계산은 deleted line 제외 |
| Designer P1 | 상세 화면 로딩 중 `orderNumber ?? id` fallback 으로 UUID 노출 가능 | title/badge fallback 을 `조회 중`으로 통일 |
| Designer D-C2-1 | 409 후 최신 내용 불러오기 성공 피드백 부재 | success banner + 3초 dismiss 추가 |
| QA | 위 UI 계약을 정적으로 막는 회귀 테스트 부재 | Playwright T5 추가 |

### 9.2 Cycle 2.5 적용 범위

- `PartnerOrder`에 `@Version Long lockVersion`을 추가하고 `V5__add_partner_order_lock_version.sql`로 기존 row를 `0` backfill.
- `PartnerOrderUpdateService`는 기존 `modifiedAt` 비교를 사용자 친화적 409 메시지용으로 유지하고, JPA optimistic lock 예외도 `PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT`로 변환.
- `PartnerOrder.replaceLines`는 기존 라인을 삭제하지 않고 soft delete 처리하며, `recomputeTotal`은 `deletedAt == null` 라인만 합산.
- `SalesPartnerOrderDetailPage`는 FE-D1 `syncFormFromData`/`handleConflictReload` 변경을 보존한 상태에서 UUID fallback guard와 reload success banner를 추가.
- QA mock PNG 스크립트는 03 audit timeline / 04 role guard 화면의 mock 안내 문구를 제거하도록 갱신.

### 9.3 Cycle 3 진입 사유

Cycle 2.5는 reviewer 지적 5건을 통합 fix로 닫는 범위다. Cycle 3에서는 PR #217 head 기준으로 5-team 재검토, CI green 확인, QA PNG/Playwright 산출물 확인 후 개발책임자 머지 요청 단계로 진입한다.
