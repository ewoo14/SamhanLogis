# SP-08-6-2 매출 수정 direct PUT endpoint

작성일: 2026-05-18
브랜치: `feat/sp-08-6-2-sales-slip-edit-put`

## 1. Gap 분석

| 항목 | 확인 결과 | 조치 |
|---|---|---|
| 매출 direct 수정 | SP-08-6-1은 `Slip(type=OUTBOUND)` 목록·상세만 잠금. 즉시 수정 endpoint 없음 | `PUT /api/v1/slips/{id}/sales` 추가 |
| 기존 수정 요청 flow | `SlipEditRequestController`는 요청·승인 흐름 전용 | direct PUT은 별도 controller/service로 공존 |
| 낙관적 잠금 | `slips.version`은 V1부터 존재하고 entity도 `@Version` 사용 | 기존 `version` + `updatedAt` 검증 사용 (신규 컬럼 불필요) |
| 라인 교체 | 기존 `Slip.lines`는 `orphanRemoval=false` (SP-08-5-2 반영분) | OUTBOUND 전용 `replaceSalesLines` 도메인 메서드 추가 |
| 감사 | slip audit log는 존재하나 매출 direct PUT action 없음 | 성공 시 `SLIP_EDIT` revision 1건 기록 |
| 권한 분리 | 매입은 WAREHOUSE 중심, 매출은 SALES 중심 | `SalesSlipUpdateController`에 `SALES/MANAGER/MASTER` 별도 선언 |

## 2. BE 변경

| 영역 | 변경 |
|---|---|
| Controller | `SalesSlipUpdateController` 신규. `PUT /slips/{id}/sales` endpoint |
| 권한 | `SALES / MANAGER / MASTER`만 허용. `INVENTORY / WAREHOUSE / ACCOUNTANT`는 403 |
| Service | `SalesSlipUpdateService` 신규. OUTBOUND 전용, `updatedAt` 검증, 라인 검증, audit 기록 |
| Domain | `Slip.updateSalesHeader`, `Slip.replaceSalesLines` 추가. 기존 라인은 soft-delete 후 컬렉션 교체 |
| DTO | `SlipUpdateRequest` 재사용 (SP-08-5-2 기존 DTO 그대로 사용) |
| ErrorCode | `SLIP_UPDATE_NON_SALES` 403 추가 (INBOUND에 매출 endpoint 호출 시) |

## 3. FE 변경

| 영역 | 변경 |
|---|---|
| API | `updateSalesSlip(id, body)` 추가 — `PUT /slips/{id}/sales` |
| 상세 화면 | `SlipDetailPage` OUTBOUND 상세에 `수정` 버튼 추가 (`sales-slip-edit-button`) |
| 권한 상수 | `SALES_EDIT_ROLES = ['SALES', 'MANAGER', 'MASTER']` 선언 |
| 접근 판단 | `canDirectEditSales` — mode=OUTBOUND + role + DRAFT/SAVED 상태에서만 true |
| 409 처리 | `salesIsConflict` state + "다른 사용자가 먼저 수정했습니다." 배너 + "최신 내용 불러오기" 버튼 |
| 충돌 reload | `handleSalesConflictReload` → `refetchDetail()` + `syncSalesFormFromData(result.data)` |
| 수정 form 동기화 | `syncSalesFormFromData` — detailQuery data → sales edit state 동기화 |
| Audit | 기존 slip audit timeline에 `SLIP_EDIT` 변경자·일시·필드 이력 표시 (actorId 미노출) |

## 4. QA 스크린샷

| 파일 | 설명 |
|---|---|
| `docs/qa/sp-08-6-2-sales-slip-edit-put/screenshots/01-sales-edit-form.png` | 매출 수정 modal form (저장완료 배지) |
| `docs/qa/sp-08-6-2-sales-slip-edit-put/screenshots/02-sales-edit-conflict-banner.png` | 409 최신 내용 불러오기 배너 |
| `docs/qa/sp-08-6-2-sales-slip-edit-put/screenshots/03-sales-edit-audit-timeline.png` | `SLIP_EDIT` audit timeline (변경자명·UUID 비공개) |
| `docs/qa/sp-08-6-2-sales-slip-edit-put/screenshots/04-sales-edit-permission-guard.png` | INVENTORY/WAREHOUSE 수정 버튼 비노출/403 guard |

## 5. 회고 적용

