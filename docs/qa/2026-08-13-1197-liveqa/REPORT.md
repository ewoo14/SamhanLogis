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

---

# 라운드 2 — HEAD `d73408581` 실서버·실 GUI 재검증

- 일시: 2026-08-13 (Asia/Seoul)
- 대상: `fix/1092-split-unified-list`, 사용자 제공 HEAD `d73408581` (CI 45/45 green)
- 게이트웨이: `http://127.0.0.1:8080`
- 제한 준수: git·Gradle·Docker 재빌드/재기동·제품 코드 수정 없음
- 브라우저 제한: 실제 Chromium 1개, context 1개, workers 1
- 중단 하한: 가용 RAM 1.0GB 미만
- 증거: 실제 업무 스택·실제 GUI만 사용. 합성·fixture 없음

## R2-1. 환경 확인 — 호출 API 원문

민감한 로그인 비밀번호와 발급 토큰만 `[REDACTED]` 처리했다.

### R2-API-ENV-1 — 게이트웨이 health

```http
GET http://127.0.0.1:8080/actuator/health

HTTP 200
Content-Type: application/vnd.spring-boot.actuator.v3+json

{"status":"UP"}
```

### R2-API-ENV-2 — 로그인

```http
POST http://127.0.0.1:8080/api/auth/login
Content-Type: application/json; charset=utf-8

{"loginId":"dev_master","password":"[REDACTED]"}

HTTP 200
Content-Type: application/json

{"success":true,"code":"OK","message":"성공","data":{"token":"[REDACTED]","userId":"a0000000-0000-0000-0000-000000000001","role":"MASTER","displayName":"[DEV-SEED] 개발마스터","partnerCode":null,"groups":[{"id":"00000000-0000-0000-0000-000000000100","name":"마스터","builtin":true}]},"timestamp":"2026-08-13T06:53:26.289670291Z"}
```

### R2 환경 실측

- 컨테이너: `samhan-*` 12개 탐지, 12개 전부 `healthy`
- 최초 가용 RAM: 3,278MB / 총 16,310MB
- 실제 listener: `127.0.0.1:8080`, `127.0.0.1:8081`
- `clients/web/design-system/dist`: 존재. 추가 npm 설치·빌드 없음
- 로그인 응답 역할: `MASTER`

## R2-2. 시나리오 1~9(가능하면 10) 실측

### 시나리오 1 — 견적 작성 라인 헤더·입력 행 정렬

**판정: 1920px PASS / 1440px 결함 도달 / 비 `ACTIVE` 행 관측 불가.**

- 빈 행과 `ACTIVE` 품목 선택 행의 DOM 실측은 헤더 10칸·행 10칸이다. `# / 모델명 / 품목명 / 규격 / 수량 / 단가 / 공급가액 / 부가세 / 합계 / 삭제`가 순서와 폭까지 1:1로 대응했다. 행 내부 여백 때문에 각 행 칸은 대응 헤더보다 왼쪽 좌표가 일관되게 4px 오른쪽이었다. 과거의 10칸 대 11칸 및 이후 값 한 칸 밀림은 재현되지 않았다.
- 1920×1080에서 `AC060CS1PBH1SY / 무풍 1way 냉난방 / (빈 규격) / 1 / 2,220,900 / 2,019,000 / 201,900 / 2,220,900`이 각 헤더 바로 아래에 표시됐다.
- 1440×900에서는 고정폭 열 합계 때문에 **품목명 열이 18px로 축소**됐다. 헤더 `품목명`이 세 줄로 수직 래핑되고 실제 값 `무풍 1way 냉난방`은 입력 안에 존재하지만 화면에서는 빈 칸처럼 보인다. 후속 열은 해당 헤더와 맞지만, 개발책임자가 지적한 “품목명 칸이 비어 보임”은 1440px에서 여전히 사용자 도달 가능하다.
- 실제 제품 API 전수 3,061건은 전부 `ACTIVE`였다. 비 `ACTIVE` 품목 0건이므로 해당 상태의 행은 합성·fixture 없이 만들 수 없었고 **관측 불가**다. 이를 정상으로 판정하지 않는다.

증거:

- `screenshots/round2-s1-empty-line.png`
- `screenshots/round2-s1-s2-selected-line-amounts.png`
- `screenshots/round2-s1-s2-selected-line-1920.png`
- `screenshots/round2-s1-product-picker.png`

### 시나리오 2 — 자동단가 적용 시 행 금액과 하단 합계

**판정: 계산·표시 PASS, 제시 재현 단가와 실서버 데이터 불일치.**

