# PR #994 / Issue #895 일정관리 R5 SOL 재수렴 적대검증

## 최종 판정

- 대상 브랜치/HEAD: `feat/895-dashboard-schedule` / `09b592d077faa40fefa5cef362d2bd66f73fe47a`
- 범위 축소 비교 기준: `b02971459..09b592d07`
- 판정 질문: **이 축소가 바꾼 표면 전체에서 실 사용자 경로로 재현 가능한 결함이 있는가**
- 판정: **도달 가능한 결함 1건**
  - `V16`·`V17` 기적용 환경에서 축소 전 이미 발행된 `SCHEDULE` 알림은 남는다.
    축소 뒤 이 행은 `알 수 없는 채널`로 표시되고, 클릭하면 저장된 `/schedules`로 이동해
    인앱 404가 된다.
- 범위 축소 방향 자체는 뒤집지 않는다. 신규 일정 알림 발행은 이월된 사양으로 판정했다.
- R4 결함 1~3의 **신규 발생 경로는 소멸**했다.
- R4 결함 4는 **기발행 알림 행의 실제 업그레이드 경로에서 미소멸**했다.
- V18은 두 적용 시나리오의 최종 groupware 스키마와 작성자 backfill 상태를 같게 만들지만,
  기적용 환경의 `notification_requested_at` 값은 백업 없이 영구 삭제한다. 현재 HEAD에 이
  값을 읽는 사용자 경로가 없어 이를 별도 사용자 결함으로 세지는 않았다.
- 작성자 자동 대상자 포함, 대상자 전용 조회, 소유자 전용 수정·삭제, 권한 카탈로그는 축소
  뒤에도 유지된다.
- 기존 메신저 알림 발행 경로는 축소 diff에서 바뀌지 않았고 실제 호출자도 남아 있다.
- 원격 마이그레이션 번호 및 적용 순서 충돌은 **0건**이다.

현재 공유 DB는 groupware Flyway 최고 `V15`이고 `notification_db`의 `SCHEDULE` 행도
0건이다. 따라서 결함 1은 현재 공유 stack의 기존 fixture로는 재현되지 않는다. 그러나
사용자가 명시한 “이미 V16·V17이 적용된 환경”에서 축소 전 production 코드가 정상적으로
만든 행을 그대로 두고 HEAD로 올리는 결정적 업그레이드 경로이므로 판정불가가 아니라
도달 결함으로 판정한다.

## 5개 독립 조사 역할

| 역할 | 조사 각도 | 판정 |
|---|---|---|
| 1 | R4 결함 1~4의 production 호출·상태·deeplink 소멸 | #1~#3 신규 경로 소멸, #4 미소멸 |
| 2 | V16→V17→V18 두 적용 시나리오와 실데이터 투영 | 최종 스키마 동일, 전용 시각 데이터 영구 손실 |
| 3 | 작성자 자동 포함·조회·수정·삭제·라이브QA 불변 | 도달 결함 0건 |
| 4 | 원격 main·열린 PR·원격 head의 migration 번호/순서 | 충돌 0건 |
| 5 | 축소 diff·고아 알림·메신저·문서 증거 무결성 red-team | 도달 결함 1건, 증거 불일치 2건 |

루트 리뷰어는 다섯 결과를 전체 production diff, 현재 공유 DB의 읽기 전용 SELECT,
GitHub의 exact PR HEAD/checks, `git ls-remote --heads origin`, 각 원격 SHA의 tree,
그리고 제한된 groupware 단위 테스트 재실행과 대조했다.

## R4 결함 1~4 경로 소멸 판정

| R4 결함 | 신규 발생 경로 | 기존 결과 처리 | R5 판정 |
|---|---|---|---|
| 1. 발행 실패 후 영구 누락 | 일정 CRUD가 publisher·전용 상태를 더는 호출하지 않아 소멸 | 과거 누락 행을 복구하지 않지만 알림 자체가 이월 범위 | **소멸** |
| 2. 동시 확정 중복 | 확정 mutation에서 발행 callback이 없어 소멸 | 이미 생긴 중복 알림 행은 정리하지 않음 | **신규 경로 소멸** |
| 3. 제거 후 재초대 누락 | 참여자에 알림 요청 상태가 없고 발행도 없어 소멸 | 이 PR에서 재초대 알림을 요구하지 않음 | **소멸** |
| 4. 알림 클릭 `/schedules` 404 | 신규 `SCHEDULE` 행 생성은 막힘 | 기발행 행과 deeplink가 남고 라벨만 제거됨 | **미소멸** |

