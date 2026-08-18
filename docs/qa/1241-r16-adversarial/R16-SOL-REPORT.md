# PR #1241 CODEX SOL 적대검증 R16

## ① 환경 확인

요청된 네 명령을 작업 시작 직후 순서 그대로 실행한 원문이다. `git status --porcelain` 출력은 0행이었다.

```text
PS C:\dev\Samhan-Public\.claude\worktrees\wgas1> git rev-parse HEAD
3c76f0eec771463496e197ff4377b7a97e2e9ee1
PS C:\dev\Samhan-Public\.claude\worktrees\wgas1> git rev-parse --abbrev-ref HEAD
feat/gas-parity-order-web
PS C:\dev\Samhan-Public\.claude\worktrees\wgas1> git status --porcelain
PS C:\dev\Samhan-Public\.claude\worktrees\wgas1> gh pr checks 1241
GitGuardian Security Checks	fail	4s	https://dashboard.gitguardian.com
문서 본문 단언 스펙 (mock 게이트 중 docs/** 를 읽는 것)	fail	1m4s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253952/job/95160129065
Desktop Playwright (mock 회귀 hard gate)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253948/job/95160129091
Detox Android (arologis-mobile, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253948/job/95160129073
Detox Android (mobile v4, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253948/job/95160129092
Frontend DS (typecheck + lint + build + storybook)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129215
Frontend Mobile-Staff (typecheck + jest + expo doctor + prebuild dry-run)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129201
Frontend Order-App (typecheck + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129277
Internal Chat Desktop (typecheck + lint + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129262
Local Stack Port Resolver Guard (#1113)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129232
Playwright (web + electron + mobile emul)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253948/job/95160129023
S1 logging opt-in 계약 (docs/local-stack 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253952/job/95160129074
빌드 + 테스트 (accounting+partner)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129306
빌드 + 테스트 (accounting-cash-receipt-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129357
빌드 + 테스트 (accounting-codef-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129294
빌드 + 테스트 (accounting-deposit-mapping-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129314
빌드 + 테스트 (accounting-partner-integrity-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129288
빌드 + 테스트 (phase9-10 (groupware+notification+dashboard))	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129329
빌드 + 테스트 (product-quantity-sync-schema)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129253
적용된 Flyway 마이그레이션 불변 가드	pass	37s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253953/job/95160129015
Credential Plaintext Guard (SP-08-8)	pass	1m5s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129218
빌드 + 테스트 (slip-it-core)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129259
App Build Version Guard (scripts/app-build-version, #910/#928)	pass	46s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129228
빌드 + 테스트 (shared+auth+gateway)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129298
빌드 + 테스트 (slip-units)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129309
#910 문서 계약 테스트 (docs/dev-reports 관할)	pass	46s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253952/job/95160129045
Config Audit Guard (다운스트림 URL/포트 정합, #745)	pass	46s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129237
Frontend Mobile (삼한 모바일 · typecheck + jest)	pass	1m6s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129238
빌드 + 테스트 (user+product+inventory+logging)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129287
자격 평문 비공개 가드 (docs 관할, SP-08-8)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253952/job/95160129126
빌드 + 테스트 (slip-it-public)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129308
Notion Runtime Zero Guard (SP-08-7)	pass	41s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945253951/job/95160129203
하네스 거짓 green 가드 (docs/qa 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945254003/job/95160129224
```

초기 카운트는 `전체 33 · 통과 7 · 실패 2 · 대기 24`다. `git add`, `git commit`, `git push`는 실행하지 않았다.

PR HEAD JAR를 새로 빌드하고 host/runtime SHA-256을 대조했다.

```text
product host     A09B2F2D42F2CA43C471EC88B8B246A1EB1E06FE574ADF5C11C506926DE30ED0
product runtime  a09b2f2d42f2ca43c471ec88b8b246a1eb1e06fe574adf5c11c506926de30ed0  /app/app.jar
partner host     D5F08F6F13CEFDF09120CA5A07023CE9F4E4C59220D2636EE1053B4BD1802B54
partner runtime  d5f08f6f13cefdf09120ca5a07023ce9f4e4c59220d2636ee1053b4bd1802b54  /app/app.jar
dc-config host   A1DD39B7F8C37B7DBE886F2B99D966495B736267F55F8BABCB1836B2FA3A4D1C
dc-config run    a1dd39b7f8c37b7dbe886f2b99d966495b736267f55f8babcb1836b2fa3a4d1c  /app/app.jar
```

