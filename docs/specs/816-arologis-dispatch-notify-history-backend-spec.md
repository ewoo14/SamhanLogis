# #816 — arologis 배차 상세 알림 발송이력 백엔드 노출 (FE-3)

- **상태**: 기획(정찰 완료·PM 설계결정 제시) · **구현 대기(개발책임자 spec 검토 후)** — 2026-07-14 "먼저 기획/spec만" 지시
- **연관**: #804(배차 상세 계약 정합) · FE `NotifyResultSection` · notification-service
- **목표**: `DispatchDetailResponse.VehicleDetail.notifyResults` 를 실데이터로 채워 배차 상세 알림 발송결과 row 원복.

## 정찰 결과 (양 서비스 실측 — 2026-07-14)

### arologis-service (발송 측)
- **실 발송 1곳뿐**: `DispatchService.autoMatch` → `notificationClient.send(appUserId, "PUSH", subject, body)`. dispatchId·vehicle **가용하나 미전달**. 채널 하드코딩 `"PUSH"`.
- **skeleton-mode 기본 true**(`application.yml`) → 기본적으로 외부 호출 회피·**아무 레코드도 생성 안 됨**.
- **wire body 결함**: `{recipientUserId, channel, subject, body}` 전송하나 notification-service `NotificationSendRequest` 는 `recipientType`(@NotNull)+`recipientId` 요구 → skeleton off 시에도 **400**(현재 실동작 불가).
- **`ArologisMatcherProperties.Notify`**(dispatchChannel=`insung-talk`·inviteChannel=`aligo`): **선언만·전 코드 미사용**.
- **arologis 로컬 알림 레코드 전무**(Notification 엔티티/테이블 없음).

### notification-service (게이트웨이 측)
- **`NotificationChannel`**: `PUSH·EMAIL·SMS` (insung-talk/aligo 없음).
- **`NotificationStatus`**: `PENDING·SENT·FAILED·RETRYING`. `NotificationLog.gatewayStatus`(String): `SUCCESS`/`FAILURE_*`.
- **`NotificationRequest`**: recipientType·recipientId·recipientAddress(전화번호)·channel·status·attemptCount·lastAttemptedAt·**`payload`(JSONB freeform·유일한 상관 저장 후보)**. **구조적 상관필드(sourceId/dispatchId 등) 없음**.
- **`NotificationLog`**: request FK·channel·attemptNo·gatewayStatus·gatewayMessageId·sentAt. 상관필드 없음.
- **조회 endpoint**: `/admin/notifications`(channel·status 필터만)·`/internal/notifications/{id}/status`. **recipient별·상관별 조회 없음·Log 노출 endpoint 없음**.

### FE 계약 (목표)
- `NotifyResult{ channel: 'insung-talk'|'aligo', status: 'SUCCESS'|'FAILED'|'DELAYED', sentAt, recipientPhone, errorCode }`. `notifyResults` 빈 배열이면 섹션 자체 숨김(무해).
- BE `VehicleDetail` 에 `notifyResults` 필드 **아직 없음**(추가 필요).

## 🔑 설계 결정 (개발책임자 확정 필요 — PM 권고 병기)

### 결정① 상관저장 위치 (아키텍처·핵심)
| 옵션 | 방식 | 장 | 단 |
|---|---|---|---|
| **A (PM 권고)** | **arologis 로컬 `DispatchNotification` 로그** — 발송 시점에 arologis가 (dispatchId·vehicleSeq·channel·status·sentAt·recipientPhone·errorCode) 자체 적재. notifyResults=로컬 조회 | notification-service 무변경(arologis 자율 범위 유지·게이트웨이 순수성)·동일 DB 조인·인덱스·빠름·FE 계약(arologis 도메인 의미)을 arologis가 소유 | 알림 요약을 arologis가 이중 보관 |
| B | notification-service에 구조적 상관(sourceType=AROLOGIS_DISPATCH·sourceId·vehicleRef) + 상관조회 endpoint 신설. arologis가 발송 시 상관 전달·조회 | 알림 SSOT가 notification-service | **cross-service 변경**(도메인 마이그+endpoint)·notification-service가 배차 인지(누수)·결합↑ |
| C | notification-service `payload` JSONB에 {dispatchId,vehicleSeq} 저장 + JSON 필터 조회 | 스키마 무변경 | JSONB 조회 인덱스 부재·느림·payload 용도(템플릿) 오염·취약 |

> **PM 권고 = A**. 근거: (1) arologis가 배차상세 표시데이터를 소유(gpsSources 조립과 동일 원칙) (2) notification-service를 배차-무관 순수 게이트웨이로 유지(arologis-extract 자율·결합 최소) (3) 동일 DB 조인 단순·인덱스 (4) FE의 insung-talk/aligo·SUCCESS/FAILED/DELAYED는 **arologis 도메인 의미**라 arologis 로컬에 담는 것이 자연스러움. notification-service는 계속 전송 게이트웨이, arologis는 배차-facing 결과를 기록.

### 결정② 채널/상태 매핑 (①에 종속)
- **A 채택 시**: arologis 로컬에 **FE-정합 enum** 직접 저장 — 채널 `ArologisNotifyChannel{INSUNG_TALK, ALIGO}`·상태 `ArologisNotifyStatus{SUCCESS, FAILED, DELAYED}`. 발송 시 notification-service 응답 상태를 매핑(SENT→SUCCESS·FAILED→FAILED·PENDING/RETRYING→DELAYED). 채널은 arologis 의미(어떤 알림 유형)로, notification-service transport(SMS/PUSH)와 분리.
- **B 채택 시**: notification-service enum 확장 or 매핑 레이어 신설(더 큼).
> **PM 권고**: ① A 와 세트로, arologis 로컬 FE-정합 enum + 발송시 매핑. notification-service enum 무변경.

