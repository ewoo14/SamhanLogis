# PR #1196 적대검증 라이브 QA 보고

검증 시각: 2026-08-13 12:31~12:47 KST  
검증 대상(사용자 제공): `fix/estimate-screen-partner-dc` / `c214de23b`  
판정: **BLOCKED — 실 GUI가 렌더링되지 않아 시나리오 1~8 관측 불가**

## 1. 환경 확인

### 실행 스택과 현재 commit 근거

- `git` 명령은 사용자 금지에 따라 한 번도 실행하지 않았다. 따라서 브랜치/HEAD는 사용자 제공값을 기록했으며 로컬 git으로 독립 확인하지 않았다.
- Docker Compose 라벨의 원문 경로는 세 대상 서비스 모두 아래와 같았다.

```text
com.docker.compose.project.config_files=
  D:\dev\Samhan-Public\.claude\worktrees\w1196\infrastructure\docker-compose.yml,
  D:\dev\Samhan-Public\.claude\worktrees\w1196\infrastructure\docker-compose.local-all.yml
com.docker.compose.project.working_dir=
  D:\dev\Samhan-Public\.claude\worktrees\w1196\infrastructure
```

- 이미지/컨테이너 원문:

```text
product-service
  Image=sha256:f1e85e35971f1481fcb108ef8903393900e5246068f42e459d1d2f2e3269aed8
  ImageCreated=2026-08-13T03:03:16.261052294Z
  ContainerCreated=2026-08-13T03:03:39.825494957Z
  StartedAt=2026-08-13T03:04:11.566229035Z

slip-service
  Image=sha256:7b81d4f5dc1a6f22fde03be9e0473000425965600d70aaff6a7ec9baa01d2d66
  ImageCreated=2026-08-13T03:03:16.684053720Z
  ContainerCreated=2026-08-13T03:03:42.525635775Z
  StartedAt=2026-08-13T03:06:46.180445467Z

inventory-service
  Image=sha256:8157ec6ecb609442c79cfb1d3e9d5fd59e8cdd2bda005ae54497c32bb4585933
  ImageCreated=2026-08-13T03:03:16.257989715Z
  ContainerCreated=2026-08-13T03:03:39.818968450Z
  StartedAt=2026-08-13T03:04:11.581960562Z
```

- 컨테이너 이미지 라벨에는 commit SHA가 없었다. 따라서 **w1196에서 당일 새로 생성된 이미지**임은 확인했지만, 런타임 메타데이터만으로 `c214de23b`를 증명할 수는 없다.
- `docker ps`에서 16개 컨테이너가 실행 중이었고 `samhan-product-service`, `samhan-slip-service`, `samhan-inventory-service`, `samhan-api-gateway`는 모두 `healthy`였다. 사용자 문서에 정지로 명시된 서비스는 실행 목록에 없었다.

### 호출한 API 원문

```text
GET http://127.0.0.1:8080/actuator/health
HTTP 200
Content-Type: application/vnd.spring-boot.actuator.v3+json
{"status":"UP"}

POST http://127.0.0.1:8080/api/auth/login
Request: {"loginId":"dev_master","password":"[REDACTED]"}
HTTP 200
Content-Type: application/json
{"success":true,"code":"OK","data":{"token":"[REDACTED_TOKEN]","role":"MASTER","partnerCode":null},"timestamp":"2026-08-13T03:33:27.374360902Z"}

GET http://127.0.0.1:8080/app/version
HTTP 400
{"success":false,"code":"INVALID_INPUT","message":"필수 요청 파라미터가 누락되었습니다.","data":null}

GET http://127.0.0.1:8080/api/app/version
HTTP 404

GET http://127.0.0.1:8080/v3/api-docs
HTTP 404

GET http://127.0.0.1:8080/actuator/info
HTTP 200
{}

GET http://127.0.0.1:8080/app/version?clientType=DESKTOP
HTTP 400

GET http://127.0.0.1:8080/app/version?platform=WINDOWS
HTTP 400

GET http://127.0.0.1:8080/app/version?appType=DESKTOP
HTTP 400
```

로그인 이후 제품/거래처/견적 API는 호출하지 않았다. 실 GUI 선행조건이 깨진 시점에 사용자 지시대로 중단했다.

### 실 GUI 기동 원문

