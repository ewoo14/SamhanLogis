# PR #1195 main 공통 결함 수정 라이브QA — CODEX SOL

## 결론

**답: 이번 라운드에서 실제 사용자 경로로 도달 가능한 결함은 0건이었다.**

- `/app/version`: deep-link 직접 새로고침과 desktop 부팅 호출 모두 HTTP 200, `forceLevel=NONE`.
- 알림: 목록·history·opaque token acknowledge·상세(알림 내역) 진입 정상. 사용자 알림 응답 및 화면 UUID literal 0건.
- 상세 화면까지 관찰한 네트워크 8건은 전부 200. 400·404·500은 0건.
- 화면 console error 0건, 무한 재시도 없음, 최종 화면 `?` 0건.
- **머지 가능 판정: 가능.** 다만 실제 패키징 Electron 바이너리 자체 대신 현재 소스의 desktop renderer를 Playwright Chromium에서 실행했고, Electron preload/updater는 계약과 같은 `not-available` 상태를 주입했다. 이 미검증 범위를 통과로 과장하지 않는다.

## 격리와 하네스

- 공유 Docker 스택: 상태 조회만 했고 중지·재기동하지 않았다.
- 공유 DB: 쓰기 0건.
- 쓰기(알림 seed/acknowledge)는 라운드 전용 `sol1195-liveqa-pg` PostgreSQL의 `notification_db`에서만 수행했다.
- 현재 HEAD에서 새로 만든 notification/dashboard JAR을 별도 포트 `19093/19094`에 기동했다.
- desktop은 design-system을 새로 빌드한 뒤 현재 renderer 소스를 Vite `5196`에서 실행했다.
- Playwright가 `:8080` 요청을 관찰하면서 대상 `/app/version`, `/api/notifications/**`만 위의 신선한 격리 서비스로 전달했다. 부팅 보조 `/app/notices/active`, 권한 조회는 쓰기 없는 격리 응답을 사용했다.
- 첫 GUI 시도에서 Electron 인증 스텁만 제공해 updater IPC 부재 경고가 나타났다. 증거 무결성을 위해 원인을 확인하고, 실제 비패키징 Electron의 `not-available` 계약과 같은 updater IPC를 제공해 최종 재실행했다. 최종 스크린샷에는 오류 배너가 없다.

## 1. 빌드 신선도 확인 원문

브랜치·PR head:

```text
fix/app-version-and-notification-uuid
HEAD=7ddda35091dfaa1f9067779169223612d1f71ba0
PR #1195 headRefName=fix/app-version-and-notification-uuid
PR #1195 headRefOid=7ddda35091dfaa1f9067779169223612d1f71ba0
```

현재 HEAD에서 clean/bootJar를 다시 실행한 원문:

```text
> Task :services:notification-service:clean
> Task :services:notification-service:bootJar
> Task :services:dashboard-service:clean
> Task :services:dashboard-service:bootJar

BUILD SUCCESSFUL in 31s
23 actionable tasks: 8 executed, 2 from cache, 13 up-to-date
```

산출물 시간·SHA-256:

```text
NOTIF=services/notification-service/build/libs/notification-service.jar
length=139130582
lastWrite=2026-08-13T05:52:42.1407166+09:00
sha256=2D1719A3D820FB252690B7A0D82A1490DF9FDB2F734FFDF499EB373A7A28A59E

DASH=services/dashboard-service/build/libs/dashboard-service.jar
length=99296075
lastWrite=2026-08-13T05:52:44.0119714+09:00
sha256=8570C12DBEF580CCAB1B2A3A42EAEA8F450E57778767D875D7B27F0930C861BC
```

격리 서비스 기동 확인:

```text
NOTIFICATION_UP=True
DASHBOARD_UP=True
19093 -> PID 77888
19094 -> PID 23232
```

desktop 파생물도 현재 checkout에서 새로 생성했다.

```text
@samhan/design-system build: ✓ built in 6.45s
@samhan/desktop build:web: ✓ built in 7.76s
desktop renderer Vite v5.4.21 ready in 298 ms, http://127.0.0.1:5196/
```

