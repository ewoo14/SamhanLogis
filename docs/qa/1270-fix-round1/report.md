# PR #1270 fix 라운드 1 보고서

검증 기준: `bc2d245328e676cbb80ca4f77614cd6c709fa910`에서 `origin/main`을 `git merge origin/main --no-edit`로 병합한 뒤 수정했다. 현재 HEAD는 병합 커밋 `a378f2421`이다. 커밋·push는 하지 않았다.

## ① 17열 대조표 전/후

대상 행은 적대검증과 같은 `2026-08-03/6`, 품목 `AC060CN1DBC1`이다. DB 원본과 수정 전 화면값은 `docs/qa/1270-sol-merge-verdict/report.md:23-41`의 실측을 그대로 대조했다. 수정 후는 `DAILY_CLOSING_HEADERS`와 렌더 셀 순서를 1:1로 맞춘 값이다.

| 열 | 헤더 | 수정 전 화면값 | DB 원본 | 수정 전 | 수정 후 화면 의미값 | 수정 후 |
|---:|---|---|---|:---:|---|:---:|
| 1 | DC | 홈45% / 360 -50000 / 4way -80000 / 1way -60000 / 스탠드 -20000 / 디럭스 -10000 / 1등급 -30000 | dc_config_db 동일 조건 | 일치 | 동일 | 일치 |
| 2 | 일자 | 2026-08-03 | slips.slip_date=2026-08-03 | 일치 | 동일 | 일치 |
| 3 | 번호 | 6 | slips.seq_no=6 | 일치 | 동일 | 일치 |
| 4 | 창고명 | 빈칸 | destination_warehouse_name=NULL | 일치 | 빈칸 | 일치 |
| 5 | 품목명 | 무풍 1way 냉방전용 실내기 | slip_lines.product_name 동일 | 일치 | 동일 | 일치 |
| 6 | 수량 | 1 | quantity=1 | 일치 | 1 | 일치 |
| 7 | 단가(VAT포함) | 641,480 | unit_price_with_vat=641,480 | 일치 | 641,480 | 일치 |
| 8 | 공급가액 | 583,164 | supply_amount=583,164 | 일치 | 583,164 | 일치 |
| 9 | 부가세 | 58,316 | vat_amount=58,316 | 일치 | 58,316 | 일치 |
| 10 | 합계 | 641,480 | 공급가액+부가세=641,480 | 일치 | 641,480 | 일치 |
| 11 | 거래처명 | 475,200 | (주)삼한공조시스템 | 불일치 | (주)삼한공조시스템 | 일치 |
| 12 | 거래처코드 | -35% | 2148720659 | 불일치 | 2148720659 | 일치 |
| 13 | 출고가 | 641,480 | price_history.release_price=475,200 | 불일치 | 475,200 | 일치 |
| 14 | 할인율 | (주)삼한공조시스템 | round((1-641480/475200)*100)=-35% | 불일치 | -35% | 일치 |
| 15 | 총계 | 2148720659 | unit_price_with_vat×quantity=641,480 | 불일치 | 641,480 | 일치 |
| 16 | 확인 | 확인 | 전표 CONFIRMED | 일치 | 확인 | 일치 |
| 17 | 회계반영일자 | 빈칸 | 활성 sales allocation 0건 | 일치 | 빈칸 | 일치 |

수정은 11~15열만 임의로 이동한 것이 아니라 `LegacyAmountEditor`를 기본 금액 7~10열과 기준값 13~15열로 분리해 부모가 `11 거래처명 → 12 거래처코드 → 13~15` 순서로 DOM을 만들게 했다. 테스트에 17열 전체 배열을 추가했다.

## ② 레거시 원문 인용

레거시 17열 원문은 `tools/legacy-gas/일마감 프로그램/Code.js:11-14`이다.

```js
const FINAL_HEADERS = [
  'DC','일자','번호','창고명','품목명','수량','단가(VAT포함)','공급가액','부가세','합계',
  '거래처명','거래처코드','출고가','할인율','총계','확인','회계반영일자'
];
```

본문도 `tools/legacy-gas/일마감 프로그램/Index.html:1103-1142`에서 `HEADERS.forEach((col, cIdx))`로 열 순서대로 셀을 생성하고 `data-col`을 붙인다. 금액 의미식은 `Code.js:551-561`의 `item['출고가']=price`, `item['할인율']=rate`, `item['총계']=unit*qty`를 기준으로 삼았다.

## ③ 견적품목 0 표시 원인과 전수 건수

원인은 **맥락이 없어서가 아니라 읽지 않은 것**이다. 기존 `ProductPriceHistoryClient.java:23-37`은 product-service의 `/products/internal/price-history/applicable` 응답에서 `release`만 읽었고, 기존 `DailyClosingSourceResolver.java:22-32`는 그 값·DC조건·회계일자만 `SourceValues`로 전달했다. `categoryKey`와 `delivery`/견적품목 exposure는 읽지 않았다. 화면은 `DailyClosingPage.tsx:1117-1121`에서 해당 필드를 기대하므로 0으로 보였다.

수정 내용:

- product-service price-history internal 응답에 활성 `product_estimate_exposure` 카테고리 목록을 추가했다.
- slip-service client가 `release`, `delivery`, `estimateCategories`를 읽는다.
- resolver가 전표 snapshot `line.categoryKey`를 우선하고 없으면 exposure 첫 카테고리를 전달하며, 적용 `delivery`를 전달한다.
- `DailyClosingRowResponse`와 프런트 계약에 category/delivery 필드를 연결했다.