### R4 결함 1 — 발행 실패 후 영구 누락

R4의 재현 절차인 “확정 일정 저장 → notification-service 실패 → 재저장 → 벨 확인”을
현재 코드에 대입하면 일정 mutation에서 notification-service로 나가는 호출 자체가 없다.
`ScheduleParticipant`에도 `notification_requested_at` 필드나 요청 표시 메서드가 없다.
따라서 **신규 영구 누락을 만드는 경로는 소멸**했다.

알림은 후속 캘린더 UI 슬라이스로 이월되었으므로 “알림이 생성되지 않는다”를 이 PR의
사양 위반으로 세지 않았다.

근거:

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:32-54,74-128`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/ScheduleParticipant.java:24-49`
- `services/groupware-service/src/main/resources/db/migration/V18__remove_schedule_notification_state.sql:1-3`

### R4 결함 2 — 동시 확정 중복

R4의 “같은 DRAFT 일정에 CONFIRMED PUT 2건 동시 제출”을 현재 코드에 대입해도 두
transaction 모두 일정 상태와 대상자만 갱신하며 notification callback을 만들지 않는다.
따라서 **신규 중복 발행 경로는 소멸**했다.

다만 축소 전 이미 중복 발행된 `notification_center` 행은 V18이 정리하지 않는다.
이는 새 중복을 만드는 결함이 아니라 아래 결함 1의 기발행 행 잔존 범위에 포함한다.