## 2. 10가지 실행 원문과 판정

| # | 실행 원문/관찰 | 판정 |
|---:|---|---|
| 1 | 위 HEAD 일치, clean bootJar, SHA-256, desktop 재빌드 | PASS |
| 2 | `GET /app/version?clientType=DESKTOP&currentVersion=2026/08/13-119500` → `200`; 본문 `latestVersion=2026/08/13-119500`, `minSupportedVersion=2026/08/13-119500`, `forceLevel=NONE` | PASS |
| 3 | desktop 부팅에서 같은 응답 수신 후 홈/알림 UI 표시. 버전 오류 화면·무한 재시도 없음. updater는 Electron 비패키징 계약과 같은 `not-available` 상태 사용 | PASS (패키징 Electron 자체는 미검증) |
| 4 | 알림 내역 상세 진입까지 아래 네트워크 8건 전수 관찰. 400/404/500=0 | PASS |
| 5 | `my` 200 UUID 0, `history` 200 UUID 0, `acknowledge` 200 UUID 0. 응답의 `id`, title 내 UUID, `refId` 모두 opaque | PASS |
| 6 | 벨 목록 표시 → opaque id 행 클릭 → acknowledge 200 → `/notifications` 상세 진입 → `readAt=2026-08-13T06:03:46.433547`; 미확인 목록 `[]` | PASS (격리 DB 쓰기) |
| 7 | 화면 본문 UUID literal 0건. `data-testid`/POST URL에도 opaque token만 존재 | PASS |
| 8 | desktop renderer 정상 부팅, 홈 및 전역 알림 벨 렌더, console error 0. 패키징 Electron 실행은 하지 못함 | 부분 검증 |
| 9 | 알림 외 홈 shell·sidebar·header 정상 렌더. 광범위 업무 화면 전수 회귀는 이 최소 구성 라운드에서 미검증 | 부분 검증 |
| 10 | 최종 화면 `?` 0건. 최초 폐기 실행에서 시드 원문 자체에 `?`가 있었음을 DB 원문으로 확인한 뒤 ASCII 시드로 재실행 | PASS |

`/app/version` 응답 원문:

```json
{"success":true,"code":"OK","message":"성공","data":{"latestVersion":"2026/08/13-119500","minSupportedVersion":"2026/08/13-119500","forceLevel":"NONE","releaseNotes":null,"releasedAt":null},"timestamp":"2026-08-12T21:03:44.444581600Z"}
```

알림 `my` 핵심 원문:

```json
{"id":"bUE_nFeQT8WdHD9Jf5MkhQ","title":"SOL1195 isolated notification IiIiIiIiIiIiIiIiIiIiIg","refId":"MzMzMzMzMzMzMzMzMzMzMw","readAt":null}
```

acknowledge 후 history 핵심 원문:

```json
{"id":"bUE_nFeQT8WdHD9Jf5MkhQ","readAt":"2026-08-13T06:03:46.433547","refId":"MzMzMzMzMzMzMzMzMzMzMw"}
```

## 3. 상세 화면 네트워크 전수표

최종 Playwright 실행에서 desktop origin이 발생시킨 요청을 전수 기록했다.

| 순서 | Method | 경로 | 상태 | 응답 UUID | 비고 |
|---:|---|---|---:|---:|---|
| 1 | GET | `/app/notices/active` | 200 | 0 | 부팅 보조 격리 빈 응답 |
| 2 | GET | `/app/version?clientType=DESKTOP&currentVersion=2026%2F08%2F13-119500` | 200 | 0 | 실제 신선한 dashboard-service |
| 3 | GET | `/auth/admin/permissions/my` | 200 | 0 | 부팅 보조 격리 응답 |
| 4 | GET | `/api/notifications/my` | 200 | 0 | 실제 신선한 notification-service |
| 5 | GET | `/api/notifications/history?page=0&size=50` | 200 | 0 | 상세 진입 |
| 6 | POST | `/api/notifications/bUE_nFeQT8WdHD9Jf5MkhQ/acknowledge` | 200 | 0 | opaque token, 격리 DB 쓰기 |
| 7 | GET | `/api/notifications/history?page=0&size=50` | 200 | 0 | `readAt` 확인 |
| 8 | GET | `/api/notifications/my` | 200 | 0 | acknowledge 후 `data=[]` |