- 거래처: `2568700899` → `주식회사 제이앤피공조`
- 품목: `AC060CS1PBH1SY` (`ACTIVE`, `무풍 1way 냉난방`)
- 실서버 현재 단가: **2,220,900원**. 사용자 제시 2,170,900원과 50,000원 다르며, 실제 제품 API도 `sellingPrice: 2220900`을 반환했다. 다른 브랜치 백엔드 또는 라이브 데이터 차이로 기록한다.
- 행 실측: 공급가액 **2,019,000원**, VAT **201,900원**, 합계 **2,220,900원**.
- 하단 실측: 공급가액 **2,019,000원**, VAT **201,900원**, 총합 **2,220,900원**.
- 비어 있는 두 번째 행은 0원이다. 따라서 비영(非零) 행 합계 총합 `2,220,900` = 하단 총합 `2,220,900`으로 정확히 일치한다.
- 자동단가 적용 직후 콘솔 신규 오류는 0건이었다.

증거: `screenshots/round2-s1-s2-selected-line-amounts.png`, `screenshots/round2-s1-s2-selected-line-1920.png`

### 라운드 2 진행 중 확인된 인증 연동 이상

GUI 로그인은 `POST http://localhost:8080/auth/login` 200 뒤 보호 API(`/auth/me`, `/auth/admin/permissions/my`, `/api/notifications/my`)가 401을 반환해 로그인 화면으로 되돌아왔다. 같은 계정의 `POST /api/auth/login` 실제 발급 토큰을 Chromium의 `Authorization` 헤더에 적용하면 대시보드와 제품 화면은 정상 진입했다. 다른 브랜치 백엔드와의 인증 연동 이상으로 분리 기록하며, 이후 화면 측정은 동일 실제 토큰과 실데이터로 수행했다.

증거: `screenshots/round2-login.png`, `screenshots/round2-dashboard.png`(이름과 달리 로그인 후 되돌아온 실제 로그인 화면)

### 시나리오 3 — `/sales/estimates` 탭 2개

**판정: PASS.** 실제 GUI에서 `종합견적서`(선택됨)와 `주문서` 두 탭이 모두 노출됐다.

- 화면 제목: `견적서 관리`
- 상단 집계: `종합견적서 전체 25건`
- 스크린샷: 없음. 이 화면에서 캡처하기 전 가용 RAM이 1,013MB로 하한을 통과해 즉시 중단했다. 브라우저 접근성 스냅샷과 화면 텍스트로만 확인했으며, 없는 이미지를 만들지 않았다.

### 시나리오 4 — 종합견적서 탭의 데스크톱 + 웹 저장분

**판정: FAIL / 웹 건수 관측 불가.**

- 데스크톱 견적: **25건** 렌더링. 첫 행 `2026/08/13-1 / 부산냉난방테크 / 316,800원 / 전표변환완료`, 나머지 24건은 2026-07-15~16 작성중 문서였다.
- 웹 종합견적서: 화면에 `종합견적서 목록을 불러오지 못했습니다. (웹 종합견적서)`가 노출됐고 콘솔에 같은 시점의 HTTP 404가 기록됐다.
- 따라서 웹 저장분은 화면 렌더 기준 0행이지만 **실제 저장 0건으로 판정하지 않는다**. 저장 건수는 관측 불가다.
- 두 출처가 동시에 보여야 한다는 시나리오는 충족하지 못했다.
- 스크린샷: 없음(자원 하한 발동 전 캡처 미완료).

### 시나리오 5 — 주문서 탭 웹 저장분·중복/누락

**관측 불가.** 주문서 탭을 누르기 전에 가용 RAM 1,013MB로 중단했다. 웹 주문서 건수, 양 탭 중복, 양쪽 모두 없는 조합은 어떤 방향으로도 판정하지 않는다. 스크린샷 없음.

### 시나리오 6 — 상태 필터와 적용 범위 안내

**부분 관측.** 종합견적서 탭에 `전체 상태 / 작성중 / 발송완료 / 수주완료 / 거절 / 전표변환완료` 상태 필터가 노출되는 것은 확인했다. 필터를 선택해 데스크톱 25건이 실제로 걸러지는지, 적용 범위 안내문이 나타나는지는 중단 전에 실행하지 못했다. 스크린샷 없음.

### 시나리오 7 — 주문서 탭의 상태·기간·삭제 필터 부재

**관측 불가.** 주문서 탭 미진입. 종합견적서 탭에는 상태, 기간 시작·종료, 거래처명, 삭제 문서 포함 필터가 모두 있었다. 주문서 탭에서 숨겨지는지는 판정하지 않는다. 스크린샷 없음.

### 시나리오 8 — 상세 → 목록 탭 왕복

**관측 불가.** 웹 주문서 상세 및 종합견적서 상세로 들어가기 전에 자원 하한이 발동했다. 스크린샷 없음.

### 시나리오 9 — 가격 경로와 전역 가격 설정 폼

**부분 관측.** 실제 사이드바의 `카테고리별 단가변동` 링크가 `/products/price-schedule`, `견적 가격 설정` 링크가 `/sales/estimate-config`를 가리키는 것까지 실 GUI 속성으로 확인했다. 그러나 해당 두 링크를 열어 화면 본문과 빈 화면 여부를 확인하기 전 중단했다. 도달 성공으로 판정하지 않는다. 스크린샷 없음.

