# PR #1202 적대검증 라이브 QA 보고서

- 대상 PR: `#1202` (`feat/1140-legacy-baseline`)
- 대상 HEAD: `09bd16d571180ffb8f60ddde001eb5bfaa60cd36`
- 검증일: 2026-08-13 KST
- 최종 판정: **부분 통과 · 라이브 QA 미완주 · 머지 비권고**
- 도달 가능한 제품 결함: **0건**
- 핵심 화면 결과: 구형 토글 ON/OFF/ON 금액 `4,229,500원` 동일, V43 이전 기존 견적 합계 `5,863,260원` DB/UI 일치, 신형 토글 `1,890,000→1,980,000→1,890,000원` 전환·원복 통과
- 미완료: 표준 QA 자격 미구성으로 Desktop 구형 관리 토글과 V43 이전 기존 판매전표 상세를 열지 못함

## 1. 환경 원문

```text
① 이 브랜치에는 미머지 마이그레이션 V43 이 있습니다
   🚫 공유 개발 스택에 올리지 마십시오 — 다른 트랙이 main 기준으로 빌드할 때
      Flyway validate 가 깨집니다
   ⟹ 격리 DB 로 검증하십시오. 🚩 격리 복제가 한글을 죽인 사례가 있으니 인코딩 먼저 확인
   🚩 다른 열린 PR 도 마이그레이션을 추가했습니다 — 번호 충돌 여부를 확인해 보고하십시오
② 공유 스택은 혼합 이미지입니다 (slip 08-12T17:53 / 나머지 08-11T17:59)
   백엔드 의존 항목을 억지로 판정하지 말고 관측 불가로 남기십시오
③ 여유 RAM
```

환경 실측:

- PR HEAD와 로컬 PR 변경 9개 파일의 blob SHA가 9/9 일치했다. `git` 명령은 사용하지 않았다.
- `tracked-writer.mjs`는 복원 blob `6f4bd99bc47f4e068c446aeedd188660cfdcf553`과 일치했다.
- 열린 PR migration은 #1202 product V43과 #1198 accounting V101이었다. 서비스와 번호가 달라 충돌 없음.
- 격리 PostgreSQL 16 `product_db`에만 V43을 적용했다. 공유 product DB에는 적용하지 않았다.
- 인코딩 복제 전후 `server_encoding=UTF8`, `client_encoding=UTF8`, 한글 구형 품목명 37행과 표본 `DVM S 구형 고온형 10HP`가 일치했다.
- 기존 라운드에서 직접 확보한 DB 게이트는 재수행하지 않고 그대로 인계했다: 활성 구형 37개, baseline 37/37, 출고가·납품가 차이 합계 각각 0원.
- 화면 자동화: `@playwright/test 1.59.1`, 로컬 Chromium 1217 실행 파일을 `clients/desktop` 패키지 내부에서 직접 launch했다.
- 화면 서버: HEAD estimate-app `127.0.0.1:25183`, HEAD Desktop HashRouter renderer `localhost:5173`, 격리 HEAD product-service `127.0.0.1:28084`.
- 시작 여유 RAM 18GB 이상, 캡처 중 최저 15.252GB, 정리 후 19.283GB. 1.0GB 중단선에 접근하지 않았다.

## 2. 최초 중단 경위 정정

최초 보고서의 다음 근거는 틀렸다.

```text
agent.browsers.list() -> []
No browser is available
```

이는 인앱 Browser 런타임 상태일 뿐 로컬 Playwright 가용성과 무관하다. 인앱 Browser 런타임과 로컬 Playwright는 다른 실행 표면이다. 이번 재개에서는 설치본 Chromium 1217을 `executablePath`로 직접 지정해 실제 UI를 조작하고 8장을 캡처했다. 따라서 최초 “브라우저 없음으로 관측 불가” 판정은 철회한다.

## 3. 시나리오 1 — 구형 토글 ON/OFF 금액 no-op

절차:

1. 실제 estimate-app에서 상단 `구형` 버튼을 클릭했다.
2. 캡처 전 구형 화면 고유 요소 `#cardOld`, `#chkOldInc`가 visible임을 단정했다.
3. `AM120NXVHHH1` 수량을 실제 UI에서 1로 입력했다.
4. 토글을 ON→OFF→ON으로 조작하고 각 상태에서 출고가, 납품가, 소계를 DOM 표시값으로 읽었다.

