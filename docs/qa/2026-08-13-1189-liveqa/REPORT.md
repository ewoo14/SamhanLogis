# #1189 검수완료 전표 되돌림 라이브 QA 보고서

- 수행 시각: 2026-08-13 14:26~14:29 KST
- 대상: 개발책임자 제공 기준 `feat/1142-completed-slip-revert` / `b11f025ea`
- 판정: **BLOCKED — RAM 안전 하한 도달로 GUI 시나리오 1~9 미수행**
- 제품 결함 수: **판정 불가**. 미수행을 결함 0건으로 기록하지 않는다.

## 1. 환경 확인

### 1.1 실행 제약 준수

- git 명령: 0회. 따라서 브랜치와 HEAD는 개발책임자가 제공한 값을 적었으며 독립 확인하지 않았다.
- 코드 수정: 0건.
- Gradle: 0회.
- Docker 재빌드·재기동: 0회.
- 합성 이미지·fixture·mock: 0건.
- `clients/web/design-system/dist` 부재를 확인해 지시된 `npm ci`와 `npm run build`만 실행했다. 빌드는 성공했다.
- 브라우저 자동화: gstack browse 기본 Chromium 세션 1개, context 1개로 시작했다. worker 병렬 실행은 하지 않았다.

### 1.2 RAM 원문

| 시점 | 가용 물리 RAM | 판정 |
|---|---:|---|
| design-system 준비 전 | 2.36GB | 시작 가능 |
| design-system 빌드 후 | 2.77GB | 시작 가능 |
| Chromium 세션으로 `http://127.0.0.1:8080/` 진입 직후 | **1.56GB** | **중단선 1.8GB 미만** |
| 자동화 서버 중단 시도 후 | 1.99GB | 자원 일부 회수, QA 재개하지 않음 |

`browse stop`은 서버 연결 종료 뒤 `Server crashed twice in a row`로 종료 코드를 1로 반환했다. 이후 `chrome-headless-shell` 프로세스는 남지 않았다. 사용자의 일반 Chrome `Profile 3` 프로세스는 임의 종료하지 않았다.

### 1.3 호출 API 원문

보안상 비밀번호, JWT, `Set-Cookie` 값만 `[REDACTED]`로 치환했다. 나머지 상태·본문은 실서버 응답이다.

#### A. 게이트웨이 health

```http
GET http://127.0.0.1:8080/actuator/health

HTTP/1.1 200 OK
Content-Type: application/vnd.spring-boot.actuator.v3+json
Content-Length: 15

{"status":"UP"}
```

#### B. 로그인

```http
POST http://127.0.0.1:8080/api/auth/login
Content-Type: application/json

{"loginId":"dev_master","password":"[REDACTED]"}

HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"code":"OK","message":"성공","data":{"token":"[REDACTED]","userId":"a0000000-0000-0000-0000-000000000001","role":"MASTER","displayName":"[DEV-SEED] 개발마스터","partnerCode":null,"groups":[{"id":"00000000-0000-0000-0000-000000000100","name":"마스터","builtin":true}]},"timestamp":"2026-08-13T05:26:48.253344516Z"}
```

참고: 성공 호출 전에 PowerShell `curl.exe --data-binary`의 따옴표가 잘못 전달된 운영자 측 시도 2회가 각각 HTTP 400 `INVALID_INPUT`을 반환했다. 같은 JSON을 `HttpClient` UTF-8 본문으로 보내자 즉시 200이므로 제품 결함으로 판정하지 않았다.

#### C. 창고 목록

```http
GET http://127.0.0.1:8080/api/inventory/warehouses
Authorization: Bearer [REDACTED]

HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"code":"OK","message":"성공","data":[{"id":"WrFM9tl-QMS5kQwE72D-6Q","code":"1","name":"서초창고","type":"HEADQUARTERS","address":null,"displayOrder":1,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"jPCu3ahWTaunBOZIytEuAw","code":"00001","name":"위니아-일산서부","type":"HEADQUARTERS","address":null,"displayOrder":1,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"EREREREREREREQAAAAAAAQ","code":"HQ-001","name":"본사창고","type":"HEADQUARTERS","address":"서울시 강남구 본사","displayOrder":1,"description":"본사 보유 메인 창고","createdAt":"2026-05-12T08:59:58.388557","createdBy":"system","modifiedAt":null,"modifiedBy":null},{"id":"ieDrHTg9R1-f-L9axXf-9w","code":"2","name":"상일물류","type":"HEADQUARTERS","address":null,"displayOrder":2,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"EREREREREREREQAAAAAAAg","code":"VH-001","name":"1호차 차량재고","type":"VEHICLE","address":null,"displayOrder":2,"description":"출장 차량 이동 재고 (창고원/기사 단위)","createdAt":"2026-05-12T08:59:58.388557","createdBy":"system","modifiedAt":null,"modifiedBy":null},{"id":"HFFji_HTS7OzqYxXVR1duw","code":"00002","name":"이창성(공항공사_49차_6372)","type":"HEADQUARTERS","address":null,"displayOrder":2,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"VzFO-5K-Q86LL01T3UX80Q","code":"00003","name":"삼성창고 (초월 무갑)","type":"HEADQUARTERS","address":null,"displayOrder":3,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"EREREREREREREQAAAAAAAw","code":"CS-001","name":"거래처 위탁창고","type":"CONSIGNMENT","address":null,"displayOrder":3,"description":"거래처에 위탁한 재고 (소유권은 자사)","createdAt":"2026-05-12T08:59:58.388557","createdBy":"system","modifiedAt":null,"modifiedBy":null},{"id":"IWQQdXKEQIiihNJmRMbM8g","code":"3","name":"광주창고","type":"HEADQUARTERS","address":null,"displayOrder":3,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"EREREREREREQAAAAAABA","code":"VR-001","name":"가상창고","type":"VIRTUAL","address":null,"displayOrder":4,"description":"삼성 직배/반품/서비스 인보이스 등 비물리 — IN_TRANSIT 스킵","createdAt":"2026-05-12T08:59:58.388557","createdBy":"system","modifiedAt":null,"modifiedBy":null},{"id":"om2LB5LhQ6W3yDiO10tQiw","code":"00004","name":"61차 - 김포물류 (한실물류)","type":"HEADQUARTERS","address":null,"displayOrder":4,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"5byNfLe7QCus7wez6Mxk7g","code":"4","name":"방주창고","type":"HEADQUARTERS","address":null,"displayOrder":4,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"Pi5eS-fHQdWaGCOY8A9gAA","code":"5","name":"다짐창고","type":"HEADQUARTERS","address":null,"displayOrder":5,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"4tx_Cm2QTzWhw6Dlp2qvWQ","code":"6","name":"위니아-서부","type":"HEADQUARTERS","address":null,"displayOrder":6,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"yzyGsiZgSjylQrDsECbYGw","code":"7","name":"위니아-북부","type":"HEADQUARTERS","address":null,"displayOrder":7,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"2lTpbz91ReKb6QBmBQ3Yzw","code":"8","name":"위니아-동부","type":"HEADQUARTERS","address":null,"displayOrder":8,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"j1sw5ed0REufUB93gy3Vng","code":"9","name":"엘에스공조창고","type":"HEADQUARTERS","address":null,"displayOrder":9,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"YenBxNLSS9ajRc6i48GunQ","code":"10","name":"이정후기사창고","type":"HEADQUARTERS","address":null,"displayOrder":10,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"Fm5Xn6P4SkmA7hLEtPPzZw","code":"11","name":"용인물류","type":"HEADQUARTERS","address":null,"displayOrder":11,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"RiTGf-y4T_KSI_7UEUUiYg","code":"12","name":"김포물류","type":"HEADQUARTERS","address":null,"displayOrder":12,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"8Lo_HoNVSVO0wKFkywNTTg","code":"13","name":"드림에어컨","type":"HEADQUARTERS","address":null,"displayOrder":13,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"3igBjGfFT7azV6emJhJUBw","code":"14","name":"온라인창고","type":"HEADQUARTERS","address":null,"displayOrder":14,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"ccLczAEIRZK7IZAsAMyazQ","code":"15","name":"파레트 창고","type":"HEADQUARTERS","address":null,"displayOrder":15,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"GP4DfXa0Td-9mRMVGsdlpw","code":"16","name":"2025-76차 공항 김포창고","type":"HEADQUARTERS","address":null,"displayOrder":16,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"a8tBQ1Y1Tn2QNysCRzI1Wg","code":"2381","name":"조달창고","type":"HEADQUARTERS","address":null,"displayOrder":2381,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"WFcEGiQHS_6VDnrBUW1s_A","code":"11151","name":"오실장창고","type":"HEADQUARTERS","address":null,"displayOrder":11151,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"yX1fp0OTTPex_7sEpOqwFQ","code":"11152","name":"삼한창고 (무갑리)","type":"HEADQUARTERS","address":null,"displayOrder":11152,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"o3VRWGLFTGe7z_MxXSdd5w","code":"11153","name":"2022-63차 공항 김포창고","type":"HEADQUARTERS","address":null,"displayOrder":11153,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"_aUeBaM3QTWMx1ORbf58HA","code":"11154","name":"2023-71차 공항 김포창고","type":"HEADQUARTERS","address":null,"displayOrder":11154,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null},{"id":"NtIFS_VDTuOon_swybc5bw","code":"11155","name":"2025-공항공사 초월창고","type":"HEADQUARTERS","address":null,"displayOrder":11155,"description":"추가사업장=(주)삼한공조시스템","createdAt":"2026-05-22T07:51:55.435175","createdBy":"a0000000-0000-0000-0000-000000000001","modifiedAt":null,"modifiedBy":null}],"timestamp":"2026-08-13T05:27:02.525777173Z"}
```