단일 Chromium만 사용했고 worker/test runner는 실행하지 않았다. 현재 worktree renderer를 Vite `5.4.21`로 `127.0.0.1:5296`에 기동했다.

```text
GET /                                                200
GET /main.tsx                                        200
GET /routes/EstimateFormPage.tsx                     200
GET /styles/global.css                               500
GET /@fs/.../clients/web/design-system/dist/index.js 500

[vite] Internal server error:
Failed to resolve import "./styles/fonts.css"
from "../web/design-system/dist/index.js". Does the file exist?
```

공식 design-system build도 완료되지 않았다.

```text
npm run build
> tsc -p tsconfig.build.json && vite build

failed to load config .../clients/web/design-system/vite.config.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vite-plugin-dts'
```

Vite 첫 진입도 백색 화면이었다. 실제 캡처: [00-initial.png](00-initial.png). 이 캡처 시점의 원인은 `/` 404였고, renderer config로 바로잡은 최종 라운드의 백색 화면 원인은 위 design-system 500이었다. 최종 라운드는 네트워크 원문만 남았으며 별도 화면 캡처는 만들지 못했다.

## 2. 시나리오 1~8 실측

| 시나리오 | 판정 | 실측값 | 스크린샷 |
|---|---|---:|---|
| 1. 거래처 `2568700899` 선택 | 관측 불가 | 선택 화면 미도달 | 단계 캡처 없음. renderer 백색 화면: `00-initial.png` |
| 2. `AC060CS1PBH1SY` 드롭다운 선택 | 관측 불가 | 단가 미측정 | 없음 |
| 3. 모델명 직접 입력 후 blur | 관측 불가 | 단가 미측정 | 없음 |
| 4. `discount_option=NULL` 품목 | 관측 불가 | 레거시 fallback 미측정 | 없음 |
| 5. 분류 있음/옵션 없음 품목 | 관측 불가 | 오적용 여부 미측정 | 없음 |
| 6. 다른 거래처로 변경 | 관측 불가 | 재계산 미측정 | 없음 |
| 7. 견적→전표 변환 후 재진입 | 관측 불가 | 링크 유무 미측정 | 없음 |
| 8. 링크·상세 URL·API UUID 검사 | 관측 불가 | UUID 미검사 | 없음 |

단계 캡처가 없는 이유는 합성·fixture를 쓰지 않고 실제 화면만 남기라는 조건을 지켰기 때문이다. 도달하지 못한 화면을 증거처럼 만들지 않았다.

## 3. 도달 가능한 결함

제품 기능 결함으로 확정한 항목은 없다. 실 GUI 진입 전에 아래 **QA 환경 blocker**만 도달했다.

1. 위치: desktop renderer Vite 실서버.
2. 입력: `http://127.0.0.1:5296/` 실제 접속.
3. 잘못된 결과: design-system CSS/entry 요청이 HTTP 500이 되어 화면 전체가 백색으로 남음.
4. 원문 핵심: `Failed to resolve import "./styles/fonts.css" from "../web/design-system/dist/index.js"`.

이 blocker를 거래처 DC 기능 결함으로 세지 않았다.

## 4. 관측 불가 목록

- 드롭다운 경로와 직접입력+blur 경로의 `2,170,900원` 일치 여부.
- `discount_option=NULL` 레거시 모델코드 fallback.
- 분류 있음/옵션 없음 품목의 1way 오할인 방지.
- 거래처 변경 후 재계산.
- 견적 저장, 전표 변환, 상세 재진입, 전표 링크.
- 링크/상세 URL/요청 URL/응답 본문의 UUID 전수 검사.
- RAM은 시작 2.60GB, 단일 Chromium/Vite 사용 중 최저 약 2.10GB, 정리 후 2.80GB였다. 시스템이 더 무거워지기 전에 중단했다.
- Gradle, Docker build/restart, 전체 테스트 스위트, git 명령은 실행하지 않았다.
- 임시 Vite/Chromium과 임시 junction은 종료·제거했다. 이번 시도에서 생성된 design-system `dist`도 생성 시각을 검증한 뒤 제거했다. Docker 스택은 건드리지 않았다.

## 5. 증거 무결성

이번 실측에서 재현되지 않은 수치는 다음과 같다. 모두 실패로 간주하지 않고 **관측 불가**로 둔다.