## ② CI 카운트

최종 재조회 기준 `전체 47 · 통과 39 · 실패 8 · 대기 0 · skip 0`이다. CI green을 주장하지 않는다.

## ③ 세트 계열 라벨-금액 짝 전수표

이번 OW-R13 세트 배분 대상은 2세트, 구성품은 6개다. 두 세트를 모두 실 화면에서 선택하고 미리보기→최종확인→격리 DB 저장까지 진행했다.

| 세트 | 구성품 라벨·모델 | 계약 | 미리보기 화면 | 최종확인 화면 | 저장 DB | 판정 |
|---|---|---:|---:|---:|---:|---|
| AC060CS6PBH1SY | 실내기 AC060CN6PBH1 | **925,050** | **616,975** | **616,975** | **616,975** | 🔴 뒤바뀜 |
| AC060CS6PBH1SY | 실외기 AC060CXAPBH1 | **616,975** | **925,050** | **925,050** | **925,050** | 🔴 뒤바뀜 |
| AC060CS6PBH1SY | 패널 PC6NUNK1NW | 104,060 | 104,060 | 104,060 | 104,060 | 일치 |
| AC060CS6PBH1SY | 리모컨 AR-EH05 | 13,915 | 13,915 | 13,915 | 13,915 | 일치 |
| AR06D1150HZS | 실내기 AR06D1150HZN | 148,000 | 148,000 | 148,000 | 148,000 | 일치 |
| AR06D1150HZS | 실외기 AR06D1150HAX | 222,000 | 222,000 | 222,000 | 222,000 | 일치 |

AC 4구성품의 실제 순서는 `실내기 → 실외기 → 패널 → 리모컨`으로 일치했다. 순서가 맞아도 첫 두 라벨의 금액은 반대다.

저장 DB 원문:

```text
AC060CN6PBH1|360 CST UV 실내기|1|616975.00|616975.00|560886.00|56089.00|PRICE
AC060CXAPBH1|360 CST UV 실외기|1|925050.00|925050.00|840955.00|84095.00|PRICE
PC6NUNK1NW|판넬 (360CST / 원형 / WIFI)|1|104060.00|104060.00|94600.00|9460.00|PRICE
AR-EH05|무선리모컨(냉난방전용)|1|13915.00|13915.00|12650.00|1265.00|PRICE
AR06D1150HZN|냉전 일반 벽걸이 실내기|1|148000.00|148000.00|134545.00|13455.00|PRICE
AR06D1150HAX|냉전 일반 벽걸이 실외기|1|222000.00|222000.00|201818.00|20182.00|PRICE
```

## ④ 합계 일치

```text
AC 실제 합계  616,975 + 925,050 + 104,060 + 13,915 = 1,660,000
AC 계약 합계  925,050 + 616,975 + 104,060 + 13,915 = 1,660,000
AR 합계       148,000 + 222,000 = 370,000
주문 전체     1,660,000 + 370,000 = 2,030,000
```

품목표·미리보기·최종확인·저장 총액은 모두 2,030,000원이다. 합계만 보면 결함을 놓친다.

## ⑤ 미리보기 500 미재발 실HTTP

PR HEAD product/partner/dc-config health 200 상태에서 실행했다.

```text
AR 단품 2행 direct preview HTTP=200 total=370000
실 화면 AR+AC 6행 preview HTTP=200 total=2030000
VAT 800000 경계 preview HTTP=200 total=800000
500 응답=0
```

실 화면 6행 응답의 모델 순서는 `AC060CN6PBH1, AC060CXAPBH1, PC6NUNK1NW, AR-EH05, AR06D1150HZN, AR06D1150HAX`였다. opaque UUID 충돌 해소 뒤 전 품목 500은 재발하지 않았다.

## ⑥ VAT 경계표

각 값마다 실 price-preview→draft→confirm→격리 DB 저장을 새로 수행했다.

| VAT 포함 입력 | preview | draft | confirm | 저장 공급가 | 저장 VAT | 판정 |
|---:|---:|---:|---:|---:|---:|---|
| 5 | 200 | 201 | 200 | 5 | 0 | 일치 |
| 6 | 200 | 201 | 200 | 5 | 1 | 일치 |
| 11 | 200 | 201 | 200 | 10 | 1 | 일치 |
| 800,000 | 200 | 201 | 200 | 727,273 | 72,727 | 일치 |