창고 `id`는 30/30건 모두 UUID 문자열이 아니라 URL-safe Base64 형태의 **22자 opaque token**이었다. 예: `WrFM9tl-QMS5kQwE72D-6Q`, `EREREREREREQAAAAAAAQ`. 다만 이 토큰을 GUI가 요청 경계에서 정상 전송하는지는 RAM 중단으로 확인하지 못했다.

## 2. 시나리오 1~9 실측

| 번호 | 시나리오 | HTTP status | GUI 결과 | 스크린샷 |
|---:|---|---|---|---|
| 1 | 판매전표 신규 작성: 출고창고 선택 → 저장 | 미호출 | **관측 불가** | 없음 |
| 2 | 입고전표 신규 작성: 입고창고 선택 → 저장 | 미호출 | **관측 불가** | 없음 |
| 3 | 재고이동 신규 작성: 출발·도착 창고 선택 → 저장 | 미호출 | **관측 불가** | 없음 |
| 4 | 재고실사 신규 등록: 창고 선택 → 저장 | 미호출 | **관측 불가** | 없음 |
| 5 | 재고실사 목록 창고 필터 | 미호출 | **관측 불가** | 없음 |
| 6 | 재고현황 창고별 조회 | 미호출 | **관측 불가** | 없음 |
| 7 | 안전재고를 선택 창고에 설정 | 미호출 | **관측 불가** | 없음 |
| 8 | 안전재고 창고 필터 후 선택 창고 알림 표시 | 미호출 | **관측 불가** | 없음 |
| 9 | 검수완료 전표 상세의 되돌림 판정과 판정 전후 전표·재고·배차 불변 | 미호출 | **관측 불가**. S1 판정 endpoint도 호출하지 않음 | 없음 |

`screenshots/`에는 실제 캡처가 없다. 중단선 도달 뒤 캡처를 만들기 위해 브라우저를 계속 조작하지 않았다.

## 3. 도달 가능한 결함

### 제품 결함

판정할 수 없다. 핵심 GUI 경로 1~9를 밟지 못했으므로 “결함 0”이 아니다.

### 환경 차단

- 무엇이: Playwright Chromium 세션 시작 직후 가용 RAM이 2.77GB에서 1.56GB로 감소했다.
- 어디서: `http://127.0.0.1:8080/`에 첫 진입한 직후.
- 어떤 입력으로: 브라우저 1개·기본 context 1개. 추가 worker나 두 번째 browser/context는 만들지 않았다.
- 무엇이 잘못됐는가: 지정된 1.8GB 안전 하한 아래로 내려가 즉시 중단해야 했다. gateway `/` 자체에는 상호작용 가능한 GUI가 없었고, renderer 기동 전 중단됐다.

## 4. 표 정렬 확인 결과

관측 불가. 표가 있는 제품 화면에 도달하지 못했으므로 헤더와 입력 행 정렬을 확인하지 않았다.

## 5. 관측 불가 목록 · 증거 무결성

- 관측 불가: 시나리오 1~9 전체, 각 저장/조회 요청의 HTTP status, UI 성공·오류 메시지, 표 정렬, 시나리오 9 판정 전후 전표·재고·배차 비교.
- raw UUID 하위 호환: 미확인. raw UUID를 요청에 보내지 않았다.
- 확인된 범위: gateway health 200, 로그인 200, `/api/inventory/warehouses` 200, 창고 응답 `id` 30/30 opaque token.
- 스크린샷: 0장. 합성·fixture·mock 캡처도 0장.
- 데이터 변경: 시나리오 저장 API와 S1 판정 API를 호출하지 않았으므로 이번 QA로 발생한 업무 데이터 변경은 없다.
- 자원 안전: 중단선 도달 후 GUI·API 시나리오를 재개하지 않았다.

---

# 라운드 2 — 정상 경로 1~8 실측

