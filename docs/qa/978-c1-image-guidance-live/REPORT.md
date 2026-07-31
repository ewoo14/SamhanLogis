# 978-C1 결재 문서 양식 편집기 이미지 안내 라이브 QA

## 실행 조건

- 실행일: 2026-07-29
- 렌더러: `clients/desktop` + `vite.renderer.dev.config.ts`
- 주소: `http://127.0.0.1:5191/#/groupware/document-templates`
- `VITE_APP_VERSION=2026/07/29-1`
- `VITE_MOCK_MODE` 미설정(mock OFF), 게이트웨이 `http://localhost:8080`
- viewport: `1440x900`, 캡처는 full-page 실제 브라우저 캡처
- 로그인: 개발 시드 계정 `dev_master` (기존 양식 편집·삭제 및 저장 없음)

in-app Browser는 이 세션에서 사용할 수 있는 브라우저 목록이 빈 배열이었다. 저장소의 Playwright 패키지를 사용했고, Playwright 캐시의 Chromium 실행 파일이 존재하지 않아 설치·다운로드 없이 시스템 Chrome(`C:\Program Files\Google\Chrome\Application\chrome.exe`)을 Playwright의 `executablePath`로 지정했다. 이 실행 차이는 아래 예상과 달랐던 점에 기록한다.

## 단계별 관찰

| 단계 | 실제 조작 및 관찰 | 안내 N | 저장 버튼 |
|---|---|---:|---|
| 01 | `신규 문서 양식`에서 이미지/로고 요소 1개 추가 후 선택. 인스펙터에 `지원 형식: PNG/JPEG/WebP · 현재 양식 기준 이미지 최대 47KB`가 표시됨. | **47KB** | 문서 유형 미선택으로 비활성 |
| 02 | 이미지 요소를 하나 더 추가하고 첫 요소 `image-1`에 실제 저장소 `splash.png`(4,040 bytes)를 선택. 두 번째 `image-2`를 선택하자 안내가 `... 최대 43KB`로 감소함. | **43KB** | 문서 유형 미선택으로 비활성 |
| 03 | 두 번째 요소에서 실제 저장소 `char_01.png`(102,522 bytes)를 선택. 입력은 반영되지 않고 오류가 표시됨: `현재 양식 기준 이미지 최대 43KB까지 저장할 수 있습니다. 더 작은 이미지로 바꾸거나 다른 이미지 요소를 삭제·교체한 뒤 다시 선택하세요.` | **43KB** | 문서 유형 미선택으로 비활성 |
| 04 | 같은 두 번째 요소에서 실제 저장소 JPEG(37,993 bytes)를 선택. `data:image/jpeg` source로 반영되고 초과 오류가 사라짐. 문서 유형을 `지출결의서`로 선택하자 저장 버튼이 활성화됨. 저장은 누르지 않음. | **43KB** | **활성** |
| 05 | `TITLE` 요소인 `approval-title`을 선택. 인스펙터는 제목 정보만 표시하고 이미지 형식/예산 안내 및 초과 회복 문구는 표시하지 않음. | 해당 없음 | 활성 유지 |

### 캡처

- [01-guidance-shown.png](./01-guidance-shown.png)
- [02-budget-shrinks.png](./02-budget-shrinks.png)
- [03-oversize-rejected.png](./03-oversize-rejected.png)
- [04-jpeg-at-limit-accepted.png](./04-jpeg-at-limit-accepted.png)
- [05-not-shown-on-text.png](./05-not-shown-on-text.png)

## 콘솔·네트워크

성공한 인증 브리지 QA 세션에서 수집한 page error는 0건이며, 캡처 단계에서 추가로 발생한 4xx/5xx는 없었다. 수집된 4xx/5xx는 앱 진입 직후의 다음 2건이다.

| 상태 | 요청 | 관찰된 콘솔 메시지 |
|---:|---|---|
| 404 | `GET http://localhost:8080/app/version?clientType=DESKTOP&currentVersion=2026%2F07%2F29-1` | `Failed to load resource: the server responded with a status of 404 (Not Found)` 및 `[app-version] 버전체크 실패 — 앱 부팅은 계속 진행합니다.` 경고 |
| 503 | `POST http://localhost:8080/logs/front` | `Failed to load resource: the server responded with a status of 503 (Service Unavailable)` 및 `[activity-log] 메뉴 접근 기록 실패` 경고 |

추가 콘솔 경고는 Vite 개발 서버의 Pretendard 폰트 응답에서 반복된 `Failed to decode downloaded font` 및 `OTS parsing error: invalid sfntVersion`(각 33회), React Router future flag 1회였다. 별도 `pageerror`는 없었다.

저장하지 않았으므로 결재 문서 양식 저장 API 요청은 관찰되지 않았다. 성공한 세션의 POST는 `/auth/login`(200)과 위 `/logs/front`(503)뿐이다.

### 로그인·진입 장애 원문

처음 브라우저 인증 브리지 없이 로그인하면 `POST http://localhost:8080/auth/login`은 200을 반환했지만 앱이 토큰을 저장하지 못하고 `http://127.0.0.1:5191/login#/login`에 남았다. 이어 `/auth/logout` 200이 반복됐고, `GET /auth/me` 등은 401이었다. 저장소 핸드오프에 기록된 브라우저용 `window.samhanAuth` 스텁을 주입한 뒤 같은 개발 계정으로 로그인하여 `#/` 대시보드와 `#/groupware/document-templates`에 진입했다. 이 과정에서 기존 양식의 편집·삭제·저장은 하지 않았다.

## 사용한 실제 저장소 자산

- `clients/desktop/android/app/src/main/res/drawable/splash.png` — 4,040 bytes, 첫 이미지 요소
- `docs/character/char_01.png` — 102,522 bytes, 초과 거부 케이스
- `docs/qa/legacy-original/estimate/Screenshot 2026-05-05 at 19.55.29.JPG` — 37,993 bytes, JPEG 허용 케이스

세 파일은 `git ls-files`로 추적 상태를 확인한 저장소 자산이며, 합성 이미지는 사용하지 않았다.

## 예상과 달랐던 점

1. in-app Browser와 Playwright 캐시 Chromium이 모두 제공되지 않아 시스템 Chrome을 Playwright로 제어했다. 브라우저 설치나 다운로드는 하지 않았다.
2. 앱 진입 시 `/app/version` 404로 업데이트 실패 안내가 떴고, `닫기`로 닫은 뒤 QA를 계속했다. 해당 404는 편집기 동작을 막지 않았다.
3. 렌더러에서 Pretendard 폰트 decode/OTS 경고가 반복됐지만 편집기 UI와 안내 문구는 렌더됐고, 요구 캡처를 확보했다.

## 저장된 파일 목록

- `01-guidance-shown.png`
- `02-budget-shrinks.png`
- `03-oversize-rejected.png`
- `04-jpeg-at-limit-accepted.png`
- `05-not-shown-on-text.png`
- `REPORT.md`

소스 코드 수정, 저장 버튼 클릭, 서버 양식 생성/변경, 패키지 설치는 수행하지 않았다.
