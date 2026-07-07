# #725 IllegalState 상태전이 메시지 sweep — slip 배차·partner-order 잔여분

- 브랜치 `fix/725-illegalstate-state-transition-messages` · 이슈 #725
- 연관 선례: #721/#724(displayName SSOT + BusinessException(CONFLICT) 승격)·2026-07-04 개발책임자 지시(fix=현 슬라이스 내).

## 문제
`IllegalStateException` 은 GlobalExceptionHandler 전용 핸들러 부재로 catch-all **500 "서버 내부 오류"** 로 마스킹(사유·사용자 안내 유실). 상태전이 위반("현재=<enum>")은 사용자 도달 가능 → **409 + 한국어 사유**가 맞다.

## 스코프 (정찰 실측)
- **slip-service** `domain/dispatch/DispatchTask.java`: 상태전이 IllegalState ~12곳(:113 DRAFT→DISPATCHING·:121 DISPATCHING→DISPATCHED·:138·:147·:162·:176·:190·:205·:219·:233·:247·:260). `DispatchVehicleGroup.java:125`.
- **partner-order-service** `outbox/SlipPublishOutbox.java:111`(PENDING→PROCESSING) 등 상태전이 enum-in-message.
- ⚠️ **분류 필수**: 내부 불변식(예: `DispatchTaskService:459` 일배차 카운터 초과·outbox 재시도 한계 등 사용자 미도달·프로그래밍 오류)은 **IllegalState 유지(genuine 500)**. 상태전이(사용자 액션→상태 위반)만 BusinessException 승격.

## 처방 (#721/#724 패턴)
- 상태전이 IllegalState → `BusinessException(ErrorCode.CONFLICT, "<한국어 사유·displayName SSOT>")`.
- enum 원어(DRAFT/DISPATCHING 등) 메시지 노출 → 상태 enum의 **displayName(한국어) SSOT** 사용(없으면 enum에 displayName 추가·기존 상태 라벨 SSOT 재사용). raw enum.name() 사용자 노출 금지([[feedback_jeonpyo_not_slip]] 계열·enum 원어 한국어화 #724).
- GlobalExceptionHandler 의 BusinessException(CONFLICT)→409 매핑 확인(기존).

## 검증
- slip-service·partner-order 변경 모듈 전체 test(Testcontainers `--rerun-tasks`) — 상태전이 위반 IT가 500이 아닌 409+메시지 단언(신규/갱신).
- 내부 불변식 IllegalState 미변경 확인(회귀 없음).
- 라이브 QA: 배차 상태전이 위반 액션(예: 이미 배송된 작업 재배차) → 409 한국어 배너.

## 워크플로우
조기 PR → 구현(Opus 라운드모델·backend-engineer) → STEP3 Opus 5-agent → STEP4 Opus 독립 적대검증(Codex Jul11 한도 대체·개발책임자 승인) → 0수렴 → 라이브QA → PM 종합 → CI → 머지.