- 수행 시각: 2026-08-13 14:50~15:09 KST
- 대상: 개발책임자 제공 기준 `feat/1142-completed-slip-revert` / `b11f025ea` / CI 45/45 green
- 판정: **시나리오 1~8 PASS. 창고 ID 요청 경계에서 HTTP 400은 0건이었다.**
- 핵심 생성 결과: 판매전표·입고전표·재고이동·재고실사 모두 창고 opaque token을 보내 HTTP 201로 생성됐다.
- 추가 관측: 재고이동은 저장 직후 목록이 비어 있고 새로고침 후에만 생성 건이 보였다. 재고현황 본사창고 첫 페이지는 50행 모두 제품 마스터 참조가 끊겨 있었다.
- 시나리오 9: **관측 불가**. 현재 실 DB의 `COMPLETED` 전표가 0건이었다. 미수행을 통과나 결함 0건으로 세지 않는다.

## R2-1. 환경 확인

### R2-1.1 실행 제약과 자원

| 항목 | 실측 |
|---|---|
| git | 0회. 브랜치·HEAD·CI는 개발책임자 제공값이며 독립 확인하지 않았다. |
| 코드 수정 | 0건. 본 `REPORT.md`와 실스크린샷만 QA 산출물로 추가했다. |
| Gradle | 0회 |
| Docker 재빌드·재기동 | 0회 |
| test runner / worker | 0회 / 0개 |
| renderer | `clients/desktop`, mock 환경변수 미사용, Vite `http://127.0.0.1:5189` |
| 브라우저 | Chromium 동시 최대 1개, context 1개, page 1개 |
| 의존성 | `clients/desktop/node_modules` 부재로 `npm ci --no-audit --no-fund` 1회(1,017 packages). design-system `dist`는 이미 있어 빌드하지 않았다. |
| 시작 가용 RAM | 4.18GB |
| Chromium 실행 중 최저 실측 | 2.80GB |
| 종료 후 가용 RAM | 3.45GB |
| 중단선 위반 | 없음. 1.0GB 아래로 내려간 적 없음 |

첫 브라우저 제어 커널은 입고 품목 선택 중 30초 timeout으로 자동 종료됐다. 당시 저장 요청은 보내지 않았다. 잔존 Chromium 0을 확인한 뒤 두 번째 단일 브라우저/context/page로 이어갔다. 두 브라우저가 동시에 존재한 적은 없다.

시작과 종료 시 아래 12개 컨테이너가 모두 `healthy`였다.

```text
postgres redis eureka api-gateway auth user product slip inventory dc-config partner rabbitmq
```

QA 종료 시 Chromium 0개, Vite listener 0개를 확인했고, 본 QA가 띄운 Vite PID만 종료했다.

### R2-1.2 호출 API 원문

보안상 비밀번호와 JWT만 `[REDACTED]`로 치환했다.

#### A. 게이트웨이 health

```http
GET http://127.0.0.1:8080/actuator/health

HTTP 200
{"status":"UP"}
```

#### B. 실 GUI 로그인 요청

standalone renderer에는 Electron token 저장 bridge가 없어 POST 200 뒤 후속 `/auth/me`가 401로 로그아웃됐다. 같은 실 JWT를 현재 context의 `window.samhanAuth`에 주입해 실제 화면을 열었다. 이는 제품 로그인 저장 동작의 통과 판정이 아니라 renderer QA 하네스다.

```http
POST http://localhost:8080/auth/login
Content-Type: application/json

{"loginId":"dev_master","password":"[REDACTED]"}

HTTP 200
{"success":true,"code":"OK","message":"성공","data":{"token":"[REDACTED]","userId":"a0000000-0000-0000-0000-000000000001","role":"MASTER","displayName":"[DEV-SEED] 개발마스터","partnerCode":null,"groups":[{"id":"00000000-0000-0000-0000-000000000100","name":"마스터","builtin":true}]},"timestamp":"2026-08-13T05:50:45.806775785Z"}
```

#### C. 창고 목록과 ID 형태

```http
GET http://127.0.0.1:8080/api/inventory/warehouses
Authorization: Bearer [REDACTED]

HTTP 200
count=30
opaque22=30
rawUuid=0
invalid=0

sample:
WrFM9tl-QMS5kQwE72D-6Q | 1      | 서초창고
jPCu3ahWTaunBOZIytEuAw | 00001  | 위니아-일산서부
EREREREREREREQAAAAAAAQ | HQ-001 | 본사창고
ieDrHTg9R1-f-L9axXf-9w | 2      | 상일물류
EREREREREREREQAAAAAAAg | VH-001 | 1호차 차량재고
```

이 라운드에서 창고 ID로 오간 값은 모두 URL-safe Base64 형태의 22자 opaque token이었다.

| 경계 | 필드 | 값 형태 |
|---|---|---|
| 창고 목록 응답 | `data[].id` | 30/30 opaque, raw UUID 0 |
| 판매전표 생성 요청 | `sourceWarehouseId` | `EREREREREREREQAAAAAAAQ` |
| 입고전표 생성 요청 | `destinationWarehouseId` | `EREREREREREREQAAAAAAAQ` |
| 재고이동 생성 요청 | `sourceWarehouseId`, `destinationWarehouseId` | `ERER...AAQ`, `ERER...AAw` |
| 재고실사 생성 요청 | `warehouseId` | `EREREREREREREQAAAAAAAw` |
| 실사·재고 조회 query | `warehouseId` | opaque |
| 안전재고 설정 요청 | `warehouseId` | opaque |
| 안전재고 알림 응답 | `warehouseId` | opaque |

비창고 식별자는 이번 PR 핵심 판정에서 분리했다. 재고이동·재고실사·안전재고 응답의 일부 `id`/`productId`와 재고실사 상세 URL에는 raw UUID가 남아 있었다. 이는 아래 범위 밖 보조 관측에 기록한다.

## R2-2. 시나리오 1~8 실측

### 1. 판매전표 신규 — 출고창고 선택 → 저장

- GUI: 홈 `새 판매전표` → 출고창고 `HQ-001 · 본사창고` → 품목 `AM100ANHDBH1` 1개 → 메모 입력 → 저장.
- 창고 목록: `GET /inventory/warehouses` → HTTP 200, 30건.
- 저장 요청/응답:

```http
POST http://localhost:8080/slips

{"slipType":"OUTBOUND","slipDate":"2026-08-13","sourceWarehouseId":"EREREREREREREQAAAAAAAQ","memo":"QA1189-R2 판매 opaque 창고","lines":[{"productId":"itC78Z-bRYS-qenO87QMLQ","productName":"실내기 DUCT(고정압) 28평형","modelName":"AM100ANHDBH1","quantity":1,"unitPrice":"1001000","priceVatInclusive":true}]}

HTTP 201
slipNo=2026/08/13-2
status=DRAFT
sourceWarehouseId=EREREREREREREQAAAAAAAQ
```

