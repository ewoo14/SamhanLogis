# PR #1203 머지 직전 재수렴 적대검증 (SOL)

검증일: 2026-08-14 KST  
대상: `fix/stock-transfer-confirm-noop` / `288cf43e646a0407d1d54a3d9f3a308d5af63e43`  
판정: **도달 가능한 결함 3건. 머지 불가.**

검증 질문은 “실 사용자 경로로 재현 가능한 결함이 남아 있는가” 하나로 제한했다. 테스트 강도·mock·가드·문서 품질은 판정하지 않았다.

## 1. 환경 실측 원문

### 1.1 대상 ref

Git 명령은 사용하지 않았다. worktree ref 파일을 읽었다.

```text
HEAD_REF_RAW=ref: refs/heads/fix/stock-transfer-confirm-noop
HEAD_SHA_RAW=288cf43e646a0407d1d54a3d9f3a308d5af63e43
```

`gh pr view 1203 --json ...`도 같은 값을 반환했다.

```text
headRefName=fix/stock-transfer-confirm-noop
headRefOid=288cf43e646a0407d1d54a3d9f3a308d5af63e43
```

### 1.2 브랜치 JAR 빌드·inventory-service 단독 재배포

`scripts/redeploy-service.ps1`은 이 worktree에 없었다. 지시된 fallback 순서를 그대로 사용했다.

```powershell
.\gradlew.bat :services:inventory-service:bootJar --no-daemon
```

```text
BUILD SUCCESSFUL in 11s
host jar: services/inventory-service/build/libs/inventory-service.jar
size=114276457
LastWriteTime=2026-08-14 07:45:19 KST
SHA256=6023CF6796D55F99598F26E759AAE99C21C22E0B258CDCD4970CDDA7CE01A0F1
```

```powershell
docker compose -f infrastructure/docker-compose.yml `
  -f infrastructure/docker-compose.local-all.yml `
  -f C:\dev\Samhan-Public\infrastructure\docker-compose.local-portfix.yml `
  up -d --build --no-deps inventory-service
```

`inventory-service` 외 컨테이너는 재배포하지 않았다.

```text
/samhan-inventory-service|2026-08-13T22:45:40.743919861Z|infrastructure-inventory-service|running|healthy
/app/app.jar|2026-08-14 07:45:19.000000000 +0900|114276457
6023cf6796d55f99598f26e759aae99c21c22e0b258cdcd4970cdda7ce01a0f1  /app/app.jar
```

컨테이너 `.Created`는 UTC라 2026-08-14 07:45:40 KST에 해당한다. 컨테이너 안 JAR의 시각·크기·SHA가 방금 만든 host JAR와 일치한다.

### 1.3 컨테이너 — 없는 것까지 계수

```text
EXPECTED_COUNT=24
RUNNING_COUNT=23
```

compose 예상 서비스 중 실제 부재는 `prometheus`, `nginx` 2개다. `eureka-server`는 컨테이너 이름만 `samhan-eureka`라 단순 이름 대조에는 부재로 보였지만 실제 실행 중이다. compose 외 `samhan-logging-service` 1개가 추가 실행 중이었다.

```text
RUNNING_CONTAINERS:
samhan-accounting-service
samhan-api-gateway
samhan-arologis-service
samhan-auth-service
samhan-dashboard-service
samhan-dc-config-service
samhan-elasticsearch
samhan-eureka
samhan-grafana
samhan-groupware-service
samhan-inventory-service
samhan-logging-service
samhan-minio
samhan-notification-service
samhan-partner-auth-service
samhan-partner-order-service
samhan-partner-service
samhan-postgres
samhan-product-service
samhan-rabbitmq
samhan-redis
samhan-slip-service
samhan-user-service
```

### 1.4 RAM

```text
최초 실측       Total=61.613GB  Free=18.273GB
배포 직전                      Free=18.166GB
배포 직후                      Free=17.946GB
후속 QA 시작                   Free=18.904GB
최종 실측       Total=61.613GB  Free=18.010GB
```

1.0GB 미만이 된 적은 없다.

### 1.5 브라우저

인앱 Browser 런타임은 사용하지 않았다. desktop 패키지 안에서 아래 로컬 Chromium을 headless로 직접 launch했다.

```text
C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
```

앱 URL은 `http://127.0.0.1:5293/#/...`, API는 `http://127.0.0.1:8080`을 사용했다. 각 화면 캡처 전에 해당 화면 고유 heading/test-id를 단언했다.