- CI `45/45 green`: 사용자 제공값이며 재조회하지 않음.
- 분류 백필 `220건` 및 옵션별 분포: DB/API 미조회.
- 1way DC 설정 거래처 `45/259건`: DB/API 미조회.
- `2568700899`의 `discount_1way_amount=50000`: 미조회.
- `AC060CS1PBH1SY`의 판매가 `2,220,900원`, `discount_option=ONE_WAY`: 미조회.
- 기대 단가 `2,170,900원`: 화면 미측정.
- 이전 보고의 견적→전표 링크 부재 및 UUID 노출: 이번 라운드에서 재진입하지 못해 재현 여부 미확정.
- 과거 관련 테스트 `175/175` 또는 다른 코멘트 수치: 전체/부분 테스트 모두 금지 조건에 따라 미실행.
- `c214de23b` exact SHA: 이미지에 revision 라벨이 없고 git 금지라 런타임에서 독립 증명하지 못함.

결론적으로 이번 라운드는 “결함 0”이 아니라 **실 GUI 선행조건 불충족으로 1~8 전부 관측 불가**다.

---

# 라운드 2 — PM 환경 보완 후 재검증

검증 시각: 2026-08-13 12:51~13:02 KST  
검증 대상(사용자 제공): `fix/estimate-screen-partner-dc` / `c214de23b`  
판정: **BLOCKED — 시나리오 1~3 실측 완료, 시나리오 4 진입 직전 Chromium 재시작 및 RAM 1.62GB로 중단. 시나리오 5의 구체 데이터 전제도 현재 DB와 불일치**

## 1. 환경 확인

### 호출한 API 원문

민감한 로그인 token과 내부 식별자는 보고서에서만 치환했다. HTTP status와 나머지 응답 필드는 실제 응답이다.

```text
GET http://127.0.0.1:8080/actuator/health
HTTP 200
{"status":"UP"}

POST http://127.0.0.1:8080/api/auth/login
Request: {"loginId":"dev_master","password":"[REDACTED]"}
HTTP 200
{"success":true,"code":"OK","message":"성공","data":{"token":"[REDACTED_TOKEN]","userId":"[REDACTED_INTERNAL_ID]","role":"MASTER","displayName":"[DEV-SEED] 개발마스터","partnerCode":null,"groups":[{"id":"[REDACTED_INTERNAL_ID]","name":"마스터","builtin":true}]},"timestamp":"2026-08-13T03:51:08.516374795Z"}
```

화면에서 이어서 관측한 핵심 API:

```text
GET /admin/partners/search?q=2568700899&page=0&size=8                         → 200
GET /api/v1/partner-dc-configs/2568700899                                     → 200
GET /api/products?q=AC060CS1&size=50&usageScope=ESTIMATE                      → 200
GET /slips/lookup-product?modelName=AC060CS1PBH1SY                            → 200
GET /slips/price-memory?partnerId=<UUID>&productId=<opaque-or-UUID>            → 204
```

`/api/v1/partner-dc-configs/2568700899` 응답의 금액 필드는 `oneWay=₩50,000`, `threeSixty=₩70,000`, `fourWay=₩70,000`, `stand=₩70,000`이었다.

### renderer와 자원

- `clients/web/design-system/dist/index.js` 329,371B와 `dist/style.css` 96,755B가 실제로 존재했다.
- QA 전용 Vite `5.4.21`를 `http://127.0.0.1:5296`에 기동했다. `/`, `/styles/global.css`, `design-system/dist/index.js`가 모두 HTTP 200이었고 로그인 화면이 렌더링됐다. 라운드 1의 `fonts.css` import 500은 재현되지 않았다.
- 테스트 runner는 실행하지 않았다. browser worker를 추가하지 않고 QA용 Chromium 한 개만 사용했다.
- RAM 여유는 시작 2.50GB였다. 시나리오 4 입력 명령에서 browser daemon이 재시작되고 탭이 `about:blank`로 초기화됐으며 RAM은 1.62GB까지 내려갔다.
- 사용자 중단 조건에 따라 재로그인·재시도하지 않았다. QA Chromium과 Vite만 종료했고 Docker 스택은 건드리지 않았다. 정리 직후 RAM은 1.89GB였다.
- `git`, Gradle, Docker rebuild/restart, 코드 수정은 실행하지 않았다.

