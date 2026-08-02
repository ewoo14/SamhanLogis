# PR #990 이미지/로고 문구 재촬영 라이브 QA V2

- 실행일: 2026-07-29 (KST)
- 대상 화면: `#/groupware/document-templates` → `신규 문서 양식` → `이미지/로고 추가`
- 브라우저: 시스템 Chrome, Playwright 직접 실행
- 렌더러: `http://127.0.0.1:5198/`, `VITE_APP_VERSION=2026/07/29-1`, mock OFF
- 캡처 viewport: 1440×900 이상 (viewport 1440×900, fullPage 캡처)
- 인증: 실서버 개발 마스터 세션
- 서버 저장: 수행하지 않음. 신규 양식에서만 확인하고 저장 버튼을 클릭하지 않음.

## ① 안내 문구 `textContent` 전문

실제 렌더 문자열:

> 지원 형식별 최대: PNG 최대 약 48KB (정확히 48,660B) · JPEG/WebP 최대 약 48KB (정확히 48,660B)

기대 문구(`PNG 48,129B`, `JPEG/WebP 48,126B`)와 달랐습니다. 화면에 렌더된 그대로 캡처했습니다.

### 계산 대조

실제 신규 문서 상태(기본 문서 + `image-1`)에서 `maxImageBytesForDocument`와 동일한 공식을 직접 계산했습니다.

| 형식 | baseBytes | remainingEncodedCharacters | `computedMaxBytes` | 화면 표시 |
|---|---:|---:|---:|---:|
| PNG | 653 | 64,883 | 48,660B | 48,660B |
| JPEG | 654 | 64,882 | 48,660B | 48,660B |
| WebP | 654 | 64,882 | 48,660B | 48,660B |

PNG와 JPEG/WebP의 접두사 길이 차이 1B는 `/4` floor에 흡수되어 세 형식의 계산값이 같아집니다. 실제 함수값, 직접 계산값, 화면 표시값이 모두 일치하므로 결함은 확인되지 않았습니다.

## ② 거부 문구 `textContent` 전문

102,522B인 `docs/character/char_01.png` 선택 후 실제 렌더 문자열:

> 현재 양식 기준 이미지 최대 약 48KB (정확히 48,660B)까지 저장할 수 있습니다. 더 작은 이미지로 바꾸거나 다른 이미지 요소를 삭제·교체한 뒤 다시 선택하세요.

## ③ 저장 버튼 활성 여부

- 37,993B JPEG(`docs/qa/legacy-original/estimate/Screenshot 2026-05-05 at 19.55.29.JPG`) 선택 후 이미지 반영 확인.
- 문서 유형을 `지출결의서`로 선택한 상태에서 저장 버튼 `enabled = true`.
- 저장 버튼은 클릭하지 않았습니다.

## ④ 4xx/5xx 네트워크 및 콘솔 에러

동일 절차에서 확인된 4xx/5xx 전부:

### 400

- method: `GET`
- URL: `http://localhost:8080/app/version?clientType=DESKTOP&currentVersion=8.98029556650246`
- 요청 본문: 없음 (`null`, GET)
- 응답 본문 전문:

```json
{"success":false,"code":"INVALID_INPUT","message":"현재 버전 semver 형식 불일치: 8.98029556650246","data":null,"timestamp":"2026-07-29T12:27:01.635500594Z"}
```

원인: `currentVersion=8.98029556650246`가 semver 형식이 아니어서 `/app/version`이 400을 반환했습니다.

### 404

- method: `GET`
- URL: `http://127.0.0.1:5198/favicon.ico`
- 요청 본문: 없음 (`null`, GET)
- 응답 본문: 빈 문자열 (`""`)

콘솔 위치도 위 favicon URL을 가리켰으며, 동일 URL의 읽기 전용 GET으로 404와 빈 응답 본문을 확인했습니다.

브라우저 콘솔 error는 위 404와 400, 총 2건입니다.

## ⑤ 저장한 파일 목록

- `01-guidance-v2.png`
- `02-oversize-v2.png`
- `03-accepted-v2.png`
- `REPORT-V2.md`
