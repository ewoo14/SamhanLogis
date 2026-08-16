# PR #1241 CODEX SOL 적대검증 R15

## ① 환경 확인

요청된 명령과 최초 실행 출력 원문이다.

```text
PS C:\dev\Samhan-Public\.claude\worktrees\wgas1> git rev-parse HEAD
7b4c94fb44db354f311d90b9235b6b32da8a66eb
PS C:\dev\Samhan-Public\.claude\worktrees\wgas1> git rev-parse --abbrev-ref HEAD
feat/gas-parity-order-web
PS C:\dev\Samhan-Public\.claude\worktrees\wgas1> git status --porcelain
PS C:\dev\Samhan-Public\.claude\worktrees\wgas1> gh pr checks 1241
Desktop Playwright (mock 회귀 hard gate)	fail	13m21s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110184/job/95152686682
GitGuardian Security Checks	fail	1s	https://dashboard.gitguardian.com
JUnit 테스트 결과 (product-quantity-sync-schema)	fail	0	https://github.com/ewoo14/Samhan-Public/runs/95153175938
JUnit 테스트 결과 (user+product+inventory+logging)	fail	0	https://github.com/ewoo14/Samhan-Public/runs/95153287880
문서 본문 단언 스펙 (mock 게이트 중 docs/** 를 읽는 것)	fail	1m8s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110190/job/95152686666
빌드 + 테스트 (product-quantity-sync-schema)	fail	2m44s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686656
빌드 + 테스트 (user+product+inventory+logging)	fail	2m43s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686731
#910 문서 계약 테스트 (docs/dev-reports 관할)	pass	35s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110190/job/95152686649
App Build Version Guard (scripts/app-build-version, #910/#928)	pass	33s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686641
Config Audit Guard (다운스트림 URL/포트 정합, #745)	pass	35s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686629
Credential Plaintext Guard (SP-08-8)	pass	1m6s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686590
Detox Android (arologis-mobile, AVD)	pass	1m15s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110184/job/95152686668
Detox Android (mobile v4, AVD)	pass	1m53s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110184/job/95152686612
Frontend DS (typecheck + lint + build + storybook)	pass	1m54s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686637
Frontend Desktop (typecheck + lint + build)	pass	4m41s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152934878
Frontend Mobile (삼한 모바일 · typecheck + jest)	pass	48s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686709
Frontend Mobile-Public (typecheck + lint + test + build)	pass	1m24s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152934817
Frontend Mobile-Staff (typecheck + jest + expo doctor + prebuild dry-run)	pass	1m3s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686715
Frontend Order-App (typecheck + test + build)	pass	43s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686625
Internal Chat Desktop (typecheck + lint + test + build)	pass	1m28s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686670
JUnit 테스트 결과 (accounting+partner)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95153600632
JUnit 테스트 결과 (accounting-cash-receipt-it)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95153093159
JUnit 테스트 결과 (accounting-codef-it)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95153196927
JUnit 테스트 결과 (accounting-deposit-mapping-it)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95153144201
JUnit 테스트 결과 (accounting-partner-integrity-it)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95153240934
JUnit 테스트 결과 (phase9-10 (groupware+notification+dashboard))	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95153156113
JUnit 테스트 결과 (shared+auth+gateway)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95153232909
JUnit 테스트 결과 (slip-it-core)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95153151113
JUnit 테스트 결과 (slip-it-public)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95153267253
JUnit 테스트 결과 (slip-units)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95153089497
Local Stack Port Resolver Guard (#1113)	pass	1m13s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686600
Notion Runtime Zero Guard (SP-08-7)	pass	41s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686660
Playwright (web + electron + mobile emul)	pass	2m6s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110184/job/95152686654
S1 logging opt-in 계약 (docs/local-stack 관할)	pass	46s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110190/job/95152686657
빌드 + 테스트 (accounting+partner)	pass	5m20s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686766
빌드 + 테스트 (accounting-cash-receipt-it)	pass	1m33s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686742
빌드 + 테스트 (accounting-codef-it)	pass	1m24s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686759
빌드 + 테스트 (accounting-deposit-mapping-it)	pass	1m39s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686720
빌드 + 테스트 (accounting-partner-integrity-it)	pass	1m29s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686793
빌드 + 테스트 (phase9-10 (groupware+notification+dashboard))	pass	1m41s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686722
빌드 + 테스트 (shared+auth+gateway)	pass	1m31s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686787
빌드 + 테스트 (slip-it-core)	pass	1m38s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686726
빌드 + 테스트 (slip-it-public)	pass	1m52s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686717
빌드 + 테스트 (slip-units)	pass	1m22s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110183/job/95152686707
자격 평문 비공개 가드 (docs 관할, SP-08-8)	pass	44s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110190/job/95152686672
적용된 Flyway 마이그레이션 불변 가드	pass	39s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110193/job/95152686740
하네스 거짓 green 가드 (docs/qa 관할)	pass	1m24s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942110199/job/95152686693
```