### SHA provenance 한계

- branch와 HEAD는 사용자 제공값이다. `git` 금지에 따라 독립 조회하지 않았다.
- 이미지/화면에는 commit SHA 라벨이 없다. PM이 이 worktree로 재빌드했다는 사실과 당일 이미지 생성 시각은 이전 라운드에 기록했지만, 런타임 산출물만으로 `c214de23b` exact SHA를 증명할 수 없다.
- 화면 좌하단 `2026/08/13-1196`은 이번 QA의 `VITE_APP_VERSION`이며 commit provenance가 아니다.

## 2. 시나리오 1~8 실측

| 시나리오 | 판정 | 실측값 | 실제 캡처 |
|---|---|---|---|
| 1. 거래처 `2568700899` 선택 | **통과** | `주식회사 제이앤피공조`, 사업자번호 `2568700899`; DC 설정 API 200 | [round2-s01-partner-2568700899-selected.png](round2-s01-partner-2568700899-selected.png) |
| 2. `AC060CS1PBH1SY` 드롭다운 선택 | **통과** | 부분검색 `AC060CS1` → radio `AC060CS1PBH1SY` → `선택 확정`; 판매가 `2,220,900`에서 1way DC `50,000`을 뺀 단가 **`2,170,900`** | [round2-s02-dropdown-ac060cs1pbh1sy-2170900.png](round2-s02-dropdown-ac060cs1pbh1sy-2170900.png) |
| 3. 같은 모델 직접 입력 후 blur | **통과** | 빈 2번 라인에 전체 모델명 입력 → `Tab` blur; `/slips/lookup-product` 200; 단가 **`2,170,900`**, 드롭다운 경로와 일치 | [round2-s03-direct-blur-ac060cs1pbh1sy-2170900.png](round2-s03-direct-blur-ac060cs1pbh1sy-2170900.png) |
| 4. `discount_option=NULL` 레거시 fallback | **관측 불가** | 실제 후보 `AC023BN1DBC1`은 판매가 `316,800`, 옵션 NULL, 신규 분류 NULL이라 기대 `266,800`. 입력 직전 browser가 재시작되어 화면 값은 측정하지 못함 | 단계 캡처 없음. 재시작 뒤 실제 blank 화면은 [round2-stop-browser-restarted-about-blank.png](round2-stop-browser-restarted-about-blank.png) |
| 5. 분류 있음/옵션 없음 오할인 방지 | **관측 불가 — 전제 불일치** | 해당 집합 899건은 재현. 그러나 그 집합에서 `model_name LIKE 'AC%' AND model_name LIKE '%1D%'`는 **0건**이라 지시된 충돌 입력을 실제 데이터로 만들 수 없음 | 없음. 존재하지 않는 행을 합성하지 않음 |
| 6. 거래처 변경 후 재계산 | **관측 불가** | 자원 중단 뒤 미진행 | 없음 |
| 7. 견적→전표 변환 후 상세 재진입 | **관측 불가** | 자원 중단 뒤 미진행 | 없음 |
| 8. 링크·상세 URL·API UUID 검사 | **부분 관측 후 중단** | 링크·상세 재진입은 미진행. 다만 시나리오 3의 가격기억 요청 URL에서 UUID가 이미 노출됨 | 시나리오 3 캡처 + 아래 요청 원문 |

시나리오 5 전제 확인 SQL과 원문:

```sql
select count(*)
from products
where is_deleted=false
  and discount_option is null
  and (cat_l_id is not null or cat_m_id is not null or cat_s_id is not null);
-- 899

select model_name
from products
where is_deleted=false
  and discount_option is null
  and (cat_l_id is not null or cat_m_id is not null or cat_s_id is not null)
  and model_name like 'AC%'
  and model_name like '%1D%';
-- (0 rows)
```

## 3. 도달 가능한 결함

### F-1. 신규 견적 가격기억 API 요청 URL에 UUID 노출

- 위치: 견적 신규 작성, 제품 선택/직접입력 후 가격기억 조회.
- 입력: 거래처 `2568700899`, 모델 `AC060CS1PBH1SY`; 특히 2번 라인 직접 입력 후 `Tab` blur.
- 잘못된 결과: client network 요청 URL의 `partnerId`와 일부 `productId`가 UUID 문자열이다.