### 시나리오 10 — 웹 종합견적서 스냅샷 분기계산 왕복

**관측 불가.** 시나리오 4에서 웹 저장분 조회 자체가 404로 실패했고, 이어 자원 하한이 발동했다. 복원·분기계산 화면은 열지 못했다. 스크린샷 없음.

## R2-3. 도달 가능한 결함

### R2-DEFECT-1 — 1440px에서 견적 품목명 열 18px 붕괴

- 심각도: 높음(견적 작성 핵심 데이터 식별 불가)
- 재현: 1440×900 → `/sales/estimates/new` → 거래처 `2568700899` 선택 → 품목 `AC060CS1PBH1SY` 입력
- 실측: 헤더·행 모두 품목명 열 폭 18px. `품목명` 헤더는 3줄로 래핑되고 실제 입력값 `무풍 1way 냉난방`은 존재하지만 화면에서는 빈 칸처럼 보인다.
- 범위: 1920×1080에서는 동일 열 658px로 정상 표시되어 viewport 의존 결함이다.
- 증거: `screenshots/round2-s1-s2-selected-line-amounts.png`, 비교 `screenshots/round2-s1-s2-selected-line-1920.png`

### R2-DEFECT-2 — 웹 종합견적서 조회 실패

- 심각도: 높음(PR 본체인 통합 목록의 한 출처가 누락)
- 재현: `/sales/estimates` 진입 → 기본 선택된 종합견적서 탭
- 실측: 데스크톱 25건은 표시되지만 `종합견적서 목록을 불러오지 못했습니다. (웹 종합견적서)` 노출, 콘솔 HTTP 404.
- 영향: 웹 저장분 건수·중복·누락·상세 왕복·분기계산을 검증할 수 없다.
- 증거 스크린샷: 없음(자원 하한 직전 도달, 캡처 전 중단). 접근성 스냅샷·화면 텍스트·콘솔 원문으로 재현 확인.

### R2-ENV-1 — GUI 로그인 직후 보호 API 401

- `POST /auth/login`은 200이나 직후 `/auth/me`·권한·알림 조회가 401이어서 로그인 화면으로 돌아간다.
- 동일 계정의 실제 `/api/auth/login` 토큰을 Chromium `Authorization` 헤더에 적용하면 제품 화면은 진입된다.
- 사용자 사전 고지대로 다른 브랜치 백엔드 동작일 수 있어 PR 결함과 분리한다.
- 증거: `screenshots/round2-dashboard.png`

### R2-ENV-2 — 실서버 가격 데이터가 제시 재현값과 다름

- `AC060CS1PBH1SY`의 실제 제품 API와 GUI 단가는 2,220,900원이다. 제시값 2,170,900원보다 50,000원 높다.
- 프런트 계산은 실제 반환값 기준으로 정확했다. 다른 브랜치 백엔드 또는 라이브 데이터 차이로 분리한다.

## R2-4. 표 정렬 확인 결과 — 화면별

| 화면 | 뷰포트 | 결과 | 증거 |
|---|---:|---|---|
| 견적서 작성 빈 행 | 1440×900 | 10 헤더·10 행 1:1 대응. 단 품목명 열 18px 붕괴 | `round2-s1-empty-line.png` |
| 견적서 작성 `ACTIVE` 품목 행 | 1440×900 | 금액 열까지 헤더 대응은 맞음. 품목명 값이 시각적으로 보이지 않음 | `round2-s1-s2-selected-line-amounts.png` |
| 견적서 작성 `ACTIVE` 품목 행 | 1920×1080 | 헤더·행 정렬 정상, 품목명 표시 정상 | `round2-s1-s2-selected-line-1920.png` |
| 견적서 작성 비 `ACTIVE` 품목 행 | — | 실데이터 0건으로 관측 불가 | 없음 |
| 품목 검색 결과 모달 | 1440×900 | 선택·모델명·품목명·규격·단가 헤더와 행 정렬 정상 | `round2-s1-product-picker.png` |
| 기초품목 관리 목록 | 1920×1080 | 모델명·품목명·제품구분·카테고리·세트·관리 헤더와 행 정렬 정상 | `round2-table-products-catalog.png` |
| `/sales/estimates` 종합견적서 목록 | 1920×1080 | 행 데이터는 렌더됐으나 캡처·시각 정렬 검토 전 자원 중단 | 없음 |
| 주문서 목록·상세·가격 화면 | — | 미도달 | 없음 |

## R2-5. 관측 불가 목록 · 증거 무결성