근거:

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:74-105`
- `services/groupware-service/src/main/resources/db/migration/V18__remove_schedule_notification_state.sql:1-3`
- `services/notification-service/src/main/java/com/samhanair/logis/notification/repository/NotificationCenterRepository.java:24-36,41-63`

### R4 결함 3 — 제거 후 재초대 누락

R4의 “B 제거 → B 재초대 → 벨 확인”에서 영구 누락을 만들던
`notification_requested_at` 상태와 `markNotificationRequested()`가 production
entity에서 제거됐다. 현재 재초대는 soft-deleted participant를 복원할 뿐 알림 상태를
판정하지 않는다. 따라서 **이 PR 범위의 신규 누락 경로는 소멸**했다.

근거:

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/Schedule.java:117-131,139-145`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/ScheduleParticipant.java:34-49`
- `services/groupware-service/src/main/resources/db/migration/V18__remove_schedule_notification_state.sql:1-3`

### R4 결함 4 — 알림 클릭 `/schedules` 404

**미소멸.** 신규 알림 producer만 제거됐을 뿐 기발행 `notification_center` 행을
삭제·변환하는 migration은 없다. 현재 알림 조회는 channel을 제한하지 않고 사용자의 모든
활성 행을 반환한다. 데스크톱은 `SCHEDULE` 라벨을 제거했으며, 알림 클릭은 행에 저장된
deeplink를 그대로 navigate한다. `/schedules` route는 없고 catch-all 404가 남아 있다.

상세 재현과 사용자 결과는 아래 결함 1에 기록한다.

근거:

- `services/notification-service/src/main/java/com/samhanair/logis/notification/repository/NotificationCenterRepository.java:24-36,41-63`
- `clients/desktop/src/renderer/api/notificationApi.ts:88-94`
- `clients/desktop/src/renderer/components/NotificationBellDropdown.tsx:73-79,162-176`
- `clients/desktop/src/renderer/routes/index.tsx:349-350,1716-1719`

## 도달 가능한 결함

## 결함 1 — 기발행 일정 알림이 고아 행으로 남아 잘못된 라벨과 `/schedules` 404를 노출한다

### 실 사용자 경로

`V16`·`V17`이 이미 적용되고 축소 전 `8991c4836` 앱이 한 번이라도 정상 운영된
환경이다. 등록자 A가 대상자 B를 포함한 `CONFIRMED` 일정을 저장해 B 대상
`notification_center(channel='SCHEDULE', deeplink='/schedules')` 행을 만든다.
운영자가 앱을 HEAD `09b592d07`로 올리고 V18을 적용한 뒤, B가 알림 벨 또는 알림
내역을 연다.

### 재현 절차

1. V16·V17과 축소 전 앱 `8991c4836`이 배포된 환경에서 A의 실제 계정으로 B 대상
   `CONFIRMED` 일정을 생성하거나 기존 일정을 확정한다.
2. notification-service가 정상인 상태에서 B 대상
   `channel='SCHEDULE', deeplink='/schedules'` 행이 발행되게 한다.
3. DB를 초기화하지 않고 앱을 HEAD `09b592d07`로 올려 V18을 적용한다.
4. B로 로그인해 알림 벨을 열거나 `/notifications` 내역에서 기존 일정 알림을 확인한다.
5. 알림 벨의 해당 행을 클릭한다.

### 관측된 잘못된 결과

V18은 groupware의 `schedule_participants.notification_requested_at`만 DROP한다.
notification-service의 기존 행은 삭제·변환되지 않고, `channel`과 `deeplink`는
updatable false로 저장된 값 그대로 남는다.

HEAD의 `CHANNEL_LABEL`에는 `SCHEDULE`이 없으므로 벨과 내역의 채널은
`알 수 없는 채널`로 표시된다. 벨 클릭은 먼저 ack를 요청한 뒤 저장된 `/schedules`로
navigate한다. 현재 route에는 `/schedules`가 없어 인증된 사용자는 인앱 catch-all 404를
본다. R4 결함 4가 기발행 행에 대해 그대로 재현된다.

현재 공유 `notification_db`의 해당 행은 0건이지만, 축소 전 producer가 정상 호출되면
행을 만들도록 구현돼 있었으므로 이는 임의 SQL fixture가 아니라 실제 배포 순서에서
생기는 사용자 경로다.

### 파일:행 근거

- 축소 전 실제 producer:
  `8991c4836:services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:149-176`
  (`SCHEDULE`은 161행, `/schedules`는 173행)
- `services/notification-service/src/main/java/com/samhanair/logis/notification/domain/NotificationCenter.java:43-44,67-71`
- `services/notification-service/src/main/java/com/samhanair/logis/notification/repository/NotificationCenterRepository.java:24-36,41-63`
- `services/groupware-service/src/main/resources/db/migration/V18__remove_schedule_notification_state.sql:1-3`
- `clients/desktop/src/renderer/api/notificationApi.ts:88-94`
- `clients/desktop/src/renderer/components/NotificationBellDropdown.tsx:73-79,162-176`
- `clients/desktop/src/renderer/routes/NotificationHistoryPage.tsx:51-55,101-104`
- `clients/desktop/src/renderer/routes/index.tsx:349-350,1716-1719`

## V18 데이터·적용 경로 판정

### 시나리오 A — V16·V17 기적용 환경에 V18 적용

1. V16이 `notification_requested_at`을 추가한다.
2. 축소 전 앱이 운영됐다면 대상자 행 일부에 발행 요청 시각이 기록될 수 있다.
3. V17이 활성 일정 중 활성 owner participant가 없는 행을 추가한다.
4. V18이 `notification_requested_at` 컬럼 전체를 백업 없이 DROP한다.

최종 groupware 스키마에는 전용 컬럼이 없고 owner participant는 남는다. 단 V16 이후
기록된 non-null 요청 시각은 전부 영구 삭제되어 복원할 수 없다.

### 시나리오 B — V15 환경에서 V16→V17→V18 연속 적용

서비스가 중간에 구버전 producer를 실행하지 않고 세 migration을 연속 적용하면 V16의
컬럼은 잠시 생겼다가 V18에서 제거된다. V17은 같은 조건으로 owner participant를
backfill한다.

### 결과 비교

- **최종 스키마:** 동일하다.
- **활성 일정의 owner participant 관계:** 동일 입력을 전제로 동일하다.
- **물리 UUID와 `created_at`:** migration 실행 때 생성되므로 실행별로 다를 수 있으나
  사용자 계약 차이는 아니다.
- **알림 요청 이력 데이터:** 동일하지 않다. 시나리오 A에 non-null 값이 있었다면 V18이
  되돌릴 수 없이 삭제한다.
- **현재 사용자 결함:** HEAD에는 삭제된 값을 읽는 caller가 없으므로 전용 시각 손실만으로
  추가 사용자 결함을 세지 않는다. 반면 별도 DB의 기발행 `notification_center` 행은
  살아 있어 결함 1을 만든다.

근거:

- `services/groupware-service/src/main/resources/db/migration/V16__add_schedule_notification_requested_at.sql:1-6`
- `services/groupware-service/src/main/resources/db/migration/V17__add_schedule_owner_as_participant.sql:1-27`
- `services/groupware-service/src/main/resources/db/migration/V18__remove_schedule_notification_state.sql:1-3`
- `services/groupware-service/src/main/resources/application.yml:34-37`

현재 공유 DB 읽기 전용 확인:

| 항목 | 관측값 |
|---|---:|
| groupware Flyway V16/V17/V18 적용 행 | 0 |
| groupware 현재 최고 migration | V15 |
| `notification_requested_at` 컬럼 | 없음 |
| 활성 일정 | 25 |
| 활성 participant | 41 |
| 활성 일정 중 활성 owner participant 보유 | 0 |
| V17 투영 추가 후보 | 25 |
| V17 투영 후 활성 participant | 66 |
| 기존 활성 `(schedule_id, participant_id)` 중복 | 0 |
| 활성/삭제 혼재 pair | 0 |

공유 DB에는 V17·V18을 실제 적용하지 않았다. 위 `41→66`은 V17 SELECT 조건을
읽기 전용으로 투영한 결과다.

## 작성자 자동 대상자 및 라이브QA 유지 판정

도달 결함은 확인되지 않았다.

- 신규 일정은 body의 대상자 목록보다 먼저 owner를 실제 participant로 추가한다.
- 응답은 owner를 대상자 UUID 목록에 합치고 distinct 처리하므로 V17 적용 전 legacy
  일정도 작성자가 대상자 목록에 보인다.
- owner 제거는 domain에서 no-op이다.
- 수정 시에도 legacy owner participant를 먼저 복구한다.
- 목록 조회는 요청의 `ownerId` query를 신뢰하지 않고 호출자 UUID만 사용한다.
- 목록 repository는 owner 또는 활성 participant인 일정만 반환한다.
- UPDATE와 DELETE는 page permission 뒤에 owner UUID 객체 권한을 다시 검사한다.
  따라서 `messenger.admin`만 가진 계정이나 시스템 마스터도 타인 일정을 수정·삭제할 수 없다.

근거:

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:32-51,74-105,120-128`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/Schedule.java:117-131,139-145`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/ScheduleResponse.java:33-40`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/repository/ScheduleRepository.java:31-39`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareAdminController.java:290-311,316-333`
- `services/groupware-service/src/main/resources/db/migration/V17__add_schedule_owner_as_participant.sql:19-27`