```text
GET /slips/price-memory
  ?partnerId=55e7ba1f-fd9f-4c82-a4c2-8d64f3128f6d
  &productId=152bf234-daf2-48c8-9d1d-d28312ca9b21
→ 204
```

- 사용자 화면 본문에는 UUID가 보이지 않았지만, 사용자가 요구한 API 요청 URL 비노출 계약은 위 원문으로 위반된다.
- 증거 화면: [round2-s03-direct-blur-ac060cs1pbh1sy-2170900.png](round2-s03-direct-blur-ac060cs1pbh1sy-2170900.png). 화면 캡처와 같은 interaction의 network 원문은 위에 기록했다.

### 부수 관측 — DC 판정을 막지는 않았음

```text
GET  /app/version?clientType=DESKTOP&currentVersion=2026%2F08%2F13-1196 → 404
POST /logs/front                                                              → 503
GET  /fonts/Pretendard*.woff2                                                 → 200, 1,480B
console: Failed to decode downloaded font / OTS parsing error
```

버전 확인, 활동 로그, QA renderer 폰트가 각각 실패했다. DC 가격 계산과 시나리오 1~3은 계속 동작했으므로 핵심 fix 실패로 합산하지 않았다.

## 4. 관측 불가 목록

- `AC023BN1DBC1` 레거시 fallback의 화면 단가 `266,800원`.
- 분류 있음/옵션 없음이면서 legacy 1way parser와 충돌하는 실제 `AC...1D...` 행. 현재 DB에는 0건이다.
- 거래처 변경 후 같은 라인들의 재계산.
- 견적 임시저장, 상세, 전표 변환, 견적 상세 재진입, 전표 링크.
- 견적·전표 상세 URL과 관련 요청/응답 body 전체의 UUID sweep.
- 시나리오 4~8의 단계 캡처. blank 화면 외에는 도달하지 못한 화면을 합성하거나 fixture로 만들지 않았다.
- browser 재시작 뒤 재시도. RAM 1.62GB에서 사용자의 명시적 중단 조건을 적용했다.

따라서 시나리오 4~8은 “결함 0”이 아니라 각각 **관측 불가/부분 관측**이다.

## 5. 증거 무결성

### 재현된 PM 수치

```text
product_db 활성 제품 discount_option
  ONE_WAY 33 · STAND 73 · FOUR_WAY 50 · FIRST_GRADE 39 · THREE_SIXTY 17 · DELUXE 8
  합계 220

product_db 분류 있음(cat_l/m/s 중 하나 이상) + discount_option NULL
  899건

dc_config_db
  활성 거래처 259건
  discount_1way_amount 비영(非零) 설정 45건
  거래처 2568700899 discount_1way_amount = 50,000

화면
  AC060CS1PBH1SY 판매가 2,220,900 · ONE_WAY
  드롭다운 2,170,900 · 직접입력+blur 2,170,900
```

### 재현되지 않았거나 독립 증명하지 못한 것

- **시나리오 5의 구체 전제:** 899건 자체는 재현됐지만 그 집합의 `AC%1D%`는 0건이었다. 이 입력으로 오적용 방지를 재현했다는 주장은 현재 DB로 성립하지 않는다.
- `AC023BN1DBC1` 기대 단가 `266,800`: DB 전제와 계산식만 재현했고 화면은 browser 재시작 때문에 미측정이다.
- 거래처 변경 재계산, 전표 링크, 상세 URL/response UUID: 미도달이다.
- `c214de23b` exact runtime SHA: 이미지 revision 라벨과 화면 SHA 라벨이 없어 독립 증명하지 못했다.
- 이전 라운드의 견적→전표 링크 부재와 상세 URL/API UUID 노출: 이번 라운드에서는 재진입하지 못해 재현 여부 미확정이다. 단 신규 견적 가격기억 요청 URL의 UUID는 별도로 재현됐다.

라운드 2 결론은 **핵심 fix 경로인 드롭다운과 직접입력+blur가 모두 2,170,900원으로 일치**, 동시에 **UUID 요청 URL 결함 1건 도달**, **시나리오 4~8은 자원 중단과 데이터 전제 불일치로 완결 검증하지 못함**이다.

---

# 라운드 3 — 시나리오 4·6·7·8 재검증