최초 `git status --porcelain` 출력은 0행이었다. `git add`, `git commit`, `git push`는 실행하지 않았다.

PR HEAD JAR 격리 실행 해시 대조:

```text
product host     76028F5F3D108BFACCBB98FF44AA97CCE1BB9AC9D93F0B1FF867C71496D23080
product runtime  76028f5f3d108bfaccbb98ff44aa97cce1bb9ac9d93f0b1ff867c71496d23080  /app/app.jar
partner host     1791CE23B685637F5F54731C8C44FB1DEEEBC8963D805A2B24B00A7CA27037DC
partner runtime  1791ce23b685637f5f54731c8c44fb1deeeebc8963d805a2b24b00a7ca27037dc  /app/app.jar
```

## ② CI 카운트

최종 재조회 기준 `TOTAL=47`, `SUCCESS=40`, `FAILURE=7`, `PENDING=0`이다. 실패 7건은 위 원문의 Desktop Playwright, GitGuardian, 두 JUnit 결과, 문서 본문 단언, 두 빌드+테스트 항목이다.

## ③ 미리보기 정상 응답 원문

실 주문서 화면에서 품목 2세트를 선택했고, 실제 응답 6행과 화면 6행이 일치했다.

```text
PREVIEW_COUNTS response=6 screen=6
{"success":true,"code":"OK","message":"성공","data":{"lines":[{"lineId":"0","modelCode":"AC060CN6PBH1","quantity":1,"listPrice":616975,"finalPrice":616975,"appliedRate":0},{"lineId":"1","modelCode":"AC060CXAPBH1","quantity":1,"listPrice":925050,"finalPrice":925050,"appliedRate":0},{"lineId":"2","modelCode":"PC6NUNK1NW","quantity":1,"listPrice":104060,"finalPrice":104060,"appliedRate":0},{"lineId":"3","modelCode":"AR-EH05","quantity":1,"listPrice":13915,"finalPrice":13915,"appliedRate":0},{"lineId":"4","modelCode":"AR06D1150HZN","quantity":1,"listPrice":148000,"finalPrice":148000,"appliedRate":0},{"lineId":"5","modelCode":"AR06D1150HAX","quantity":1,"listPrice":222000,"finalPrice":222000,"appliedRate":0}],"totalListAmount":2030000,"totalFinalAmount":2030000,"totalDiscountAmount":0},"timestamp":"2026-08-16T11:09:14.414662203Z"}
```

opaque UUID 역직렬화 fix는 500 없이 실제 HTTP 200으로 도달했다.

## ④ R15 VAT 경계표 실측

PR HEAD partner JAR, 격리 partner DB, 별도 복제 dc-config DB/JVM으로 직접 draft→confirm→저장했다.

| VAT 포함 입력 | draft HTTP | confirm HTTP/총액 | 저장 공급가 | 저장 VAT | 판정 |
|---:|---:|---:|---:|---:|---|
| 5 | 201 | 200 / 5 | 5 | 0 | 일치 |
| 6 | 201 | 200 / 6 | 5 | 1 | 일치 |
| 11 | 201 | 200 / 11 | 10 | 1 | 일치 |
| 800,000 | 201 | 200 / 800,000 | 727,273 | 72,727 | 일치 |

