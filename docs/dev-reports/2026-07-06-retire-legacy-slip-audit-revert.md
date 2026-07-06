# 2026-07-06 — 레거시 Slip `/audit/revert` 엔드포인트 폐기 (보안·상태잠금 우회)

> 개발책임자 결정(2026-07-06): "보안 문제가 발생할 수 있으니 레거시 처리해줘." → 폐기.
> PR #747(#31) BE 재수렴이 발견한 무결성 위험을 별도 BE 슬라이스로 처리.

## 배경 — 취약점
`SlipAuditLogController.revertToRevision`(`POST /slips/{id}/audit/revert/{revisionNo}`) →
`SlipAuditLogService.revertToRevision`(audit-log 기반 overlay 필드 revert)는 복원 시
`slip.applyOverlayPatch()` 내부의 **도메인 `requireNotLocked()`(마감기간 잠금)만** 거치고,
**서비스 계층 `guardLockPolicy`(상태기반 잠금 — INSPECTING/SHIPPING/DELIVERED 완전잠금 +
CONFIRMED/ACCEPTED/PROCESSING 결재 요구)를 경유하지 않는다.**

결과: `slip.audit-revert:RESTORE` 권한자가 이 엔드포인트를 직접(API) 호출하면
**배송완료 등 완전잠금 슬립의 overlay 필드(메모·배송지·수령인 등 11종)를 결재 승인 없이
되돌릴 수 있고**, 이 mutation 은 `slip_revisions`(신규 스냅샷 시스템·통합 버전이력 패널의 소스)에
기록되지 않아 **통합 버전이력에 나타나지 않는 감사 사각지대**가 된다.

- 대조: 활성 경로 `SlipService.applyOverlayPatch`(PATCH `/audit/overlay`)·신규 통합
  `SlipService.restoreToRevision`(`/slips/{id}/revisions/{n}/restore`)은 둘 다 `guardLockPolicy` 호출.
- FE 소비처는 이미 #31(PR #747)에서 제거됨(구 `/revert/` 경로는 BE `/audit/revert/`와 불일치해
  실서버 404 였던 죽은 버튼). 통합 restore 가 정상 복원 경로.

## 폐기 스코프
1. `SlipAuditLogController.revertToRevision` 엔드포인트(+`@Operation`/매핑) 제거.
2. `SlipAuditLogService.revertToRevision` 서비스 메서드 제거. 그로 인해 고아가 되는 헬퍼
   (`buildEventPayload`·`EVENT_SLIP_REVERTED` 등)는 **다른 사용처 grep 후** orphan 만 제거
   (사용처 있으면 존치).
3. 연관 테스트 정리: `SlipAuditLogServiceRevertTest`(전부 revert 전용 → 파일 제거)·
   `SlipAuditLogServiceTest`(revert 테스트 메서드)·`SlipAuditPayloadCaptorTest`(revert payload)·
   `SlipPermissionControllerIT`(`/audit/revert` 권한 테스트) 해당 케이스 제거/갱신.
4. `slip.audit-revert` 권한 자체는 **존치** — 통합 restore(`SlipRevisionController`)가 동일 권한
   사용(제거 대상 아님).

## Family sweep
- inventory `WarehouseController`/`WarehouseService.revertToRevision`(`/inventory/warehouses/{id}/audit/revert`)
  는 **같은 패턴이나 다른 도메인** — 창고는 마스터데이터(name/type/address/displayOrder/description)로
  슬립 같은 상태잠금/결재 개념이 없어 우회할 lock 자체가 없음 → **동일 취약 아님·미변경**(패턴만 유사).

## 검증
- BE 컴파일 + slip-service 전체 test(제거 후 회귀 0).
- 엔드포인트 부재 IT(선택) 또는 SlipPermissionControllerIT 갱신으로 `/audit/revert` 제거 확인.
