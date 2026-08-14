# PR #1203 fix 라운드 재수렴 적대검증 보고서 (SOL)

- 검증일: 2026-08-14 (KST)
- 대상: `fix/stock-transfer-confirm-noop`, `d36302c618d7e84a4a989db13f5e94840cfb4bb1`
- 정본: `docs/decisions/2026-08-14-stock-ledger-modal-spec.md` 결정 1~7
- 결론: **재수렴 실패 / 머지 보류**. 사용자 도달 결함 2건(이동·재고실사 수불행이 특정 전표로 열리지 않음)이 남았다. 캐시 무효화 5개 사건은 각각 실제 재GET으로 다시 검증했고, 14개 캡처의 SHA-256 중복은 0개다.

## 1. 환경 실측 원문

### 대상·PR

git 명령은 사용하지 않았다. `.git` 포인터와 ref 파일을 읽은 결과는 다음과 같다.

```text
branch=refs/heads/fix/stock-transfer-confirm-noop
HEAD=d36302c618d7e84a4a989db13f5e94840cfb4bb1
gh pr view 1203: issue comments 10, review comments 0, reviews 0
```

PR 본문과 issue comment 10개를 전부 읽고 검증을 시작했다.

### 컨테이너·메모리

초기 compose 기대 서비스 24개를 기준으로 실제 실행 컨테이너는 23개였다. 이름 매핑까지 대조한 결과 없는 서비스는 2개였다.

```text
missing: prometheus => samhan-prometheus
missing: nginx => samhan-nginx
initial unhealthy: dc-config-service
inventory-service: healthy (재배포 후에도 healthy)
```

호스트 RAM 원문:

```text
total=61.613 GB
initial free=14.901 GB
pre-deploy=15.174 GB
post-deploy=15.154 GB
live-QA checkpoints=14.574 / 14.352 / 14.300 / 13.027 / 12.700 GB
```

모든 체크포인트가 중단 기준 1.0 GB를 넘었다.

### inventory-service만 재배포

지정된 `scripts/redeploy-service.ps1`은 이 워크트리에 존재하지 않았다.

```text
Test-Path .\scripts\redeploy-service.ps1
False
```

다른 워크트리의 스크립트는 다른 소스를 빌드하므로 사용하지 않고, 이 워크트리에서 그 스크립트와 동등한 순서를 직접 실행했다. 다른 서비스는 재배포하지 않았다.

```powershell
.\gradlew.bat :services:inventory-service:bootJar --no-daemon -q
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml -f C:\dev\Samhan-Public\infrastructure\docker-compose.local-portfix.yml up -d --build --no-deps inventory-service
```

산출물 원문:

```text
host jar: 114277560 bytes, 2026-08-14 08:43:08.275 +09:00
container /app/app.jar: 114277560 bytes, 2026-08-14 08:43:08 +0900
SHA-256: 684007AFDE6545473F8943519FEC6447D2F8AA09C3A8FAA40B790C96B31EE1D1
container created: 2026-08-13T23:49:38.099401938Z
image id: sha256:6e415cd…
```

### 브라우저

로컬 Vite 실제 앱(`http://127.0.0.1:5294`)과 실제 API(`http://127.0.0.1:8080`)를 사용했다. 모든 화면은 `/#/...` 해시 경로로 진입하고, 화면 고유 heading/testid를 먼저 단정했다.

```text
Playwright package: clients/desktop
browser: C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
mode: headless=true
credential source: infrastructure/.env.local (dev_master + QA_DEV_DEFAULT_PASSWORD)
```

합성 PNG, 복제 PNG, mock API는 사용하지 않았다.

## 2. 증거 무결성 정정

직전 보고서의 “이동·판매 ship/confirm·입고 confirm·실사 complete 전 계열 실제 재GET PASS” 주장을 **철회**한다. 다음 3쌍이 SHA-256까지 같았으므로 서로 다른 사건의 증거가 아니었다.

```text
08-sales-ship-refetched == 09-sales-confirm-refetched
05-transfer-source-refetched == 10-inbound-confirm-refetched
06-transfer-destination-refetched == 11-audit-complete-refetched
```