- GUI 결과: 판매전표 상세 `2026/08/13-2`, 메모·1라인·총액 1,001,000원 표시.
- 판정: **PASS. HTTP 400 없음.**
- 증거: `screenshots/round2-02b-sales-ready.png`, `screenshots/round2-02c-sales-saved.png`.

### 2. 입고전표 신규 — 입고창고 선택 → 저장

- GUI: 구매관리 `신규 입고전표` → 입고창고 `HQ-001 · 본사창고` → 같은 품목 1개 → 메모 입력 → 저장.
- 저장 요청/응답:

```http
POST http://localhost:8080/slips

{"slipType":"INBOUND","slipDate":"2026-08-13","destinationWarehouseId":"EREREREREREREQAAAAAAAQ","memo":"QA1189-R2 입고 opaque 창고","lines":[{"productId":"itC78Z-bRYS-qenO87QMLQ","productName":"실내기 DUCT(고정압) 28평형","modelName":"AM100ANHDBH1","quantity":1,"unitPrice":"1001000","priceVatInclusive":true}]}

HTTP 201
slipNo=2026/08/13-1
status=DRAFT
destinationWarehouseId=EREREREREREREQAAAAAAAQ
```

- GUI 결과: 구매관리 총 2건 → 3건, 첫 행에 `2026/08/13-1`, 본사창고, 임시저장 표시.
- 판정: **PASS. HTTP 400 없음.**
- 증거: `screenshots/round2-03c-purchase-ready.png`, `screenshots/round2-03d-purchase-saved.png`.

### 3. 재고이동 신규 — 출발·도착 창고 → 저장

- GUI: 재고이동 관리 `새 이동전표` → 출발 `HQ-001 · 본사창고` → 도착 `CS-001 · 거래처 위탁창고` → `AM100ANHDBH1` 1개 → 저장.
- 저장 요청/응답:

```http
POST http://localhost:8080/inventory/transfers

{"sourceWarehouseId":"EREREREREREREQAAAAAAAQ","destinationWarehouseId":"EREREREREREREQAAAAAAAw","reason":"REBALANCE","reasonDetail":"QA1189-R2 opaque 창고 이동","lines":[{"productId":"8ad0bbf1-9f9b-4584-bea9-e9cef3b40c2d","requestedQuantity":1}]}

HTTP 201
transferNo=2026/08/13-1
status=REQUESTED
sourceWarehouseId=EREREREREREREQAAAAAAAQ
destinationWarehouseId=EREREREREREREQAAAAAAAw
```

- 판정: **창고 요청 경계 PASS. HTTP 400 없음.**
- 별도 UI 결함: POST 201 직후 리다이렉트된 목록은 `등록된 이동전표가 없습니다.`를 표시했고 GET 재조회도 없었다. 브라우저 새로고침 뒤 `GET /inventory/transfers?page=0&size=20` → HTTP 200, `2026/08/13-1` 1행이 나타났다.
- 증거: 저장 직후 `screenshots/round2-04c-transfer-saved.png`, 새로고침 후 `screenshots/round2-04d-transfer-after-reload.png`.

### 4. 재고실사 신규 — 창고 선택 → 저장

- GUI: 재고 실사 `신규 실사` → `CS-001 · 거래처 위탁창고` → 2026-08-13 → 실사 등록.
- select option의 실제 value도 `EREREREREREREQAAAAAAAw`였다.
- 저장 요청/응답:

```http
POST http://localhost:8080/inventory/audits

{"warehouseId":"EREREREREREREQAAAAAAAw","auditDate":"2026-08-13"}

HTTP 201
auditNo=2026/08/13-1
status=PLANNED
warehouseId=EREREREREREREQAAAAAAAw
warehouseCode=CS-001
warehouseName=거래처 위탁창고
```

- 상세 조회: `GET /inventory/audits/{id}` 및 `/realtime`, `/audit-logs` 모두 HTTP 200.
- 선택 창고에 활성 재고가 없어 snapshot 라인은 0건이었다. 이는 생성 실패로 세지 않는다.
- 판정: **PASS. HTTP 400 없음.**
- 증거: `screenshots/round2-05b-count-ready.png`, `screenshots/round2-05c-count-saved.png`.

### 5. 재고실사 목록 창고 필터

- GUI: 재고 실사 목록의 창고 필터에서 `CS-001 · 거래처 위탁창고` 선택.

```http
GET http://localhost:8080/inventory/audits?page=0&size=50&warehouseId=EREREREREREREQAAAAAAAw

HTTP 200
totalElements=1
auditNo=2026/08/13-1
warehouseId=EREREREREREREQAAAAAAAw
```

- GUI 결과: 선택 창고의 방금 생성한 실사 1행만 표시.
- 판정: **PASS.**
- 증거: `screenshots/round2-06-audit-filter.png`.

### 6. 재고현황 창고별 조회

- GUI: 창고 운영 → 재고 현황 → `본사창고` → 조회.

```http
GET http://localhost:8080/inventory/balances?page=0&size=50&warehouseId=EREREREREREREQAAAAAAAQ

HTTP 200
pageCount=50
total=103
warehouseCode=HQ-001
warehouseName=본사창고
```

- GUI 결과: 본사창고 재고 50행과 `총 103건`, `1 / 3` 표시.
- 판정: **창고별 조회 경로 PASS.**
- 별도 데이터 결함: 첫 페이지 50행 전부 품목코드 `참조 끊김`, 품목명 `제품 마스터 없음`으로 표시됐다. 재고 수량은 보이나 사용자가 실제 품목을 식별할 수 없다.
- 증거: `screenshots/round2-07-stock-by-warehouse.png`.

### 7. 안전재고를 선택 창고에 설정

- GUI: 안전재고 알림 → 제품 `QA-825-S5-LIVE` → 창고 `거래처 위탁창고` → 임계값 2 → 저장.

```http
POST http://localhost:8080/inventory/products/HZ6BFlbRT3eQIMTr2xpS7Q/safety-stock

{"warehouseId":"EREREREREREREQAAAAAAAw","threshold":2,"scopeMode":"SELECTED"}

HTTP 201
warehouseId=EREREREREREREQAAAAAAAw
threshold=2
```

- GUI 결과: `안전재고 설정을 저장했습니다.`와 함께 임계 미만 6건 → 7건, 거래처 위탁창고 알림 행 추가.
- 판정: **PASS. HTTP 400 없음.**
- 증거: `screenshots/round2-08a-safety-ready.png`, `screenshots/round2-08b-safety-saved.png`.

### 8. 안전재고 창고 필터 → 선택 창고 알림 표시

- GUI: 상단 창고 필터에서 `거래처 위탁창고` 선택.
- 필터 변경 자체는 새 HTTP 요청 없이 이미 받은 7건을 client-side로 필터했다.
- 필터 상태에서 `새로고침`을 눌러 서버 원문을 다시 받았다.

