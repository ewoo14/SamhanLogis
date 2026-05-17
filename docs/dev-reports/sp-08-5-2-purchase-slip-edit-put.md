# SP-08-5-2 매입 수정 direct PUT endpoint

작성일: 2026-05-18  
브랜치: `feat/sp-08-5-2-purchase-slip-edit-put`

## 1. Gap 분석

| 항목 | 확인 결과 | 조치 |
|---|---|---|
| 매입 direct 수정 | SP-08-5-1은 `Slip(type=INBOUND)` 목록·상세만 잠금. 즉시 수정 endpoint 없음 | `PUT /api/v1/slips/{id}` 추가 |
| 기존 수정 요청 flow | `SlipEditRequestController`는 요청·승인 흐름 전용 | direct PUT은 별도 controller/service로 공존 |
| 낙관적 잠금 | `slips.version`은 V1부터 존재하고 entity도 `@Version` 사용 | 신규 `lock_version` 중복 컬럼 없이 기존 `version` + `updatedAt` 검증 사용 |
| 라인 교체 | 기존 `Slip.lines`는 orphanRemoval=true라 전체 교체 시 hard delete 위험 | `orphanRemoval=false`, 기존 라인은 `markDeleted` 후 신규 라인 append |
| 감사 | slip audit log는 존재하나 direct PUT action 없음 | 성공 시 `SLIP_EDIT` revision 1건 기록 |

## 2. BE 변경

| 영역 | 변경 |
|---|---|
| Controller | `SlipUpdateController` 신규. `PUT /slips/{id}` gateway strip 기준 endpoint |
| 권한 | `WAREHOUSE / MANAGER / MASTER`만 허용. `INVENTORY / SALES / ACCOUNTANT`는 403 |
| Service | `SlipUpdateService` 신규. INBOUND 전용, `updatedAt` 검증, 라인 검증, audit 기록 |
| Domain | `Slip.updateHeader`, `Slip.replaceLines` 추가. 기존 라인은 soft-delete 후 컬렉션 교체 |
| DTO | `SlipUpdateRequest` 신규. `updatedAt`, 헤더 필드, 라인 입력 포함 |
| 응답 | `SlipResponse`, `SlipDetailResponse`에 `updatedAt` 추가 |
| ErrorCode | `SLIP_OPTIMISTIC_LOCK_CONFLICT` 409, `SLIP_UPDATE_INVALID_LINE` 422 추가 |

## 3. FE 변경

| 영역 | 변경 |
|---|---|
| API | `updatePurchaseSlip(id, body)` 추가 |
| 상세 화면 | `SlipDetailPage` INBOUND 상세에 `수정` 버튼 추가 |
| 권한 | `WAREHOUSE / MANAGER / MASTER`만 수정 버튼 노출 |
| 수정 Modal | design-system `Modal / Input / Button` 기반 구매번호, 거래처, 사업자번호, 비고, 배송주소, 프로젝트, 수령자 연락처, 지급예정일, 라인 수정 form |
| 409 처리 | “다른 사용자가 먼저 수정했습니다. 최신 내용 불러오기 후 다시 저장해 주세요.” 배너와 reload 버튼 제공 |
| Audit | 기존 slip audit timeline에 `SLIP_EDIT` 변경자·일시·필드 이력 표시 |

## 4. QA 스크린샷

| 파일 | 설명 |
|---|---|
| `docs/qa/sp-08-5-2-purchase-slip-edit-put/screenshots/01-purchase-edit-form.png` | 매입 수정 form |
| `docs/qa/sp-08-5-2-purchase-slip-edit-put/screenshots/02-purchase-edit-conflict-banner.png` | 409 최신 내용 불러오기 배너 |
| `docs/qa/sp-08-5-2-purchase-slip-edit-put/screenshots/03-purchase-edit-audit-timeline.png` | `SLIP_EDIT` audit timeline |
| `docs/qa/sp-08-5-2-purchase-slip-edit-put/screenshots/04-purchase-edit-inventory-guard.png` | INVENTORY 수정 버튼 비노출/403 guard |

## 5. 회고 적용

| 회고 | 적용 |
|---|---|
| SP-08-4-2 orphanRemoval 회고 | `Slip.lines`를 `orphanRemoval=false`로 변경하고 기존 라인을 soft-delete |
| SP-08-4-3 createdAt fallback | `updatedAt` 검증 시 `modifiedAt`이 없으면 `createdAt` 사용 |
| HttpHeaderConstants | `X-Caller-Id`, `X-Caller-Name` 표준 header 사용 |
| UUID 비공개 | 화면과 QA PNG는 구매번호/변경자명만 표시 |
| IT 외부 client 격리 | `InventoryClient`, `ProductClient`, `Notification*`, `Partner*` mock 격리 |

## 6. Verification table

| 검증 | 명령 | 실제 결과 |
|---|---|---|
| Spring RED | `.\gradlew.bat :services:slip-service:test --tests "*SlipUpdate*" --no-daemon --rerun-tasks` | RED 확인: 9 tests / 9 failed (endpoint 미구현) |
| Spring targeted | `.\gradlew.bat :services:slip-service:test --tests "*SlipUpdate*" --no-daemon --rerun-tasks` | PASS: 9 tests / 0 failed |
| Desktop typecheck | `cd clients\desktop ; npm run typecheck` | PASS |
| Desktop lint | `cd clients\desktop ; npm run lint` | PASS |
| QA PNG | `.\scripts\generate-sp-08-5-2-purchase-slip-edit-put-screenshots.ps1` | PASS: 4 PNG 생성 |
| diff whitespace | `git diff --check` | PASS: whitespace error 0, CRLF warnings only |

## 7. 예외 catalog

| code | HTTP | 발생 조건 | IT case |
|---|---:|---|---|
| `SLIP_OPTIMISTIC_LOCK_CONFLICT` | 409 | 요청 `updatedAt`과 현재 `modifiedAt`/`createdAt` 불일치 | `testUpdateOptimisticLockConflict` |
| `SLIP_UPDATE_INVALID_LINE` | 422 | 라인 누락, 상품 ID 누락, 수량/단가 0 이하 | `testUpdateInvalidLineReturns422` |
| `SLIP_NOT_FOUND` | 404 | 전표 없음 또는 soft-delete | `testUpdateSoftDeletedReturns404` |
| `FORBIDDEN` | 403 | 비허용 role 또는 OUTBOUND 전표 direct 수정 | `testUpdateForbidden*`, `testUpdateNonInboundForbidden` |

## 8. EditRequest vs direct PUT 정합

| 흐름 | 사용자 | 권한 | 용도 | 감사 |
|---|---|---|---|---|
| direct PUT | 본사 운영자 | `WAREHOUSE / MANAGER / MASTER` | legacy GAS식 매입 전표 즉시 수정 | `SLIP_EDIT` audit revision |
| EditRequest | 요청·승인 흐름 | 기존 controller 정책 유지 | 수정 요청 후 승인/반려 | 기존 EditRequest 이력 |

## 9. Flyway 판단

신규 `lock_version` migration은 만들지 않았다. `services/slip-service/src/main/resources/db/migration/V1__init_slip_service.sql`에 `slips.version BIGINT NOT NULL DEFAULT 0`가 이미 있고, `Slip` entity도 해당 컬럼을 `@Version`으로 매핑하고 있다. SP-08-5-2는 이 기존 JPA optimistic lock 컬럼과 request `updatedAt` 비교를 함께 사용한다.