금액 원문:

| 상태 | 수량 | 출고가 | 납품가 | 소계 |
|---|---:|---:|---:|---:|
| ON(최초) | 1 | 8,459,000 | 4,229,500 | 4,229,500 |
| OFF | 1 | 8,459,000 | 4,229,500 | 4,229,500 |
| ON(원복) | 1 | 8,459,000 | 4,229,500 | 4,229,500 |

세 금액 필드를 문자열이 아니라 숫자 정규화 후 양방향 exact equality로 단정했다.

스크린샷:

- [01-old-toggle-on.png](screenshots/01-old-toggle-on.png)
- [02-old-toggle-off.png](screenshots/02-old-toggle-off.png)
- [03-old-toggle-on-restored.png](screenshots/03-old-toggle-on-restored.png)

결과: **PASS.** 결정 B의 핵심 문구 “UI만 생기고 금액은 안 바뀐다”가 실제 사용자 조작에서 재현됐다.

## 4. 시나리오 2 — 전 구형 품목 출고가·납품가 차이 0원

이 축은 최초 라운드에서 구현 보고서의 숫자를 인용하지 않고 1~37번으로 직접 열거해 완료했으며, 재개 지시에 따라 다시 수행하지 않았다.

원문 요약:

```text
active_old=37
baseline_rows=37
baseline_missing=0
release_equal=37
delivery_equal=37
release_abs_diff=0.00
delivery_abs_diff=0.00
korean_name_rows=37
```

결과: **PASS(DB 게이트).** 37행 각각의 출고가·납품가 차이가 모두 `0.00`이었다.

## 5. 시나리오 3 — 기존 견적·전표 저장 금액 무변화

### 5.1 V43 이전 기존 견적

대상은 다른 라운드가 V43 적용 전인 2026-08-13 10:53에 저장한 `PR1197-R3-BRANCH-1786618391920`이다. 새 QA 데이터를 만들지 않았다.

절차:

1. 실제 `저장내역` UI를 열었다.
2. 대상 기존 행이 렌더됐음을 단정하고 `복원`을 클릭했다.
3. 확인 dialog와 `복원 완료` alert를 실제로 수락했다.
4. `견적서(기본)`으로 이동했다.
5. 캡처 전 화면 고유 요소 `#cardPreview`가 visible이고 기존 모델 `AM080AXVHHH1`이 포함됨을 단정했다.
6. 공유 `quote_snapshots.total_amount`와 UI `총 견적 합계(VAT 포함)`을 대조했다.

금액 원문:

```text
DB saved_at     = 2026-08-13 10:53:26.598
DB supply       = 5,330,237.00
DB VAT          =   533,023.00
DB total_amount = 5,863,260.00
UI total        = 5,863,260
```

스크린샷:

- [04-existing-snapshot-row.png](screenshots/04-existing-snapshot-row.png)
- [05-existing-snapshot-restored-total.png](screenshots/05-existing-snapshot-restored-total.png)

결과: **PASS(기존 견적).** V43 이전 저장 합계와 현재 HEAD 복원 합계가 정확히 일치했다.

### 5.2 V43 이전 기존 판매전표

읽기 전용 DB에서 다른 트랙의 당일 `2026/08/13-1~4`를 제외하고, 2026-08-10 기존 판매전표 `2026/08/10-9`, 저장 라인 합계 `1,023,000원`을 후보로 정했다.

Desktop 실서버에 로그인해 해당 기존 행을 열기 직전 표준 자격 resolver가 중단했다.

실패 명령 원문:

```text
QA_CREDENTIAL_MISSING
QA 자격이 없습니다: ...\infrastructure\.env.local에
QA_DEV_DEFAULT_PASSWORD를 입력하거나 표준 환경변수를 설정하십시오.
```

프로세스 환경과 `infrastructure/.env*`에는 `QA_DEV_DEFAULT_PASSWORD`, `DEV_PASSWORD`, `QA_PASSWORD`, `QA_MASTER_PW`가 모두 없었다. 비밀번호를 추측하거나 해시에서 역추출하지 않았다.