저장 원문:

```text
2026/08/16-3|5.00|5.00|5.00|0.00
2026/08/16-4|6.00|6.00|5.00|1.00
2026/08/16-5|11.00|11.00|10.00|1.00
2026/08/16-6|800000.00|800000.00|727273.00|72727.00
```

## ⑤ R13 세트 배분표 실측

| 세트 | 구성품 | 요구값 | 실 화면→미리보기→저장값 | 판정 |
|---|---|---:|---:|---|
| AR06D1150HZS | 실내기 AR06D1150HZN | 148,000 | 148,000 | 일치 |
| AR06D1150HZS | 실외기 AR06D1150HAX | 222,000 | 222,000 | 일치 |
| AR06D1150HZS | 합계 | 370,000 | 370,000 | 일치 |
| AC060CS6PBH1SY | 실내기 AC060CN6PBH1 | **925,050** | **616,975** | **불일치** |
| AC060CS6PBH1SY | 실외기 AC060CXAPBH1 | **616,975** | **925,050** | **불일치** |
| AC060CS6PBH1SY | 패널 PC6NUNK1NW | 104,060 | 104,060 | 일치 |
| AC060CS6PBH1SY | 리모컨 AR-EH05 | 13,915 | 13,915 | 일치 |
| AC060CS6PBH1SY | 합계 | 1,660,000 | 1,660,000 | 합계만 일치 |

DB 원문도 라벨과 금액의 역전을 그대로 보존했다.

```text
AC060CN6PBH1|360 CST UV 실내기|616975.00|616975.00|560886.00|56089.00|PRICE
AC060CXAPBH1|360 CST UV 실외기|925050.00|925050.00|840955.00|84095.00|PRICE
PC6NUNK1NW|판넬 (360CST / 원형 / WIFI)|104060.00|104060.00|94600.00|9460.00|PRICE
AR-EH05|무선리모컨(냉난방전용)|13915.00|13915.00|12650.00|1265.00|PRICE
AR06D1150HZN|냉전 일반 벽걸이 실내기|148000.00|148000.00|134545.00|13455.00|PRICE
AR06D1150HAX|냉전 일반 벽걸이 실외기|222000.00|222000.00|201818.00|20182.00|PRICE
```

## ⑥ R03·R05·R08 화면 확인

- R03: 데스크톱 `/#/sales/partner-orders/2026-08-16-2`에서 화면 전용 제목 `주문서 상세`을 단정한 뒤 `거래처 · 주식회사 중앙유통`을 확인했다. fallback 통과.
- R05: 주문 화면 입력과 저장값이 모두 `배송/현장=서울특별시 R15 격리 QA로 15 15층`, `010-1234-5678`, `2026-08-20`, `2026-08-31`, `R15 헤더 보존 격리 QA`로 일치했다. 헤더 보존 통과.
- R08: 화면이 만든 `setAllocation=true` 수동 배분 단가 6행이 미리보기·최종확인·DB `price_vat`에 그대로 도달했고, 각 공급가/VAT가 재계산됐다. 단, AC 두 핵심 구성품의 라벨별 원천 배분 자체는 ⑤의 결함이다.

저장 헤더 원문:

```text
2026/08/16-2|1068689215|1068689215|2030000.00|서울특별시 R15 격리 QA로 15 15층|서울특별시 R15 격리 QA로 15 15층|010-1234-5678|2026-08-20|2026-08-31|R15 헤더 보존 격리 QA
```

## ⑦ 금액 4단계 비교표

| 대상 | 품목표 | 미리보기 | 최종확인 | 저장값 |
|---|---:|---:|---:|---:|
| AR06D1150HZS 세트 | 370,000 | 148,000 + 222,000 = 370,000 | 동일 2행 | 동일 2행 / 합계 370,000 |
| AC060CS6PBH1SY 세트 | 1,660,000 | 616,975 + 925,050 + 104,060 + 13,915 = 1,660,000 | 동일 4행 | 동일 4행 / 합계 1,660,000 |
| 주문 전체 | 2,030,000 | 2,030,000 / 6행 | 2,030,000 / 6행 | 2,030,000 / 6행 |

