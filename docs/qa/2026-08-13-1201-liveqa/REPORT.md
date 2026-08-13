# PR #1201 라이브 QA 보고서

- 대상: PR #1201 `feat/894-s1-chat-port`, 요청 HEAD `36b6bc162`
- 일시: 2026-08-13 (Asia/Seoul)
- 판정: **도달 결함 0건, 핵심 시나리오 2~4 관측 불가, 머지 권고 보류**
- 실행 수단: `clients/desktop` 패키지 안의 Playwright `1.59.1`에서 로컬 Chromium 1217 직접 launch
- 인앱 Browser: 사용하지 않음

## 1. 환경 원문

PM 정정 후 실측을 정본으로 남긴다.

```text
samhan-* 실행 컨테이너: 22개
전체 실행 컨테이너: 타 트랙 컨테이너의 시작·종료에 따라 최초 29개 → 재개 시 24개
prometheus·nginx: samhan-* 스택에 없음

samhan-slip-service
  container=2026-08-12T17:53:07.461758521Z
  image created=2026-08-12T17:52:59.907441518Z

samhan-api-gateway
  container=2026-08-12T15:39:17.991855852Z
  image created=2026-08-12T15:39:14.976509948Z

samhan-auth-service
  container=2026-08-12T00:03:23.288496844Z
  image created=2026-08-12T00:03:20.533978097Z

samhan-groupware-service
  container=2026-08-11T17:59:58.936253267Z
  image created=2026-07-31T15:47:40.582649175Z

최초 여유 RAM: 18.316 GB
재개 직후 여유 RAM: 18.173 GB
최종 증거 실행 직전 여유 RAM: 16.887 GB
```

이미지 label에는 Compose project/service/version만 있고 Git revision은 없어서 어느 커밋 빌드인지는 확정할 수 없었다. 채팅 API 소유 `groupware-service`가 07-31 이미지라는 사실이 아래 관측 불가의 직접 원인이다.

브라우저 실측:

```text
Playwright package: 1.59.1
Chromium executable:
C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
```

독립 앱 렌더러는 `http://localhost:5174`, 본체 렌더러는 `http://localhost:5182`에서 이 워크트리 코드를 띄웠다. 두 화면 모두 지시대로 `/#/chat`으로 진입했다. 캡처 전에 각 화면 전용 `data-testid` 또는 전용 요소를 단정했다.

## 2. 시나리오 1 — 독립 앱 채팅방 목록

절차:

1. `dev_master`로 실 API 로그인 200을 확인했다.
2. `http://localhost:5174/#/chat`으로 이동했다.
3. 독립 앱 전용 `[data-testid="chat-rooms-page"]`가 visible임을 단정한 뒤 캡처했다.
4. `GET /admin/groupware/chat/rooms` 응답을 관측했다.

증거:

- [01-independent-room-list.png](01-independent-room-list.png)
- Playwright 네트워크: `GET /admin/groupware/chat/rooms` → `500`

결과: **화면 셸 도달, 실제 방 목록 데이터 관측 불가.** 채팅방 목록 화면과 새 대화 입력은 보였으나 backend route 부재로 목록 데이터는 비어 있었다.

## 3. 시나리오 2 — 새 대화 생성

절차:

1. 독립 앱에서 `새 대화`를 눌렀다.
2. `개발매니저`를 검색했다.
3. 실 API `GET /admin/groupware/messages/recipient-search?...` → `200`과 `[DEV-SEED] 개발매니저 · 대표실` 표시를 확인했다.
4. 검색 결과와 선택 후 `대화 시작` 버튼을 각각 단정·캡처했다.
5. `대화 시작`을 눌러 실 POST를 시도했다.
6. 화면의 `대화방을 만들지 못했습니다` alert를 단정·캡처했다.

증거:

- [02-independent-recipient-search.png](02-independent-recipient-search.png)
- [03-independent-recipient-selected.png](03-independent-recipient-selected.png)
- [04-independent-create-backend-blocked.png](04-independent-create-backend-blocked.png)
- Playwright 네트워크: `POST /admin/groupware/chat/rooms/direct` → `500`
- 응답 원문:

```json
{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,"timestamp":"2026-08-13T13:02:48.762027887Z"}
```

