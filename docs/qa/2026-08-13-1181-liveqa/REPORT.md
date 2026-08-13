# PR #1181 게이트 ③ 라이브QA 보고서

- 대상: PR #1181 `feat/910-935-client-auto-update`
- 요청/확인 HEAD: `9e9cd36d5690d351d2c3fbbe74d80a2d105b098d`
- 실행일: 2026-08-13 (Asia/Seoul)
- 결론: **C 웹 3앱 reload 경로는 🟡→✅. D Electron은 배너·`안내 닫기`·renderer 자동 설치 호출까지 ✅, 서명 패키지의 실제 다운로드·설치·다운그레이드는 🟡 유지. 게이트 ③ 전체는 미충족(허용된 관측 상한 도달).**

## 1. 환경 확인 원문

### 1.1 HEAD·정책

```text
HEAD=9e9cd36d5690d351d2c3fbbe74d80a2d105b098d
정책 1=강제 즉시 설치 유지
정책 2=INTERNAL_CHAT_DESKTOP 경로 신설
정책 3=allowDowngrade=true
정책 4=9건 일괄
```

정책은 `git show origin/main:docs/decisions/2026-08-13-client-auto-update-policy.md`로 읽었다. git 쓰기 명령은 사용하지 않았다.

### 1.2 혼합 이미지·컨테이너 결번

```text
/samhan-slip-service|image=infrastructure-slip-service|created=2026-08-12T17:53:07.461758521Z|status=running
/samhan-api-gateway|image=infrastructure-api-gateway|created=2026-08-12T15:39:17.991855852Z|status=running
/samhan-dashboard-service|image=infrastructure-dashboard-service|created=2026-08-11T17:59:58.903286495Z|status=running
```

종료 시 재확인 원문:

```text
running=22
samhan-dashboard-service|Up About an hour (healthy)
samhan-prometheus|Exited (127) About an hour ago
samhan-nginx|Exited (127) About an hour ago
```

스택은 혼합 이미지다. `/app/version` 소유자인 `dashboard-service`는 **2026-08-11T17:59** 빌드다. 따라서 백엔드 의존 결과는 PR HEAD 백엔드 판정으로 확대하지 않는다. `prometheus`, `nginx` 결번은 이 라운드에서 고치지 않았다.

### 1.3 RAM

```text
시작: FreePhysicalMemoryGB=27.158
렌더러 기동 후: 26.407
Playwright 성공 라운드 직전: 23.630
종료 후: FreePhysicalMemoryKB=25180720, FreePhysicalMemoryGB=24.014
```

모든 시점이 중단 기준 1.0GB를 넘었다.

### 1.4 Playwright·프로세스

인앱 Browser는 `No browser is available`, 목록 `[]`로 연결 불가였다. 직전 정찰에서 확인한 로컬 Playwright 1.59.1 / Chromium-1217을 사용했다.

```text
C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
로컬 포트: 49181 관리자, 49182 주문, 49183 모바일 퍼블릭, 49184 견적, 49185 아로로지스
종료 대상 PID: 44508, 52424, 2896, 32968, 31768
LISTENERS_AFTER=NONE
```

## 2. `app_release` 삽입 전·후·정리 후 원문

### 2.1 삽입 전

```text
 total | active_published |       min_created_at       |       max_created_at
-------+------------------+----------------------------+----------------------------
   144 |                0 | 2026-06-27 01:24:22.867545 | 2026-07-30 01:39:22.692121
(1 row)
```

기존 144개 ID 전체 원문: [baseline-ids.txt](baseline-ids.txt).

### 2.2 생성 ID 전부

첫 캡처 라운드는 Playwright screenshot 경로 타입 오류로 관리자 첫 캡처 직전에 중단됐다. 생성된 4개는 해당 라운드 `finally`에서 제거했다.