- 중단 시점: `/sales/estimates` 접근성 스냅샷·텍스트·콘솔 확인 직후 가용 RAM **1,013MB**. 사용자 지정 1.0GB 하한에 도달한 것으로 보고 추가 조작을 즉시 중단했다.
- 종료 확인: QA Chromium 루트 0개, 5173 Vite listener 0개. 종료 후 가용 RAM 3,137MB.
- 실제 Chromium: headless Chromium root 1개, browser context 1개, worker 1개만 사용했다. 새 탭을 만들지 않았다.
- git·Gradle·Docker 재빌드/재기동·제품 코드 수정 없음. Docker는 상태 조회만 수행했다.
- npm 설치·빌드 없음. 기존 design-system dist와 기존 node_modules로 Vite renderer만 기동했다.
- 합성·fixture 없음. 모든 유효 PNG는 실제 Chromium 렌더 캡처다.
- `round2-defect-auth-login-return.png`는 browse daemon 재시작 시 생성된 빈 `about:blank` 캡처라 **증거에서 제외**했다. 파일은 삭제하지 않았다.
- `round2-dashboard.png`는 파일명과 달리 GUI 로그인 후 401로 되돌아온 실제 로그인 화면이다.
- 미완주: 시나리오 5, 7, 8, 10 전체; 시나리오 4 웹 건수; 시나리오 6 필터 적용; 시나리오 9 두 목적지 화면 본문; 비 `ACTIVE` 행; `/sales/estimates` 목록 시각 정렬.
- 위 항목은 “결함 0” 또는 PASS로 세지 않는다.

## 라운드 2 최종 상태

`DONE_WITH_CONCERNS` — 우선 결함 2건 중 자동단가 행 금액은 실제 반환 단가 기준 정상이고, 헤더·행 열 순서 밀림도 해소됐다. 그러나 1440px 품목명 열 붕괴와 웹 종합견적서 404가 도달 가능하며, 자원 하한 발동으로 시나리오 5~10의 상당 부분은 관측 불가다.

---

# Round 3 — PR #1197 라이브 QA 완주 (2026-08-13)

대상은 사용자 지정 PR #1197 `fix/1092-split-unified-list`, HEAD `f5f3161e0`이다. git 명령은 사용하지 않았다. 이 절은 기존 Round 1·2 기록을 보존한 채 추가한 결과다.

## R3-1. 환경 확인 원문

### ① 백엔드 컨테이너 빌드 시각

`docker inspect samhan-<svc> --format "{{.Created}}"` 계열 실측 원문:

```text
samhan-slip-service|2026-08-12T17:53:07.461758521Z
samhan-api-gateway|2026-08-12T15:39:17.991855852Z
samhan-partner-order-service|2026-08-12T15:02:01.069557636Z
samhan-auth-service|2026-08-12T00:03:23.288496844Z
samhan-product-service|2026-08-11T18:10:22.372262338Z
samhan-eureka|2026-08-11T18:10:15.05691594Z
samhan-postgres|2026-08-11T18:10:14.478346436Z
samhan-user-service|2026-08-11T17:59:58.945181532Z
samhan-arologis-service|2026-08-11T17:59:58.944887609Z
samhan-accounting-service|2026-08-11T17:59:58.936343007Z
samhan-groupware-service|2026-08-11T17:59:58.936253267Z
samhan-dc-config-service|2026-08-11T17:59:58.935668218Z
samhan-inventory-service|2026-08-11T17:59:58.933815104Z
samhan-partner-service|2026-08-11T17:59:58.92548763Z
samhan-dashboard-service|2026-08-11T17:59:58.903286495Z
samhan-partner-auth-service|2026-08-11T17:59:58.888219639Z
samhan-notification-service|2026-08-11T17:59:58.884122215Z
samhan-grafana|2026-08-11T17:59:50.780292025Z
samhan-prometheus|2026-08-11T17:59:50.305821163Z
samhan-nginx|2026-08-11T17:59:50.302952411Z
samhan-minio|2026-08-07T17:15:59.685930284Z
samhan-elasticsearch|2026-06-28T09:49:33.830104726Z
samhan-rabbitmq|2026-06-22T14:54:01.201891168Z
samhan-redis|2026-06-22T14:54:01.200390069Z
```

최신 백엔드인 `slip-service`조차 `2026-08-12T17:53` 생성본이다. 따라서 아래 백엔드 의존 결과는 **현재 라이브 스택과의 호환성 관측**이지 PR HEAD 백엔드 빌드의 증명으로 확대하지 않는다.

### ② 컨테이너 24개 존재·상태

`docker ps -a --filter "name=samhan-" --format "{{.Names}}|{{.Status}}"` 결과는 총 24개였다. **없는 컨테이너 0개/24개**, 실행 22개, 알려진 중단 2개다.

```text
samhan-nginx|Exited (127)
samhan-prometheus|Exited (127)
나머지 samhan-* 22개|Up (healthy)
```

### ③ 프런트엔드 워크트리 빌드

현재 워크트리에서 `clients/desktop`의 `npm run build`를 실행했다.