### 결정③ 실제 발송경로 개수 여부 (범위)
- **A (PM 권고)** — **발송이력 기록·노출만**(#816 스코프="발송이력 노출"에 충실): arologis가 발송하는 알림을 로컬 로그에 상관과 함께 기록 + notifyResults 노출. **실 insung-talk/aligo 벤더 발송(W10-2 인성 sandbox·aligo)은 별도 슬라이스로 이연**. 단, **현재 깨진 wire body(recipientType 누락)**는 발송경로를 건드리는 김에 정정(진짜 결함).
- B — #816에서 insung-talk/aligo 실 발송까지 구현. → 벤더 통합 영역(W10-2)과 중첩·대형.
> **PM 권고 = A**. 근거: #816은 "발송**이력** 노출"이 스코프. 실 벤더 발송은 인성 퀵프로그램 통합(W10-2·sandbox) 영역·별건. #816은 상관 기록+노출 플러밍. ⚠️ **함의**: 실 insung-talk/aligo 발송이 없으면 notifyResults는 (현 PUSH-매칭 기록 외) 비어 보일 수 있음 → 라이브 QA는 #815처럼 투명 시드 필요·FE 섹션은 빈 배열 시 숨김(무해).

## 구현 범위 (결정 A/A/A 가정 시 — 확정 후 조정)

1. **arologis BE**: `DispatchNotification` 엔티티(BaseEntity·dispatchId·vehicleSeq·channel·status·sentAt·recipientPhone·errorCode)+repo+Flyway V24. 발송 hook(autoMatch 등 send 지점)에서 상관과 함께 적재. `NotificationClient` wire body 정정(recipientType/recipientId). `DispatchDetailResponse.VehicleDetail.notifyResults` 추가 + assembler(vehicleSeq별 조회). 
2. **arologis FE**: `arologisDispatchDetail.ts` notifyResults 매핑(현 `undefined` 하드코딩 제거)·`RawVehicleDetail` 필드 추가. (NotifyResultSection UI는 #804서 완성).
3. **notification-service**: **무변경**(A 채택 시).
4. **테스트+라이브 QA**(#815 패턴): IT(notifyResults jsonPath)·GpsSourceAssembler류 단위·투명 시드 라이브 GUI 스샷.

## 캐논 워크플로우

Opus 기획(본 spec·완료) → **개발책임자 결정①②③ 확정** → 조기 PR → Codex 개발 → Opus 5-agent+fix+라이브QA ↔ Codex 5-agent 적대 → 0수렴 → PM 종합 → CI → 머지.

## ✅ 결정 확정 (2026-07-15 개발책임자) — ③-B 실 발송까지 확장

> R1 5-agent 리뷰가 ③-A(이력 기록만)의 **구조적 비기능성** 포착: 실 드라이버 `appUserId` 항상 null(Mock/Insung matcher·updateAppInstalled 호출자 0)이라 recording 미발동 → notifyResults 영구 `[]`·조작 시드로만 표시. 실 insung-talk/aligo 벤더 발송 부재로 **기록할 실 알림 자체가 없음**. → 개발책임자 **③-B(실 발송 확장)** 결정.

### ③-B 설계 (실 aligo SMS 배차 알림 발송 + 기록 + 노출)
- **실 발송**: `autoMatch` 매칭 성공 시 **기사 전화번호로 aligo SMS**(배차 매칭 알림) 발송 — notification-service 기존 `POST /internal/notifications/send`(recipientType=`EXTERNAL_PHONE`·channel=`SMS`·recipientAddress=phone·AligoSmsAdapter). **appUserId 게이트 제거**(phone 기반이라 전 기사 도달). notification-service **무변경**(기존 엔드포인트 정상 사용).
- **wire body 정정**: 기존 `{recipientUserId,...}`(recipientType 누락→400)를 `{recipientType:EXTERNAL_PHONE, recipientAddress:phone, channel:SMS, subject, body}`로 정정.
- **채널 = ALIGO**(정확·SMS). INSUNG_TALK는 실 인성 알림톡 벤더(W10-2) 시점 예약.
- **상태 매핑**: notification-service 응답 SENT→SUCCESS·FAILED→FAILED. **skeleton-mode 시 실 미발송 → 미기록**(attempted=false·arologis 조작 SUCCESS 금지). ⚠️ **재리뷰 정정**: (1) **DELAYED 현 도달불가**(notification-service W3=1회 시도·retryable=false·SMS 채널은 SENT/FAILED만·DELAYED는 W10-2 예약). (2) **dev 'SUCCESS'=stub**: 로컬은 arologis skeleton=false이나 notification-service Aligo creds blank → `AligoSmsAdapter`가 미발송 stub SUCCESS 반환. 라이브 QA "성공"은 **end-to-end 기록·렌더 경로 실증**이며 실 문자 전달 증거 아님(실 creds 주입 시 별도). 레코드는 실 autoMatch 경로 실데이터.
- **R1 fix 동반**: tx 격리(REQUIRES_NEW recorder)·raw phone BE 마스킹·errorCode overflow 가드·populated-case 테스트·미사용 복합 인덱스 제거.

## (참고) 초기 옵션 제시 — 개발책임자 확정 요청

- **결정① 상관저장**: A(arologis 로컬·PM 권고) vs B(notification-service SSOT) vs C(payload).
- **결정③ 범위**: A(이력 기록·노출만·벤더 발송 이연·PM 권고) vs B(실 발송까지).
- ② 는 ①에 종속(A 세트 권고).
- 부수: 깨진 `NotificationClient` wire body(recipientType) 정정을 #816에 포함(권고) vs 별건.