### 기존 라이브QA 항목별 불변 판정

| R3/R4 라이브QA 항목 | 축소 뒤 판정 | 근거 |
|---|---|---|
| 등록 201 | 유지 | controller 290-297, service 32-51 |
| 대상자 목록 조회 | 유지 | response 33-40 |
| 비대상자 목록 비노출 | 유지 | repository 31-39 |
| `messenger.admin` 타인 수정·삭제 403 | 유지 | service 76-80, 122-126 |
| 시스템 마스터 타인 수정·삭제 403 | 유지 | 같은 owner 객체 권한 검사 |
| 등록자 본인 수정·삭제 | 유지 | service 76-105, 122-128 |
| 권한 화면 `groupware.schedules` | 유지 | permissions API 114, matrix 245/423, V90 |

권한 카탈로그 및 seed 근거:

- `clients/desktop/src/renderer/api/permissionsApi.ts:114`
- `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx:245,423`
- `services/auth-service/src/main/resources/db/migration/V90__seed_groupware_schedules_page_permission.sql:14-36,38-71,73-115,117-168`

현재 공유 auth DB의 읽기 전용 대조에서도 V90 성공, 활성
`account_page_permissions(page_code='groupware.schedules')` 10행, 네 CRUD 권한 모두
true 10행, 활성 group grant 10행을 확인했다. 권한 화면 캡처
`docs/qa/994-schedule-live/screenshots/03-permission-groupware-schedule.png`도 원본을 열어
`그룹웨어 일정` / `groupware.schedules` 표기를 확인했다.