## 2. 밟은 시나리오와 결과

### 2.1 재고이동 confirm — PASS

실 UI에서 생성 → 승인 → 출고 → 입고 → 확정했다. 확정 전에 같은 SPA 세션에서 양쪽 재고현황과 수불부를 조회해 캐시를 채웠다.

대표 표본 `2026/08/14-11`, 품목 `0000098`, 수량 1:

```text
2026/08/14-11 | HQ-001 | TRANSFER_OUT | -1 | 2026/08/14-11
2026/08/14-11 | 00003  | TRANSFER_IN  | +1 | 2026/08/14-11
total_delta=0 | movement_rows=2
```

이 라운드에서 확정한 이동 `2026/08/14-6~11` 모두 movement 2행, 합계 delta 0이었다. 출발/도착 수불부에도 각각 행이 표시됐다.

확정 뒤 양쪽 재고현황 GET 2회와 수불부 GET이 새로 발생했다. 이동 confirm 캐시 무효화 PASS.

### 2.2 캐시 무효화 계열 — PASS

각 변이 전에 같은 SPA 세션에서 본사 또는 초월 재고현황을 조회해 캐시를 채우고, 변이 직후 동일 조회 버튼을 눌러 실제 `GET /inventory/balances` HTTP 200을 다시 관측했다.

| 경로 | 실 사용자 전이 | 결과 |
|---|---|---|
| 이동 | `confirm` | 재고현황 양쪽 + 수불부 재GET PASS |
| 판매 | 결재선 검수자 `inspect` → 관리자 `ship` → `deliver` → `confirm` | `ship`, `confirm` 각각 재GET PASS |
| 입고 | 관리자 상태 전이 → 창고 담당자 `inspect` → 관리자 `confirm` | 재GET PASS |
| 실사 | 등록 → 시작 → `complete` | 재GET PASS |

판매 검수는 일반 창고 계정이 아니라 해당 전표 결재선 검수자 `kimgicheol`로 실행했다. 입고 검수는 `dev_warehouse`, 나머지는 `dev_master`를 사용했다.

### 2.3 수불부 결정 1~7 — 일부 PASS, 전표 이동 FAIL

실 앱·실 API·실 DB의 품목 `0000098` 수불부를 열었다.

```text
headers=[일자, 품목명, 품목코드, 창고명, 거래처명, 적요, 전표번호, 입고수량, 출고수량, 재고수량]
start=2026-05-14
end=2026-08-14
openingDescription=전일재고
openingInbound=0
openingOutbound=0
summaryLabel=합계 / 누계
totalInbound=15 == 기간 거래행 입고합 15
totalOutbound=10 == 기간 거래행 출고합 10
closing=5
```

- 엑셀본 9열 + 전표번호 1열: PASS
- 전일재고 행 유지: PASS
- 합계/누계 신설 및 전일재고 제외: PASS
- 적요 한 열: PASS
- 최근 3개월: PASS
- 판매전표 `2026/08/14-6` 클릭 후 판매전표 상세 이동: PASS
- 이동·입고전표 이동: FAIL — 결함 1, 2 참조

### 2.4 모달 폭 — PASS, 단 기존 실측 수치 정정

```text
WIDTH_METRICS=
1600: dialog=1316.1005859375, table=1280/1280, scroller=1280/1280, overflow=false, productHeader=127.09219360351562
1440: dialog=1297.654296875, table=1280/1280, scroller=1280/1280, overflow=false, productHeader=125.31088256835938
1366: dialog=1297.73291015625, table=1280/1280, scroller=1280/1280, overflow=false, productHeader=125.3184814453125
```

세 viewport 모두 가로 오버플로가 없었다. 따라서 사용자 도달 폭 결함은 없다.

다만 PR 최종 코멘트가 원문 실측으로 적은 아래 값은 현재 HEAD 실 앱에서 재현되지 않았다.

```text
PR 기존 주장: 1600 dialog 1320px / 1440 dialog 1320px
현재 실측:    1600 dialog 1316.1006px / 1440 dialog 1297.6543px
```

table 1280px과 `overflow=false`는 재현됐다. 이 보고서의 live 수치로 정정한다. 이전 `1440px 품목명 103.28px` 주장도 현재 live 데이터에서는 `125.3109px`였다.