검증 시각: 2026-08-13 13:22~13:38 KST  
검증 대상(사용자 제공): `fix/estimate-screen-partner-dc` / `c214de23b`  
판정: **시나리오 4·6·7 통과. 시나리오 8에서 기지 `price-memory` 외 UUID 노출 2개 계열을 추가 관측**

## 1. 환경 확인

- 라운드 2와 같은 게이트웨이·실 DB·실 renderer를 사용했다. 새 seed, fixture, route mock은 만들지 않았다.
- `GET http://127.0.0.1:8080/actuator/health` → HTTP 200, `POST /api/auth/login` → HTTP 200이었다. 인증 token은 출력·파일에 남기지 않았다.
- 라운드 2에서 준비된 `design-system/dist/index.js`와 `style.css`를 그대로 사용해 QA Vite `5.4.21`만 `127.0.0.1:5296`에 기동했다. build는 하지 않았다.
- Playwright는 `clients/desktop` 패키지에서 직접 실행했다. **동시에 Chromium 1개, context 1개, page 1개**였고 test runner·worker는 실행하지 않았다. 전표 링크가 `target="_blank"`라 시나리오 8에서 같은 context 안에 실제 상세 탭 1개가 추가됐다.
- RAM 여유는 시작 **4,125MB**, Playwright 구간 최저 **1,813MB**, 모든 Chromium/Vite 종료 뒤 **2,688MB**였다. 명시된 1,800MB 중단선 아래로 내려가지 않았다.
- 처음 사용한 browser daemon은 시나리오 6 캡처 시 재시작됐지만 당시 RAM은 2,261MB였다. 그 blank 캡처는 판정 증거에서 제외하고, 이후 직접 Playwright로 같은 경로를 재현했다.
- `git`, Gradle, 코드 수정, Docker build/restart는 실행하지 않았다. branch/HEAD는 git 금지에 따라 사용자 제공값이며 독립 검증하지 않았다.

## 2. 시나리오 4·6·7·8 실측

### 시나리오 4 — `discount_option=NULL` 레거시 모델코드 판별

실사용자 입력:

```text
거래처     주식회사 제이앤피공조 / 2568700899
모델       AC023BN1DBC1
입력 경로  모델명 전체 입력 → Tab blur
제품 조회  GET /slips/lookup-product?modelName=AC023BN1DBC1 → 200
DC 조회    GET /api/v1/partner-dc-configs/2568700899 → 200
가격 기억  GET /slips/price-memory?... → 204
화면 단가  266,800원
```

라운드 2에서 확인한 판매가 316,800원과 1way DC 50,000원의 차가 실제 화면 단가와 일치한다. 옵션·신규 분류가 NULL인 후보에서도 레거시 모델코드 판별이 살아 있다.

- 판정: **통과**
- 실제 캡처: [round3-s04-direct-playwright-legacy-null-ac023bn1dbc1-266800.png](round3-s04-direct-playwright-legacy-null-ac023bn1dbc1-266800.png)

### 시나리오 6 — 거래처 변경 후 재계산

같은 작성 화면과 같은 라인을 유지한 채 거래처만 바꿨다.

```text
변경 전  주식회사 제이앤피공조 / 2568700899 / 266,800원
변경 후  부산냉난방테크 / P-2026-0003 / 139-21-10093
DC 조회  GET /api/v1/partner-dc-configs/P-2026-0003 → 404 (설정 없음)
재조회   POST /slips/price-memory/bulk → 200
결과     316,800원
화면 배너 "거래처 변경 단가 확인 완료 · 판매가 1건 · 변경 1행"
```

`discountInput` 좌표가 실제 거래처 변경 interaction에서 작동해, 기존 거래처의 50,000원 DC를 남기지 않고 새 거래처 기준 판매가로 다시 계산했다.

- 판정: **통과**
- 실제 캡처: [round3-s06-partner-change-busan-316800-real.png](round3-s06-partner-change-busan-316800-real.png)

### 시나리오 7 — 견적→전표 변환 후 견적 상세 재진입

시나리오 6 결과를 실제 저장·변환했다.

```text
신규 견적       2026/08/13-1 / 부산냉난방테크 / AC023BN1DBC1 / 316,800원
메모            LIVEQA R3 #1196
견적 저장       POST /slips/estimates → 201
전표 변환       POST /slips/estimates/<opaque>/convert → 200
변환 직후 확인  "전표 변환 완료! 신규 판매전표가 임시저장 상태로 생성되었습니다."
```