## 기존 메신저 알림 불변 판정

도달 결함은 확인되지 않았다.

- 범위 축소 diff에서 `MessageService`와 공통 publisher/executor 구현은 바뀌지 않았다.
- 단건 메시지는 저장 뒤 `MESSENGER`, 수신자 UUID, `/messenger` 요청을 after-commit
  executor로 보낸다.
- 일괄 메시지도 각 저장 행마다 같은 실제 발행 경로를 사용한다.
- 따라서 공통 publisher와 executor는 죽은 코드가 아니며 일정 전용 호출만 제거됐다.

근거:

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/MessageService.java:35-38,53-69,129-149`

제한된 fresh 실행 증거:

| 테스트 클래스 | 실행 | 실패 | 오류 | skip |
|---|---:|---:|---:|---:|
| `MessageServiceTest` | 6 | 0 | 0 | 0 |
| `ScheduleServiceTest` | 8 | 0 | 0 | 0 |

`GRADLE_USER_HOME=D:\dev\Samhan-Public\.gradle-t26`와 `--rerun-tasks`를 사용해
`UP-TO-DATE`/`FROM-CACHE` 결과를 채택하지 않았다. Docker나 공유 DB는 변경하지 않았다.

## 죽은 코드·죽은 데이터 판정

- 일정 production 코드의 publisher·executor·deeplink·알림 상태 참조: **0건**.
- 공통 publisher/executor: `MessageService`의 실제 caller가 있으므로 **살아 있음**.
- `ScheduleParticipant` 전용 컬럼/field/method: V18 및 entity에서 제거됨.
- `CHANNEL_LABEL.SCHEDULE`: 제거됐지만 기발행 `SCHEDULE` 행의 consumer까지 함께 없어진
  것이 아니다. 그 행은 조회·렌더·클릭되는 **살아 있는 고아 데이터**이며 결함 1을 만든다.
- 축소가 새로 만든 production dead method는 확인되지 않았다. `ScheduleService`의
  참여자 단건 추가 메서드는 base에도 있던 기존 표면이어서 이 축소 결함으로 세지 않았다.
- 일정 알림 관련 과거 문서는 역사 자료로 남지만, 머리말에 현재 구현이 아님을 명시한다.

증거 무결성 잔재:

1. `Schedule.java:139`는 “알림 발행 이력은 재추가 시 중복 발행 방지를 위해 보존”한다고
   설명하지만, 현재 entity에는 해당 이력이 없고 V18이 전용 컬럼을 제거한다.
2. `ScheduleStatus.java:7-9`는 CONFIRMED 참여자 알림과 CANCELLED 신규 알림을 현재
   동작처럼 설명하지만, 이 PR에서는 알림 발행이 이월됐다.

이는 현재 사용자 실행 결함으로 세지 않았지만, 현재 production 계약의 증거로 읽으면
사실과 다른 주석이다.

근거:

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/Schedule.java:139-145`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/ScheduleStatus.java:3-10`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/ScheduleParticipant.java:24-49`
- `docs/dev-reports/2026-07-30-895-schedule-notification-fix.md:1-14`

## 마이그레이션 번호·적용 순서 판정

판정: **SAFE, 충돌 0건**.

| 대상 | 원격 SHA | groupware 최고/추가 | auth 최고/추가 | #994와 순서 충돌 |
|---|---|---|---|---|
| `origin/main` | `8b302629...` | V15 | V89 | 없음 |
| PR #994 | `09b592d...` | V16→V17→V18 | V90 | 기준 |
| PR #996 | `3498473...` | 신규 없음 | 신규 없음 | 없음 |
| PR #993 | `ede7b83...` | 신규 없음 | 신규 없음 | 없음 |
| PR #991 | `a2f0818...` | 신규 없음 | 신규 없음 | 없음 |
| PR #984 | `94dc40a...` | 신규 없음 | 신규 없음 | 없음 |

- 열린 PR은 #996, #994, #993, #991, #984 총 5개다.
- PR #991의 accounting V67/slip V60과 PR #984의 product V27/V28은 서로 다른 Flyway
  history이므로 groupware/auth 적용 순서에 영향을 주지 않는다.
- 원격 head 22개를 SHA 고정 tree로 전수 대조했으며, main에 없는 더 낮은
  groupware/auth migration이나 같은 version의 다른 파일은 0건이다.