결과: **관측 불가(기존 판매전표).** 기존 견적 PASS로 판매전표를 대신 판정하지 않는다.

## 6. 시나리오 4 — 신형 품목 기존 동작

처음 선택한 상업멀티 `AM080AXVHHH1`은 DB 현재가와 baseline이 원래 같아 회귀 판정용 데이터가 아니었다. 해당 캡처는 증거에서 제거했다. 실제 baseline 차이가 있는 신형 싱글 세트 `AP145BAPPHH2S`로 재검증했다.

절차:

1. 실제 `싱글중대형` 화면에 진입했다.
2. 캡처 전 고유 요소 `#cardSingle`, `#chkSingleInc`와 모델 행을 단정했다.
3. 수량을 1로 입력하고 토글을 OFF→ON→OFF로 조작했다.
4. 납품가와 소계가 전환되고 정확히 원복되는지 단정했다.

금액 원문:

| 상태 | 수량 | 출고가 | 납품가 | 소계 |
|---|---:|---:|---:|---:|
| OFF(최초) | 1 | 3,846,000 | 1,890,000 | 1,890,000 |
| ON | 1 | 3,846,000 | 1,980,000 | 1,980,000 |
| OFF(원복) | 1 | 3,846,000 | 1,890,000 | 1,890,000 |

스크린샷:

- [06-new-single-initial.png](screenshots/06-new-single-initial.png)
- [07-new-single-toggled.png](screenshots/07-new-single-toggled.png)
- [08-new-single-restored.png](screenshots/08-new-single-restored.png)

결과: **PASS.** 신형의 기존 단가변동 전환과 원복이 유지됐다.

## 7. 시나리오 5 — 구형 토글 가시성·조작성

estimate-app 구형 화면에서 `단가변동` 토글이 실제로 visible이고 Playwright click/check로 `true→false→true` 변경됐다. 각 상태는 위 시나리오 1 스크린샷과 금액 대조로 증명된다.

Desktop HashRouter도 `${BASE_URL}/#/products/price-schedule`로 기동했지만, 실제 `dev_master` 로그인 자격이 없어 관리 화면 고유 행 `price-schedule-row-oldProducts`까지 도달하지 못했다. HTML 존재나 mock으로 대체하지 않았다.

결과: **PASS(estimate-app 사용자 계산 화면) / 관측 불가(Desktop 관리 화면).**

## 8. 토글 ON/OFF 금액 대조표

| 축 | 모델 | 최초 | 전환 | 원복 | 결과 |
|---|---|---:|---:|---:|---|
| 구형 납품가 | AM120NXVHHH1 | ON 4,229,500 | OFF 4,229,500 | ON 4,229,500 | no-op PASS |
| 구형 소계 | AM120NXVHHH1 × 1 | ON 4,229,500 | OFF 4,229,500 | ON 4,229,500 | no-op PASS |
| 신형 납품가 | AP145BAPPHH2S | OFF 1,890,000 | ON 1,980,000 | OFF 1,890,000 | 기존 동작 PASS |
| 신형 소계 | AP145BAPPHH2S × 1 | OFF 1,890,000 | ON 1,980,000 | OFF 1,890,000 | 기존 동작 PASS |

## 9. 기존 행 금액 무변화 확인

| 기존 행 | 생성 시점 | DB 저장 금액 | UI 표시 금액 | 결과 |
|---|---|---:|---:|---|
| 기존 웹 견적 `PR1197-R3-BRANCH-1786618391920` | V43 전 | 5,863,260 | 5,863,260 | PASS |
| 기존 판매전표 `2026/08/10-9` | V43 전 | 1,023,000 | 미측정 | 자격 미구성으로 관측 불가 |

## 10. 도달 결함

**0건.**

로컬 자격 미구성과 estimate-app의 버전 정책 API 404 배너는 PR #1202 도달 제품 결함으로 세지 않았다. 다만 기존 판매전표와 Desktop 관리 화면이 미관측이므로 “결함 0건”은 전체 QA 통과를 뜻하지 않는다.