```text
f01bf19f-2bbf-43ea-98de-ff702a737981|SAMHAN_ORDER_WEB
bbd45f88-9f20-4366-9359-8043a5fe8d55|SAMHAN_ESTIMATE_WEB
5d4542dd-0212-4a9f-8203-21f0fdaad59b|SAMHAN_MOBILE_PUBLIC_WEB
e204d883-17b6-4edf-9b8c-a30f51395893|AROLOGIS_DESKTOP
DELETE 4
0
CLEANUP_FINAL|144|0|2026-07-30 01:39:22.692121
```

성공 라운드가 생성한 4개:

```text
2b84b5fe-8502-492a-bae6-4bbe601e4e8f|SAMHAN_ORDER_WEB
1556dc49-05c6-47ab-aa43-23c8d44164d4|SAMHAN_ESTIMATE_WEB
3f473e3c-fba2-479b-86d7-c3730fce6a15|SAMHAN_MOBILE_PUBLIC_WEB
48af594f-e079-4bb1-9d87-59faa21215eb|AROLOGIS_DESKTOP
```

삽입·웹 3행 선게시 직후 원문:

```text
148|3
48af594f-e079-4bb1-9d87-59faa21215eb|AROLOGIS_DESKTOP|2026/08/13-118101|false|false
1556dc49-05c6-47ab-aa43-23c8d44164d4|SAMHAN_ESTIMATE_WEB|2026/08/13-118101|true|false
3f473e3c-fba2-479b-86d7-c3730fce6a15|SAMHAN_MOBILE_PUBLIC_WEB|2026/08/13-118101|true|false
2b84b5fe-8502-492a-bae6-4bbe601e4e8f|SAMHAN_ORDER_WEB|2026/08/13-118101|true|false
```

### 2.3 성공 라운드 정리 후

```text
DELETE 4
0
CLEANUP_FINAL|144|0|2026-07-30 01:39:22.692121
```

## 3. 시나리오 1~5

### 3.1 시나리오 1 — `/app/version` 200 본문

절차: `AROLOGIS_DESKTOP` 릴리스 `2026/08/13-118101`, `MINOR`, 최소 지원 `2026/08/01-1`을 실제 관리자 API로 생성하고 UI로 게시한 뒤 공개 endpoint를 호출했다.

구버전 요청 원문:

```text
GET /app/version?clientType=AROLOGIS_DESKTOP&currentVersion=2026%2F08%2F12-1
HTTP 200
{"success":true,"code":"OK","message":"성공","data":{"latestVersion":"2026/08/13-118101","minSupportedVersion":"2026/08/01-1","forceLevel":"MINOR","releaseNotes":"PR1181-LIVEQA-20260813 AROLOGIS_DESKTOP 실제 200/reload 검증","releasedAt":"2026-08-13T19:58:00"},"timestamp":"2026-08-13T11:01:29.610122832Z"}
```

결과: 최신 버전, 최소 지원 버전, force level, 노트, 배포 일시는 200 본문에 있다. **download URL 필드는 없다.** 이 endpoint만으로 Electron 다운로드 주소를 얻는 계약은 관측되지 않았다.

### 3.2 시나리오 2 — 최신·구버전·더 높은 버전

```text
최신: current=2026/08/13-118101 → HTTP 200, forceLevel=NONE
구버전: current=2026/08/12-1      → HTTP 200, forceLevel=MINOR
더 높음: current=2026/08/14-1    → HTTP 200, forceLevel=NONE
```

최신 원문:

```json
{"success":true,"code":"OK","message":"성공","data":{"latestVersion":"2026/08/13-118101","minSupportedVersion":"2026/08/01-1","forceLevel":"NONE","releaseNotes":"PR1181-LIVEQA-20260813 AROLOGIS_DESKTOP 실제 200/reload 검증","releasedAt":"2026-08-13T19:58:00"},"timestamp":"2026-08-13T11:01:29.596281019Z"}
```

더 높은 버전 원문:

```json
{"success":true,"code":"OK","message":"성공","data":{"latestVersion":"2026/08/13-118101","minSupportedVersion":"2026/08/01-1","forceLevel":"NONE","releaseNotes":"PR1181-LIVEQA-20260813 AROLOGIS_DESKTOP 실제 200/reload 검증","releasedAt":"2026-08-13T19:58:00"},"timestamp":"2026-08-13T11:01:29.620193433Z"}
```

`allowDowngrade=true`는 `/app/version`의 더 높은 현재 버전 응답으로 증명되지 않는다. 서버는 `NONE`을 반환했고, 다운그레이드는 별도 Electron generic feed/electron-updater 경계다. 보조 런타임 계약은 다음과 같이 통과했다.

```text
✓ src/main/auto-update.test.ts (10 tests)
✓ src/renderer/components/common/AppVersionGate.test.tsx (8 tests)
Test Files 2 passed (2)
Tests 18 passed (18)
```

실제 서명 패키지 다운그레이드는 관측 불가로 남긴다.

### 3.3 시나리오 3 — 관리자 게시 → 해제 → 재게시

실제 `/admin/app-releases` 화면에서 `AROLOGIS_DESKTOP` 행의 버튼과 확인 모달을 클릭했다.

```text
초기=테스트/배포 버튼
publish=배포됨/배포 취소 버튼|릴리스를 배포했습니다.
unpublish=테스트/배포 버튼|릴리스 배포를 취소했습니다.
republish=배포됨/배포 취소 버튼|릴리스를 배포했습니다.
```

스크린샷:

- [01-admin-test-state.png](01-admin-test-state.png)
- [02-admin-publish-confirm.png](02-admin-publish-confirm.png)
- [03-admin-publish-done.png](03-admin-publish-done.png)
- [02-admin-unpublish-confirm.png](02-admin-unpublish-confirm.png)
- [03-admin-unpublish-done.png](03-admin-unpublish-done.png)
- [02-admin-republish-confirm.png](02-admin-republish-confirm.png)
- [03-admin-republish-done.png](03-admin-republish-done.png)

결과: ✅ 왕복 완료. 재게시 뒤 `/app/version` 200이 유지됐다.

### 3.4 시나리오 4 — 웹 3앱 reload 게이트

세 앱을 PR HEAD로 실제 기동하고 `VITE_APP_VERSION=2026/08/12-1`을 주입했다. 각 앱이 공유 게이트웨이의 자기 client type 200 응답을 받은 뒤 `페이지 새로고침`을 클릭했다. 문서 초기화 스크립트의 `sessionStorage` load count로 실제 document reload를 확인했다.

| 앱 | 요청 client type | 안내 원문 요약 | load count | 결과 |
|---|---|---|---:|---|
| 주문 웹 | `SAMHAN_ORDER_WEB` | `새 주문 웹 버전 2026/08/13-118101을 사용할 수 있습니다.` | `1→2` | ✅ |
| 종합견적 웹 | `SAMHAN_ESTIMATE_WEB` | `새 견적 웹 버전 2026/08/13-118101을 사용할 수 있습니다.` | `1→2` | ✅ |
| 모바일 퍼블릭 웹 | `SAMHAN_MOBILE_PUBLIC_WEB` | `새 버전 2026/08/13-118101을 사용할 수 있습니다.` | `1→2` | ✅ |

스크린샷:

- [10-web-order-reload-required.png](10-web-order-reload-required.png), [11-web-order-after-actual-reload.png](11-web-order-after-actual-reload.png)
- [10-web-estimate-reload-required.png](10-web-estimate-reload-required.png), [11-web-estimate-after-actual-reload.png](11-web-estimate-after-actual-reload.png)
- [10-web-mobile-public-reload-required.png](10-web-mobile-public-reload-required.png), [11-web-mobile-public-after-actual-reload.png](11-web-mobile-public-after-actual-reload.png)

결과: ✅ 구버전 클라이언트가 실제 라이브 200 정책으로 reload를 요구받고, 사용자 버튼이 실제 reload를 실행한다.