```text
vite v6.4.1 building for production...
✓ 748 modules transformed.
✓ built
Exit code: 0
```

`clients/web/estimate-app`도 의존성 설치 후 `npm run build`를 실행했고 JS 17개 파일 typecheck가 성공했다. 실제 GUI는 이 워크트리의 desktop Vite(5173)와 estimate-app(5183)을 Playwright Chromium으로 조작했다.

RAM 원문은 시작 `RAM_FREE_MB=28973 RAM_TOTAL_MB=63092`, 최종 증거 고정 직전 `RAM_FREE_MB=27377 RAM_TOTAL_MB=63092`였다. 라운드 중 최저 관측치는 24,579MB로 1.0GB 중단선에 접근하지 않았다.

## R3-2. 0단계 — 웹 종합견적서 HTTP 404 재확인

실 사용자 경로 `대시보드 → 판매 → 견적서 관리`로 진입해 브라우저가 발생시킨 요청을 관측했다.

```text
GET http://localhost:8080/api/v1/estimates/web-snapshots
HTTP/1.1 200
Content-Type: application/json
data.length=4
화면 오류 문구/alert=없음
```

화면에는 웹 저장분 4건(`S3-1135-%_\\`, `S9-875-20260807200351`, `QA-875-live-1786131344007`, `QA 견적 수정 2026-08-02`)이 렌더됐다.

**판정: PASS. Round 2의 404는 재현되지 않았다.** PR 전제인 “종합견적서 탭에 웹 저장분이 보인다”는 현재 실서버에서 성립한다.

증거: [round3-stage0-web-snapshot-list.png](screenshots/round3-stage0-web-snapshot-list.png)

## R3-3. 시나리오 5~10

### 시나리오 5 — 주문서 탭 웹 저장분·중복·누락

절차: 견적서 관리에서 `주문서` 탭 클릭 → 목록 렌더와 실제 네트워크 응답 확인 → 각 행의 `draftKey`를 수집해 중복 검사.

```text
GET /api/v1/partner-orders/web-drafts → 200
화면 행=11
고유 draftKey=11
중복 draftKey=0
```

같은 표시명 `주문서 확정 임시저장` 행들은 거래처·시각·draftKey가 서로 다른 별도 저장분이었다. 다른 트랙이 만든 행을 결함으로 세지 않았다.

**결과: PASS.** 증거: [round3-s5-orders-list.png.png](screenshots/round3-s5-orders-list.png.png)

### 시나리오 6 — 상태 필터와 적용 범위 안내

절차: 종합견적서 탭에서 `작성중(QUOTE_DRAFT)` 선택 → URL·선택 상태·안내문·목록을 확인.

```text
URL query=status=QUOTE_DRAFT
안내문=상태 필터는 데스크톱 견적에만 적용됩니다. 웹 종합견적서 저장분은 '저장됨' 상태 하나뿐이므로 이 필터로 걸러지지 않습니다.
화면 행=44
```

**결과: PASS.** 증거: [round3-s6-status-scope.png.png](screenshots/round3-s6-status-scope.png.png)

### 시나리오 7 — 주문서 탭 필터 범위

절차: 주문서 탭 진입 후 필터 control 수를 DOM과 화면에서 확인.

```text
status=0
startDate=0
endDate=0
includeDeleted=0
partnerName=1
URL query=tab=orders
```

**결과: PASS.** 주문서 탭에는 거래처 필터만 있고 상태·기간·삭제 포함 필터는 없다. 증거: [round3-s7-order-filters.png.png](screenshots/round3-s7-order-filters.png.png)

### 시나리오 8 — 주문서 상세 → 목록 탭 왕복

절차: 주문서 첫 웹 저장행(`draftKey=1068689215:2`) 상세 진입 → 본문 확인 → `목록으로` 클릭 → 복귀 탭 확인.

```text
상세 URL=/sales/partner-orders/web-drafts/1068689215%3A2
상세 문서명=주문서 확정 임시저장
거래처 코드=1068689215
작성시각=2026-08-07T19:35:01.817407
목록 복귀 URL query=tab=orders
주문서 탭 aria-selected=true
```

**결과: PASS.** 증거: [round3-s8-order-detail.png.png](screenshots/round3-s8-order-detail.png.png)

### 시나리오 9 — 가격 경로·페이지 실도달

절차: 실제 사이드바 링크로 `견적 가격 설정`, `카테고리별 단가변동`을 각각 열어 본문과 입력 폼/카테고리 목록을 확인.

- `/sales/estimate-config`: 가정용·상업용 할인율, 구형 할인율, VAT 등 전역 설정 폼 렌더 확인.
- `/products/price-schedule`: `카테고리별 단가변동` 제목과 네 개 카테고리 렌더 확인.

**결과: PASS.** 빈 화면·라우트 실패 없음.