특히 직전 실사는 실제 품목코드 `0000098` 입력이 HTTP 400으로 막혔다고 같은 보고서가 기록했으므로, 그 상태에서 `audit complete 재GET PASS`를 주장한 캡처는 성립할 수 없다.

이번 라운드는 각 mutation 응답 뒤 `/inventory/balances?...` GET 응답(HTTP 200)을 별도로 기다린 경우에만 재GET PASS로 처리했다.

| 사건 | 이번 실제 대상 | 대체 캡처 | 판정 |
|---|---|---|---|
| 이동 confirm | 이동전표 `2026/08/14-15` | `01-transfer-confirm-refetched-real-qa.png` | PASS |
| 판매 ship | 판매전표 `2026/08/14-9` | `02-sales-ship-refetched-real-qa.png` | PASS |
| 판매 confirm | 판매전표 `2026/08/14-9` | `03-sales-confirm-refetched-real-qa.png` | PASS |
| 일반 입고 confirm | 입고전표 `2026/08/14-2` | `04-inbound-confirm-refetched-real-qa.png` | PASS |
| 재고실사 complete | 실사 `2026/08/14-3`, 품목코드 `0000098` | `06-audit-complete-refetched-real-qa.png` | PASS |

추가로 입고검수 complete도 실제로 밟아 `05-inbound-inspection-complete-real-qa.png`에 남겼다. 다섯 사건과 추가 검수 캡처는 모두 서로 다른 화면 상태이며 해시도 다르다.

## 3. 캡처 SHA-256 — 14개, 중복 0

```text
CC4405C3F27D28CBB7A0C1471026F26AC80364435F651743C1E6B7DFEF80CC16  01-transfer-confirm-refetched-real-qa.png
259A9013CB7B206C1840C73A696C5F59305A485DFDF0A97773D832FBA20936D9  02-sales-ship-refetched-real-qa.png
695C716DA3250AB350D89C9C3EC3DE8E291E234378B4953DAD976F6CB0BB4B10  03-sales-confirm-refetched-real-qa.png
1A4665A4A9471DC3C78C5BCAD01C82BD73E6967C336C911A98D3508AD87D8AC2  04-inbound-confirm-refetched-real-qa.png
AAEDACDDBC8AFC533B992C14CFCA7F0EFB4B7F3D73BBD7352BFF717854B113FD  05-inbound-inspection-complete-real-qa.png
2C235D0FD9EA13F998041D473E79481AF58B1F19ABF5BDF01733B393E396E57D  06-audit-complete-refetched-real-qa.png
65D3A33216C273D001FCC1D9DAAFFDED2911415A328E6FD1DCB1F61BCFBEBCA5  07-ledger-1366px-no-overflow-real-qa.png
C025A005BE4A89809CCC2C2EFF6DCD73D53DF5739DCEABD8584B04E0D7DA940D  07-ledger-1440px-no-overflow-real-qa.png
9591B99FE694CDBD7714E142D409928B6C41E44EA107241C18F38E33A2F60ECA  07-ledger-1600px-no-overflow-real-qa.png
A32EAF6AE2D7CDA07F1280A56B533886A52FD8BC6CC0B818A029CFE91D5BBECB  08-ledger-sales-navigation-real-qa.png
F069000D125803D133FDDD69328EAA4396C2BE0D8A00FE8273E7A702E3B2F268  09-ledger-inbound-navigation-real-qa.png
CEA528AC66F221FFC9E9EE903450615345F12CE3AB5CBA8B1C43F6CC41CBDF6F  10-ledger-inbound-inspection-navigation-real-qa.png
45F70A06DCE8F58367B8275CFF3BD3A2B37ACCFAFF9CE7D0A90A601DAAD6CBBA  11-ledger-transfer-navigation-landing-real-qa.png
3B47AE3389308444EB660F82EED3F7C42EFFE0E2E581D9429A12038C8A446CBB  12-ledger-audit-navigation-landing-real-qa.png
```

```text
COUNT=14
DUPLICATE_GROUPS=0
```

## 4. fix 재수렴 결과

