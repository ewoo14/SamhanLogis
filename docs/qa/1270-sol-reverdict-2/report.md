# PR #1270 CODEX SOL 적대검증 재판정 보고서 — 2회차

## ① 검증 SHA·main 병합

- 검증 브랜치: `fix/daily-closing-parity`
- 검증 SHA: `af435d45f16f9583552941f75c33df526d3b6b57`
- 시작 시 최신 `origin/main`: `b9d9ab16d447ade3ae548acbf42da2b13f805cc0`
- 시작 전 `git fetch origin main` 뒤 `git merge origin/main --no-edit`를 실행했고 결과는 `Already up to date.`였다. 충돌과 추가 병합 커밋은 없었다.
- 검증 도중 다른 세션의 fetch로 로컬 공유 ref `origin/main`이 `1c9ebfc44`까지 전진했지만, GitHub PR #1270의 base OID는 게시 직전에도 `b9d9ab16d...`, head OID는 `af435d45f...`였다. 지정 SHA 재판정이므로 새 main 커밋을 뒤늦게 섞지 않았다.
- 제품 코드는 수정하지 않았고 `git add`·commit·push를 하지 않았다.

## ② 17열 대조표

대조 행은 기존 행 `2026/08/03-6`의 첫 품목 `AC060CN1DBC1`이다. branch product-service(38084)와 slip-service(38086)를 읽기 전용 DB 연결로 띄우고, branch slip GET 응답을 renderer(5175)에 프록시해 headless Chromium DOM의 17개 `<td>`를 순서대로 읽었다. DB 조회는 모두 `BEGIN READ ONLY`로 수행했다.

| 열번호 | 헤더명 | 화면값 | DB 원본 또는 원본 계산값 | 일치여부 |
|---:|---|---|---|:---:|
| 1 | DC | `홈45% / 360 -50000 / 4way -80000 / 1way -60000 / 스탠드 -20000 / 디럭스 -10000 / 1등급 -30000` | `dc_configs`: 홈 0.4500, 360 50,000, 4way 80,000, 1way 60,000, 스탠드 20,000, 디럭스 10,000, 1등급 30,000 | 일치 |
| 2 | 일자 | `2026-08-03` | `slips.slip_date=2026-08-03` | 일치 |
| 3 | 번호 | `6` | `slips.seq_no=6` | 일치 |
| 4 | 창고명 | 빈칸 | `destination_warehouse_name=NULL` | 일치 |
| 5 | 품목명 | `무풍 1way 냉방전용 실내기` | `slip_lines.product_name` 동일 | 일치 |
| 6 | 수량 | `1` | `quantity=1` | 일치 |
| 7 | 단가(VAT포함) | `641,480` | `unit_price_with_vat=641,480.00` | 일치 |
| 8 | 공급가액 | `583,164` | `supply_amount=583,164.00` | 일치 |
| 9 | 부가세 | `58,316` | `vat_amount=58,316.00` | 일치 |
| 10 | 합계 | `641,480` | 공급가액+부가세=`641,480.00` | 일치 |
| 11 | 거래처명 | `(주)삼한공조시스템` | `slips.partner_name` 동일 | 일치 |
| 12 | 거래처코드 | `2148720659` | `slips.partner_code` 동일 | 일치 |
| 13 | 출고가 | `475,200` | 2026-04-01 적용 `price_history.release_price=475,200.00` | 일치 |
| 14 | 할인율 | `-35%` | `round((1-641480/475200)*100)=-35%` | 일치 |
| 15 | 총계 | `641,480` | 단가×수량=`641,480.00` | 일치 |
| 16 | 확인 | `확인` | branch API 판정 `CONFIRMED` | 일치 |
| 17 | 회계반영일자 | 빈칸 | `sales_accounting_slip_allocations` 활성 행 0건 | 일치 |

**17/17 일치. 1차 결함인 11~15열 연쇄 오배치는 라이브에서 해소됐다.** 화면 구현도 기본 금액 열을 먼저 렌더링하고(`DailyClosingPage.tsx:619-626`), 거래처명·코드 뒤에 기준 금액 열을 렌더링한다(`:1104-1118`).

레거시 원문 계약은 다음과 같다.

> `tools/legacy-gas/일마감 프로그램/Code.js:11-14`  
> `const FINAL_HEADERS = [`  
> `  'DC','일자','번호','창고명','품목명','수량','단가(VAT포함)','공급가액','부가세','합계',`  
> `  '거래처명','거래처코드','출고가','할인율','총계','확인','회계반영일자'`  
> `];`

레거시는 `Index.html:207`에서도 같은 배열을 선언하고 `Index.html:1103`의 `HEADERS.forEach((col, cIdx) => ...)`로 그 순서대로 본문 셀을 만든다. 금액 의미는 `Code.js:551-561`의 `출고가=price`, `할인율=(1-unit/price)`, `총계=unit*qty`이며 이번 화면 실측과 일치한다.

## ③ 견적품목 값 화면 표시 + 같은 원인 전수 건수