변환 완료 뒤 견적 목록으로 나갔고, 별도 Chromium 세션에서도 저장된 견적 상세를 다시 열었다. 재진입 화면에 상태 `전표 변환 완료`와 본문 링크 `변환 전표 보기 →`가 있었다. 링크는 `target="_blank"`로 실제 판매전표 상세를 새 탭에 열었다.

- 판정: **통과**
- 실제 캡처: [round3-s07-reentry-confirmed-converted-slip-link.png](round3-s07-reentry-confirmed-converted-slip-link.png)

### 시나리오 8 — 링크·상세 URL·API UUID sweep

#### 링크와 화면

```text
견적 상세 URL   /#/sales/estimates/0mRTI0WMR_GaqJn8_8u3lQ
전표 링크 href  /#/sales/cIWZwwmjSpWGagFI5RJufQ
전표 상세 URL   /#/sales/cIWZwwmjSpWGagFI5RJufQ
```

세 값은 모두 UUID가 아닌 opaque token이었다. 견적 상세와 판매전표 상세의 화면 본문 UUID **0건**, anchor href UUID **0건**이었다. `GET /slips/estimates/<opaque>`와 `GET /slips/<opaque>` JSON 응답에서도 UUID 패턴은 검출되지 않았다.

- 링크·상세 URL 판정: **통과**
- 실제 판매전표 캡처: [round3-s08-converted-slip-detail-popup-uuid-sweep.png](round3-s08-converted-slip-detail-popup-uuid-sweep.png)

#### 기지 결함 외에 추가로 검출된 UUID

기지 결함인 아래 요청은 새 결함으로 다시 세지 않았다.

```text
GET /slips/price-memory?partnerId=<UUID>&productId=<UUID> → 204
```

그 외 같은 실사용자 경로에서 다음 노출을 검출했다. 값 자체는 보고서에서 `<UUID>`로 치환했다.

| 위치 | 방향 | UUID 필드 |
|---|---|---|
| `GET /admin/partners/search` | 응답 | `data.items[0].partnerId` |
| `GET /slips/lookup-product` | 응답 | `data.id` |
| `POST /slips/price-memory/bulk` | 요청 body | `partnerId`, `productIds[0]` |
| `POST /slips/estimates` | 요청 body | `partnerId`, `lines[0].productId` |
| 견적·전표 `collab/presence`, `presence/join`, `presence/leave` | 요청·응답 body | `sessionId`, `data.sessionId`, `data[*].sessionId` |

따라서 시나리오 8의 결론은 **링크·상세 URL·일반 상세 응답은 UUID 0건**, 그러나 **기지 `price-memory` query 외의 API 요청·응답 UUID 노출은 존재**다.

## 3. 도달 가능한 결함

### F-R3-1. 견적 작성 API가 파트너·제품 UUID를 추가 노출

- 무엇이: 파트너 검색/제품 조회 응답과 가격 일괄조회/견적 저장 요청이 내부 UUID를 JSON에 싣는다.
- 어디서: `GET /admin/partners/search`, `GET /slips/lookup-product`, `POST /slips/price-memory/bulk`, `POST /slips/estimates`.
- 입력: 거래처 `2568700899` 또는 `부산냉난방테크`, 모델 `AC023BN1DBC1`, 실제 견적 저장.
- 잘못된 결과: 기지 `GET /slips/price-memory` query 외에도 `partnerId`·`productId`가 UUID 형태로 client request/response에 노출된다.

### F-R3-2. 견적·전표 협업 presence가 `sessionId` UUID를 왕복

- 무엇이: 협업 presence 요청·응답의 세션 식별자가 UUID다.
- 어디서: 견적 상세와 변환된 판매전표 상세의 `collab/presence`, `presence/join`, `presence/leave`.
- 입력: 변환 완료 견적 상세 재진입 후 `변환 전표 보기 →` 클릭.
- 잘못된 결과: 요청 body와 응답의 `data.sessionId`/`data[*].sessionId`에 UUID가 노출된다. 화면 본문에는 보이지 않지만 사용자가 요구한 API 비노출 축을 위반한다.

### 부수 관측 — UUID 판정에는 합산하지 않음

