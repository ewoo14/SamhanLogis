# 검증 SHA: `bc2d245328e676cbb80ca4f77614cd6c709fa910`

# PR #1270 CODEX SOL 적대검증 보고서

## ① 검증 SHA·워크트리 생성·main 병합

- 전용 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wdc70`를 `fix/daily-closing-parity`로 생성했다.
- 원격 PR head: `a61a7b750db22245c6587291c718cd45ff69e11c`.
- 검증 시작 시점 최신 `origin/main`: `b9ef19f5a1246a33fce423fa377f6ae5d0332eee`.
- 지시대로 `git merge origin/main --no-edit`를 먼저 실행했고 충돌 없이 완료됐다. 그 결과인 검증 SHA가 이 보고서 첫 줄의 `bc2d245...`이며 부모는 PR head `a61a7b7...`와 당시 main `b9ef19f...`이다.
- 병합 3분 뒤 main에 `b9d9ab16d447ade3ae548acbf42da2b13f805cc0`이 새로 push됐다. 이미 기동·실측한 검증 SHA를 바꾸지 않았으며, CI 귀속 비교에는 이 최신 main run도 함께 확인했다.
- 새 워크트리에 누락된 `infrastructure/.env.local`을 원본 워크트리에서 복사했고, Desktop은 `npm ci`, design-system은 `npm ci`와 build를 수행했다. 별도 `git add`·수동 commit·push·제품 코드 수정은 하지 않았다.

## ② 17열 대조표

대조 행은 `2026/08/03-6`의 첫 품목 `AC060CN1DBC1`이다. 브랜치 slip-service JAR(38086)의 GET 응답을 실제 Chromium 화면에 렌더링했고, 화면의 `<td>`를 x좌표순으로 읽었다. DB는 공유 원본을 `BEGIN READ ONLY`로 직접 조회했다.

| 열번호 | 헤더명 | 그 자리의 화면값 | DB 원본 또는 원본 계산값 | 일치여부 |
|---:|---|---|---|:---:|
| 1 | DC | `홈45% / 360 -50000 / 4way -80000 / 1way -60000 / 스탠드 -20000 / 디럭스 -10000 / 1등급 -30000` | `dc_config_db`: 홈 0.45, 360 50,000, 4way 80,000, 1way 60,000, 스탠드 20,000, 디럭스 10,000, 1등급 30,000 | 일치 |
| 2 | 일자 | `2026-08-03` | `slips.slip_date=2026-08-03` | 일치 |
| 3 | 번호 | `6` | `slips.seq_no=6` | 일치 |
| 4 | 창고명 | 빈칸 | `destination_warehouse_name=NULL`(화면 계약상 빈칸) | 일치 |
| 5 | 품목명 | `무풍 1way 냉방전용 실내기` | `slip_lines.product_name` 동일 | 일치 |
| 6 | 수량 | `1` | `quantity=1` | 일치 |
| 7 | 단가(VAT포함) | `641,480` | `unit_price_with_vat=641,480.00` | 일치 |
| 8 | 공급가액 | `583,164` | `supply_amount=583,164.00` | 일치 |
| 9 | 부가세 | `58,316` | `vat_amount=58,316.00` | 일치 |
| 10 | 합계 | `641,480` | 공급가액+부가세=`641,480.00` | 일치 |
| 11 | 거래처명 | `475,200` | `(주)삼한공조시스템` | **불일치 — 출고가가 옴** |
| 12 | 거래처코드 | `-35%` | `2148720659` | **불일치 — 할인율이 옴** |
| 13 | 출고가 | `641,480` | `price_history.release_price=475,200.00`(2026-04-01 적용) | **불일치 — 총계가 옴** |
| 14 | 할인율 | `(주)삼한공조시스템` | `round((1-641480/475200)*100)=-35%` | **불일치 — 거래처명이 옴** |
| 15 | 총계 | `2148720659` | 단가×수량=`641,480.00` | **불일치 — 거래처코드가 옴** |
| 16 | 확인 | `확인` | 출고가 원천 확보·전표 `CONFIRMED` | 일치 |
| 17 | 회계반영일자 | 빈칸 | 활성 sales allocation 0건 | 일치 |

**도달 결함 1 — 11~15열 연쇄 오배치.** 헤더 배열은 17개로 맞지만 실제 화면의 `<td>` 순서는 `...합계 → 출고가 → 할인율 → 총계 → 거래처명 → 거래처코드 → 확인...`이다. 사용자는 거래처명에서 475,200원을, 총계에서 거래처코드 2148720659를 보게 된다. `DailyClosingPage.tsx:614-629`가 금액 6~9 뒤에 12~14를 먼저 렌더링하고, 부모가 `:1101-1102`에서 10~11을 뒤늦게 붙이는 것이 실측과 일치한다. 즉 이 PR이 `data-testid`의 의미 이름을 바꿨지만 DOM 순서는 고치지 않았다.

## ③ 레거시 원문 인용 대조

레거시의 열 계약은 다음 원문 그대로 17개다.

> `tools/legacy-gas/일마감 프로그램/Code.js:11-14`  
> `const FINAL_HEADERS = [`  
> `'DC','일자','번호','창고명','품목명','수량','단가(VAT포함)','공급가액','부가세','합계',`  
> `'거래처명','거래처코드','출고가','할인율','총계','확인','회계반영일자'`  
> `];`

레거시는 헤더만 선언한 것이 아니라 그 순서로 본문 셀을 만든다.

> `tools/legacy-gas/일마감 프로그램/Index.html:1103-1104`  
> `HEADERS.forEach((col, cIdx) => {`  
> `  let isMergeCol = MERGE_COLS.includes(col);`

> `tools/legacy-gas/일마감 프로그램/Index.html:1126-1142`  
> `if (col === '단가(VAT포함)') ...`  
> `else if (col === '출고가') ... data-col="출고가" ...`  
> `else if (['공급가액','부가세','합계','총계'].includes(col)) ... data-col="${col}" ...`  
> `else if (col === '할인율') ...`

따라서 레거시의 10번 합계 다음은 11 거래처명, 12 거래처코드, 13 출고가, 14 할인율, 15 총계다. PR 화면은 위 ②처럼 이 순서와 다르다.

레거시 금액 의미와 식은 다음과 같다.

> `tools/legacy-gas/일마감 프로그램/Code.js:551-561`  
> `var price = pData.price;`  
> `var unit = money_to_int_(item['단가(VAT포함)']);`  
> `var qty = money_to_int_(item['수량']);`  
> `item['출고가'] = price;`  
> `var rate = price ? (1 - (unit / price)) : 0;`  
> `item['할인율'] = rate;`  
> `item['총계'] = unit * qty;`

현재 행의 원천 계산 자체는 출고가 475,200원, 할인율 -35%, 총계 641,480원으로 이 식과 일치한다. 다만 화면 위치가 다르므로 사용자가 읽는 열 의미는 레거시와 불일치한다. 레거시 편집 재계산도 `Index.html:1203-1237`에서 출고가·단가·할인율을 양방향 계산하고 합계/총계를 `unit * qty`로 둔다.

견적 기준 원천도 레거시는 기초품목 하나만 읽지 않는다.

> `tools/legacy-gas/일마감 프로그램/Code.js:270-305`  
> `var map = { 'OLD': {}, 'HOME_MULTI': {}, 'COMM_MULTI': {}, 'SINGLE': {}, 'UNKNOWN': {} };`  
> `var sInfo = [`  
> `{ n: '홈멀티' + suf, ... z: 'HOME_MULTI' },`  
> `{ n: '상업멀티' + suf, ... z: 'COMM_MULTI' },`

> `tools/legacy-gas/일마감 프로그램/Code.js:486-500,519-545`  
> 품목을 `COMM_MULTI`·`HOME_MULTI`·`SINGLE`로 분류한 뒤 해당 zone의 견적 단가 map을 찾고, 없을 때 `UNKNOWN`으로 fallback한다.

현재 백엔드는 `DailyClosingSourceResolver.java:22-32`에서 `ProductPriceHistoryClient.applicable()` 하나만 호출하고, 그 client도 `ProductPriceHistoryClient.java:23-37`에서 `/products/internal/price-history/applicable`의 `release`만 반환한다. 견적품목 노출/카테고리 경로가 없다.

## ④ 금액 축 — #1264와 일치 여부

- `2026/08/14-6` 한경희 선풍기 행을 실제 화면에서 읽은 의미 값은 단가 11,000, 공급가 10,000, VAT 1,000, 합계 11,000, 총계 11,000이다.
- #1264 최종 적대검증 원문(`docs/qa/1264-sol-reverdict-3/report.md`)은 같은 원천에 대해 화면·전표 헤더·라인·배분·격리 DB 저장값이 모두 11,000원이라고 기록한다. 따라서 **API의 의미상 총계/회계 생성 금액은 #1264와 11,000원으로 일치**한다.
- 그러나 이번 화면에서 15번 `총계` 헤더 아래에는 거래처코드 `4483500844`가 보이고, 의미상 총계 11,000원은 13번 `출고가` 헤더 아래에 보인다. 미리보기 의미값과 #1264 저장값은 같아도 사용자가 헤더 기준으로 확인하는 금액 축은 결함 1 때문에 깨져 있다.

## ⑤ 견적품목 축

`product_db` 직접 조회에서 모델 `PC1BWCK3NW`는 다음 원본을 가진다.

- 기초 출고가 520,300원, 납품가 286,165원.
- `product_estimate_exposure`: `COMMERCIAL_MULTI`, `HOME_MULTI` 두 건.

그러나 2026-08-14 선발행 화면에서 해당 행의 상세를 펼치면 실제로 `카테고리 0 / 기준 납품가 0 / 기대율 0% / DC액 0 / 확인 사유 0`을 표시한다.

**도달 결함 2 — 견적품목 원천 미반영.** 개발책임자가 명시한 견적품목 기준값이 화면에 도달하지 않는다. 기초 `price_history.release`만 보아 출고가 520,300원과 할인율 0%를 만들 뿐, DB에 존재하는 견적 카테고리와 납품가 286,165원을 상세에서도 0으로 보여 준다. 이는 사용자가 화면에서 해당 행의 `상세 펼치기` 한 번으로 재현할 수 있다.

## ⑥ 라이브 스크린샷 — 행 수·경로

Chromium은 headless로 실행했다. 자격은 `resolveQaCredential()`, 게이트웨이 호출은 `SAMHAN_GATEWAY_ATTESTATION`, 캡처 위치는 `resolveQaShotsDir()`을 사용했다. 브랜치 JAR의 일마감 GET이 200으로 호출된 것을 네트워크 관측 JSON으로 남겼고, PNG 4장을 모두 직접 열어 한글·데이터행·주장을 확인했다.

| 캡처 | 직접 센 화면 데이터행 | 내용 |
|---|---:|---|
| `_local/01-2026-08-03-17cols-live.png` | 원천 4행 | 17개 헤더와 11~15열 연쇄 오배치 |
| `_local/02-2026-08-14-result-live.png` | 원천 1행 | 결과 탭 비어 있지 않음 |
| `_local/03-2026-08-14-preissued-live.png` | 화면에 보이는 원천 10행 | 선발행 탭 실제 데이터. DOM 전체 원천은 12행 |
| `_local/04-2026-08-14-estimate-detail-live.png` | 원천 10행 + 상세 1행 | 견적 노출 모델의 상세값 0 재현 |

날짜별 DOM 총계는 2026-08-03 결과 0+선발행 4=4행, 2026-08-14 결과 1+선발행 12=13행이다. 로그인 화면·빈 입력폼·0행 stub이 아니다.

![2026-08-03 17열 실측](_local/01-2026-08-03-17cols-live.png)

![2026-08-14 견적품목 상세 실측](_local/04-2026-08-14-estimate-detail-live.png)

## ⑦ #1238 A-2 분류 접촉 여부

이 PR은 결과/선발행 분류식을 건드리지 않았다. diff에서 `baseVisible`의 `accountingPostedAt` predicate 변경은 없고 dependency 배열만 바뀌었다. 현재 코드는 `DailyClosingPage.tsx:774-778`에서 회계반영일자 있음→결과, 없음→선발행이다.

참고로 레거시 원문은 반대다.

> `tools/legacy-gas/일마감 프로그램/Code.js:737-739`  
> `if (datePattern.test(String(item['회계반영일자']).trim())) pre.push(item);`  
> `else main.push(item);`

> `tools/legacy-gas/일마감 프로그램/Index.html:210-212`  
> `결과 ... dataKey: 'main'`  
> `선발행 ... dataKey: 'pre'`

따라서 #1238 A-2의 대기 결정 대상과 현재 동작이 반대인 사실은 유지되지만, **#1270이 그 분류를 변경하거나 결정과 충돌하는 수정은 하지 않았다.** 이 PR에 고치라고 요구하거나 별도 도달 결함으로 세지 않는다.

## ⑧ 미검증 축

- 공유 DB write 금지에 따라 일마감 편집값의 실제 저장·재진입은 미검증이다.
- 수량 2 이상 행의 라이브 편집 후 공급가/VAT 반올림과 최종 저장은 미검증이다.
- 면세·영세율·0원 견적품목의 전표 생성 금액은 미검증이다.
- 원격 PR head에 최신 main을 push한 뒤의 재실행 CI는 권한 범위 밖이라 미검증이다.

위 미검증 축은 결함 0건의 근거로 사용하지 않았다.

## ⑨ CI 귀속

게시 직전 PR #1270의 원격 checks는 3개 fail로 green이 아니다.

- `accounting-deposit-mapping-it`: 테스트 전에 `actions/setup-java` 다운로드가 HTTP 429를 세 번 받고 종료됐다. 사용자가 지정한 「Set up job」 계열 GitHub 장애이며 PR 귀속이 아니다. 같은 계열은 main CI에서 통과한다.
- `Frontend Mobile-Staff`: `SalesTabNavigator.test.tsx` 한 건이 5초 timeout. PR 변경 파일에 mobile-staff가 없고, PR merge ref의 main 부모 `d0250cd...` CI run `32017679141` 및 후속 main CI에서 해당 job이 통과한다. 일마감 변경 귀속 증거가 없는 비결정적 기존 테스트 실패다.
- `Frontend Desktop`: `SalesCommissionSettlementDetailPage.test.tsx`의 느린 이전 응답 테스트 한 건 실패(299 파일 통과, 1 파일 실패). PR이 바꾼 `DailyClosingPage`와 무관한 파일이고 main run `32071853278`에서도 같은 테스트가 실패했다. 최신 main `b9d9ab16...` CI run `32080847048`에서는 수정되어 전체 성공했다. PR 제품 변경 귀속이 아니다.
- 이 PR의 slip unit/IT 계열은 전부 통과했다. 알려진 main 기존 `SlipSalesUpdateIT R9 (expected: 2 / was: 1)`은 이번 PR run에서 나타나지 않았다.
- GitGuardian, 두 Playwright 계열, 나머지 표시 checks는 통과했다.

CI red 자체는 머지 게이트를 닫지만, 위 3건은 제품 도달 결함 N에 포함하지 않는다.

## ⑩ 머지 가능/불가 — 도달 결함 2건

**머지 불가 — 실 사용자가 화면으로 재현 가능한 도달 결함 2건.**

1. 17개 헤더는 있으나 11~15열 데이터가 `출고가→할인율→총계→거래처명→거래처코드` 순으로 렌더링되어 헤더와 연쇄 불일치한다.
2. 견적품목 카테고리/납품가 원본이 DB에 있어도 화면 상세가 모두 0으로 표시되어 견적품목 기준값을 반영하지 않는다.

금액 11,000원의 내부 의미값은 #1264 전표·배분·DB와 일치하지만, 결함 1 때문에 화면의 `총계` 헤더에서는 그 금액을 확인할 수 없다.

## ⑪ 프로세스 회수

- 이번 검증에서 기동한 branch slip-service PID 70856(38086)을 종료했고, 38086 listener 잔여는 0개다.
- 격리 PostgreSQL `sol1270-pg`를 제거했고 15473 listener와 컨테이너 잔여는 0개다.
- 임시 Playwright spec/config와 제 테스트 결과·임시 로그를 제거했다.
- 5173 listener는 다른 워크트리 `wcat` 소유 PID 24580임을 확인해 건드리지 않았다. 28086의 타 검증 프로세스도 건드리지 않았다.
- 공유 `samhan-*` 컨테이너는 24개 그대로다. 공유 DB에는 읽기 전용 조회만 했고 write하지 않았다.
- 다른 검증자의 컨테이너와 `wcat · wsrd · wdcp · wdps · wd03 · wuuid · wp2 · wslip` 워크트리는 변경하지 않았다.
- 지시대로 `wdc70` 워크트리는 유지했다.