증거: [round3-s9-estimate-config.png.png](screenshots/round3-s9-estimate-config.png.png), [round3-s9-price-schedule.png.png](screenshots/round3-s9-price-schedule.png.png)

### 시나리오 10 — 종합견적서 스냅샷 분기계산 왕복

절차:

1. estimate-app 실제 GUI에서 상업멀티 제품 `AM080AXVHHH1` 1대, `AM016BN1PBH2` 1대, `AM020BN1PBH2` 1대를 선택했다.
2. 분기계산 화면에서 실외기명과 용량·분기관·추가수량을 입력했다.
3. `견적저장` → 이름 `PR1197-R3-BRANCH-1786618391920` 입력 → 확인 → `✅ 안전하게 저장되었습니다!` 확인.
4. 화면 값을 의도적으로 실외기명 `R3-변경값`, 용량 `99/88`, 추가수량 `0`으로 변조했다.
5. `저장내역`에서 해당 행의 `복원` 클릭 → 확인 → `✅ 복원 완료` 확인.
6. 복원된 분기 화면의 실제 input·계산 결과와 `GLOBAL_BRANCH_STATE`를 함께 읽어 저장 전 값과 비교했다.

| 항목 | 저장 값 | 변조 값 | 복원 값 | 판정 |
|---|---|---|---|---|
| 실외기명 | `R3-실외기-A` | `R3-변경값` | `R3-실외기-A` | 일치 |
| 용량 슬롯 1~4 | `16, 20, 빈칸, 빈칸` | `99, 88, 빈칸, 빈칸` | `16, 20, 빈칸, 빈칸` | 일치 |
| 분기관 코드 1~4 | `-, 2512, -, -` | 재계산 상태 | `-, 2512, -, -` | 일치 |
| 2512 추가수량 | `2` | `0` | `2` | 일치 |
| 2512 합계 | `3` | 변조 후 값 | `3` | 일치 |

복원 RPC도 `GET /rpc/getQuoteHistory → 200`이었다. 화면값 5개 비교와 내부 상태 비교가 모두 `true`였다.

**결과: PASS.** 분기 상태와 분기관 코드가 실제 저장소 왕복 후 그대로 복원됐다.

증거: [저장 전 분기](screenshots/round3-s10-before-save-branch.png), [저장내역](screenshots/round3-s10-saved-list.png), [복원 후 분기](screenshots/round3-s10-restored-branch.png)

## R3-4. 도달 가능한 결함

- **Round 3 신규 도달 결함: 0건.** 0단계 및 시나리오 5~10에서 실 사용자 경로로 재현되는 결함은 없었다.
- **전체 라이브 QA의 기존 미해결 결함: 1건.** 같은 HEAD의 Round 2 `R2-DEFECT-1`(1440px 견적 품목명 열 18px 붕괴)은 이번 지시 범위인 시나리오 5~10에서 재검증하지 않았으므로 해소됐다고 정정할 근거가 없다.
- Round 2 `R2-DEFECT-2`(웹 종합견적서 조회 404)는 이번 0단계 실측으로 철회한다.

## R3-5. 증거 무결성 정정

1. Round 2의 “웹 종합견적서 조회 HTTP 404”는 현재 실 사용자 경로에서 200으로 반증됐다. **낡은 배포본/당시 스택 관측으로 정정하며 PR #1197 현 HEAD의 도달 결함 증거로 사용하지 않는다.**
2. 기존 문서 첫 제목의 `PR #1092` 표기는 이 라운드 사용자 지정 대상 `PR #1197`과 어긋난다. 기존 기록은 삭제하지 않고 Round 3 대상을 PR #1197로 명시한다.
3. estimate-app 최초 기본 이메일 `dev@samhan-air.com` 실행에서는 `접근 권한이 없습니다`가 나왔고, 실 seed 계정 `dev_master@samhan-air.com`으로 다시 실행해 권한 화면과 전 시나리오를 관측했다. 최초 권한 화면은 제품 결함 증거에서 제외한다.
4. estimate-app의 내부 저장 API 대상을 gateway로 둔 최초 QA 실행은 404, 잘못 추정한 8081 직접 포트는 403이었다. Docker 실제 매핑 `slip-service 8086/tcp → 127.0.0.1:18086`과 컨테이너의 기존 내부 토큰으로 수정한 뒤 실제 저장·복원에 성공했다. 실패한 두 저장 이름은 생성되지 않았다.

## R3-6. 관측 불가·실패 명령 원문

### 관측 불가

- 시나리오 5~10의 사용자 화면 항목은 **관측 불가 없음**.
- 단, 백엔드 컨테이너가 PR HEAD의 신선 빌드인지 여부는 관측 불가다. `slip-service` Created가 `2026-08-12T17:53:07Z`이므로 위 결과를 HEAD 백엔드 검증으로 판정하지 않았다.

### 실패 명령 원문과 후속 처리