합계: 8건, 2xx 8건, 400/404/500 0건, UUID literal 0건.

## 4. 알림 엔드포인트 전수 목록 대조

구현 보고서의 목록과 라이브 사용자 경로를 대조했다.

| 보고서 엔드포인트 | 이번 GUI 사용자 경로 | 확인 결과 |
|---|---:|---|
| `GET /api/notifications/my` | 사용 | 200, 응답 전체 UUID 0 |
| `GET /api/notifications/history?page=&size=` | 사용 | 200, 중첩 `content[]` 전체 UUID 0 |
| `POST /api/notifications/{id}/acknowledge` | 사용 | opaque token으로 200, 이후 `readAt` 생성, 응답 UUID 0 |
| `POST /internal/notifications` | GUI 비노출 | 격리 seed 생성에만 사용. 내부 계약상 UUID 반환은 의도대로 유지 |
| `POST /internal/notifications/send` | GUI 비노출 | 형제 서비스 내부 계약, 이번 사용자 응답 전수 대상 아님 |
| `GET /internal/notifications/{id}/status` | GUI 비노출 | 내부 상태 계약, 이번 사용자 응답 전수 대상 아님 |
| `/admin/notifications/**` | 관리자 전용·미사용 | 사용자 알림 센터 경로 아님 |
| `/api/v1/notification/push-tokens/**` (실 controller `/api/v1/push-tokens/**`) | Chromium desktop renderer에서 미사용 | push token 등록 경로이며 알림 센터 UUID 응답 경로 아님 |

따라서 **이번 실제 사용자 알림 기능이 호출한 모든 응답(`my`, `history`, `acknowledge`)은 UUID 0건**이다. 내부·관리자·native push 경로를 실행한 것으로 과장하지 않는다.

## 5. 스크린샷

모두 `docs/qa/2026-08-13-main-common-liveqa/`에 있으며 driver 파일은 이 디렉터리에 두지 않았다.

- `02-app-version-200-none-response.png` — `/app/version` 200/NONE 본문
- `03-desktop-boot-no-version-error.png` — desktop 정상 부팅, 버전 오류 없음
- `05-notifications-my-uuid-zero-response.png` — `my` 응답 UUID 0
- `05-notifications-history-uuid-zero-response.png` — `history` 응답 UUID 0
- `06-notification-list-before-ack.png` — 읽기 전 알림 목록 표시
- `06-notification-ack-and-detail-entry.png` — acknowledge 후 알림 내역 상세 진입·확인됨
- `06-notification-history-readat-after-ack.png` — 실제 `readAt` 생성 응답

## 6. 도달 가능한 결함과 미검증

- 도달 가능한 결함: **0건**.
- 못 한 것: 실제 설치/패키징된 Electron 실행, 실제 updater feed 통신, 알림 외 업무 화면 전수, native push token 흐름, 내부·관리자 알림 API 실행.
- 증거 무결성 조치: 인앱 Browser 런타임 `[]`을 실행 불가로 판정하지 않고 Playwright Chromium으로 수행했다. 최초 잘못된 updater 스텁/깨진 시드 결과는 최종 증거에서 제외하고 원인을 분리한 뒤 다시 측정했다.

## 7. 라운드 종료 점검

`git ls-files --deleted`: 삭제된 추적 파일 0건.

`tools/.s24-build-only/build/deep/tracked-writer.mjs`: 존재, 42 bytes.

제가 띄운 `19093/19094/5195/5196` listener 4개와 `sol1195-liveqa-pg`, 임시 driver/result/log만 정리했다. 종료 재확인 결과 해당 listener 0개, 해당 컨테이너 0개, 임시 driver 0개다. 공유 Docker 스택은 건드리지 않았다.