```text
2026/08/16-11|5.00|5.00|5.00|5.00|0.00
2026/08/16-12|6.00|6.00|6.00|5.00|1.00
2026/08/16-13|11.00|11.00|11.00|10.00|1.00
2026/08/16-14|800000.00|800000.00|800000.00|727273.00|72727.00
```

## ⑦ R03·R05·R08

- R03: 데스크톱 주문 상세에서 `거래처 · 주식회사 중앙유통`을 실 화면으로 확인했다. 코드 단독 fallback이 사용자에게 거래처명으로 도달했다.
- R05: 입력·상세·DB가 모두 `배송/현장=서울특별시 R16 격리 QA로 16 16층`, `010-1616-1616`, 납기 `2026-08-20`, 입금예정일 `2026-08-31`, 메모 `R16 헤더 보존 격리 QA`로 일치했다.
- R08: 실제 카탈로그의 `싱글 실링 AC145BSCPHH2SY`를 `1`로 입력하자 `ADP-F075SP=1`, 펌프를 수동 `7`, 원품을 `2`로 바꾸자 펌프가 `2`로 재계산됐다.

```text
R08_AUTO1 source=1 pump=1
R08_MANUAL7 pump=7
R08_RECALC2 source=2 pump=2
```

## ⑧ 금액 4단계

| 대상 | 품목표 | 미리보기 | 최종확인 | 저장값 |
|---|---:|---|---|---|
| AC060CS6PBH1SY | 1,660,000 | 616,975 + 925,050 + 104,060 + 13,915 | 동일 4행 | 동일 4행 / 1,660,000 |
| AR06D1150HZS | 370,000 | 148,000 + 222,000 | 동일 2행 | 동일 2행 / 370,000 |
| 주문 전체 | 2,030,000 | 2,030,000 / 6행 | 2,030,000 / 6행 | 2,030,000 / 6행 |

품목표는 부모 세트 합계만 보이고, 구성품 라벨-금액 결함은 미리보기부터 저장까지 이어졌다.

## ⑨ 시트 폐기 전달·카탈로그 유지

MASTER로 `/#/admin/sheet-sync`에 진입해 화면 전용 `admin-sheetsync-retired`를 단정했다.

```text
제목       구글 시트 동기화 폐기
안내       구글 시트 연계는 폐기되었습니다. 현재 품목 카탈로그는 데이터베이스를 기준으로 사용합니다.
실행 버튼  0
일반 장애  0
```

양방향 원문:

```text
PRODUCT_GOOGLE_URL_COUNT=0
PRODUCT_SHEET_EXECUTION_COUNT=0
[ProductSheetSyncScheduler] Google Sheets runtime 연동 폐기 — 부팅 sync skip
[ProductSheetSyncScheduler] Google Sheets runtime 연동 폐기 — DB source-of-truth 유지
PARTNER_GOOGLE_URL_COUNT=0
[BootstrapService] product_db catalog prefetch 완료: keys=[homemulti, homeInc, singleSets, singleInc, singleParts, singlePartsInc, singleMatPrices, commercialMulti, commInc, commercialParts, commPartsInc, oldProducts, priceChangeSchedule]
[BootstrapService] DB catalog prefetch 완료 — Google Sheets runtime 연동 없음
CATALOG singleSets=224 singleParts=1447
AC060CS6PBH1SY=1660000
AR06D1150HZS=360000 (납기 2026-08-20 화면 INC 적용 후 370000)
```

시트 연결 시도는 0이고 DB 카탈로그와 가격 변경 규칙은 계속 사용자 화면에 도달했다.

## ⑩ 캡처

`clients/desktop` 패키지 안에서 Chromium 1217, `headless: true`, 해시라우터로 실행했다. 마지막 전체 실행은 `4 passed (5.6s)`다. 모든 캡처는 `resolveQaShotsDir()`가 반환한 `docs/qa/1241-r16-adversarial/screenshots/_local/`에 있고 7장을 직접 육안 확인했다.