인앱 브라우저 세션 탐색:

```text
No browser is available
```

사용자 지정 설치본 `@playwright/test` + `chromium-1217` standalone 실행으로 전 시나리오를 완료했으므로 이것은 최종 관측 불가 사유가 아니다.

estimate-app 최초 서버 실행:

```text
node server.js
Error: Cannot find module 'dotenv'
Require stack:
- C:\dev\Samhan-Public\.claude\worktrees\wsplitlist\clients\web\estimate-app\server.js
Node.js v24.15.0
```

`npm ci` 후 동일 서버가 정상 기동됐다.

잘못된 내부 API 대상의 실제 원문:

```text
GET http://127.0.0.1:8080/internal/estimates/snapshots
404
{"timestamp":"2026-08-13T10:49:08.132+00:00","path":"/internal/estimates/snapshots","status":404,"error":"Not Found","requestId":"62ef0362-813"}

GET http://127.0.0.1:8081/internal/estimates/snapshots
403
```

실제 Docker 매핑으로 정정 후:

```text
GET http://127.0.0.1:18086/internal/estimates/snapshots
200
Content-Type: application/json
BODY_LENGTH=557224
```

## R3-7. 공유 DB에 남긴 문서번호·이름

- 생성 성공: `PR1197-R3-BRANCH-1786618391920` — 웹 종합견적서 스냅샷 1건.
- 생성 실패·DB 미잔존: `PR1197-R3-BRANCH-1786617985175`, `PR1197-R3-BRANCH-1786618201076`.
- 시나리오 5~9에서는 신규 문서를 만들지 않았다. 기존 주문서·견적서 행은 조회만 했다.

## R3-8. 머지 권고

**현재 상태에서는 머지를 권고하지 않는다.** Round 3의 필수 0단계와 시나리오 5~10은 모두 PASS했고 이 범위 신규 결함은 0건이며, 웹 종합견적서 404도 철회한다. 그러나 동일 HEAD에서 이미 실 사용자 경로로 기록된 `R2-DEFECT-1`(1440px에서 품목명 식별 불가)이 미해결 상태다. 해당 결함의 수정 또는 동일 조건 재검증으로 해소가 확인되기 전에는 “도달 가능한 결함 0건” 게이트가 충족되지 않는다.

## Round 4

### R4-1. 환경 확인 원문

Round 2의 재현 조건을 그대로 사용했다: `1440×900` → `/sales/estimates/new` → 거래처 `2568700899` 선택 → 품목 `AC060CS1PBH1SY` 입력 후 blur로 실서버 lookup 완료. 같은 상태를 `1920×1080`으로 바꿔 다시 측정했다. 정적 게이트나 소스 존재 여부가 아니라 Playwright `@playwright/test 1.59.1`과 설치본 `chromium-1217`로 실제 Vite 렌더러(`127.0.0.1:5173`) 및 실 gateway(`127.0.0.1:8080`)를 조작했다. 로그인 HTTP는 200이었다. 저장 버튼은 누르지 않아 신규 문서번호는 없다.

`git` 명령 없이 worktree 관리 파일의 HEAD를 직접 읽은 원문:

```text
WORKTREE_HEAD=eb5aa20e7a1f15136e54843ba9a667386c13caa9
EXPECTED_PREFIX_MATCH=True
VITE_APP_VERSION=2026/08/13-1197
```

RAM 원문:

```text
시작 RAM_FREE_GIB=22.215
증거 고정 직전 RAM_FREE_GIB=21.083
중단 기준=1.0GiB
```

### R4-2. 견적 1440px 실제 렌더 폭

`getBoundingClientRect()` 및 헤더 텍스트 node의 `Range.getClientRects()` 원문:

```json
{
  "viewport": { "width": 1440, "height": 900 },
  "headerCount": 10,
  "rowCount": 10,
  "headerModel": { "left": 305, "right": 543, "width": 238, "height": 18 },
  "headerProduct": { "left": 543, "right": 781, "width": 238, "height": 18 },
  "rowModel": { "left": 309, "right": 545, "width": 236, "height": 36 },
  "rowProduct": { "left": 545, "right": 781, "width": 236, "height": 28 },
  "modelInput": { "left": 322, "right": 532, "width": 210, "height": 23 },
  "productInput": { "left": 545, "right": 781, "width": 236, "height": 28 },
  "modelHeaderTextLines": [
    { "left": 305, "top": 490.5625, "width": 33.125, "height": 16 }
  ],
  "productHeaderTextLines": [
    { "left": 543, "top": 490.5625, "width": 33.125, "height": 16 }
  ],
  "hiddenCollabCount": 1,
  "hiddenCollabRects": [
    { "left": 0, "right": 0, "width": 0, "height": 0 }
  ]
}
```

육안 확인: `모델명`, `품목명`은 각각 한 줄로 표시됐다. `품/목/명` 형태의 3줄 래핑은 재현되지 않았고, 행의 `무풍 1way 냉난방`도 정상 식별된다.