## 11. 증거 무결성 정정

- 최초 보고서의 “인앱 Browser 목록이 비어 로컬 Playwright도 불가”라는 근거를 철회했다.
- 로컬 Playwright Chromium 1217로 실제 화면 8장을 생성했고 대표 캡처를 시각 확인했다.
- 구현 보고서의 구형 DB 사전 실측과 V43 후 37/37·차이 0원은 독립 재현됐다.
- 구현 보고서의 UI no-op은 이번 실제 조작으로 `4,229,500원` 양방향 동일을 재현했다.
- 구현 보고서의 “기존 저장 금액 불변”은 기존 웹 견적에서 재현했지만 기존 판매전표에서는 아직 재현하지 못했다. 두 축을 합쳐 완료로 표현하면 안 된다.
- 신형 최초 후보 `AM080AXVHHH1`은 현재가와 baseline이 동일해 무변화가 정상이다. 이를 신형 회귀 결함으로 세지 않고, 차이가 있는 `AP145BAPPHH2S`로 재검증했다.

## 12. 만든 데이터와 정리

- 공유 업무 데이터 생성/수정: **0건**.
- 견적 저장, 판매전표 저장, 단가변동 관리 저장 버튼: 누르지 않음.
- UI에서 변경한 수량·토글은 브라우저 메모리에서만 사용했고 원복했다.
- 격리 DB에만 Flyway V43 baseline 37행이 존재했으며 QA 종료 후 격리 컨테이너를 제거했다.
- 공유 DB 종료 확인은 기존대로 활성 구형 37개, `2000-01-01` 구형 baseline 0행이었다.
- QA Java, Node, Vite/Electron, Chromium 프로세스와 임시 dump/log를 제거했다.
- 정리 후 포트 35432/28084/25183/5173 listener 0, QA 컨테이너 0.
- 이번 라운드의 임시 캡처 스크립트는 패키지에서 제거했다. 산출물 디렉터리 `docs/qa/2026-08-13-1202-liveqa/`에는 `REPORT.md`와 PNG 8장만 남겼다.

## 13. 머지 권고

**현재는 머지 비권고.** 핵심 금액 no-op, 전 구형 DB 차이 0원, 기존 웹 견적 금액, 신형 회귀, estimate-app 구형 토글은 통과했다. 그러나 V43 이전 기존 판매전표 상세 금액과 Desktop 구형 관리 토글을 실제 사용자 화면에서 확인하지 못했다.

`QA_DEV_DEFAULT_PASSWORD`를 표준 환경변수 또는 `infrastructure/.env.local`에 구성한 뒤 같은 HEAD에서 두 화면만 재개하면 된다.

## 라운드 3

- 요청 대상: PR #1202 `feat/1140-legacy-baseline`, 요청 HEAD `9b39395d2`
- 범위: 직전 라운드의 관측 불가 2축만 재개 — 기존 판매전표, Desktop 관리 토글
- 판정: **두 화면 PASS · 도달 가능한 결함 0건 · 관측 불가 0개 · 머지 권고**
- 실행: 실 Docker 서비스, mock OFF, `dev_master` 실 로그인, 로컬 Playwright Chromium 실 화면

### R3-1. 환경 원문

요청에 따라 브랜치 상태 확인·커밋·차이 확인용 git 명령은 사용하지 않았다. 사용자가 지정한 요청 HEAD의 현재 워크트리 렌더러를 사용했다.

공유 스택 시작 실측:

```text
samhan-groupware-service|Up 32 minutes (healthy)|infrastructure-groupware-service
samhan-dashboard-service|Up 33 minutes (healthy)|infrastructure-dashboard-service
samhan-inventory-service|Up 38 minutes (healthy)|infrastructure-inventory-service
samhan-slip-service|Up 4 hours (healthy)|infrastructure-slip-service
samhan-api-gateway|Up 4 hours (healthy)|infrastructure-api-gateway
samhan-partner-order-service|Up 4 hours (healthy)|infrastructure-partner-order-service
samhan-auth-service|Up 4 hours (healthy)|infrastructure-auth-service
samhan-product-service|Up 4 hours (healthy)|infrastructure-product-service
samhan-eureka|Up 4 hours (healthy)|infrastructure-eureka-server
samhan-postgres|Up 4 hours (healthy)|postgres:16-alpine
samhan-user-service|Up 4 hours (healthy)|infrastructure-user-service
samhan-arologis-service|Up 4 hours (healthy)|infrastructure-arologis-service
samhan-accounting-service|Up 4 hours (healthy)|infrastructure-accounting-service
samhan-dc-config-service|Up 4 hours (healthy)|infrastructure-dc-config-service
samhan-partner-service|Up 4 hours (healthy)|infrastructure-partner-service
samhan-partner-auth-service|Up 4 hours (healthy)|infrastructure-partner-auth-service
samhan-notification-service|Up 4 hours (healthy)|infrastructure-notification-service
samhan-grafana|Up 4 hours (healthy)|grafana/grafana:11.3.1
samhan-minio|Up 4 hours (healthy)|minio/minio:latest
samhan-elasticsearch|Up 4 hours (healthy)|docker.elastic.co/elasticsearch/elasticsearch:8.15.3
samhan-rabbitmq|Up 4 hours (healthy)|rabbitmq:3.13-management-alpine
samhan-redis|Up 4 hours (healthy)|redis:7-alpine
```

기준 compose 25개 중 실재 22개이며 없는 3개는 기존 알려진 예외 `samhan-logging-service`, `samhan-nginx`, `samhan-prometheus`다. 만들거나 고치지 않았다.

대상 의존 서비스 생성 시각 원문:

```text
/samhan-slip-service|2026-08-12T17:53:07.461758521Z|infrastructure-slip-service
/samhan-api-gateway|2026-08-12T15:39:17.991855852Z|infrastructure-api-gateway
/samhan-auth-service|2026-08-12T00:03:23.288496844Z|infrastructure-auth-service
/samhan-product-service|2026-08-11T18:10:22.372262338Z|infrastructure-product-service
/samhan-postgres|2026-08-11T18:10:14.478346436Z|postgres:16-alpine
```

혼합 이미지이므로 PR의 백엔드 변경을 공유 스택에 올리지 않았다. 이번 두 축은 HEAD Desktop/estimate-app 렌더러와 기존 공유 API 계약으로 도달했고, 미머지 V43은 공유 DB에 적용하지 않았다.

RAM 원문:

```text
FreePhysicalMemoryKB=25457332
START_FREE_RAM_GB=24.278
PRE_CLEANUP_FREE_RAM_GB=23.176
FINAL_FREE_RAM_GB=26.398
```

전 구간에서 1.0GB 중단선을 넘었다.

로그인 경로 정정 원문:

```text
C:\dev\Samhan-Public\infrastructure\.env.local|exists=True|has_qa_dev_password=True
POST http://127.0.0.1:8080/api/auth/login
LOGIN_HTTP=200|ROLE=MASTER
```

직전 라운드의 resolver는 현재 worktree의 `infrastructure/.env.local`만 확인했다. 같은 PC 기준 체크아웃의 표준 자격 파일을 사용해 실 JWT를 발급하고, 성공한 #1189/#1197 라운드와 같은 `window.samhanAuth` 브리지에 주입했다. 비밀번호와 JWT는 출력·파일·스크린샷에 남기지 않았다.

브라우저·렌더러:

```text
C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
@playwright/test 1.59.1
Desktop HashRouter http://127.0.0.1:5173/#/...
estimate-app       http://127.0.0.1:25183
VITE_MOCK_MODE 미설정
```

### R3-2. 기존 판매전표 — 저장 금액 무변화

대상은 V43 이전 기존 판매전표 `2026/08/10-9`다. 새 전표를 만들거나 기존 전표를 수정하지 않았다.

절차:

1. 읽기 전용 DB에서 대상 전표의 상태와 저장 라인 금액을 재조회했다.
2. `dev_master` 실 로그인 JWT를 Desktop 인증 브리지에 주입했다.
3. HashRouter 경로 `/#/sales/{id}`로 이동했다.
4. 화면 고유 제목 `판매전표 상세 [2026/08/10-9]`와 모델 `AC060CX1DBC1` 행을 단정했다.
5. 같은 행의 공급가액·부가세·VAT 포함 합계를 DB와 숫자 exact equality로 대조했다.

