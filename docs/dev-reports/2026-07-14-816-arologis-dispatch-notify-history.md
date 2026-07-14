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

## 구현 (③-B — 실 aligo SMS 발송 + 기록 + 노출)

> R1 5-agent가 ③-A 구조적 비기능성(appUserId 항상 null→기록할 실 알림 부재) 포착 → 개발책임자 ③-B 결정. 아래는 ③-B 재구현(+R1 fix 전량).

### BE (arologis-service·notification-service 무변경)
- **실 발송**: `NotificationClient.sendDispatchSms(phone, subject, body)` — notification-service `POST /internal/notifications/send`(recipientType=`EXTERNAL_PHONE`·channel=`SMS`·recipientAddress=phone·기존 AligoSmsAdapter). **wire body 정정**(recipientType 누락 400 해소). `NotificationSendOutcome{attempted, status, errorCode}` 리치 반환(skeleton→attempted=false·SENT→SUCCESS·FAILED→FAILED·RETRYING/PENDING→DELAYED).
- **autoMatch**: 매칭 성공 시 driver phone으로 ALIGO SMS 발송(**appUserId 게이트·old PUSH 제거**·phone 기반 전 기사 도달). `outcome.attempted()` 참일 때만 기록(**skeleton 미기록·조작 SUCCESS 제거**·R1-P2). 채널 **ALIGO**(정확·INSUNG_TALK는 W10-2 예약).
- **tx 격리(R1-P1)**: `DispatchNotificationRecorder`(@Transactional **REQUIRES_NEW**+fail-soft) 별도 빈 — 이력 저장 실패가 배차 매칭 batch 롤백 불가.
- **엔티티/enum/assembler/DTO**: `DispatchNotification`(BaseEntity)·`ArologisNotifyChannel{INSUNG_TALK/ALIGO}`·`ArologisNotifyStatus{SUCCESS/FAILED/DELAYED}`·`DispatchNotificationAssembler`(dispatchId 1회·채널별 최신 dedup·N+1 없음)·`NotifyResult`·`VehicleDetail.notifyResults`. **V24**(BaseEntity 7감사+CHECK+`(dispatch_id)` partial 인덱스·미사용 복합 인덱스 제거).

### FE (arologis-desktop)
- `arologisDispatchDetail.ts` notifyResults 매핑·mock `channel:'aligo'`. `DispatchDetailPage` NotifyResultSection errorCode overflow 가드(ellipsis+title). maskPhone 주석 정정. (섹션 UI는 #804).

## 검증

- **BE**: `--rerun-tasks --no-build-cache` BUILD SUCCESSFUL. **FE**: typecheck clean·50 tests. (권위 재검증·R1 재리뷰 진행)
- _(라이브 QA — skeleton OFF 실 SMS 시도·NotifyResultSection GUI·리뷰 라운드에서)_

## 리뷰 이력

- **R1 Opus 5-agent(③-A)**: 구조 결함 포착 — Design Finding 0(appUserId 항상 null→비기능)·BE P1(tx 격리)·BE P2(skeleton 조작 SUCCESS)·Design P1(채널 오라벨). → 개발책임자 ③-B 확장.
- **Codex ③-B 재구현**(codex exec·effort high): 실 SMS 발송+격리+정직상태+R1 fix 전량. BE green·FE 50.
- _(R1 5-agent 재리뷰[범위 재설정] ↔ Codex 적대 — 진행 예정)_