결과: **검색·선택은 도달, 대화 생성은 관측 불가.** 생성 실패 원인은 현재 groupware 이미지에 route가 없는 것이다. PR은 백엔드를 변경하지 않았으므로 이 환경 차단을 PR 도달 결함으로 세지 않았다.

## 4. 시나리오 3 — 메시지 전송 및 상대 화면 SSE 재조회

선행 직접방 생성이 500으로 실패해 roomCode가 없었다. 따라서 메시지 전송 endpoint와 두 번째 계정 화면의 SSE-triggered REST 재조회는 실행할 수 없었다.

결과: **관측 불가.** 미리 추론한 것이 아니라 시나리오 2의 실 POST 실패 뒤 중단했다. 메시지 데이터는 만들지 않았다.

## 5. 시나리오 4 — 본체 앱 채팅 회귀

절차:

1. 별도 browser context에서 `dev_manager` 실 API 로그인 200을 확인했다.
2. 본체 렌더러 `http://localhost:5182/#/chat`으로 이동했다.
3. 본체 `[data-testid="chat-rooms-page"]`가 visible임을 단정한 뒤 캡처했다.
4. 본체가 호출한 동일 방 목록 API 응답을 관측했다.

증거:

- [05-main-app-room-list-backend-blocked.png](05-main-app-room-list-backend-blocked.png)
- Playwright 네트워크: `GET /admin/groupware/chat/rooms` → `500`

결과: **본체 채팅 화면 셸은 남아 있고 접근 가능하지만, 정상 방 목록·대화·전송은 관측 불가.** 독립 앱과 동일하게 old groupware route 부재에 막혔다. “본체 채팅 정상 동작”을 통과로 판정하지 않았다.

## 6. 시나리오 5 — 화면·URL UUID 비노출

각 캡처 시점에 DOM visible text, 현재 URL, 모든 링크 `href`를 UUID 정규식으로 sweep했다.

```text
독립 앱 방 목록                  0건  http://localhost:5174/#/chat
독립 앱 상대 검색·생성 실패 화면 0건  http://localhost:5174/#/chat
본체 앱 방 목록                  0건  http://localhost:5182/#/chat
```

결과: **관측한 화면·URL·링크에서는 UUID 노출 0건.** 표시된 값은 `[DEV-SEED] 개발매니저`, `대표실` 같은 업무 표시명이었다. room 생성 실패로 roomCode가 포함된 대화 URL은 관측하지 못했으므로 그 표면까지 일반화하지 않는다.

범위 밖으로 지정된 `participantId` UUID 요청 payload는 결함으로 세지 않았으며 화면·URL sweep 대상에도 포함하지 않았다.

## 7. UUID 노출 sweep 결과

- sweep한 화면 상태: 독립 목록, 독립 상대 검색, 독립 상대 선택, 독립 생성 실패, 본체 목록.
- visible text UUID: 0건
- browser URL UUID: 0건
- 링크 href UUID: 0건
- 관측하지 못한 표면: 생성된 방의 독립 앱 URL, 본체 대화 URL, 메시지 화면.

## 8. 도달 결함

**0건.**

현재 backend route 부재는 PR #1201이 변경한 클라이언트 코드에서 발생한 결함이 아니며, 요청자가 명시한 07-31 groupware 이미지의 환경 한계다. 테스트 약함, 문서 표현, mock·가드 품질은 조사·결함 집계 대상에서 제외했다.

## 9. 증거 무결성 정정

1. 최초 보고서의 “환경 전제 불일치로 미실행”은 PM이 전제를 정정한 뒤 폐기했다. 이 보고서는 재개 실행 결과로 전면 대체했다.
2. 스크린샷 5장은 모두 이 워크트리 렌더러와 실 gateway를 로컬 Playwright Chromium으로 직접 연 결과다.
3. 모든 캡처 전에 목표 화면 전용 요소를 visible 단정했다.
4. 빈 방 목록을 정상 목록이라고 주장하지 않았다. 화면 셸 도달과 API 데이터 관측을 분리했다.
5. 새 대화 검색 200을 방 생성 성공으로 확대하지 않았다.
6. 본체 화면 셸 도달을 본체 채팅 정상 동작으로 확대하지 않았다.
7. UUID 0건은 실제 sweep한 표면에만 한정했고 생성 방 URL은 관측 불가라고 명시했다.
8. `docs/qa/2026-08-13-1201-liveqa/` 안에는 캡처 스크립트를 남기지 않는다.
9. 인앱 Browser 가용 여부를 관측 불가 근거로 사용하지 않았다.