### 3.5 시나리오 5 — Electron 배너·`안내 닫기`·강제 즉시 설치

아로로지스 PR HEAD renderer를 실제 Vite로 기동하고 라이브 `/app/version`을 사용했다. 서명 빌드가 없으므로 updater IPC 이벤트만 Playwright 페이지에 주입했다.

```text
배너=새 아로로지스 데스크톱 버전 2026/08/13-118101이 있습니다. 다운로드가 끝나면 자동으로 설치하고 앱을 다시 시작합니다. 안내 닫기
나중에 버튼 count=0
안내 닫기 후 banner count=0
updater audit={"checkCalls":1,"installCalls":1,"quitCalls":0,"emitted":[{"kind":"checking"},{"kind":"available","version":"2026/08/13-118101"},{"kind":"downloading","percent":67},{"kind":"downloaded","version":"2026/08/13-118101"}]}
```

스크린샷:

- [20-electron-banner-안내닫기.png](20-electron-banner-%EC%95%88%EB%82%B4%EB%8B%AB%EA%B8%B0.png)
- [21-electron-after-안내닫기.png](21-electron-after-%EC%95%88%EB%82%B4%EB%8B%AB%EA%B8%B0.png)
- [22-electron-downloaded-auto-install.png](22-electron-downloaded-auto-install.png)

결과: 배너 노출·문구·`안내 닫기` 동작은 ✅. `downloaded` 직후 renderer의 자동 `install()` 호출도 ✅. 실제 `quitAndInstall(true,true)`에 의한 프로세스 종료·설치·재시작은 서명 패키지/feed 부재로 관측 불가다.

전체 기계 원문: [results.json](results.json).

## 4. C·D의 🟡가 ✅로 바뀌었는가

| 축 | 세부 항목 | 전 | 후 |
|---|---|---:|---:|
| C | 주문 웹 200 정책 → reload 안내 → 실제 reload | 🟡 | ✅ |
| C | 종합견적 웹 200 정책 → reload 안내 → 실제 reload | 🟡 | ✅ |
| C | 모바일 퍼블릭 웹 200 정책 → reload 안내 → 실제 reload | 🟡 | ✅ |
| D | 아로로지스 라이브 200 정책 배너 | 🟡 | ✅ |
| D | `안내 닫기`가 배너만 닫음, `나중에` 없음 | 🟡 | ✅ |
| D | downloaded 직후 renderer 자동 install 호출 | 🟡 | ✅ |
| D | 서명 바이너리 실제 다운로드·즉시 설치·재기동 | 🟡 | 🟡 |
| D | 더 낮은 signed release 실제 다운그레이드 | 🟡 | 🟡 |

따라서 **C는 전체 ✅**, **D는 사용자 배너/renderer 경계까지만 ✅이고 전체 축은 🟡 유지**다.

## 5. 도달 가능한 결함

**0건.** 이번에 실제로 연 경로에서 버전 정책 200, 관리자 왕복, 웹 reload, Electron 배너/닫기/자동 install 호출의 재현 가능한 제품 결함은 발견하지 못했다.

관리자 화면 상단의 DESKTOP 정책 404 안내는 DESKTOP 게시 행을 만들지 않은 이 라운드의 의도된 양성 경계이며 결함으로 세지 않았다. 웹 앱의 업무 데이터 인증/404 화면도 버전 게이트 검증용 비로그인 진입 조건이므로 제품 결함으로 세지 않았다.

## 6. 증거 무결성 정정