### 4.1 수불행 전표번호와 이동

| 원천 | 전표번호 열 | 클릭 결과 |
|---|---|---|
| 판매 `2026/08/14-9` | 채워짐 | PASS — 판매전표 상세와 해당 번호 도달 |
| 일반 입고 `2026/08/14-2` | 채워짐 | PASS — 입고전표 상세와 해당 번호 도달 |
| 입고검수 `2026/08/14-3` | 채워짐 | PASS — 원 입고전표 상세와 해당 번호 도달 |
| 이동 `2026/08/14-15` | 채워짐 | **FAIL** — `/#/transfers?transferNo=...` 일반 목록에만 착지 |
| 재고실사 `2026/08/14-3` | 채워짐 | **FAIL** — `/#/warehouse/audit?auditNo=...` 일반 목록에만 착지 |

판매 회귀는 없었다.

### 4.2 실제 품목코드 재고실사와 조정행

실사 `2026/08/14-3`에서 화면 입력란에 실제 품목코드 `0000098`, 실물수량 4를 입력했다. HTTP 200으로 등록되고 UI에 차이 `+1`이 표시된 뒤 complete HTTP 200을 통과했다.

DB 원문:

```text
2026-08-14 09:13:29.687|ADJUST|1|AUDIT|재고 실사 조정 (2026/08/14-3)|00003
2026/08/14-3|COMPLETED|한경희 선풍기|expected=3|actual=4|diff=1
```

조정행은 수불부에 남고 전표번호도 표시됐으나, 클릭은 특정 실사 상세가 아닌 목록에 그쳤다. 직전 관측 불가 항목은 이번에 **도달 가능한 FAIL**로 재분류한다.

### 4.3 정상 UUID 경로와 없는 품목코드

- 기존 UUID `productId` 요청: HTTP 200. 다른 실사 라인을 장부수량과 같은 실물수량으로 저장했다.
- 문자열 `productCode=0000098` 요청: HTTP 200, 차이 `+1` 저장.
- 존재하지 않는 `productCode=PR1203-NOT-EXIST-...`: 4xx로 거부됨. 실행 assertion은 `[400, 404]` 범위였고 거부를 확인했다. 다만 중간 실행 결과 파일이 후속 재실행으로 덮여 정확한 400/404 숫자와 body 원문은 보존되지 않아 그 이상은 주장하지 않는다.

즉 신규 문자열 경로가 기존 UUID 정상 경로를 막지 않았고, 없는 코드도 수용하지 않았다.

### 4.4 UUID 비공개

수불부 본문·전표번호 열과 판매/입고/입고검수/이동/실사 착지 화면의 body 및 URL을 UUID 정규식으로 검사했다. 노출 0건이었다. 이동·실사 URL에도 업무 전표번호만 존재했다.

### 4.5 직전 PASS 회귀

- 이동 `2026/08/14-15`: `00003 -1`, `HQ-001 +1`, 총량 변화 0, 양쪽 수불행 2개 PASS.
- 수불부 헤더 정확히 10열 PASS: 일자/품목명/품목코드/창고명/거래처명/적요/전표번호/입고수량/출고수량/재고수량.
- 첫 행 `전일재고` PASS.
- 합계/누계 행 PASS. API 합계는 movement rows만 합산해 전일재고를 제외: 입고 22, 출고 16, 마감 6.
- 적요는 한 열 PASS.
- 기본 기간 `2026-05-14 ~ 2026-08-14`, 정확히 3개월 PASS.
- 1366/1440/1600px 모두 table/scroller `1280/1280`, 수평 overflow=false PASS.

### 4.6 PR 본문 dialog 폭 수치 대조

PR 본문 정정값은 1600px에서 `1316.1006px`, 1440px에서 `1297.6543px`다. 같은 실제 dialog DOM의 `getBoundingClientRect().width` 실측은 아래와 같았다.

```text
viewport 1366: dialog=1320px
viewport 1440: dialog=1320px
viewport 1600: dialog=1320px
```

따라서 **PR 본문 수치와 불일치**한다. 제품의 무오버플로 자체는 세 폭 모두 PASS이므로 이 수치 불일치는 사용자 도달 제품 결함으로 세지 않고, PR 증거 정정 필요사항으로 분리한다.