## 10. 관측 불가 및 실패 명령 원문

핵심 backend 실패 재현:

```text
GET /admin/groupware/chat/rooms
500 {"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,...}

POST /admin/groupware/chat/rooms/direct
500 {"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,...}
```

groupware-service 로그 원문:

```text
org.springframework.web.servlet.resource.NoResourceFoundException:
No static resource admin/groupware/chat/rooms.

org.springframework.web.servlet.resource.NoResourceFoundException:
No static resource admin/groupware/chat/rooms/direct.
```

최종 Playwright 실행의 판정 원문:

```text
[HTTP] 독립-master GET 500 /admin/groupware/chat/rooms
[HTTP] 독립-master GET 200 /admin/groupware/messages/recipient-search?...limit=10000
[HTTP] 독립-master POST 500 /admin/groupware/chat/rooms/direct
[HTTP] 본체-manager GET 500 /admin/groupware/chat/rooms
[FAIL] 채팅 소유 백엔드에 S1 route 부재: POST direct status=500; 본체 GET rooms status=500
```

첫 Playwright 실행은 실제 검색 결과의 사번이 `null`인데 예상 selector에 `MANAGER-001`을 넣어 실패했다. 원문:

```text
locator.waitFor: Timeout 15000ms exceeded.
- waiting for getByRole('button', { name: /개발매니저.*MANAGER-001/ }) to be visible
```

응답 원문은 `employeeCode:null`이었다. selector를 화면에 실제 표시된 `개발매니저`로 정정하고 재실행했다. 이는 제품 결함으로 세지 않았다.

중간 보완 실행 한 번은 Playwright 응답 body 대기 중 shell 120초 제한을 넘겼다.

```text
command timed out after 124024 milliseconds
```

해당 실행이 남긴 QA browser process tree는 PID와 시작시각을 확인한 뒤 이 검증자가 시작한 트리만 종료했다. 이후 응답 body를 별도 실 API 명령으로 재현했다. 최종 Playwright 실행은 backend 차단을 명시하는 exit 1로 끝났고 browser/context는 `finally`에서 종료했다.

## 11. 만든 데이터

- 채팅방: 0개 (`POST direct` 500)
- 메시지: 0개
- 사용자/업무 데이터 변경: 0건
- 인증: `dev_master`, `dev_manager`의 httpOnly 세션 쿠키를 각 격리 browser context에서 발급받았고 context 종료로 폐기했다.

## 12. 프로세스 정리

- 최종 Playwright browser/context: 종료
- timeout 실행이 남긴 Node/Chromium tree: 이 검증자가 시작한 PID tree만 강제 종료
- QA용 독립 앱·본체 Vite 서버와 rendererOnly가 띄운 Electron: 종료 대상 확인 후 종료
- 기존 Docker 컨테이너: 시작·중지·삭제하지 않음
- 다른 트랙의 Playwright/Chromium/Node: 종료하지 않음

## 13. 머지 권고

**현 증거만으로는 머지를 권고하지 않는다.** 도달 결함을 발견해서가 아니라 필수 시나리오인 방 생성, 메시지 양방향 도착/SSE 재조회, 본체 채팅 정상 동작을 old groupware route 부재로 판정하지 못했기 때문이다.

채팅 route를 포함한 groupware-service 이미지로 교체한 뒤 시나리오 1~5를 다시 수행해야 한다. 그 재검증에서 방 생성·양방향 메시지·본체 회귀·대화 URL UUID sweep까지 통과하면 머지 판단이 가능하다.

## 14. 2026-08-13 신선 이미지 재개 라운드

### 14.1 재개 환경 직접 실측 원문

PM의 환경 값은 인용하지 않고 `docker inspect`와 `docker image inspect`로 다시 측정했다.