| 파일 | bytes | 내용 |
|---|---:|---|
| `01-r08-manual-recalc-real-qa.png` | 51,868 | 원품 2·펌프 2 |
| `02-set-preview-label-amount-real-qa.png` | 33,461 | AC 4구성품 라벨·뒤바뀐 금액 |
| `03-order-headers-real-qa.png` | 25,954 | R05 입력 헤더 |
| `04-final-label-amount-real-qa.png` | 61,489 | 6구성품 최종확인 라벨·금액 |
| `05-send-complete-real-qa.png` | 62,056 | 실제 전송 완료 |
| `06-r03-r05-order-detail-real-qa.png` | 83,523 | 저장 헤더·거래처명·6라인 |
| `07-sheet-sync-retired-real-qa.png` | 25,452 | 폐기 안내·버튼 없음 |

금액 핵심 캡처 SHA-256:

```text
0870533008737972F79022C79B01DE93B99BB554E70C1C3FA2B4F5FB39AC85AD  02-set-preview-label-amount-real-qa.png
76CF211A0A9AA4671F339BEF1D447E524D311D74881B42943E8A560D0A16DD26  04-final-label-amount-real-qa.png
9A5C4C5BD8B85345BE2D7B42CEEC5032FFB46F6887DA872F7A3CD1B3AC065A0F  06-r03-r05-order-detail-real-qa.png
851C5D9B0FBDA4FE23289ADB8B5D090CCF8790F0B69D24B512ED6C2004B7ED2A  07-sheet-sync-retired-real-qa.png
```

## ⑪ 도달 결함

### 결함 1 — AC 세트 실내기·실외기 배분금액 라벨이 여전히 뒤바뀐다

재현:

1. 주문서웹 `/#/order`에서 등록 거래처로 싱글중대형 화면에 진입한다.
2. 납기 `2026-08-20`, `AC060CS6PBH1SY` 수량 1을 입력한다.
3. 품목표 합계 1,660,000원을 확인하고 「견적/주문하기」로 진행한다.
4. 미리보기에서 `360 CST UV 실내기 AC060CN6PBH1=616,975`, `360 CST UV 실외기 AC060CXAPBH1=925,050`이 표시된다.
5. 계약은 실내기 925,050 / 실외기 616,975다.
6. 최종확인과 주문 상세, 저장 DB도 같은 뒤바뀐 짝이다.

합계는 1,660,000원으로 정확해 합계 검사로 발견되지 않는다. 사용자는 구성품별 라벨과 단가를 직접 보므로 도달 결함이다.

## ⑫ 증거 무결성 자기 고지

- R15 fix 보고서는 단위테스트 결과와 라이브 미실행을 명시했으므로 그 표를 라이브 증거로 전재하지 않았다. 이번 R16에서 PR HEAD JAR·실 HTTP·Playwright·격리 DB를 새로 측정했다.
- 첫 실행의 잘못된 `.env.local` 상대경로, 고정 하단 버튼의 viewport 판정, 과거 fixture 모델, 네트워크 이동 후 Hikari stale connection, 주문번호 URL 변환 누락을 각각 원문으로 확인하고 하네스/격리 운영 문제로 분리했다. 최종 실행은 최신 env와 재기동된 격리 서비스에서 새로 수행했다.
- 세트 스펙은 첫 라벨 불일치에서 중단하지 않고 최종확인·저장까지 측정하기 위해 금액 차이를 관측값으로 기록한다. 따라서 `4 passed`는 결함 0을 뜻하지 않는다. 본 보고서가 별도로 실측 불일치 1건을 판정한다.
- 주소검색 외부 인증서 오류와 접근만료 404는 주문 가격·저장 경로와 분리된 부가 호출이며, 지정 질문의 도달 결함으로 세지 않았다.
- 공유 업무 DB에는 write하지 않았다. product/partner-order/dc-config DB 복제본과 격리 RabbitMQ에만 write했다.

## ⑬ 프로세스 회수

이 세션이 기동한 Vite 2개와 격리 컨테이너 5개, 전용 네트워크를 모두 회수했고 공유 서비스의 임시 네트워크 연결도 원복했다.

```text
OUR_CONTAINERS_AFTER=0
PORT_5176_LISTEN=0
PORT_5186_LISTEN=0
PORT_28184_LISTEN=0
PORT_28188_LISTEN=0
PORT_28189_LISTEN=0
PORT_55461_LISTEN=0
OUR_NETWORK_AFTER=0
OTHER_RUNNING_CONTAINERS_AFTER=26
```

다른 트랙 컨테이너는 중지·삭제하지 않았다. 격리 DB/컨테이너는 삭제돼 복구 대상이 없다.

## ⑭ 판정

**도달 결함 1건.**

라운드 fix로 넘긴다.