증거: [round4-estimate-1440.png](screenshots/round4-estimate-1440.png)

### R4-3. 견적 1920px 실제 렌더 폭

동일 DOM과 동일 측정 함수의 원문:

```json
{
  "viewport": { "width": 1920, "height": 1080 },
  "headerCount": 10,
  "rowCount": 10,
  "headerModel": { "left": 305, "right": 783, "width": 478, "height": 18 },
  "headerProduct": { "left": 783, "right": 1261, "width": 478, "height": 18 },
  "rowModel": { "left": 309, "right": 785, "width": 476, "height": 36 },
  "rowProduct": { "left": 785, "right": 1261, "width": 476, "height": 28 },
  "modelInput": { "left": 322, "right": 772, "width": 450, "height": 23 },
  "productInput": { "left": 785, "right": 1261, "width": 476, "height": 28 },
  "modelHeaderTextLines": [
    { "left": 305, "top": 490.5625, "width": 33.125, "height": 16 }
  ],
  "productHeaderTextLines": [
    { "left": 783, "top": 490.5625, "width": 33.125, "height": 16 }
  ],
  "hiddenCollabCount": 1,
  "hiddenCollabRects": [
    { "left": 0, "right": 0, "width": 0, "height": 0 }
  ]
}
```

육안 확인: 두 헤더 모두 한 줄이며 품목명 값도 정상 표시됐다.

증거: [round4-estimate-1920.png](screenshots/round4-estimate-1920.png)

### R4-4. `SlipFormPage` 대조

`/sales/new`에 같은 거래처 `2568700899`와 같은 품목 `AC060CS1PBH1SY`를 입력했다. 판매전표의 기존 규칙에 따라 세트가 구성품으로 전개됐고, 첫 행은 `AC060CN1PBH1 / 무풍 1way 냉난방 실내기`였다. 저장하지 않고 같은 `getBoundingClientRect()` 방식으로 열만 대조했다.

```text
1440×900
  모델명 헤더/행 = 183px / 183px
  품목명 헤더/행 = 183px / 183px
  모델명 헤더 텍스트 line rect = 1개
  품목명 헤더 텍스트 line rect = 1개
  헤더/행 칸 수 = 12 / 12

1920×1080
  모델명 헤더/행 = 423px / 423px
  품목명 헤더/행 = 423px / 423px
  모델명 헤더 텍스트 line rect = 1개
  품목명 헤더 텍스트 line rect = 1개
  헤더/행 칸 수 = 12 / 12
```

판매전표도 모델명·품목명에 동일 비율을 주며 두 열이 같은 폭으로 렌더된다. 견적은 판매전표보다 선택/드래그 칸이 적어 가용 폭이 더 크지만, 핵심 기준인 두 열 동등 배분과 최소 폭 보존이 실제 렌더에서도 성립했다.

### R4-5. 헤더 칸 수 vs 행 칸 수

- 견적: 1440px `10 vs 10`, 1920px `10 vs 10`.
- 판매전표 대조: 1440px `12 vs 12`, 1920px `12 vs 12`.
- 견적 행 내부의 협업 동기화 요소는 직접 grid child가 아니라 중첩된 숨은 input 1개이며 실제 rect는 `0×0px`다. 따라서 과거의 숨은 wrapper로 인한 `헤더 10칸 vs 행 11칸`은 재현되지 않았다.
- 견적 행은 좌우 padding 때문에 헤더보다 모델명 행이 좌측 4px, 품목명 행이 좌측 2px 이동하고 각각 2px 좁지만, 열 순서·경계·후속 열 대응은 일치한다.

### R4-6. `R2-DEFECT-1` 판정

**해소.** Round 2에서 1440px 품목명 헤더·행이 각각 18px로 붕괴했던 동일 조건에서 Round 4 실측은 품목명 헤더 `238px`, 행 `236px`다. 헤더 `품목명`의 text line rect가 1개이고 실제 값 `무풍 1way 냉난방`이 화면에서 정상 식별된다. 1920px도 헤더 `478px`, 행 `476px`로 정상이다. 따라서 기존 `R2-DEFECT-1`을 **해소로 정정**한다.

스크린샷 SHA-256:

```text
round4-estimate-1440.png  0BD74087049C3B390B5C5AC2D65B9266AD01B849578BF39A47116D48B864D348
round4-estimate-1920.png  1C8FC20D8D481657BCFE76BB52E582497E3631C345874BF23B6DC86944D773DB
```

### R4-7. 머지 권고

**머지를 권고한다.** Round 4에서 마지막 미해결 항목 `R2-DEFECT-1`이 동일 조건 실측으로 해소됐다. Round 3에서 확인된 나머지 게이트와 합쳐 PR #1197의 라이브 QA 차단 결함은 0건이다.