```http
GET http://localhost:8080/inventory/alerts/safety-stock

HTTP 200
count=7
selected row:
{"productCode":"QA-825-S5-LIVE","productName":"QA-825-S5-LIVE","warehouseId":"EREREREREREREQAAAAAAAw","warehouseName":"거래처 위탁창고","threshold":2,"currentQty":0,"shortage":2}
```

- GUI 결과: 새로고침 전후 모두 선택 창고의 `QA-825-S5-LIVE` 알림 1행만 표시. 선택값과 응답의 `warehouseId`가 같은 opaque token이었다.
- 직전 시도의 `opaque 선택값` 대 `raw 응답` 비교로 0건이 되던 증상은 재현되지 않았다.
- 판정: **PASS.**
- 증거: `screenshots/round2-09-safety-filter-visible.png`, `screenshots/round2-09b-safety-filter-refreshed.png`.

### 9. 검수완료 전표 상세의 되돌림 판정

```http
GET http://127.0.0.1:8080/api/slips/revertability
HTTP 200
count=0

GET http://127.0.0.1:8080/api/slips?status=COMPLETED&page=0&size=50
HTTP 200
count=0
```

- 현재 실 DB에 `COMPLETED` 전표가 없어 판정 카드를 표시할 상세 대상이 없다.
- `CONFIRMED` 판매전표 `2026/08/04-5` 상세에는 진입했지만 S1 대상이 아니며, 되돌림 가능성 카드도 호출도 없었다. 이 화면을 시나리오 9 통과 증거로 사용하지 않는다.
- 전표·재고·배차 판정 전후 불변성: **관측 불가**. 판정할 완료 전표가 없었다.
- 되돌림 실행: 0회. 권한·범위·연결처리·이력 단계에 진입하지 않았다.
- 보조 캡처: `screenshots/round2-10-revertability-detail.png`는 `CONFIRMED` 비대상 대조 화면이다.

## R2-3. 도달 가능한 결함

### 제품 경로 결함

1. **[MEDIUM] 재고이동 생성 후 목록이 자동 갱신되지 않는다.**
   - 입력: 본사창고 → 거래처 위탁창고, AM100ANHDBH1 1개.
   - 서버: POST `/inventory/transfers` HTTP 201, `2026/08/13-1` 생성.
   - 사용자 증상: 저장 직후 목록은 빈 상태를 표시한다. 새로고침 뒤에만 GET 200과 생성 행이 보인다.
   - 증거: `round2-04c-transfer-saved.png` → `round2-04d-transfer-after-reload.png`.
   - 중복 업무데이터 생성을 피하기 위해 두 번째 transfer를 만들지는 않았다. 1회 실측임을 명시한다.

2. **[MEDIUM, 데이터 품질] 본사창고 재고현황 첫 페이지 50행이 모두 제품 마스터 참조 끊김이다.**
   - 요청: GET `/inventory/balances?...warehouseId=ERER...AAQ` HTTP 200.
   - 사용자 증상: 품목코드 `참조 끊김`, 품목명 `제품 마스터 없음`만 반복돼 어느 재고인지 식별할 수 없다.
   - 창고 opaque token 회귀와는 별도이며, 실데이터/참조 정합성 문제로 분리한다.

### 범위 밖 보조 관측

- 재고실사 상세 URL `#/warehouse/audit/48e0e02e-8334-44d8-a0f1-9bff2618244d`와 일부 비창고 응답 필드에 raw UUID가 남아 있다. 이번 라운드의 창고 ID 계약은 통과했지만 저장소의 사용자 UUID 비공개 원칙 관점에서는 별도 후속 확인 대상이다.
- renderer에서 QA 불필요 서비스를 정지한 환경 때문에 `app/version`, 공지, 알림, `logs/front`, 거래처 잔액 회계 호출에서 HTTP 503이 반복됐다. 필수 시나리오의 업무 endpoint 400/403/404/500은 0건이었다.
- 콘솔 집계: error 34건은 모두 resource HTTP 503, warning 116건은 Pretendard decode/OTS 108건과 app-version/app-notice/activity-log/React Router 경고였다. 필수 저장·조회 실패를 만든 JS page error는 관측되지 않았다.

## R2-4. 표 정렬 확인 결과

관측한 표에서 헤더와 데이터/입력 행의 열 위치가 한 칸씩 어긋난 결함은 없었다.

| 화면 | 열 수 | 결과 |
|---|---:|---|
| 판매 품목 검색 모달 | 5 | header와 첫 행 x/width 일치 |
| 판매전표 신규 입력 grid | 10개 표시 열 | 헤더와 1~5 입력 행 시각 정렬 일치 |
| 판매전표 상세 라인 | 10 | header와 첫 행 x/width 일치 |
| 구매관리 목록 | 14 | header와 첫 행 x/width 일치 |
| 입고전표 신규 입력 grid | 10개 표시 열 | 헤더와 1~5 입력 행 시각 정렬 일치 |
| 재고이동 목록 | 6 | 저장 후 새로고침 행과 header x/width 일치 |
| 재고실사 목록 | 5 | header와 첫 행 x/width 일치 |
| 재고실사 상세 | 7 | 데이터 0건이라 행 정렬은 관측 불가, empty colspan만 정상 |
| 재고현황 | 8 | header와 첫 행 x/width 일치 |
| 안전재고 알림 | 7 | 전체/필터 1행 모두 header와 x/width 일치 |

재고이동의 최초 빈 목록과 재고실사 상세의 빈 snapshot 표는 데이터 행이 없어 “행 정렬 통과”로 세지 않았다.

## R2-5. 관측 불가 목록 · 증거 무결성

### 관측 불가

- 시나리오 9의 실제 `COMPLETED` 전표 상세 카드, single 판정, 판정 전후 전표·재고·배차 비교: 완료 전표 0건으로 관측 불가.
- 재고실사 상세의 실제 snapshot 데이터 행 정렬: 선택한 거래처 위탁창고에 활성 재고가 없어 0행.
- 재고이동 목록 자동 갱신 결함의 두 번째 생성 재현: 중복 업무데이터 생성을 피하려고 추가 생성하지 않음.

### 실제 생성·변경된 업무데이터

| 유형 | 식별자 | 상태/값 |
|---|---|---|
| 판매전표 | `2026/08/13-2` | DRAFT, 본사창고, 메모 `QA1189-R2 판매 opaque 창고` |
| 입고전표 | `2026/08/13-1` | DRAFT, 본사창고, 메모 `QA1189-R2 입고 opaque 창고` |
| 재고이동 | `2026/08/13-1` | REQUESTED, HQ-001 → CS-001 |
| 재고실사 | `2026/08/13-1` | PLANNED, CS-001, snapshot 0행 |
| 안전재고 | `QA-825-S5-LIVE` / CS-001 | threshold 2, scopeMode SELECTED |