확정 응답 원문:

```text
{"success":true,"code":"OK","message":"성공","data":{"orderNo":"2026/08/16-2","slipNo":null,"status":"DRAFT","slipPublishStatus":"NOT_REQUIRED","totalAmount":2030000,"confirmedAt":null},"timestamp":"2026-08-16T11:09:16.189093566Z"}
```

## ⑧ 시트 차단 + 카탈로그 유지 양방향

부팅/주기 로그와 URL 탐지 원문:

```text
[ProductSheetSyncScheduler] Google Sheets runtime 연동 폐기 — 부팅 sync skip
[ProductSheetSyncScheduler] Google Sheets runtime 연동 폐기 — DB source-of-truth 유지
PRODUCT_OUTBOUND_GOOGLE_URL_COUNT=0
[BootstrapService] product_db catalog prefetch 완료: keys=[homemulti, homeInc, singleSets, singleInc, singleParts, singlePartsInc, singleMatPrices, commercialMulti, commInc, commercialParts, commPartsInc, oldProducts, priceChangeSchedule]
[BootstrapService] DB catalog prefetch 완료 — Google Sheets runtime 연동 없음
PARTNER_OUTBOUND_GOOGLE_URL_COUNT=0
[BootstrapCacheRefreshScheduler] bootstrap cache refresh 시작
[BootstrapCacheRefreshScheduler] bootstrap cache refresh 완료
```

카탈로그는 `HTTP 200`, 응답 `705433 bytes`, `singleSets=224`, `singleParts=1447`이었고 실 화면에 `AR06D1150HZS=370,000`, `AC060CS6PBH1SY=1,660,000`이 표시됐다. 변경 서비스 health는 product 200, partner 200이었다. `docker compose -f infrastructure/docker-compose.prod.yml --env-file infrastructure/.env.local config --quiet`는 exit 0이었다(로컬 env에 없는 운영 전용 DB/ECR/SMTP 값 경고는 출력됨).

양방향에서 남은 사용자 도달 결함: 관리자 `/#/admin/sheet-sync`가 폐기된 기능을 여전히 `지금 동기화` 버튼으로 노출한다. 클릭 실측 원문은 다음과 같다.

```text
SHEET_ADMIN_RAW HTTP=410 {"success":false,"code":"SHEET_SYNC_DISABLED","message":"Google Sheets 연동은 폐기되었으며 DB 카탈로그만 사용합니다.","data":null,"timestamp":"2026-08-16T11:20:13.441655182Z"}
SHEET_ADMIN_SCREEN 동기화 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
```

즉, 금지된 연결은 끊겼고 DB 카탈로그/스케줄러는 살아 있지만, 남아 있는 관리자 정상 UX는 깨졌다.

## ⑨ 캡처

Playwright는 `clients/desktop` 패키지 안에서 Chromium 1217, `headless: true`로 실행했다. 주문 화면 전용 `#bizGateInput`, `#cardSingle`, 데스크톱 화면 전용 제목을 각각 단정했다. 마지막 주문 실화면 스펙은 `1 passed (4.4s)`, 데스크톱 실화면 스펙은 `1 passed (2.2s)`였다. 응답 6행=미리보기 화면 6행=최종확인 6행이다.

모든 파일은 `resolveQaShotsDir()` 결과인 `docs/qa/1241-r15-adversarial/screenshots/_local/`에 있으며 직접 육안 확인했다.

| 파일 | bytes | 육안 확인 |
|---|---:|---|
| `01-preview-ar-ac.png` | 86,227 | 미리보기 6행·합계 2,030,000 |
| `02-order-headers.png` | 39,933 | 주소·전화·납기·입금·메모 |
| `03-final-confirm.png` | 103,132 | 최종확인 6행 |
| `04-send-complete.png` | 98,046 | 전송 완료 |
| `05-partner-name-fallback.png` | 84,174 | 거래처명·저장 헤더·6행 |
| `06-sheet-sync-gone.png` | 42,610 | 폐기 기능 버튼과 일반 오류 |