변환된 판매전표 상세에서 `GET /accounting/journals/sales-slip-ledger?...`가 503이었고 화면은 `전잔·후잔을 불러오지 못했습니다.`를 표시했다. 같은 환경에서 `POST /logs/front` 503과 `/app/version` 404도 재현됐다. 본 PR의 거래처 DC·전표 링크 판정과는 분리했다.

## 4. 관측 불가 목록

- 시나리오 1~3은 라운드 2 통과 결과를 존중해 실행하지 않았다.
- 시나리오 5는 현재 DB 표본 0건이라는 라운드 2 결론과 사용자 지시에 따라 실행하지 않았다. 행을 만들거나 합성하지 않았다.
- `collab/stream`은 지속 연결인 SSE라 응답 body 전체를 종료 시점까지 소비하지 않았다. JSON 요청·응답과 URL은 검사했지만 SSE event payload 전체 UUID sweep은 관측 불가다.
- `discount_option=NULL`, 신규 분류 NULL이라는 DB 컬럼 전제는 라운드 2 실측을 사용했다. 라운드 3에서는 git·DB 재정찰을 반복하지 않고 실제 GUI 가격 경로만 재현했다.
- `c214de23b` exact runtime SHA는 git 금지와 이미지 revision label 부재 때문에 독립 증명하지 않았다.

## 5. 증거 무결성

- 캡처는 모두 실 게이트웨이·실 DB에 연결된 Playwright Chromium의 실제 화면이다. 합성 이미지, fixture, route mock은 0건이다.
- 실제 DB 쓰기: 견적 `2026/08/13-1`과 변환 판매전표 `2026/08/13-1`을 생성했다. 거래처 `부산냉난방테크`, 품목 `AC023BN1DBC1`, 단가 316,800원, 메모 `LIVEQA R3 #1196`이다. 증거 보존을 위해 행을 삭제하지 않았다.
- 라운드 3에서 새로 관측한 인증 token과 UUID 값은 원문으로 추가하지 않고 각각 `[REDACTED]`, `<UUID>`로 취급했다. append-only 지시 때문에 라운드 2 F-1에 이미 기록돼 있던 UUID 원문 2개는 수정하지 않았다.
- 주 증거 4장은 모두 1440×900 실제 PNG다.

```text
round3-s04-direct-playwright-legacy-null-ac023bn1dbc1-266800.png
  75,998B  SHA-256 b3a06b12d643ccf4c62e3283c75ebf64c41f28e417f4f576e96b51de8c52afad
round3-s06-partner-change-busan-316800-real.png
  79,178B  SHA-256 cfcace5d5055140954a5f5d6f39eb7ae08b0fe2bfce1d02fe84c0cf8e529dd89
round3-s07-reentry-confirmed-converted-slip-link.png
  94,246B  SHA-256 6032da4856eee858ebcdcddc9cd6db036f621b3eb11d1d1094f90e7e107c33a1
round3-s08-converted-slip-detail-popup-uuid-sweep.png
  78,932B  SHA-256 53abecf792dd266b3eaf9edd28398f4d5093d6dca5d9a6a14935edf769554868
```

- `round3-s06-partner-change-busan-316800.png`은 browser daemon 재시작 뒤의 실제 `about:blank` 캡처라 판정에서 제외했다.
- `round3-s08-slip-detail-uuid-sweep.png`은 첫 selector가 사이드바 `전표 정리`를 잘못 잡은 실제 화면이라 시나리오 8 증거에서 제외했다. 이후 본문 `변환 전표 보기 →`를 정확히 지정해 새 탭 캡처를 다시 얻었다.
- `round3-s07-reopened-estimate-slip-link.png`도 실제 재진입 화면이며 본문 링크가 보이지만, 자동 판정의 selector 오분류가 있었으므로 집중 재검 캡처를 주 증거로 사용했다.
- QA Chromium과 Vite는 종료했고 Playwright 잔여 프로세스는 0개다. Docker 스택은 건드리지 않았다.

라운드 3 결론은 **레거시 NULL 품목 266,800원, 거래처 변경 후 316,800원, 변환 견적 재진입 링크가 모두 실제 화면에서 정상**이며, **상세 URL/화면은 opaque 처리됐지만 기지 `price-memory` 외 파트너·제품·협업 session API UUID 노출은 남아 있다**는 것이다.