합성·fixture·mock 데이터/화면은 사용하지 않았다. 사용자가 요구한 실 생성이므로 위 업무데이터는 정리·삭제하지 않았다. 되돌림 실행이나 전표 상태 변경은 수행하지 않았다.

### 스크린샷 무결성

모두 실제 renderer + 실제 gateway/service/DB의 PNG이며 `round2-` 접두를 사용했다.

| 파일 | 크기 | SHA-256 |
|---|---:|---|
| `round2-00-entry.png` | 1440x900 | `6BA4AD45F155319B94BB904DBAA9C03BA4CBBA8A04DF113A55E916A256DBF074` |
| `round2-01-dashboard.png` | 1440x962 | `22CCEACE82C4B03FF53341A6A8C3667EC1F072B638BEABEA67BFEACF594AA563` |
| `round2-02-sales-form.png` | 1440x1692 | `AD0C4101EFEAFAD805BC49D838F6A76321D27AF5214281DCAB625C1100D5E332` |
| `round2-02a-sales-product-table.png` | 1440x1692 | `65A3BAA497FEF7A2D10DA7049434579F12ACE6F380796FA306E6C705416C211C` |
| `round2-02b-sales-ready.png` | 1440x1692 | `48023C5394A43C94B67F9F612D9EFECC8F8AE1C026D62107C208F1420BE955AD` |
| `round2-02c-sales-saved.png` | 1440x1868 | `5CEC06A7947D9C0C554BBC5E70DAAD42A48408C4D8CE38C1CFD53A16C01A5CB6` |
| `round2-03a-purchase-list.png` | 1440x900 | `CC68FB0DD77294DB6D15B2694D8A27F2B0BC16711321A4F1DAFE2498B8637821` |
| `round2-03b-purchase-form.png` | 1440x1465 | `80325E95B748C675C22528D491E55532DB058256D07856B93C3F567AC9B6E881` |
| `round2-03c-purchase-ready.png` | 1440x1465 | `D013B0ECF9D53494C6DDF492FB48EA16E2A282F42B3C67174D5C9FD9AE6F99A7` |
| `round2-03d-purchase-saved.png` | 1440x900 | `818A6E397CE3C1350424D109068BDA3006E4A7F1691E0F1F1A868243BBE01510` |
| `round2-04a-transfer-list.png` | 1440x900 | `F980AB95ED71D5BC984A001F62A67C422CACEC59A409893254E60654831D0030` |
| `round2-04b-transfer-ready.png` | 1440x900 | `A15C17F979208C88E4A1C3ACFA6BC3A61D613BCC4CBECC8B93551C7393B8BCEF` |
| `round2-04c-transfer-saved.png` | 1440x900 | `3326123162E8FD023FF53AFD800BDC3EA4CC06AEACDD68EEE909A345DEC5F2DE` |
| `round2-04d-transfer-after-reload.png` | 1440x962 | `30BA7587E57D04C3E549461CAA4BCED2C38599EEB822551807379039CD7F04F8` |
| `round2-05a-count-list.png` | 1440x900 | `39C030191FB0E55F5AA2B1E92379E2D91C2326E1087325C296F15A46CC47378C` |
| `round2-05b-count-ready.png` | 1440x900 | `09B8103DC7C62A16AB3ECE1226D9C10132C411C1E494A48E5AD8A469BBD30B44` |
| `round2-05c-count-saved.png` | 1440x900 | `C30767540020C76484002F5A673E21318ECF7127C18DB23667CECF936AED122F` |
| `round2-06-audit-filter.png` | 1440x900 | `746616F73D7AA3966C871403DB642820897E2D58158100BA7DCC191B03ACDDDE` |
| `round2-07-stock-by-warehouse.png` | 1440x2211 | `F6D730474509169D8568678778B78768A0AD7EA9D4C92616D39CB0C9E026785F` |
| `round2-08a-safety-ready.png` | 1440x996 | `D12C4B1798E59467528804421F29382E19F44F42D80A8EB3B89554316472CF3D` |
| `round2-08b-safety-saved.png` | 1440x996 | `F0E85D6F9A08E3DFBB2AD61CFE5DDD8318765A6AD225F326E6C1CEDDE51178D5` |
| `round2-09-safety-filter-visible.png` | 1440x996 | `FDED89A63FBA91F94502821BE1B9DD0FC12AE3609F32C63A4EE176AFA11B5B4C` |
| `round2-09b-safety-filter-refreshed.png` | 1440x996 | `60A570E0DB23A760A5D6B1420B49239B2A96CE8E3BD32B09D859B4C145E41E24` |
| `round2-10-revertability-detail.png` | 1440x2012 | `6A28C54959EA2D8354AA4731B4BC81CF9B719A3CE2DE77AC9A2B9BCFA338FB30` |

---

# 라운드 3 — 재수렴

- 수행 시각: 2026-08-13, 종료 16:58 KST
- 프런트 대상: 개발책임자 제공 기준 `feat/1142-completed-slip-revert` / `225fdb913` / CI 45/45 green
- 백엔드 대상: **이전 커밋 `b11f025ea` 빌드의 기존 컨테이너 12개**
- 판정: **재고이동 캐시 fix 본체 PASS. transfer 저장 구간의 교차 query-family 호출 0건. 재고실사 warm 목록에서 별도 stale-cache 결함 1건.**
- 중요 제한: 이번 컨테이너에는 `225fdb913`의 백엔드 변경이 없다. 재고실사 상세 ID opaque 해소 여부를 비롯한 백엔드 변경은 모두 **관측 불가**이며 통과나 결함으로 판정하지 않는다.

## R3-1. 환경 확인

### R3-1.1 실행 대상과 제약 준수

| 항목 | 실측 |
|---|---|
| 컨테이너 | 시작·종료 모두 12개 healthy, gateway `/actuator/health` `UP` |
| 백엔드 빌드 | 개발책임자가 명시한 이전 커밋 `b11f025ea`. git 금지로 이미지 커밋을 독립 조회하지 않았다. |
| 프런트 renderer | 워크트리 `clients/desktop`, Vite `http://127.0.0.1:5189`; 현재 워크트리 프런트 변경을 직접 렌더링 |
| design-system | `clients/web/design-system/dist` 존재. `npm ci`·build 추가 실행 0회 |
| 브라우저 | Playwright Chromium 동시 1개, context 1개, page 1개, worker 0개 |
| git / Gradle | 각각 0회 |
| Docker 재빌드·재기동 | 0회 |
| 코드 수정 | 0건. 본 `REPORT.md`와 실제 renderer 스크린샷만 QA 산출물로 추가 |
| 합성·fixture·mock | 0건 |