DB 원문:

```text
slip_no      | 2026/08/10-9
status       | COMPLETED
supply_amount| 1023000.00
vat_amount   |  102300.00
total_amount | 1125300.00
```

화면 행 원문:

```text
1 | AC060CX1DBC1 | 수량 1 | 단가(VAT포함) 1,125,300
  | 공급가액 1,023,000 | 부가세 102,300 | 합계(VAT포함) 1,125,300
```

스크린샷:

- [09-r3-existing-sales-slip.png](screenshots/09-r3-existing-sales-slip.png)

결과: **PASS.** V43 이전 기존 판매전표의 저장 공급가 `1,023,000원`, VAT `102,300원`, 합계 `1,125,300원`이 현재 HEAD Desktop 화면과 일치했다. 이 PR 때문에 기존 행 금액이 바뀐 증거는 없다.

### R3-3. Desktop 관리 토글 — 가시성·조작성·구형 금액 no-op

절차:

1. `/#/products/price-schedule`로 이동하고 화면 고유 제목 `카테고리별 단가변동 [제품]`을 단정했다.
2. `price-schedule-row-oldProducts`와 `price-schedule-toggle-oldProducts`가 실 화면에 visible임을 단정했다.
3. 공유 스택의 기존 `oldProducts.default_pre_change=false`를 UI에서 ON으로 바꾸고 저장했다.
4. 실제 PUT 200과 체크 상태 `true`를 단정했다.
5. estimate-app 구형 화면에서 `AM120NXVHHH1` 수량 1의 출고가·납품가·소계를 읽었다.
6. Desktop에서 토글을 OFF로 되돌려 저장하고 실제 PUT 200과 체크 상태 `false`를 단정했다.
7. estimate-app을 새 문서로 열어 같은 모델·수량의 세 금액을 다시 읽고 ON/OFF exact equality를 단정했다.

토글 저장 원문:

```text
OLD_TOGGLE_INITIAL=false
OLD_TOGGLE_SAVE_HTTP=200|CHECKED=true
OLD_TOGGLE_SAVE_HTTP=200|CHECKED=false
FINAL_DB=oldProducts|2026-07-01|default_pre_change=false
```

금액 원문:

| Desktop 관리값 | 모델 | 수량 | 출고가 | 납품가 | 소계 |
|---|---|---:|---:|---:|---:|
| ON 저장 후 | AM120NXVHHH1 | 1 | 8,459,000 | 4,229,500 | 4,229,500 |
| OFF 원복 후 | AM120NXVHHH1 | 1 | 8,459,000 | 4,229,500 | 4,229,500 |

```text
ADMIN_ON_AMOUNT |MODEL=AM120NXVHHH1|QTY=1|RELEASE=8459000|DELIVERY=4229500|SUBTOTAL=4229500
ADMIN_OFF_AMOUNT|MODEL=AM120NXVHHH1|QTY=1|RELEASE=8459000|DELIVERY=4229500|SUBTOTAL=4229500
ADMIN_TOGGLE_NO_OP=PASS|ON=4229500|OFF=4229500
```

스크린샷:

- [10-r3-desktop-old-toggle-on.png](screenshots/10-r3-desktop-old-toggle-on.png)
- [11-r3-old-amount-after-admin-on.png](screenshots/11-r3-old-amount-after-admin-on.png)
- [12-r3-desktop-old-toggle-restored-off.png](screenshots/12-r3-desktop-old-toggle-restored-off.png)
- [13-r3-old-amount-after-admin-off.png](screenshots/13-r3-old-amount-after-admin-off.png)

결과: **PASS.** Desktop 구형 행에 토글이 보이고 실제 저장·원복됐다. 관리값 ON/OFF 모두 구형 납품가와 소계는 `4,229,500원`으로 동일해 no-op 계약을 지켰다.

### R3-4. 도달 가능한 결함

**0건.**

- 기존 판매전표 금액: DB/UI 일치.
- Desktop 구형 토글: visible, 조작·저장·원복 가능.
- 관리 토글 ON/OFF 후 구형 금액: 동일.