1. 요청 문구의 “200 응답 본문 — 다운로드 URL”과 달리 실측 200 JSON에는 download URL 필드가 없다. 최신/최소지원/force/노트/배포일시만 있다.
2. “더 높은 버전일 때 `allowDowngrade=true` 확인”은 단일 서버 endpoint로 성립하지 않는다. 더 높은 현재 버전에 서버가 `NONE`을 반환한다. `allowDowngrade`는 Electron updater/feed 경계이며 이번에는 runtime 계약 18/18만 확인했다.
3. 직전 정찰 문서 앞부분의 `ff972a2da` 즉시 중단 기록은 당시 감사 이력이고, 같은 문서 138행 이후 재개 본문이 최종 정찰이다. 이번 HEAD는 `9e9cd36d5`로 일치했다.
4. 첫 Playwright 실행은 제품 오류가 아니라 screenshot path에 URL 객체를 넘긴 하네스 오류였다. 해당 라운드 생성 4행은 즉시 `DELETE 4`로 제거했고 144행 복구 후 다시 실행했다.
5. 인앱 Browser는 여전히 연결 불가였다. 스크린샷은 정상 설치가 확인된 standalone Playwright Chromium-1217 산출물이다.

## 7. 관측 불가로 남긴 것과 이유

- **E 사내 메신저 전체**: 시도하지 않았다. PR HEAD 백엔드를 공유 스택에 배포하면 미머지 Flyway `V8__add_internal_chat_desktop_client_type.sql`이 공유 DB에 적용되어 main 기준 재빌드의 Flyway validate를 깨뜨릴 수 있다. 현재 구 `dashboard-service`는 enum을 몰라 400을 반환한다.
- `/app/version` PR HEAD 백엔드 자체 판정: 공유 `dashboard-service`가 2026-08-11 이미지라 관측 결과를 PR HEAD BE로 귀속할 수 없다.
- Electron 실제 signed installer 다운로드, `latest.yml`/blockmap 처리, `quitAndInstall`, 앱 재기동: 서명 패키지와 generic feed가 없고, 실제 릴리스 서버 생성은 금지됐다.
- `allowDowngrade=true` 실제 다운그레이드 설치: 낮은 signed release/feed가 없다.
- Expo OTA: 직전 정찰대로 3앱 모두 `updates.enabled=false`; 이번 임무 범위에서 재시도하지 않았다.

## 8. 정리 완료 확인 원문

성공 라운드 삭제 직전:

```text
48af594f-e079-4bb1-9d87-59faa21215eb|AROLOGIS_DESKTOP|2026/08/13-118101|true|false
1556dc49-05c6-47ab-aa43-23c8d44164d4|SAMHAN_ESTIMATE_WEB|2026/08/13-118101|true|false
3f473e3c-fba2-479b-86d7-c3730fce6a15|SAMHAN_MOBILE_PUBLIC_WEB|2026/08/13-118101|true|false
2b84b5fe-8502-492a-bae6-4bbe601e4e8f|SAMHAN_ORDER_WEB|2026/08/13-118101|true|false
```

최종 방어 조회:

```text
 total | active_published | marker_rows |       max_created_at
-------+------------------+-------------+----------------------------
   144 |                0 |           0 | 2026-07-30 01:39:22.692121
(1 row)
```

판정: 이번 작업이 만든 8개 ID는 모두 제거됐다. 물리 행 수 144, 활성 게시 0, marker 잔재 0, 기존 `max(created_at)`까지 원상복구됐다. 로컬 포트 49181~49185 리스너도 `NONE`이다.

## 9. 게이트 ③ 충족 여부

**전체 게이트 ③: 미충족. 단, 이번 라운드에 허용된 관측 상한에는 도달했다.**

근거:

- 0개 표본 병목을 안전한 임시 행으로 해소하고 200 경로·관리자 왕복·웹 3앱 실제 reload·아로로지스 배너/닫기/자동 install 호출을 실측했다.
- C는 전 항목 ✅로 전환됐다.
- D는 renderer 사용자 경로까지 ✅이나 실제 signed install·재기동·downgrade가 관측 불가라 전체 ✅로 올릴 수 없다.
- E는 공유 DB Flyway 오염 방지 지시로 의도적으로 미실행이다.
- 백엔드는 혼합 이미지이므로 PR HEAD 백엔드 동작으로 단정할 수 없다.