standalone renderer에서는 Electron token 저장 bridge가 없어 실 GUI 로그인 POST 200 뒤 `/auth/me`가 401로 돌아오는 기존 하네스 제약이 있었다. 로그인 응답의 실 JWT를 같은 browser context의 요청 헤더에만 주입했고, 이후 `/auth/me` 200과 `[DEV-SEED] 개발마스터 · MASTER` 화면을 확인했다. 비밀번호와 JWT는 보고서·스크린샷·해시 산출물에 기록하지 않았다.

### R3-1.2 RAM과 종료 상태

| 시점 | 가용 물리 RAM |
|---|---:|
| renderer 시작 전 | 2.08GB |
| Vite 기동 뒤 | 2.13GB |
| Chromium 실행 중 최저 실측 | **1.25GB** |
| Chromium·Vite 종료 뒤 | 1.75GB |

1.0GB 중단선 아래로 내려간 적은 없다. 종료 시 Vite listener 0개, Playwright headless Chromium 0개를 확인했다. 사용자의 일반 Chrome은 조작하거나 종료하지 않았다.

## R3-2. 항목 1~3 실측

### 1. 재고이동 신규 저장 → 새로고침 없이 목록 표시

- GUI: 재고이동 관리 → `새 이동전표` → 출발 `HQ-001 · 본사창고` → 도착 `CS-001 · 거래처 위탁창고` → 사유 `재배치` → `AM100ANHDBH1` 1개 → 저장.
- 저장 전 목록: `2026/08/13-1` 1행.
- 저장 요청/응답:

```http
POST http://localhost:8080/inventory/transfers

HTTP 201
transferNo=2026/08/13-2
status=REQUESTED
```

- 같은 저장 동작에서 이어진 목록 재조회:

```http
GET http://localhost:8080/inventory/transfers?page=0&size=20

HTTP 200
totalElements=2
```

- GUI 결과: document reload 없이 `/transfers/new` → `/transfers` SPA 이동 뒤 `2026/08/13-1`, `2026/08/13-2` 2행이 표시됐다.
- DOM 연속 관측: 저장 클릭 전부터 목록 렌더 완료까지 mutation 5회에서 `등록된 이동전표가 없습니다.` 노출 **0회**. POST 201 뒤 GET 200이 실제로 발생했다.
- 판정: **PASS. 라운드 2의 “POST 201 뒤 빈 목록, 수동 새로고침 필요” 결함은 재현되지 않았다.**
- 증거: `screenshots/round3-01-transfer-list-before-1440.png`, `round3-02-transfer-ready-1440.png`, `round3-03-transfer-visible-without-reload-1440.png`, `round3-04-transfer-visible-without-reload-1920.png`.

### 2. fix가 다른 목록 캐시에 만든 표면

#### A. transfer 저장 구간의 query-family 경계

저장 클릭부터 새 목록 렌더 완료까지 실제 response는 아래 3건뿐이었다.

```text
POST /inventory/transfers                         201
GET  /auth/admin/permissions/my                  200
GET  /inventory/transfers?page=0&size=20         200
```

같은 구간의 교차 호출은 다음과 같다.

| query family | 호출 수 |
|---|---:|
| `/inventory/audits` | 0 |
| `/inventory/balances` | 0 |
| `/inventory/warehouses` | 0 |

따라서 transfer invalidation이 재고실사·재고현황·창고 목록을 함께 다시 부르는 현상은 관측되지 않았다.

#### B. 재고이동 필터·페이지 상태

**관측 불가.** 저장 전 1행, 저장 후 2행인 현재 목록에는 필터 input/select가 0개이고 이전·다음·페이지 버튼도 0개였다. 최종 재진입에서도 input 0, select 0, pagination button 0이었다. 존재하지 않는 조작면을 임의 query parameter나 fixture로 만들어 통과시키지 않았다.

#### C. 다른 목록 화면

| 화면 | 조작 | 실측 |
|---|---|---|
| 재고현황 | 본사창고 선택 → 조회 | GET `/inventory/balances?...` 200, 총 103건 중 50행. 명시적 empty-state 문구 노출 0회. 첫 조회의 정상 loading 구간에서 0행이 약 143ms 있었고 곧 50행으로 수렴. |
| 재고실사 | 목록 진입 | GET `/inventory/audits?page=0&size=50` 200, 기존 10행 정상 표시. 단 아래 별도 stale-cache 결함 발견. |
| 창고 목록 | 재고실사·재고현황 뒤 진입 | `/inventory/warehouses` 추가 GET 없이 기존 warehouse cache로 30행 즉시 표시. 빈 상태 0회. |

재고현황의 기존 데이터 품질 결함인 `참조 끊김 / 제품 마스터 없음` 50행은 라운드 2와 동일하게 남아 있다. transfer fix가 만든 새 결함으로 세지 않는다.

### 3. 재고이동·재고실사 2종 회귀

| 대상 | 실측 | 판정 | 증거 |
|---|---|---|---|
| 재고이동 | POST 201 `2026/08/13-2`, GET 200, 새로고침 없이 2행 | **PASS** | `round3-02`~`round3-04` |
| 재고실사 등록·상세 | `1 · 서초창고`, 2026-08-13 → POST 201 `2026/08/13-2` / `PLANNED`; 상세·realtime·audit-logs 모두 200, snapshot 0행 | **저장·상세 PASS** | `round3-07-audit-ready-1920.png`, `round3-08-audit-saved-1920.png` |
| 재고실사 목록 복귀 | 저장 전에 열어 둔 목록으로 복귀하자 audits GET 0회, 10행 유지, 신규 `2026/08/13-2` 없음 | **FAIL — 별도 캐시 결함** | `round3-06-audit-list-before-1920.png`, `round3-09-audit-list-stale-without-reload-1920.png` |
| 재고실사 수동 새로고침 대조 | GET audits 200 뒤 11행, 신규 `2026/08/13-2` 첫 행 표시 | **대조 확인** | `round3-10-audit-list-after-reload-1920.png`, `round3-11-audit-list-after-reload-1440.png` |

신규 실사 대상인 서초창고에는 활성 재고가 없어 snapshot 0행이었다. 이는 POST·상세 실패로 세지 않는다.

## R3-3. 🚨 fix가 만든 새 표면

### transfer invalidation으로 귀속 가능한 새 표면

**관측 0건.** 저장 구간에서 transfer 외 목록 API 호출은 0건이었고, 재고현황 50행·창고 30행은 비정상 empty-state 없이 표시됐다.

### 별도 인접 결함 — 재고실사 생성 후 warm 목록 stale

**[MEDIUM] 재고실사 목록을 먼저 본 뒤 신규 실사를 만들면 목록 복귀 시 생성 건이 보이지 않는다.**

1. `/warehouse/audit`에서 기존 10행을 연다.
2. `신규 실사`에서 `1 · 서초창고`, `2026-08-13`을 등록한다.
3. POST `/inventory/audits` 201, 상세 `2026/08/13-2` 진입을 확인한다.
4. 사이드바 `재고 실사`로 목록에 돌아간다.