## 3. 스크린샷 목록

모두 로컬 Playwright Chromium + 실 앱 + 실 서버 캡처다.

1. `01-ledger-1600-real-qa.png` — 1600px 수불부
2. `01-ledger-1440-real-qa.png` — 1440px 수불부
3. `01-ledger-1366-real-qa.png` — 1366px 수불부
4. `04-transfer-confirmed-real-qa.png` — 이동 확정 상세
5. `05-transfer-source-refetched-real-qa.png` — 출발 재고 재조회
6. `06-transfer-destination-refetched-real-qa.png` — 도착 재고 재조회
7. `07-transfer-ledger-both-sides-real-qa.png` — 양쪽 이동 수불행
8. `08-sales-ship-refetched-real-qa.png` — 판매 ship 후 재조회
9. `09-sales-confirm-refetched-real-qa.png` — 판매 confirm 후 재조회
10. `10-inbound-confirm-refetched-real-qa.png` — 입고 confirm 후 재조회
11. `11-audit-complete-refetched-real-qa.png` — 실사 complete 후 재조회
12. `12-ledger-decisions-1-to-7-real-qa.png` — 10열·전일재고·합계·3개월 및 결함 1·2
13. `13-ledger-sales-navigation-real-qa.png` — 판매전표 클릭 이동 성공
14. `15-audit-product-code-400-real-qa.png` — 실사 품목코드 입력 HTTP 400

## 4. 도달 가능한 결함

### 결함 1 — 이동전표 번호가 전표번호 열이 아니라 적요에만 있고 클릭할 수 없음

재현:

1. 재고이동 `2026/08/14-11`을 실 UI에서 확정한다.
2. 재고 현황 → 본사창고 → `0000098` 수불부를 연다.
3. 이동행의 `적요`에는 `2026/08/14-11`이 보이지만 `전표번호` 열은 빈칸이다.
4. `전표 2026/08/14-11 열기` 버튼이 0개라 이동전표 화면으로 갈 수 없다.

DB 원문은 `reference_type=STOCK_TRANSFER`, 유효한 `reference_id`, `note=2026/08/14-11`이다. 화면이 note만 적요에 보여주고 정식 전표번호 링크로 만들지 않는다.

Playwright 원문:

```text
waiting for getByRole('dialog', { name: '재고수불부' })
  .getByRole('button', { name: '전표 2026/08/14-11 열기' })
Test timeout of 120000ms exceeded.
```

위반: 결정 2-3, 2-4, 2-5, 결정 6.

### 결함 2 — 확정한 입고전표의 수불행에 전표번호가 전혀 없고 클릭할 수 없음

재현:

1. 입고전표 `2026/08/14-1`, 품목 `0000098`, 수량 1을 실 UI 상태 전이로 확정한다.
2. 본사창고 `0000098` 수불부를 연다.
3. 마지막 `INBOUND +1` 행은 거래처·적요·전표번호가 모두 빈칸이다.
4. `전표 2026/08/14-1 열기` 버튼이 없어 입고전표 상세로 갈 수 없다.

DB 원문:

```text
movement_type=INBOUND
quantity_delta=+1
reference_type=INBOUND
reference_id=NULL
note=NULL
```

비교군인 판매 `2026/08/14-6`은 같은 모달에서 전표번호 링크가 보이고 클릭 후 판매전표 상세로 정상 이동했다.

Playwright 원문:

```text
waiting for getByRole('dialog', { name: '재고수불부' })
  .getByRole('button', { name: '전표 2026/08/14-1 열기' })
Test timeout of 120000ms exceeded.
```

위반: 결정 2-3, 2-4, 2-5.

### 결함 3 — 재고실사의 “품목코드 / 바코드” 입력에 실제 품목코드를 넣으면 HTTP 400

재현:

1. 초월창고 실사 `2026/08/14-3`을 등록하고 시작한다.
2. 화면 라벨과 placeholder가 안내하는 `품목코드 / 바코드`에 실제 품목코드 `0000098`을 입력한다.
3. 실물 수량 `4`를 입력하고 `입력`을 누른다.
4. 화면에 `요청 본문이 유효하지 않습니다`가 표시되고 입력이 기록되지 않는다.

원문:

