# #725 IllegalState 상태전이 메시지 — slip 배차·partner-order 잔여분

- PR #763 · 브랜치 `fix/725-illegalstate-state-transition-messages` · 이슈 #725
- 선례 #721/#724(displayName SSOT + BusinessException(CONFLICT) 승격)·2026-07-04 개발책임자 지시(fix=현 슬라이스 내).

## 문제
상태전이 `IllegalStateException` 은 slip-service `GlobalExceptionHandler` 전용핸들러 부재로 catch-all **500 "서버 내부 오류"** 마스킹(사유 유실). 사용자 도달 가능한 상태전이 위반은 **409 + 한국어 사유**가 맞다.

## 구현 (분류 후 선별 승격)
- **승격(BusinessException(CONFLICT) + displayName)**: `DispatchTask` 상태전이 12곳(mark* 가드)·`DispatchVehicleGroup.resetToPending()`. enum 원어(DRAFT/DISPATCHING/MODIFICATION_ACCEPTED 등) 메시지 노출 제거 → `DispatchTaskStatus`/`DispatchVehicleGroupDispatchStatus` 에 **displayName SSOT 추가**(FE `dispatchTask.ts` `DISPATCH_TASK_STATUS_LABEL` 문구 정확 이식·신규 창작 0). 도메인이 직접 BusinessException 을 던지므로 **서비스 레이어 `try/catch(IllegalState)→BusinessException` wrapper 9개 제거**(#724 정리 패턴).
- **KEEP(genuine 500·판정 근거 Javadoc 박제)**: `DispatchTaskService` 일배차 카운터 초과(MAX_DAILY_COUNTER·도달불가 채번 sentinel)·partner-order `SlipPublishOutbox.markProcessing()`(5분 @Scheduled 배치 전용·HTTP 경로 전무·호출부 pre-check).

## KEY 발견
승격 대상 12+1 중 **7곳(LIVE)은 이미 서비스 레이어 수동 try/catch workaround 로 409 반환 중이었으나 메시지에 raw enum(영문 상수) 노출** 결함 실존(`EstimateService` 주석 "slip-service GlobalExceptionHandler 는 IllegalStateException → 500 이므로 BE 단에서 선차단" 이 이 우회가 전사 workaround 였음을 방증). 이번 fix 실질가치 = (a) raw enum 노출 제거(한국어 displayName) (b) dead-code 5곳 pre-check 리팩터링 시 재발할 500 마스킹 근본 차단 (c) wrapper 보일러플레이트 제거.

## 검증 (genuine·Testcontainers `--rerun-tasks --no-build-cache`)
- **slip-service 1208 tests · partner-order-service 352 tests — 0 fail**.
- 신규/갱신 IT: `DispatchTaskAdminControllerIT`(취소요청 pre-DISPATCHED → 409+한국어+원어부재)·`DispatchTaskInternalControllerIT`(arologis 웹훅 수정수락 위반 → 409)·`DispatchTaskTest`/`DispatchVehicleGroupTest` 도메인 단언(BusinessException·CONFLICT·displayName·원어 부재).
- 미사용 `group` 지역변수(wrapper 제거 잔여, `DispatchMatchedDriverManualService`) 폐기(findGroup 404 검증 call 유지).

## 후속/백로그
- **`EstimateService` 동일 결함 패턴**(500 마스킹 + 선차단 workaround) 실존 — 별도 이슈 권고(이슈 스코프 밖).
- partner-order `PartnerOrder`(markOnHold 등)는 이미 `ResponseStatusException(409)` — 500 마스킹 없음(별개)이나 메시지 원어 enum 노출은 잔존(메시지 품질 백로그).
- slip-service 타 도메인 IllegalState(Slip/EstimateNumber/SlipSignature 등)는 배차 스코프 밖·후속.
