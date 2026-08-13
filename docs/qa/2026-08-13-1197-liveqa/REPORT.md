# PR #1092 종합견적서·주문서 분리 실서버 라이브 QA

- 일시: 2026-08-13 (Asia/Seoul)
- 대상: `fix/1092-split-unified-list`, 사용자 제공 HEAD `b6cc47674`
- 게이트웨이: `http://127.0.0.1:8080`
- 시도 방식: 실제 로컬 업무 스택 + 실제 GUI. GUI 진입 전 자원 하한으로 중단, 합성·fixture 없음
- 변경 제한: git·Gradle·Docker 재빌드/재기동·제품 코드 수정 없음
- 자원 제한: Chromium 1개, context 1개, workers 1; RAM 1.8GB 미만 즉시 중단

## 1. 환경 확인 — 호출 API 원문

민감한 로그인 비밀번호와 발급 토큰만 `[REDACTED]` 처리했다. 응답의 한글은 HTTP UTF-8 바이트를 정상 디코딩해 기록했다.

### API-ENV-1 — 게이트웨이 health

```http
GET http://127.0.0.1:8080/actuator/health

HTTP/1.1 200
Content-Type: application/vnd.spring-boot.actuator.v3+json

{"status":"UP"}
```

### API-ENV-2 — 로그인

```http
POST http://127.0.0.1:8080/api/auth/login
Content-Type: application/json

{"loginId":"dev_master","password":"[REDACTED]"}

HTTP/1.1 200
Content-Type: application/json

{"success":true,"code":"OK","message":"성공","data":{"token":"[REDACTED]","userId":"a0000000-0000-0000-0000-000000000001","role":"MASTER","displayName":"[DEV-SEED] 개발마스터","partnerCode":null,"groups":[{"id":"00000000-0000-0000-0000-000000000100","name":"마스터","builtin":true}]},"timestamp":"2026-08-13T05:07:32.510532598Z"}
```

### API-ENV-3 — 게이트웨이 루트(프런트엔드 탐색)

```http
GET http://127.0.0.1:8080/

HTTP/1.1 404
Content-Type: application/json
```

이 탐색 호출은 상태와 Content-Type만 보존했으며 응답 body는 보존하지 못했다. 없는 원문을 추정해 채우지 않았다.

### 환경 실측

- 최초 가용 RAM: 2.16GB / 총 15.93GB
- 실제 listener: `127.0.0.1:8080`, `127.0.0.1:8081`
- 게이트웨이 루트는 프런트엔드를 제공하지 않음(404). 데스크톱 renderer를 별도 GUI로 기동해 검증한다.
- `clients/web/design-system/dist`: 존재. 추가 설치·빌드하지 않음.

## 2. 시나리오 1~8

### 자원 하한으로 인한 공통 차단

데스크톱 renderer를 실제 GUI로 열기 위해 Vite를 기동했다. `http://127.0.0.1:5173/`가 HTTP 200으로 준비된 직후 가용 RAM이 **1.68GB**로 내려갔다. 사용자 지정 중단 하한 1.8GB 미만이므로 Chromium을 띄우기 전에 즉시 중단하고, 기동한 Vite PID 20348을 종료했다.

| 시나리오 | 실측 결과 | 건수 | 스크린샷 |
|---|---|---:|---|
| 1. `/sales/estimates` 탭 2개 | **관측 불가** — Chromium 기동 전 RAM 하한 위반 | 미측정 | 없음 |
| 2. 종합견적서 두 출처 | **관측 불가** | 미측정 | 없음 |
| 3. 주문서 웹 저장분·중복/누락 | **관측 불가** | 미측정 | 없음 |
| 4. 종합견적서 상태 필터·적용 범위 안내 | **관측 불가** | 미측정 | 없음 |
| 5. 주문서 미지원 필터 숨김 | **관측 불가** | 해당 없음 | 없음 |
| 6. 상세 → 목록 탭 왕복 | **관측 불가** | 해당 없음 | 없음 |
| 7. 가격 메뉴 이동·estimate-config 전역 설정 | **관측 불가** | 해당 없음 | 없음 |
| 8. 종합견적서 스냅샷 분기계산 왕복 | **관측 불가** | 해당 없음 | 없음 |

따라서 웹 종합견적서 0건 여부, 주문서 건수, 문서 중복/누락, 분기계산 복원은 어떤 방향으로도 판정하지 않는다.

## 3. 도달 가능한 결함

제품 화면에 도달하지 못했으므로 제품 결함을 판정하지 않는다. **결함 0이 아니라 검증 차단**이다.

검증 환경의 도달 가능 차단 조건:

- 무엇이: 실제 데스크톱 renderer GUI 기동
- 어디서: `http://127.0.0.1:5173/` 준비 직후
- 어떤 입력으로: Vite renderer 1개 기동, Chromium은 아직 미기동
- 무엇이 잘못되었는가: 가용 RAM 2.16GB → 1.68GB로 하락하여 사용자 지정 1.8GB 하한 위반

## 4. 표 정렬 확인 결과

**관측 불가.** 목록·표 GUI를 열기 전에 중단했으므로 헤더와 행 정렬을 확인하지 않았다. 정렬 정상/결함 없음으로 간주하지 않는다.

## 5. 관측 불가 목록 · 증거 무결성

- git 명령은 실행하지 않았다. 브랜치와 HEAD는 사용자 제공값을 기록했다.
- 제품 코드는 읽거나 수정하지 않았다. 프런트 기동에 필요한 `package.json` 스크립트 정보만 확인했다.
- Gradle, Docker 재빌드/재기동, npm 설치·빌드를 실행하지 않았다.
- Vite PID 20348은 중단 직후 종료했고, 5173 listener가 사라진 것을 확인했다.
- Chromium 기동 횟수 0, browser context 0, workers 0. 따라서 스크린샷도 0장이다.
- 합성·fixture 캡처를 만들지 않았다. 실제 GUI 캡처가 없으므로 빈 `screenshots/` 디렉터리만 존재한다.
- 시나리오 1~8, 문서 건수, 탭 귀환, 필터, 가격 설정, 분기계산 복원, 표 정렬은 전부 관측 불가다.

## 최종 상태

`BLOCKED` — 사용자 지정 RAM 중단 조건(1.8GB 미만)이 실제 GUI 준비 단계에서 발동했다. 제품 결함 수와 성공 여부는 판정하지 않는다.
