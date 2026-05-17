# SP-08-4-3 주문 soft delete + 견적 주문 변환

작성일: 2026-05-17
브랜치: `feat/sp-08-4-3-order-delete-and-estimate-convert`

## 1. Gap 분석

| 항목 | 확인 결과 | 조치 |
|---|---|---|
| 주문 삭제 | `DELETE /api/v1/partner-orders/{id}` 부재 | `PartnerOrderDeleteController` + soft delete service 추가 |
| 견적 변환 | `partner-order-service` 내부 estimate-service client 부재 | `EstimateClient` port + 임시 fixture 구현, IT는 `@MockBean` snapshot 주입 |
| source link | `partner_orders`에 견적 원본 링크 없음 | `source_estimate_id` nullable 컬럼 + active unique index 추가 |
| audit | SP-08-4-2 audit overlay 존재 | DELETE / FROM_ESTIMATE action을 `recordBatch`로 기록 |
| desktop 삭제 | 상세 화면 수정만 존재 | `삭제` 버튼 + 확인 Modal + DELETE API 추가 |

## 2. BE 구현

| 영역 | 변경 |
|---|---|
| DELETE | `DELETE /api/v1/partner-orders/{id}`. 주문번호(`YYYY/MM/DD-N`, `YYYY-MM-DD-N`) 또는 UUID path 허용 |
| 권한 | `SALES / MANAGER / MASTER`, `PARTNER`는 403 |
| 상태 정책 | `DRAFT / CONFIRMING`만 삭제 허용. `CONFIRMED` 이상은 `PARTNER_ORDER_DELETE_FORBIDDEN_STATUS` 422 |
| Soft delete | `X-User-Name` 헤더의 `actorName`을 `PartnerOrder.softDeleteCascade(actorName)`에 전달. 없거나 blank이면 `"system"` fallback |
| from-estimate | `POST /api/v1/partner-orders/from-estimate/{estimateId}`. `EstimateClient` snapshot을 `PartnerOrder.createFromEstimate`로 변환 |
| 중복 정책 | active `source_estimate_id` 주문이 있으면 409 명시 거부 |

## 3. FE 구현

| 영역 | 변경 |
|---|---|
| API | `deletePartnerOrder(orderNumber)` 추가 |
| 상세 화면 | `SALES / MANAGER / MASTER`만 `삭제` 버튼 노출 |
| 확인 | design-system `Modal / Button`으로 삭제 확인 dialog 구성 |
| 오류 | 422은 "확정 또는 전표 발행된 주문서는 삭제할 수 없습니다."로 안내 |
| 견적 변환 UI | desktop 내부 견적 화면은 외부 `estimate-app`과 분리되어 있어 본 PR은 BE endpoint만 구현하고 UI는 후속 슬라이스로 위임 |

## 4. QA

| 구분 | 케이스 |
|---|---|
| IT D1 | success 204, soft-deleted 404, PARTNER 403, CONFIRMED 422, CANCELED 422, DELETE audit |
| IT C1 | success 201, not found 404, already converted 409, PARTNER 403, FROM_ESTIMATE audit |
| Playwright | endpoint contract 2건, ErrorCode 3건, desktop 삭제 dialog, DELETE audit mock |
| QA PNG | delete confirm, delete success, from-estimate success, already converted, PARTNER role guard |

추가 IT 메서드:
- `testDeleteCanceledOrderReturns422` (D6): 취소 주문 삭제 422 + active 유지 검증
- `testFromEstimateSuccessRecordsAuditLog` (C5): 견적 변환 audit log `actor_name='영업담당자'` 기록 검증

## 5. SP-08-4-2 회고 회피

| 회고 | 적용 |
|---|---|
| verifyVersion null fallback | 본 슬라이스는 DELETE/from-estimate라 version 비교 없음. 기존 PUT fallback 보존 |
| replaceLines soft-delete | 삭제도 라인 컬렉션 제거 없이 `markDeleted`만 사용 |
| orphanRemoval=false | `PartnerOrder.lines`의 `orphanRemoval=false` 유지 |
| 외부 client 격리 | IT에서 `EstimateClient` 포함 외부 client 전부 `@MockBean` |
| UUID 비공개 | UI/testid는 주문번호 기반. source estimate UUID는 DB/API path 내부 계약으로만 사용 |

## 6. Verification table

| 검증 | 명령 | 실제 결과 |
|---|---|---|
| Spring RED | `GRADLE_USER_HOME=.gradle-codex .\gradlew.bat :services:partner-order-service:test --tests "*PartnerOrderDelete*" --tests "*PartnerOrderFromEstimate*" --no-daemon --rerun-tasks` | RED 확인: `EstimateClient` 미구현 compile fail |
| Spring targeted | 동일 | PASS: BUILD SUCCESSFUL, 신규 IT 11건 실행 (Delete 6 + FromEstimate 5) |
| Desktop typecheck | `cd clients\desktop ; npm run typecheck` | PASS |
| Desktop lint | `cd clients\desktop ; npm run lint` | PASS: 0 errors / 기존 warning 2건 |
| Playwright | `cd clients\desktop ; npx playwright test playwright/sp-08-4-3-order-delete-and-estimate-convert --reporter=line` | Windows Codex sandbox `spawn EPERM`으로 실행 차단. spec 작성 완료, CI/Linux 검증 대상 |
| QA PNG | `.\scripts\generate-sp-08-4-3-order-delete-and-estimate-convert-screenshots.ps1` | PASS: 5 PNG (01~05) / non-zero |
| diff whitespace | `git diff --check` | PASS: whitespace error 0, CRLF warnings only |

## 7. ErrorCode catalog

| code | HTTP | 발생 조건 |
|---|---:|---|
| `PARTNER_ORDER_DELETE_FORBIDDEN_STATUS` | 422 | `CONFIRMED` 또는 전표 발행된 주문 삭제 시도 |
| `PARTNER_ORDER_FROM_ESTIMATE_NOT_FOUND` | 404 | `EstimateClient`가 estimate snapshot을 찾지 못함 |
| `PARTNER_ORDER_FROM_ESTIMATE_ALREADY_CONVERTED` | 409 | 같은 `source_estimate_id` active 주문이 이미 존재 |

## 8. 정책

| 정책 | 결정 |
|---|---|
| 삭제 가능 status | `DRAFT / CONFIRMING`만 허용 |
| 삭제 불가 status | `CONFIRMED / CANCELED` 및 전표 발행 주문 |
| soft delete actor | `X-User-Name` 헤더의 `actorName`을 header/line `deleted_by`에 기록. 헤더가 없으면 `"system"` fallback. IT는 `deleted_by='영업담당자'`로 검증 |
| 견적 변환 source | `source_estimate_id` nullable 보존, active unique |
| estimate-service 부재 | 임시 `EstimateClient` fixture는 기본 empty. 실제 snapshot은 후속 estimate-service HTTP client로 교체 |