상단 `업데이트 실패: 업데이트에 실패했습니다` 배너는 로컬 QA 버전 문자열 `2026/08/13-1202`가 공유 버전 정책 대상이 아닌 기존 렌더러 환경에서 발생했다. 두 대상 화면의 도달·저장·금액 판정에는 사용하지 않았다.

### R3-5. 관측 불가와 실패 명령 원문

대상 2화면의 관측 불가 축은 **0개**다. 아래 하네스 실패는 원인을 교정한 뒤 두 화면 모두 최종 PASS 원문을 얻었다.

#### 1) Vite root 누락으로 첫 Desktop 진입 실패

실패 명령:

```powershell
npm exec vite -- --config vite.config.ts --host 127.0.0.1 --port 5173
node playwright/1202-r3-real-qa/1202-r3-real-qa.spec.mjs
```

원문:

```text
GET http://127.0.0.1:5173/ -> 404
page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at
http://127.0.0.1:5173/#/sales/7d900259-377b-46f8-bfab-966ef82fe2e5
```

`vite.config.ts` 주석의 실제 root인 `src/renderer`를 인자로 넣어 재기동한 뒤 `GET / -> 200`과 HashRouter 화면 고유 제목을 확인했다.

#### 2) 기존 판매전표 금액을 편집 input으로 찾은 첫 단언 실패

실패 명령:

```powershell
node playwright/1202-r3-real-qa/1202-r3-real-qa.spec.mjs
```

원문:

```text
locator.inputValue: Timeout 30000ms exceeded.
waiting for getByLabel('공급가액 1')
```

완료 전표의 실제 화면은 금액을 읽기 전용 표 셀로 렌더한다. 모델 행을 고유 단언하고 표 셀 `1,023,000 / 102,300 / 1,125,300`을 숫자로 대조해 재실행했다.

#### 3) PostgreSQL 기본 role 가정 실패

실패 명령:

```powershell
docker exec samhan-postgres psql -U postgres -d slip_db ...
```

원문:

```text
FATAL: role "postgres" does not exist
```

컨테이너의 비밀값이 아닌 `POSTGRES_USER=samhan` 설정만 확인해 읽기 전용 쿼리를 재실행했다.

### R3-6. 만든 데이터와 종료 정리

공유 업무 데이터:

- 신규 견적·판매전표·전표 라인·품목·가격 이력: **0건**.
- 기존 판매전표 `2026/08/10-9`: 읽기만 수행, 상태·금액·버전 변경 없음.
- 기존 `price_change_schedule.oldProducts`: `false→true→false`로 UI 저장 왕복. 최종 업무값은 시작값 `false`로 복구됐다.
- 위 저장 왕복으로 해당 스케줄 행의 수정 감사 필드는 실 `dev_master` 행위로 갱신됐다. 감사 원문을 위조해 과거 값으로 되돌리지 않았다.
- estimate-app 수량 1 입력은 브라우저 메모리에서만 사용했고 견적 저장은 누르지 않았다.

V43 격리 원칙 종료 확인:

```text
shared_old_baseline_rows=0
shared_v43_created_rows=0
```

즉 공유 `product_db`의 구형 `2000-01-01` baseline은 0행이며 미머지 V43을 올리지 않았다.

산출물·프로세스:

- 신규 실 캡처 5장: `09`~`13`.
- 임시 `1202-r3-real-qa` 스크립트: 실행 후 삭제.
- `docs/qa` 안의 캡처 스크립트: 0개.
- 종료 원문: `VITE_ESTIMATE_LISTENERS=0`, `PLAYWRIGHT_CHROME=0`, `FINAL_FREE_RAM_GB=26.398`.

### R3-7. 머지 권고

**머지 권고.**

직전 라운드에 남았던 두 관측 불가가 모두 해소됐다. 기존 판매전표의 저장 금액은 DB/UI가 일치했고, Desktop 구형 관리 토글은 실 화면에서 표시·저장·원복되며 ON/OFF 후 구형 금액은 동일했다. 라운드 1~3 전체 범위의 도달 가능한 결함은 0건이고, 금액 축과 마지막 두 화면이 모두 완주됐다.