실제 결과: `/inventory/audits` 재조회가 0회이고 이전 10행 cache가 그대로 남아 `2026/08/13-2`가 없다. 수동 새로고침 뒤 GET 200, 11행으로 바뀌며 생성 건이 나타난다.

`round3-06-audit-list-before-1920.png`와 `round3-09-audit-list-stale-without-reload-1920.png`는 바이트와 SHA-256이 완전히 같다(`234EB72C...E945016`). 반면 reload 뒤 `round3-10`은 새 첫 행을 포함한다. transfer 저장 구간의 교차 invalidation은 아니므로 이번 transfer fix가 원인이라고 귀속하지 않지만, 요구한 “근처 정상 경로” 재수렴에서 실제로 드러난 결함으로 분리한다.

## R3-4. 표 정렬 — 1440px · 1920px

실제 screenshot 시각 확인과 DOM `getBoundingClientRect()`를 함께 사용했다. 각 표의 header cell과 첫 데이터 row cell은 같은 열에서 `x`와 `width`가 모두 일치했다(최대 차이 0px).

| 화면 | 1440px | 1920px | 증거 |
|---|---|---|---|
| 재고이동 6열 | header↔2개 행 정렬 일치 | header↔2개 행 정렬 일치 | `round3-03`, `round3-04` |
| 재고실사 5열 | header↔신규 첫 행 정렬 일치 | header↔첫 행 정렬 일치 | `round3-11`, `round3-10` |
| 재고현황 8열 | header↔첫 행 정렬 일치 | header↔첫 행 정렬 일치 | `round3-12`, `round3-05` |
| 창고 목록 5열 | header↔첫 행 정렬 일치 | header↔첫 행 정렬 일치 | `round3-13`, `round3-14` |

1440px에서만 열이 붕괴하거나 header와 row가 한 칸 어긋나는 현상은 관측되지 않았다.

## R3-5. 관측 불가 목록 · 증거 무결성

### 관측 불가

- **재고실사 상세 URL raw UUID 해소 여부:** 백엔드가 이전 `b11f025ea` 빌드이므로 관측 불가. 현재 stack의 URL 형태를 `225fdb913` backend fix 판정에 사용하지 않았다.
- `225fdb913`가 바꾼 재고실사 ID 응답·요청 경계 전체: 현재 stack 미반영으로 관측 불가.
- 재고이동 필터·페이지 상태 유지: 해당 목록에 필터·pagination UI가 없고 2행뿐이라 관측 불가.
- 재고실사 상세 데이터 행 정렬: 신규 서초창고 snapshot이 0행이라 empty colspan만 확인. 행 정렬 통과로 세지 않았다.

### 콘솔·네트워크

- Playwright `pageerror`: 0건.
- 필수 경로 `/inventory/transfers`, `/inventory/audits`, `/inventory/balances`, `/inventory/warehouses`의 HTTP 400/403/404/500: **0건**.
- console 집계: debug 8, info 4, warning 97, error 33. error는 인증 bridge 주입 전 `/auth/me` 401과 기존 stack에서 빠진 app-version·notification·notice·front-log 서비스의 503 resource error였다. 필수 업무 endpoint 실패는 없었다.
- 비밀번호·JWT는 screenshot·보고서·네트워크 요약에 포함하지 않았다.

### 이번 라운드에서 생성된 실제 업무데이터

| 유형 | 식별자 | 값 |
|---|---|---|
| 재고이동 | `2026/08/13-2` | REQUESTED, HQ-001 → CS-001, AM100ANHDBH1 1개, 사유 상세 `QA1189-R3 캐시 무효화 재수렴` |
| 재고실사 | `2026/08/13-2` | PLANNED, `1 · 서초창고`, 2026-08-13, snapshot 0행 |

사용자가 요구한 실제 저장 검증이므로 위 데이터는 삭제·정리하지 않았다.

### 스크린샷 무결성

모두 현재 워크트리 renderer + 기존 실 gateway/service/DB에서 캡처한 실제 PNG다. 합성·fixture·mock은 사용하지 않았고 모두 `round3-` 접두다.

| 파일 | 크기 | SHA-256 |
|---|---:|---|
| `round3-01-transfer-list-before-1440.png` | 1440x900 | `60576A66608444B6CF8A789B9444C47FB4EB90B183EF0826541F77D1201942B3` |
| `round3-02-transfer-ready-1440.png` | 1440x900 | `123B63B2AB9976351F15EF9FDB9B6BF11440DB620226BC7DDF3D005F258567B5` |
| `round3-03-transfer-visible-without-reload-1440.png` | 1440x900 | `B091A27B810E6305FC303136C32BA1948EEF88E39B9B49E63C454661BB4F500F` |
| `round3-04-transfer-visible-without-reload-1920.png` | 1920x1080 | `AFD0072E3653851807520938A67F8CEF9D49401DAA167848771EC4AAF3B3B017` |
| `round3-05-stock-list-1920.png` | 1920x2211 | `C32CA81A23EA028DA83E380C60222E72483078F11EC6F265B493438EE0CDC8A4` |
| `round3-06-audit-list-before-1920.png` | 1920x1080 | `234EB72C637F40C74F3E728F411F7E21F810D345EA96D669F97B009C5E945016` |
| `round3-07-audit-ready-1920.png` | 1920x1080 | `07EF6CCA615836F6C9B7635EA9A1069ABC44CFF0EAA6C63242296259E850B79B` |
| `round3-08-audit-saved-1920.png` | 1920x1080 | `3D37BE2B1C9724CDB6E097173962323618064E69F9DD303077611E44F9BF5A38` |
| `round3-09-audit-list-stale-without-reload-1920.png` | 1920x1080 | `234EB72C637F40C74F3E728F411F7E21F810D345EA96D669F97B009C5E945016` |
| `round3-10-audit-list-after-reload-1920.png` | 1920x1080 | `B99491853E0CFE2C39EB985D612FBB90CE2006BB1378E3DECE3D0FA1BD84DFF4` |
| `round3-11-audit-list-after-reload-1440.png` | 1440x996 | `A23AC5A8A7253A0086ED1FDCF03C135B780F4D07344749FBB466FEE466BD58F2` |
| `round3-12-stock-list-1440.png` | 1440x2211 | `A1918199DC0C785619E3920B9E9F35DA0A5A07EA4527141C3FDD088CBD2D1B12` |
| `round3-13-warehouse-list-1440.png` | 1440x1376 | `0C3A4BC39D7A0D2EB985EF501E9AD51E6E4CCB2451C10046AD679044357A35BF` |
| `round3-14-warehouse-list-1920.png` | 1920x1376 | `A12E182195156423767F06161578ED48D8B06D92C4C4CA00DFDCBB4F8348416B` |
