# #816 — arologis 배차 상세 알림 발송이력 백엔드 노출 (FE-3)

- **일자**: 2026-07-14
- **PR**: #816 (feat/816-arologis-dispatch-notify-history)
- **연관**: #804(FE-3 `NotifyResultSection` 완성·BE 미구현 이연) · spec `docs/specs/816-arologis-dispatch-notify-history-backend-spec.md`
- **상태**: 구현 진행 중 (조기 PR 시드)

## 목표

`DispatchDetailResponse.VehicleDetail.notifyResults` 를 실데이터로 채워 배차 상세 알림 발송결과 row(#804 완성·미표시)를 원복한다.

## 개발책임자 결정 (2026-07-14·"먼저 기획/spec만"→spec 검토→"자율 진행" A/A/A 승인)

- **① 상관저장 = A(arologis 로컬)**: notification-service **무변경**. arologis 로컬 `DispatchNotification` 엔티티에 발송 시점 (dispatchId·vehicleId·channel·status·sentAt·recipientPhone·errorCode) 자체 적재. → arologis 단독 슬라이스.
- **② 채널/상태 = A(FE-정합 enum)**: `ArologisNotifyChannel{INSUNG_TALK, ALIGO}`(wire 'insung-talk'/'aligo')·`ArologisNotifyStatus{SUCCESS, FAILED, DELAYED}`. 발송 결과 매핑.
- **③ 범위 = A(이력 기록·노출만)**: 실 insung-talk/aligo 벤더 발송(W10-2)은 이연. 현 발송지점(autoMatch 배차 매칭 알림) 기록 + 노출. wire body 정정은 별건(skeleton 기본·notification-service RecipientType 의존).

## 구현

### BE (arologis-service·notification-service 무변경)
- **enum**: `ArologisNotifyChannel{INSUNG_TALK("insung-talk"), ALIGO("aligo")}`(wireValue)·`ArologisNotifyStatus{SUCCESS, FAILED, DELAYED}`(FE 이름 직접 정합).
- **엔티티**: `DispatchNotification`(BaseEntity·dispatchId·vehicleId·channel·status·sentAt·recipientPhone·errorCode) + repo `findAllByDispatchIdOrderBySentAtAsc` + **V24**(BaseEntity 7감사+CHECK 제약(channel/status)+partial 인덱스 2종).
- **recording hook**: `DispatchService.autoMatch` 매칭 알림 발송 지점(appUserId!=null) → `send()` boolean → `DispatchNotification.of(dispatchId, vehicleId, INSUNG_TALK, sent?SUCCESS:FAILED, now(clock), driver.getPhoneNumber(), sent?null:"SEND_FAILED")` 적재. (INSUNG_TALK=Notify.dispatchChannel 의도·DELAYED는 rich-status 대비 예약).
- **assembler**: `DispatchNotificationAssembler`(dispatchId 1회 조회·차량별 group·**채널별 최신 1행** dedup·N+1 없음) → `Map<vehicleId, List<NotifyResult>>`. `NotifyResult`(channel wire·status·sentAt·recipientPhone·errorCode) + `VehicleDetail.notifyResults` + `ArologisAdminController.findById` 배선(gpsSources 패턴 미러).

### FE (arologis-desktop)
- `arologisDispatchDetail.ts`: `RawNotifyResult` + notifyResults 매핑(현 `undefined` 하드코딩 제거). mock parity. (NotifyResultSection UI는 #804 완성).

## 검증

- **BE**: `--rerun-tasks --no-build-cache` → **568 tests**(561+7 신규·IT가 V24 스키마 검증). **FE**: typecheck clean·49 tests.
- _(라이브 QA — 리뷰 라운드에서)_

## 리뷰 이력

- **Codex 개발**(MCP·effort high): 상기 구현. BE 568·FE 49 green.
- _(Opus 5-agent ↔ Codex 5-agent 적대 — 진행 예정)_