- #994를 먼저 병합해도 이후 열린 PR에 groupware V16 미만 또는 auth V90 미만 신규
  migration이 없고, #994를 나중에 병합해도 main은 각각 V15/V89이므로
  `out-of-order: false`에서 두 순서 모두 안전하다.

열린 PR이 아닌 stale `wip/ds3a-2026-07-21-evening`에 기존 groupware V12 blob
불일치가 있었으나 신규 하위 번호가 아니며 #994 병합 순서와 무관하다.

근거:

- `services/groupware-service/src/main/resources/application.yml:34-37`
- `services/groupware-service/src/main/resources/db/migration/V16__add_schedule_notification_requested_at.sql`
- `services/groupware-service/src/main/resources/db/migration/V17__add_schedule_owner_as_participant.sql`
- `services/groupware-service/src/main/resources/db/migration/V18__remove_schedule_notification_state.sql`
- `services/auth-service/src/main/resources/db/migration/V90__seed_groupware_schedules_page_permission.sql`

## 증거 무결성 대조

### 일치한 증거

- exact GitHub PR HEAD는 `09b592d07`이며 이 문서 작성 시점 checks는 42/42 SUCCESS였다.
- 축소 commit `80793789d`의 7개 파일 증감은 축소 보고서와 일치한다.
- `09b592d07`이 복원한 알림 fix 문서는 1~14행의 이월 배너로 “현재 구현 없음”을
  명시하므로 역사 기록을 현재 구현으로 오인시키지 않는다.
- 현재 공유 groupware DB의 활성 일정 25건, 활성 participant 41건, V17 후보 25건,
  투영 후 66건은 작성자 자동 대상자 보고서와 일치한다.
- 현재 공유 auth DB의 `groupware.schedules` 실효 계정 10건은 후속 R3 정정 수치와
  일치한다.
- 원격 현황은 22 heads/5 open PR이다. R4의 과거 23/6과 다른 것은 PR 병합 및 branch
  삭제에 따른 시점 차이로, 과거 증거 변조가 아니다.

### 불일치한 증거

1. 축소 보고서 91~96행은 결함 4에 “적용할 알림 행이 이 브랜치에 없으므로 사용자
   경로가 없다”고 판정한다. 그러나 기적용 환경의 `notification_center` 행은 이
   branch DB migration의 소유가 아니며 그대로 조회된다. **결함 1의 업그레이드 경로를
   누락한 판정**이다.
2. 축소 보고서 106행의 “죽은 코드 없음” 근거는 `SCHEDULE` 라벨 제거를 포함한다.
   기발행 행에는 라벨이 살아 있는 consumer 계약이므로 제거 뒤 fallback이
   `알 수 없는 채널`이 된다. 해당 라벨은 모든 운영 이력이 없다는 증거 없이는 단순
   dead label로 판정할 수 없다.

근거:

- `docs/dev-reports/2026-07-30-895-scope-reduction-defer-notification.md:91-106`
- `clients/desktop/src/renderer/components/NotificationBellDropdown.tsx:162-176`
- `clients/desktop/src/renderer/routes/NotificationHistoryPage.tsx:51-55,101-104`

## 판정불가

- 다른 실제 V16·V17 기적용 운영 환경마다 non-null
  `notification_requested_at`이 몇 건인지, 기발행 `SCHEDULE` 행이 몇 건인지는 접근
  증거가 없어 **수량 판정불가**다.
- 다만 행이 하나라도 존재할 때의 라벨/클릭 결과는 production 코드로 결정되므로 결함 1
  자체는 판정불가가 아니다.

## 이 라운드가 보지 않은 것

- 검증 품질, 테스트 강도, mock 품질 및 테스트 커버리지 평가는 보지 않았다.
- 이월된 캘린더 UI, 공휴일, 모바일 상호작용은 보지 않았다.
- 공유 DB에 write하지 않았고 V17·V18을 실제 적용하지 않았다.
- Docker를 재배포·중단하지 않았다.
- notification-service 장애 주입, 공유 실데이터 동시 PUT, 운영 데이터 정리 실행은
  하지 않았다.
- 새 이슈 등록, branch 생성, 코드 수정, git add/commit/push/checkout은 하지 않았다.