- DB 원본: `PC1BWCK3NW`의 적용 이력은 출고가 520,300원, 납품가 **286,165원**이며 활성 exposure는 `HOME_MULTI`, `COMMERCIAL_MULTI` 두 건이다.
- branch API·화면 실측: 상세를 펼쳤을 때 `카테고리 COMMERCIAL_MULTI, HOME_MULTI`, `기준 납품가 286,165`가 실제로 표시됐다. 화면 구현 위치는 `DailyClosingPage.tsx:1130-1135`다.
- 2026-08-14 기존 대상은 API 13행이다. 그중 DB에 카테고리와 0이 아닌 납품가가 있어 1차에서 같은 원인으로 0이던 대상은 **1행**이었다. 이번 실측은 `카테고리 있음 1/1`, `납품가 286,165원 1/1`이다. 나머지 12행은 이 날짜의 대상 원천상 해당 설정값이 없는 행이며 성공 건수에 섞지 않았다.
- 전달 경로는 product internal 응답의 `delivery`·`estimateCategories`(`PriceHistoryInternalController.java:129-142`) → slip client(`ProductPriceHistoryClient.java:34-48`) → 일마감 resolver(`DailyClosingSourceResolver.java:22-37`) → 일마감 상세다.

**판정: 1차 결함인 견적품목 카테고리·납품가 0 표시는 해소됐다.**

다만 이 fix가 연 것은 **일마감 조회 경로**다. 변경 소비자는 slip-service의 `ProductPriceHistoryClient`와 `DailyClosingSourceResolver`이고 다른 화면 소비자는 변경하지 않았다. 따라서 컬러유선리모컨·360 할인·실외기 받침대처럼 “DB 설정은 있으나 해당 화면이 읽지 않는” 계열 전체를 자동으로 여는 전역 fix는 아니다. product internal 응답에는 필드가 추가됐지만 각 화면은 별도로 그 필드를 소비해야 한다.

## ④ 금액 축 — #1264·#1265 계약과 일치

- 2026-08-14 기존 한경희 선풍기 행의 branch API·화면 실측은 단가 11,000원, 공급가 10,000원, VAT 1,000원, 합계 11,000원, 총계 11,000원이다.
- 이는 #1264 계약인 화면·전표·배분·DB 총액 11,000원과 일치한다.
- #1265 VAT 계약도 `Math.round(11000/1.1)=10,000`, 차액 `1,000`으로 일치한다. 화면 재계산 구현 역시 `DailyClosingPage.tsx:480-488`에서 `supplyPerUnit=Math.round(roundedUnit/1.1)`, VAT=단가-공급가, 총계=단가×수량을 사용한다.
- 17열 대상 641,480원도 공급가 583,164원=`Math.round(641480/1.1)`, VAT 58,316원=차액, 합계·총계 641,480원이다.
- 출고가·할인율은 회계 총액과 별도의 기준축이다. 한경희 선풍기는 적용 출고가 원천이 없어 화면에서 출고가 0·할인율 0%지만, 합계·총계 11,000원은 바뀌지 않는다. `PC1BWCK3NW`는 출고가 520,300원·할인율 0%·총계 520,300원으로 같은 계약을 지킨다.

**금액 축 도달 결함 없음.**

## ⑤ 새 탭 분류 준수

최신 정본은 레거시 원문과 동일하다.

> `tools/legacy-gas/일마감 프로그램/Code.js:738`  
> `if (datePattern.test(String(item['회계반영일자']).trim())) pre.push(item);`

> `tools/legacy-gas/일마감 프로그램/Index.html:211-212`  
> `결과 ... dataKey: 'main'`  
> `선발행 ... dataKey: 'pre'`

즉 회계반영일자 있음→선발행, 없음→결과다. 그러나 검증 SHA의 화면 코드는 `DailyClosingPage.tsx:779-782`에서 `RESULT ? Boolean(row.accountingPostedAt) : !row.accountingPostedAt`으로 정확히 반대로 분류한다.

라이브 2026-08-14 실측도 다음과 같다.

- 결과 탭 1행 = 회계반영일자 있는 행 1행.
- 선발행 탭 12행 = 회계반영일자 없는 행 12행.
- 2026-08-03은 미반영 4행 전부가 선발행 탭에 있고 결과 탭은 0행이다.

**도달 결함 1 — 새 정본과 반대인 탭 분류.** 사용자는 기존 일마감 화면에서 탭만 눌러 재현할 수 있다. 미반영 행이 「결과」가 아닌 「선발행」에 있으므로 #1264의 “회계전표 생성 버튼은 미반영=결과 탭” 계약과도 결합할 수 없다. 검증 SHA에는 별도 PR #1264의 생성 버튼 구현 자체가 포함돼 있지 않아 버튼 배치 UI는 아래 판정 불가 축에 분리했다.

## ⑥ 기존 행 호환

- 새 QA 데이터가 아니라 공유 DB의 기존 행으로 확인했다.
- 2026-08-03: branch API 4행, 화면 결과 0+선발행 4=4행.
- 2026-08-14: branch API 13행, 화면 결과 1+선발행 12=13행.
- 두 날짜 모두 header-only·0행 stub이 아니며, 기존 행의 17열·견적 상세·금액이 실제 렌더링됐다.