실데이터 전수는 기존 정찰 기준 `2026-08-14`, OUTBOUND, `CONFIRMED|DELIVERED|COMPLETED` **13행**이다(`docs/dev-reports/2026-08-16-daily-closing-detail-zero-recon.md:13-20`). 수정 전 화면은 13행에서 category/delivery/expectedRate를 모두 0으로 렌더했고, DB에는 적용 price_history delivery가 의미 있게 존재하는 행이 **1/13**, 해당 견적품목 `PC1BWCK3NW`는 exposure 2건과 delivery 286,165원이 있었다(`docs/qa/1270-sol-merge-verdict/report.md:98-105`). 수정 후 해당 행은 API 경로상 `COMMERCIAL_MULTI`/`286165`를 받을 수 있도록 연결했다. 나머지 12행의 DB 결측은 0으로 위장하지 않는 추가 표시 개선이 별도 축이다.

## ④ 금액 축 #1264 일치

화면·전표·배분·DB가 모두 11,000원(공급가 10,000 + VAT 1,000)이었던 #1264 축은 건드리지 않았다. 17열 재배치 후에도 합계/총계는 `unitPriceWithVat × quantity`, 출고가는 price-history release, 할인율은 기존 계산식으로 같은 의미값을 유지한다. 회계전표 생성 로직은 수정하지 않았다.

## ⑤ RED 원문

견적품목 RED는 `wdc70`에서 다음으로 재현했다.

```text
./gradlew :services:slip-service:test --tests 'com.samhanair.logis.slip.web.dto.DailyClosingRowResponseTest'
...
error: constructor SourceValues ... cannot be applied
required: BigDecimal,String,LocalDateTime,String
found: BigDecimal,<null>,<null>,<null>,String,BigDecimal,<null>
error: cannot find symbol row.categoryKey()
error: cannot find symbol row.deliveryPrice()
BUILD FAILED
```

열 정합 RED 테스트는 최초 실행에서 Desktop 경로 필터를 잘못 지정해 `No test files found`가 발생했고, 올바른 `wdc70\clients\desktop` 경로에서 재실행했다. 이후 17열 전수 테스트가 통과해 DOM 순서 결함을 잡는 테스트로 고정됐다. 기존 테스트를 새 동작에 맞춰 삭제하거나 약화하지 않았다.

## ⑥ 새 탭 분류 전제

결과/선발행 분류와 회계전표 생성 로직은 수정하지 않았다. QA 전제는 최신 결정대로 `회계반영일자 있음 → 결과`, `없음 → 선발행`이며, 전표 생성 버튼은 미반영인 결과 탭이라는 PR #1264 반영 상태를 유지한다.

## ⑦ 스크린샷 및 라이브 검증

기존 수정 전 PNG는 직접 열어 확인했다.

- `C:\dev\Samhan-Public\.claude\worktrees\wdc70\docs\qa\1270-sol-merge-verdict\_local\01-2026-08-03-17cols-live.png`: 원천 4행, 17열 화면.
- `C:\dev\Samhan-Public\.claude\worktrees\wdc70\docs\qa\1270-sol-merge-verdict\_local\04-2026-08-14-estimate-detail-live.png`: 원천 10행 + 상세 1행, PC1 행의 category/delivery가 0으로 보이는 수정 전 증거.

수정 후 라이브 캡처는 미검증이다. Playwright Chromium/headless 실행 명령은 다음이며, 실제 실패 원문은 `page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/#/accounting/daily-closings`이다. 5173 renderer가 없었고, 브랜치 JAR를 공유 gateway에 연결하지 않은 채 캡처하지 않았다. 따라서 수정 후 PNG와 행 수를 성공 증거로 주장하지 않는다.

## ⑧ CI 귀속

이번 라운드의 로컬 검증은 다음과 같다.

- `./gradlew :services:product-service:compileJava :services:slip-service:test --tests 'com.samhanair.logis.slip.web.dto.DailyClosingRowResponseTest'`: PASS.
- `npm exec -- vitest run src/renderer/routes/DailyClosingPage.test.tsx` (`wdc70\clients\desktop`): **35 tests PASS**.
- Playwright 라이브: renderer 포트 부재로 FAIL; 제품 실패로 귀속하지 않고 라이브 미검증으로 기록한다.

적대검증의 3개 red는 GitHub 429 및 main/비관련 기존 테스트로 귀속되었고, 이번 수정에서 새 CI 실행은 하지 않았다. 기존 main의 SlipSalesUpdateIT R9도 제품 결함 0건의 근거로 사용하지 않았다.

## ⑨ `git status --porcelain` 원문

```text
 M clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx
 M clients/desktop/src/renderer/routes/DailyClosingPage.tsx
 M services/product-service/src/main/java/com/samhanair/logis/product/web/PriceHistoryInternalController.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/client/ProductPriceHistoryClient.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingSourceResolver.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/DailyClosingRowResponse.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/web/dto/DailyClosingRowResponseTest.java
?? docs/qa/1270-fix-round1/
?? docs/qa/1270-sol-merge-verdict/
```

`docs/qa/1270-sol-merge-verdict/`는 세션 시작 전부터 존재한 적대검증 산출물이며 이번 라운드에서 수정하지 않았다. `docs/qa/1270-fix-round1/`는 본 보고서만 포함한다. `.pid`, `.log`, 0행 캡처는 추가하지 않았다.

## ⑩ 프로세스 회수

이번 라운드에서 시작한 장기 서버·격리 컨테이너는 없다. Playwright·Gradle·Vitest는 종료됐고, 38086·15473·5173·5175 listener 잔여도 확인되지 않았다. 공유 컨테이너 24개와 `wdc70` 워크트리는 유지했다. 다른 워크트리는 건드리지 않았다.

판정: 코드·단위/컴파일 검증은 완료했지만, 요청된 수정 후 실제 화면 캡처는 renderer 기동 실패로 미검증이다. 따라서 라이브 증거 기준으로는 결함 0이라고 단정하지 않는다.