```text
AUDIT_INPUT_RAW=400 {"success":false,"code":"INVALID_INPUT","message":"요청 본문이 유효하지 않습니다","data":null,"timestamp":"2026-08-13T23:25:49.447823461Z"}
```

실사용자가 화면이 요구하는 품목코드를 그대로 입력해 재현할 수 있는 결함이다.

## 5. 관측 불가 항목

재고실사 조정행의 전표번호 클릭 이동은 독립 판정하지 못했다. 결함 3 때문에 우리 실사 `2026/08/14-3`에 차이수량을 기록하지 못해 조정 movement가 생성되지 않았다.

실패 명령:

```powershell
npx playwright test --config playwright/1203-reconv-real-qa/playwright.config.ts `
  playwright/1203-reconv-real-qa/1203-resume-real-qa.spec.ts
```

실패 원문:

```text
Error: 실사 수량 입력
Expected: 200
Received: 400
화면 alert: 요청 본문이 유효하지 않습니다
```

나머지 요구 항목은 모두 실행했다. 미실행을 결함 0으로 판정한 항목은 없다.

## 6. 공유 DB에 만든·바꾼 것 전부

### 6.1 이동전표

모두 수량 1, marker `PR1203-SOL-RECONV-*`.

| 번호 | 품목 | 방향 | 최종 상태 | 재고 영향 |
|---|---|---|---|---|
| 2026/08/14-5 | AJ030RXH4BC1 | HQ-001 → 00003 | RECEIVED | 없음 |
| 2026/08/14-6 | AJ030RXH4BC1 | HQ-001 → 00003 | CONFIRMED | -1 / +1 |
| 2026/08/14-7 | 0000098 | 00003 → HQ-001 | CONFIRMED | -1 / +1 |
| 2026/08/14-8 | 0000098 | 00003 → HQ-001 | CONFIRMED | -1 / +1 |
| 2026/08/14-9 | 0000098 | 00003 → HQ-001 | CONFIRMED | -1 / +1 |
| 2026/08/14-10 | 0000098 | HQ-001 → 00003 | CONFIRMED | -1 / +1 |
| 2026/08/14-11 | 0000098 | HQ-001 → 00003 | CONFIRMED | -1 / +1 |
| 2026/08/14-12 | 0000098 | HQ-001 → 00003 | RECEIVED | 없음 |

### 6.2 판매·입고전표

모두 품목 `0000098`, 수량 1, 거래처 `능동에어컨(박수천)`, marker `PR1203-SOL-RECONV-*`.

| 번호 | 유형 | 창고 | 최종 상태 | 재고 영향 |
|---|---|---|---|---|
| 2026/08/14-4 | OUTBOUND | 00003 | DRAFT | 없음 |
| 2026/08/14-5 | OUTBOUND | 00003 | PROCESSING | 예약/차감 없음 |
| 2026/08/14-6 | OUTBOUND | HQ-001 | CONFIRMED | RESERVE +1, DEDUCT -1 |
| 2026/08/14-7 | OUTBOUND | HQ-001 | INSPECTING | RESERVE +1, DEDUCT -1 |
| 2026/08/14-1 | INBOUND | HQ-001 | CONFIRMED | INBOUND +1 |

### 6.3 재고실사

| 번호 | 대상일 | 창고 | 최종 상태 | 재고 영향 |
|---|---|---|---|---|
| 2026/08/14-2 | 2026-08-13 | 00003 | COMPLETED | 장부와 동일, 조정 없음 |
| 2026/08/14-3 | 2026-08-12 | 00003 | IN_PROGRESS | 품목코드 입력 400, 조정 없음 |

삭제·원복은 하지 않았다. 다른 트랙이 만든 기존 행은 결함·생성 목록에 포함하지 않았다.

## 7. 증거 무결성 정정 요약

PR의 “전표 클릭 이동 보존” 주장은 현재 HEAD에서 판매만 재현되고 이동·입고는 재현되지 않았다. 도달 결함 1, 2로 정정한다.

PR의 최종 폭 코멘트 중 table 1280과 `overflow=false`는 재현됐지만 dialog `1320px` 고정 수치는 재현되지 않았다. 현재 live 수치는 1600 viewport에서 `1316.1006px`, 1440에서 `1297.6543px`이다.

최종 게이트:

```text
실 사용자 도달 결함: 3
관측 불가: 재고실사 조정행 전표 이동 1항목 (결함 3에 의해 차단)
머지 판정: 보류
```