| 회고 | 적용 |
|---|---|
| SP-08-5-2 orphanRemoval 회고 | `orphanRemoval=false` + `replaceSalesLines` soft-delete 패턴 재사용 |
| SP-08-5-2 createdAt fallback | `updatedAt` 검증 시 `modifiedAt`이 없으면 `createdAt` 사용 |
| SP-08-6-1 동일 SlipUpdateRequest 재사용 | 매입/매출 수정 요청 DTO 공유 (enum 분기 없이 도메인 메서드로 분리) |
| HttpHeaderConstants 표준 | `X-Caller-Id`, `X-Caller-Name` 헤더 사용 |
| UUID 비공개 | 화면과 QA PNG는 구매번호/변경자명만 표시, actorId 미노출 |
| IT 외부 client 격리 | `InventoryClient`, `ProductClient`, `Notification*`, `Partner*` @MockBean lenient stub |
| Malgun Gothic unicode escape | PNG 스크립트 모든 한글 리터럴 unicode escape + U() 함수 통과 |

## 6. Verification table

| 검증 | 명령 | 기대 결과 |
|---|---|---|
| Spring IT | `.\gradlew.bat :services:slip-service:test --tests "*SalesSlipUpdate*" --no-daemon --rerun-tasks` | PASS: 8 tests / 0 failed |
| Desktop typecheck | `cd clients\desktop ; npm run typecheck` | PASS |
| Desktop lint | `cd clients\desktop ; npm run lint` | PASS |
| Playwright static | `npx playwright test playwright/sp-08-6-2-sales-slip-edit-put/sp-08-6-2-sales-slip-edit-put.spec.ts` | PASS: 5 case / 0 failed |
| QA PNG | `.\scripts\generate-sp-08-6-2-sales-slip-edit-put-screenshots.ps1` | PASS: 4 PNG 생성 (21KB~20KB) |
| diff whitespace | `git diff --check` | PASS: whitespace error 0 |

## 7. 예외 catalog

| code | HTTP | 발생 조건 | IT case |
|---:|---:|---|---|
| `SLIP_OPTIMISTIC_LOCK_CONFLICT` | 409 | 요청 `updatedAt`과 현재 `modifiedAt`/`createdAt` 불일치 | `testSalesUpdateOptimisticLockConflict` |
| `SLIP_UPDATE_INVALID_LINE` | 422 | 라인 누락, 상품 ID 누락, 수량/단가 0 이하 | `testSalesUpdateInvalidLineReturns422` |
| `NOT_FOUND` | 404 | 전표 없음 또는 soft-delete | `testSalesUpdateSoftDeletedReturns404` |
| `SLIP_UPDATE_NON_SALES` | 403 | INBOUND 전표에 매출 endpoint 호출 | `testSalesUpdateNonOutboundForbidden` |
| `FORBIDDEN` | 403 | 비허용 role (INVENTORY/WAREHOUSE/ACCOUNTANT) | `testSalesUpdateForbiddenFor*` |

## 8. EditRequest vs direct PUT 정합

| 흐름 | 사용자 | 권한 | 용도 | 감사 |
|---|---|---|---|---|
| direct PUT (매출) | 영업 담당자 | `SALES / MANAGER / MASTER` | legacy GAS식 매출 전표 즉시 수정 | `SLIP_EDIT` audit revision |
| direct PUT (매입) | 창고 담당자 | `WAREHOUSE / MANAGER / MASTER` | legacy GAS식 매입 전표 즉시 수정 | `SLIP_EDIT` audit revision |
| EditRequest | 요청·승인 흐름 | 기존 controller 정책 유지 | 수정 요청 후 승인/반려 | 기존 EditRequest 이력 |

## 9. Flyway 판단

신규 migration은 만들지 않았다. SP-08-5-2에서 이미 `slips.version BIGINT NOT NULL DEFAULT 0`가 존재하고 `@Version` 매핑이 완료되어 있다. SP-08-6-2는 동일 낙관적 잠금 컬럼과 request `updatedAt` 비교를 재사용한다. 도메인 메서드(`updateSalesHeader`, `replaceSalesLines`)는 Slip entity 내 신규 메서드 추가이므로 DDL 변경 없음.

## 10. SP-08-5-2 대비 차이점

| 항목 | SP-08-5-2 (매입) | SP-08-6-2 (매출) |
|---|---|---|
| endpoint | `PUT /slips/{id}` | `PUT /slips/{id}/sales` |
| 허용 역할 | WAREHOUSE/MANAGER/MASTER | SALES/MANAGER/MASTER |
| 도메인 메서드 | `updateHeader`, `replaceLines` | `updateSalesHeader`, `replaceSalesLines` |
| slipType guard | INBOUND 전용, OUTBOUND는 403 | OUTBOUND 전용, INBOUND는 403 |
| ErrorCode | `FORBIDDEN` 포괄 | `SLIP_UPDATE_NON_SALES` 전용 |
| IT 차단 케이스 | INVENTORY/SALES/ACCOUNTANT | INVENTORY/WAREHOUSE/ACCOUNTANT |