```text
FreeRAM_GB    : 19.265
RunningTotal  : 23
RunningSamhan : 22

name=/samhan-groupware-service
container_created=2026-08-13T13:10:23.841805531Z
status=running
health=healthy
image=infrastructure-groupware-service
image_id=sha256:f35f882ebbb61d91d2a9245defaebf6d64f80db476c9e9847080c5990a6c2d74

repo=infrastructure-groupware-service:latest
image_created=2026-08-13T13:10:21.52028317Z
image_id=sha256:f35f882ebbb61d91d2a9245defaebf6d64f80db476c9e9847080c5990a6c2d74
labels={"com.docker.compose.project":"infrastructure","com.docker.compose.service":"groupware-service","com.docker.compose.version":"5.3.1"}

GET /admin/groupware/chat/rooms (미인증)
401 {"success":false,"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}
```

이미지와 컨테이너는 실제로 새로 생성됐고 같은 image ID를 사용했다. 그러나 미인증 401은 보안 필터가 handler mapping보다 먼저 실행되므로 route 존재 증거로 사용하지 않았다.

### 14.2 시나리오 2 재개 결과

기존 라운드에서 확인한 독립 앱 목록·상대 검색·선택은 다시 캡처하지 않았다. 동일 UI 흐름으로 `대화 시작`만 재시도했다.

```text
PRE_RAM_GB=22.621
[PASS] dev_master 실 API 로그인 200
[PASS] 독립 앱 목록 진입(재캡처 없음)
[HTTP] 독립-master GET 500 /admin/groupware/chat/rooms
[HTTP] 독립-master GET 200 /admin/groupware/messages/recipient-search?...limit=10000
[PASS] 상대 검색 결과 재사용
[HTTP] 독립-master POST 500 /admin/groupware/chat/rooms/direct
[FAIL] POST direct status=500
```

결과: **새 대화 생성 관측 불가 유지.** 직접방은 생성되지 않았다. 시나리오 3·4는 roomCode가 없어 다시 진입하지 않았다.

### 14.3 새 이미지인데 route가 여전히 없는 원인

인증 요청 시 groupware-service 로그 원문:

```text
org.springframework.web.servlet.resource.NoResourceFoundException:
No static resource admin/groupware/chat/rooms.

org.springframework.web.servlet.resource.NoResourceFoundException:
No static resource admin/groupware/chat/rooms/direct.
```

서비스 시작 로그는 실행 JAR가 가진 migration이 V14까지임을 드러냈다.

```text
Successfully validated 18 migrations
Current version of schema "public": 18
Schema "public" has a version (18) that is newer than the latest available migration (14) !
```

반면 현재 main 소스에는 다음 파일이 실재했다.

```text
ChatRoomController.java
V20__add_room_based_internal_chat.sql
V21__harden_room_chat_sequences.sql
```

Docker image history는 새 Gradle 빌드를 수행하지 않고 host 산출물을 복사했음을 보였다.

```text
COPY --chown=app:app services/groupware-service/build/libs/groupware-service.jar /app/app.jar
```

실제로 PM이 빌드에 사용한 main 작업본의 host JAR는 07-23 산출물이었고 채팅 controller·migration이 없었다.

```text
C:\dev\Samhan-Public\services\groupware-service\build\libs\groupware-service.jar
bytes=99355517
last_write=2026-07-23T19:12:22.6897367+09:00

CHAT_CONTROLLER_COUNT=0
V20_COUNT=0
V21_COUNT=0

JAR에 포함된 마지막 groupware migration:
V14__add_messages_batch_id.sql
```

따라서 이번 상태는 **신선한 Docker image 안에 낡은 host JAR를 다시 포장한 상태**다. `docker compose ... up -d --build`만으로는 애플리케이션 JAR를 다시 컴파일하지 않는다. 이 환경 문제를 PR #1201의 도달 결함으로 세지 않았다.

### 14.4 증거 무결성 및 데이터

- 미인증 401을 route 존재 증거로 확대하지 않았다.
- 이미지 생성시각과 이미지 안 애플리케이션 산출물의 신선도를 분리했다.
- 새 스크린샷은 없다. 시나리오 2가 기존과 같은 API 경계에서 차단되어 성공 화면에 도달하지 못했다.
- 추가 생성 채팅방: 0개
- 추가 생성 메시지: 0개
- 추가 도달 결함: 0건
- 시나리오 2~4 관측 불가 및 머지 권고 보류 판정은 유지한다.
- 다음 재개 조건: main 작업본에서 `groupware-service.jar`를 먼저 재빌드하고, 새 JAR에 `ChatRoomController`, V20, V21이 포함됐음을 확인한 뒤 Docker image를 다시 생성해야 한다.