## ⑩ 도달 결함

### 결함 1 — AC 세트의 실내기·실외기 배분금액이 뒤바뀜

재현:

1. 주문서 웹 `/#/order`에서 사업자번호 경계를 통과한다.
2. 싱글중대형에서 `AC060CS6PBH1SY` 수량 1을 선택한다.
3. 가격 미리보기로 진행한다.
4. `360 CST UV 실내기 AC060CN6PBH1=616,975`, `360 CST UV 실외기 AC060CXAPBH1=925,050`을 확인한다.
5. 최종확정 후 저장 DB도 같은 값이다. 요구 계약은 실내기 925,050 / 실외기 616,975이다.

합계는 1,660,000으로 맞아 합계 검사만으로는 발견되지 않지만, 사용자가 구성품별 단가를 화면에서 직접 보므로 도달 결함이다.

### 결함 2 — 폐기된 시트 동기화 관리 기능이 실행 가능한 것처럼 남아 일반 장애를 표시

재현:

1. MASTER로 데스크톱 `/#/admin/sheet-sync`에 진입한다.
2. 화면 전용 제목 `구글 시트 동기화`와 `지금 동기화` 버튼을 확인한다.
3. 버튼을 클릭한다.
4. 서버는 의도된 `410 SHEET_SYNC_DISABLED`를 반환하지만 화면은 폐기 안내 대신 `동기화 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.`를 표시한다.

실 사용자는 폐기된 기능을 정상 기능으로 오인해 반복 재시도하게 된다.

## ⑪ 증거 무결성 자기 고지

LUNA 표를 전재하지 않고 모든 수치를 PR HEAD 격리 JAR·실 HTTP·Playwright·격리 DB에서 다시 셌다. 직전 fix 코멘트의 ⑥ 표는 `AC 실내기=925,050 / 실외기=616,975`를 “실측”으로 적었지만, 그 코멘트 스스로 라이브 HTTP/저장을 측정하지 못했다고 ⑨·⑫에 한계를 고지했다. 이번 실제 화면·응답·저장에서는 라벨별 수치가 반대이므로, 해당 표를 라이브 실측 증거로 사용하면 안 된다. 이를 증거 무결성 정정 1건으로 고지한다.

초기 PowerShell `Invoke-WebRequest`의 한글 `message`가 콘솔 코드페이지 때문에 깨진 출력이 있었으므로, 보고서의 한글 API 원문은 Playwright가 UTF-8로 포착한 응답과 후속 브라우저 응답을 사용했다. 숫자·HTTP 상태·DB 값은 양쪽에서 동일하다. 공유 사업 주문 DB에는 write하지 않았고, 주문·VAT·dc 계산 로그는 모두 복제 DB에 남겼다.

## ⑫ 프로세스 회수

이 세션이 기동한 Vite 2개(5175, 5184)와 격리 컨테이너 4개(`sol1241r15-postgres`, `sol1241r15-product`, `sol1241r15-partner`, `sol1241r15-dc`)를 모두 종료·삭제했다. 임시 dump도 삭제했다.

```text
OUR_CONTAINERS_AFTER=0
PORT_5175_LISTEN=0
PORT_5184_LISTEN=0
PORT_28084_LISTEN=0
PORT_28088_LISTEN=0
PORT_28089_LISTEN=0
PORT_55441_LISTEN=0
OTHER_RUNNING_CONTAINERS_BEFORE=27
OTHER_RUNNING_CONTAINERS_AFTER=27
TEMP_EXISTS=False
```

다른 트랙 컨테이너는 건드리지 않았다. 격리 DB/컨테이너 삭제는 회수 완료로 복구 대상이 없다.

## ⑬ 판정

**도달 결함 2건.**

