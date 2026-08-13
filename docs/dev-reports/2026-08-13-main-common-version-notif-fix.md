# main 공통 결함 수정 보고서 — `/app/version` · 알림 UUID

## 범위와 판정

대상 브랜치는 `fix/app-version-and-notification-uuid`이며 git 변경 계열 명령과 공유 DB 쓰기는 수행하지 않았다. 공유 Docker 스택도 중지하거나 재기동하지 않았다.

## ① `/app/version` 원인과 선택한 방향

`/app/version`은 `dashboard-service`의 `AppReleaseController`에 실제로 정의되어 있고, gateway에도 `dashboard-app-version-public` route가 존재한다. 따라서 deep-link SPA fallback 문제가 아니라 dashboard-service가 `DESKTOP`의 published 릴리스를 찾지 못해 `BusinessException(NOT_FOUND)`를 반환한 것이 404의 직접 원인이다. 일반 진입과 새로고침의 호출 URL은 동일하므로 새로고침 전용 결함도 아니다.

desktop `AppVersionGate`는 Electron updater 피드 확인과 별도로 `getAppVersion({ clientType, currentVersion })`을 호출해 force level을 결정한다. #910의 updater 배선/실제 피드 부재는 이 API의 릴리스 카탈로그 부재와 다른 계층이다. 따라서 호출을 삭제하지 않았다.

published 릴리스가 없을 때 `200 + forceLevel=NONE`을 선택한 이유는 다음과 같다.

- 초기 배포·피드 미연결 상태는 “요청한 리소스가 잘못됨”이 아니라 “현재 적용할 업데이트가 없음”이다.
- 클라이언트는 정상 응답의 `forceLevel`을 읽고 `NONE`이면 계속 진입하며, 네트워크/HTTP 실패는 경고 후에도 앱을 계속 진행한다. 404를 유지하면 정상 초기 상태가 오류 경로로 기록되고 deep-link 새로고침에서 결함으로 보인다.
- 응답의 `latestVersion`과 `minSupportedVersion`을 요청한 `currentVersion`으로 채워 기존 DTO 계약을 유지한다. 실제 published 피드가 붙으면 기존 릴리스 조회 결과가 우선되어 이 fallback은 사용되지 않으므로 #910의 향후 feed 계약을 막지 않는다.

구현: `AppVersionResponse.noPublishedRelease(currentVersion)` 및 `AppReleaseService.checkVersion` fallback.

## ② 알림 관련 엔드포인트 전수 점검

| 구분 | 경로 | 사용자 노출 여부 | 처리 |
|---|---|---:|---|
| 사용자 센터 | `GET /api/notifications/my` | 예 | `NotificationCenterResponse.id`를 opaque serializer로 출력; 본문 문자열의 UUID literal도 masking |
| 사용자 센터 | `GET /api/notifications/history?page=&size=` | 예 | 위와 동일. 중첩 `content[]` 전체 적용 |
| 사용자 센터 | `POST /api/notifications/{id}/acknowledge` | 예 | UUID 또는 opaque token을 받아 내부 UUID로 decode 후 기존 권한/read_at 처리 |
| 내부 발행 | `POST /internal/notifications` | 아니오, 형제 서비스 계약 | 내부 UUID 반환 계약 유지; gateway 사용자 route 대상 아님 |
| 기존 발송 | `POST /internal/notifications/send` | 아니오, 내부 계약 | 기존 내부 DTO 계약 유지; 사용자 응답 범위 아님 |
| 내부 상태 | `GET /internal/notifications/{id}/status` | 아니오, 내부 계약 | 기존 내부 상태 DTO 유지; 사용자 노출 경로 아님 |
| 관리자 발송/조회 | `/admin/notifications/**` | 관리자 전용 | 사용자 알림 센터와 별도 관리자 계약으로 분류, 이번 사용자 노출 결함의 경로 아님 |
| push token | `/api/v1/notification/push-tokens/**` | 사용자 기능 | token 자체는 UUID 식별자가 아닌 push token이며 이번 변경 범위의 알림 센터 UUID 응답 아님 |

소비 측 desktop은 `notificationApi.ts`에서 조회 `id`를 그대로 acknowledge URL segment에 전달하므로 opaque token 변경을 추가 수정 없이 수용한다. `deeplink`는 기존 업무 경로를 유지하며 UUID literal이 들어온 경우에만 응답 직렬화 시 opaque token으로 치환한다.

## RED → GREEN 원문

### version RED

```text
AppReleaseServiceNoPublishedReleaseTest > checkVersion_withoutPublishedRelease_returnsNoUpdateInsteadOfNotFound() FAILED
com.samhanair.logis.common.exception.BusinessException
at AppReleaseService.latestRelease(AppReleaseService.java:127)
```

### notification RED

```text
my: HTTP 200
response body data[0].id = "22222222-2222-2222-2222-222222222222"

acknowledge opaque token: HTTP 400
Invalid UUID string: IiIiIiIiIiIiIiIiIiIiIg
```

초기 history RED는 production 실패가 아니라 standalone MockMvc에 Pageable argument resolver가 없어 `No primary or single unique constructor found for interface Pageable`가 발생했다. resolver를 테스트 하네스에 추가한 뒤 본문 전체 UUID 정규식 검사로 재실행했다.

### GREEN

```text
:services:notification-service:test --tests '*NotificationCenterControllerContractTest' --no-daemon --max-workers=1
BUILD SUCCESSFUL

:services:dashboard-service:test --tests '*AppReleaseServiceNoPublishedReleaseTest' --no-daemon
BUILD SUCCESSFUL
```

알림 계약 테스트는 `my`와 `history`의 JSON 응답 본문 전체를 UUID 정규식으로 검색하고, acknowledge token이 원 UUID로 decode되어 service에 전달되는지 검증한다.

## 검증 결과

- `:services:notification-service:test --no-daemon --max-workers=1`: **BUILD SUCCESSFUL**
- `:services:dashboard-service:test --no-daemon --max-workers=1`: **BUILD SUCCESSFUL**
- desktop `npm run typecheck`: **실행 시작 전 중단**. 로컬 파생물 가드가 `electron-updater` 미설치 및 `clients/web/design-system/dist/index.d.ts` 부재를 보고했다. 이 라운드에서는 npm install/build를 수행하지 않았다.
- 요청된 desktop 기준 `Test Files 260 passed / Tests 2260 passed | 2 skipped`: 위 의존성 부재로 **못 돌렸다**. 따라서 해당 기준을 통과했다고 주장하지 않는다.
- 공유 Docker/공유 DB: 쓰기·중지·재기동 없음.

## 불변식 재확인

1. published 릴리스가 없는 `/app/version`도 200/NONE이며 deep-link refresh에서 404를 만들지 않는다.
2. 사용자 알림 `my`·`history` 응답의 중첩 본문 전체에 UUID literal이 없고 id는 opaque token이다.
3. acknowledge는 opaque token을 decode하여 기존 `NotificationCenterService.acknowledge(UUID, ...)`와 권한/read_at 동작을 보존한다. 상세 진입은 기존 `deeplink`를 보존한다.
4. 관련 backend 전량 테스트는 통과했다. desktop 전량 기준은 환경 의존성 때문에 검증하지 못했다.

## 라운드 종료 점검

`git ls-files --deleted`: 삭제된 추적 파일 없음.

`tools/.s24-build-only/build/deep/tracked-writer.mjs`는 존재하며 42 bytes로 확인했다. 이 라운드에서 띄운 프로세스/파일이 아니므로 삭제하지 않았다.