## 5. 도달 가능한 결함 목록 — 2건

1. **이동 수불행 전표 링크가 특정 이동전표를 열지 못함.** `2026/08/14-15` 버튼 클릭 후 URL은 `/#/transfers?transferNo=2026%2F08%2F14-15`지만 화면은 필터/상세가 적용되지 않은 재고이동 일반 목록이다. 정본 결정 3 위반.
2. **재고실사 조정행 전표 링크가 특정 실사를 열지 못함.** `2026/08/14-3` 버튼 클릭 후 URL은 `/#/warehouse/audit?auditNo=2026%2F08%2F14-3`지만 화면은 실사 일반 목록이다. 정본 결정 3 위반.

두 결함 모두 수불부의 전표번호 버튼을 누르는 실제 사용자 경로로 반복 도달했다.

## 6. 관측 불가와 실패 원문

최종 요구 1~6 중 관측 불가 항목은 없다. 다만 정확한 없는-code HTTP 숫자/body는 위 4.3과 같이 보존되지 않았으므로 4xx 거부 이상의 상세는 관측 불가다.

검증 도중 제품 결함으로 세지 않은 하네스 중단 원문:

```text
Test-Path .\scripts\redeploy-service.ps1 => False
Locator: getByTestId('inbound-inspection-dialog') / element(s) not found
strict mode violation: getByRole('button', { name: '검수 완료', exact: true }) resolved to 2 elements
TimeoutError: page.waitForResponse: Timeout 15000ms exceeded while waiting for event "response"
<td> from <div ... data-testid="ds-modal-backdrop"> subtree intercepts pointer events
```

실제 DOM의 `dialog/alertdialog` 역할로 locator를 교정하고, 이미 완료된 mutation은 DB 상태를 확인한 뒤 중복 실행하지 않았다. 최종 링크 검증 실행 원문은 `1 passed (6.0s)`다.

## 7. 공유 DB에 만든·바꾼 것

### 이번 reconv2가 생성

- 이동전표 `2026/08/14-13`, `-14`, `-15`: 모두 CONFIRMED. 최종 증거는 `-15`.
- 판매전표 `2026/08/14-8`, `-9`: 모두 CONFIRMED. 최종 증거는 `-9`.
- 일반 입고전표 `2026/08/14-2`: CONFIRMED.
- 입고검수용 입고전표 `2026/08/14-3`: slip은 SAVED, 연결 검수는 COMPLETED/stock_applied=true.

발생 수불행 중 최종 대상:

```text
09:05:30.095|TRANSFER_OUT|-1|STOCK_TRANSFER|2026/08/14-15|00003
09:05:30.100|TRANSFER_IN|+1|STOCK_TRANSFER|2026/08/14-15|HQ-001
09:05:32.928|DEDUCT|-1|SLIP|판매 2026/08/14-9|HQ-001
09:05:38.960|INBOUND|+1|INBOUND|입고 2026/08/14-2|HQ-001
09:12:28.569|INBOUND|+1|INBOUND_INSPECTION|2026/08/14-3|HQ-001
09:13:29.687|ADJUST|+1|AUDIT|2026/08/14-3|00003
```

### 이번 실행이 변경한 직전 라운드 행

초기 5초 wrapper가 종료된 뒤 child가 남아 다음 기존 행을 변경했다. 이 행들은 이번 PASS 증거로 사용하지 않았다.

- 이동전표 `2026/08/14-12`: RECEIVED → CONFIRMED, 이동 수불행 -1/+1 생성.
- 판매전표 `2026/08/14-7`: INSPECTING → CONFIRMED, 판매 차감행 생성.

재고실사 `2026/08/14-3`은 직전 라운드가 만든 IN_PROGRESS 행을 이번에 변경했다. UUID 경로로 한 라인을 `expected=1, actual=1`, 실제 코드 `0000098` 경로로 다른 라인을 `expected=3, actual=4`로 기록하고 COMPLETED로 전환했다. 삭제·되돌림은 수행하지 않았다.