**기존 일마감 조회 호환은 유지된다.** 탭별 귀속만 ⑤의 정본과 반대다.

## ⑦ 스크린샷 — 행 수·경로

모든 PNG는 `resolveQaShotsDir()` 기본 `_local` 경로로 저장했고, 4200px viewport 원본을 직접 열어 한글·17열·데이터행·상세값을 확인했다.

| 캡처 | 직접 센 화면 데이터행 | 확인 내용 |
|---|---:|---|
| `_local/01-2026-08-03-17cols-live.png` | 4행 | 기존 행 4개, 17열 전체와 11~15열 정위치 |
| `_local/02-2026-08-14-result-live.png` | 1행 | 회계반영일자 있는 기존 행이 결과 탭에 있음 |
| `_local/03-2026-08-14-preissued-live.png` | 12행 | 회계반영일자 없는 기존 행 12개가 선발행 탭에 있음 |
| `_local/04-2026-08-14-estimate-detail-live.png` | 원천 12행 + 상세 1행 | PC1BWCK3NW 카테고리와 286,165원 실제 표시 |

![2026-08-03 17열 실측](_local/01-2026-08-03-17cols-live.png)

![2026-08-14 견적품목 상세 실측](_local/04-2026-08-14-estimate-detail-live.png)

수치 원문은 `_local/live-evidence.json`에 UUID·자격 없이 저장했다. 라이브 스펙은 headless Chromium에서 1건 통과했고 branch 일마감 GET `2026-08-14`, `2026-08-03` 모두 HTTP 200이었다.

## ⑧ 판정 불가 축

- 공유 DB write 금지에 따라 금액 편집 저장 후 재진입은 판정 불가다. 이번 결함 두 축과 기존 조회는 read-only로 판정했다.
- 검증 SHA에는 PR #1264의 회계전표 생성 버튼 코드가 포함돼 있지 않으므로 버튼 자체의 최종 탭 배치는 판정 불가다. 다만 현재 분류식이 최신 정본과 반대라는 ⑤의 결함은 화면으로 확정했다.
- 검증 시작 뒤 새로 전진한 main 커밋 두 건을 검증 SHA에 재병합한 결과는 지정 SHA 범위 밖이라 판정 불가다.

위 축을 결함 0건의 근거로 사용하지 않았다.

## ⑨ CI 귀속

게시 직전 PR #1270 head `af435d45f...`의 GitHub checks를 직접 조회했다.

- 총 46개: **success 46 / failure 0 / pending 0**.
- CI run `32083680996`은 head SHA `af435d45f...`, conclusion `success`다.
- product/user/inventory/logging, slip-units, slip-it-core, slip-it-public, Frontend Desktop, Desktop Playwright, 전체 Playwright, GitGuardian을 포함해 모두 통과했다.
- 1차에서 본 GitHub 429 `Set up job` red와 비관련 Frontend red는 이번 head 재실행에서 재발하지 않았다.
- 알려진 main 기존 `SlipSalesUpdateIT R9 — expected: 2 / was: 1`도 이번 head CI에 나타나지 않았다.

따라서 현재 CI red 귀속 대상은 없다. CI green은 ⑤의 라이브 탭 분류 결함을 상쇄하지 않는다.

## ⑩ 머지 가능/불가 — 도달 결함 1건

**머지 불가 — 실 사용자가 화면으로 재현 가능한 도달 결함 1건.**

1. 최신 정본은 회계반영일자 있음→선발행, 없음→결과인데 화면은 반대로 분류한다. 2026-08-14 기존 13행 전부가 반대 탭(반영 1행은 결과, 미반영 12행은 선발행)에 있다.

1차 결함 두 건 중 17열 오배치와 견적품목 카테고리·납품가 0 표시는 해소됐다. 금액 축과 기존 조회도 유지된다. 그러나 탭 분류 결함이 남아 있어 머지할 수 없다.

## ⑪ 프로세스 회수

- branch product-service PID 62692(38084), branch slip-service PID 78744(38086), renderer npm PID 45016과 Vite PID 73032(5175)를 종료했다.
- 종료 후 38084·38086·5175 listener는 0개다.
- 5173은 시작 시 타 작업 PID가 점유해 건드리지 않고 5175를 사용했다. 해당 타 PID를 종료하지 않았다.
- 임시 Playwright 스펙/config와 `%TEMP%`의 전용 pid·log 파일을 삭제했다. 보존한 것은 본 보고서와 `_local` 라이브 증거뿐이다.
- 격리 컨테이너는 생성하지 않았다. 공유 `samhan-*` 컨테이너는 **24개 그대로**이며, 종료 시 전체 컨테이너 25개 중 나머지 1개 타 검증 컨테이너도 건드리지 않았다.
- 공유 DB는 `BEGIN READ ONLY` 조회만 했고 write하지 않았다.
- 다른 워크트리 `wcat · wsrd · wdcp · wdps · wd03 · wuuid · wp2 · wslip`를 변경하지 않았고 `wdc70` 워크트리를 유지했다.
