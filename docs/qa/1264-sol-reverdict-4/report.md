# PR #1264 최종 재판정 (3회차)

## ① 검증 SHA·main 병합

- 지정 검증 SHA: `128ea511bbcb3f62ab253a719a1309b9d8c10cc5` (`128ea511b`).
- 시작 전 `git fetch origin main` 후 `git merge origin/main --no-edit`를 실행했다. 충돌 없이 merge commit `6412680eadb2ac11671d17be75ac4f5f853aa18b`가 생성됐고 부모는 `128ea511b`와 당시 `origin/main` `1c9ebfc447a7ec50ad5b6eb9cbf52573e5300b11`이다.
- 검증 종료 시 원격 main은 다른 머지로 `3e4f44cc0`까지 전진했지만, 이 라운드의 브랜치 JAR·renderer는 위 merge commit에서 직접 빌드·기동했다.
- 코드 수정, `git add`, commit, push는 하지 않았다.

## ② 두 탭 행 수 + 레거시 원문 인용

레거시 원문은 다음과 같다.

- `tools/legacy-gas/일마감 프로그램/Code.js:738`: `if (datePattern.test(String(item['회계반영일자']).trim())) pre.push(item);`
- `tools/legacy-gas/일마감 프로그램/Code.js:739`: `else main.push(item);`
- `tools/legacy-gas/일마감 프로그램/Code.js:744`: `return { status: 'success', main: main, pre: pre, sum: main.concat(pre) };`
- `tools/legacy-gas/일마감 프로그램/Index.html:211`: `dataKey: 'main'`의 제목은 `결과`.
- `tools/legacy-gas/일마감 프로그램/Index.html:212`: `dataKey: 'pre'`의 제목은 `선발행`.

따라서 정본 의미는 **회계반영일자 있음 → 선발행, 없음 → 결과**다. 현행 `DailyClosingPage.tsx:812-816`도 `RESULT`에서 `!row.accountingPostedAt`, `PRE_ISSUED`에서 `Boolean(row.accountingPostedAt)`을 사용한다.

격리 DB와 브랜치 JAR·renderer를 사용한 2026-08-14 Chromium 실측은 다음과 같다.

| 원천 | 결과(미반영) | 선발행(반영) | 합계 |
|---|---:|---:|---:|
| 매출/OUTBOUND | 12 | 1 | 13 |
| 매입/INBOUND | 14 | 0 | 14 |
| 합계 | **26** | **1** | **27** |

두 방향 모두 전수 일치했다. 다만 요청서의 `결과 23 + 선발행 1 = 24행`은 과거 정찰 시점 모집단이다. 이번 공유 원천의 읽기 전용 복제본에는 OUTBOUND 13행과 INBOUND 14행, 합계 27행이 있어 역사적 24행 수 자체는 재현되지 않았다. 현재 존재하는 27행의 분류는 `반영 1/1 → 선발행`, `미반영 26/26 → 결과`다.

## ③ 생성 버튼 위치와 실제 생성

- 매출 결과 탭: 12행, 활성 `회계전표 생성` 버튼 12개. 선발행 탭: 1행, 활성 생성 버튼 0개.
- 매출 결과 탭의 `2026/08/14-6`에서 버튼을 실제 클릭해 `2026/08/14-6218 회계전표 생성 성공`을 확인했다.
- 이어 매입 결과 탭의 같은 날짜·순번 `2026/08/14-6` 버튼이 활성 상태임을 확인하고 실제 클릭해 `2026/08/14-7145 회계전표 생성 성공`을 확인했다.
- 즉 생성 버튼은 미반영 행이 있는 **결과** 탭으로 함께 이동했고, 사용자가 그 탭에서 생성까지 할 수 있다.
- 재진입 후 생성한 매입 행의 생성 버튼과 11,000원 입력은 잠금 상태였고, 다른 정상 행의 활성 버튼은 12개 남아 있었다.

## ④ 폐기 해석 잔재 grep 결과

`선발행|결과|PRE_ISSUED|preIssued|pre-issued|pre_issued|accountingPostedAt|회계반영일자`를 전수 검색했다.

- 실행 코드: 폐기된 의미의 단정 없음. `DailyClosingPage.tsx:812-816`의 주석과 조건이 정본과 일치한다.
- 핵심 Vitest: 이름만 바뀐 것이 아니다. `DailyClosingPage.test.tsx:241` 계열은 미반영 행을 결과, 반영 행을 선발행에서 찾고, 생성·재진입 테스트도 결과 탭을 클릭한다. 관련 3파일 **36/36 통과** (`DailyClosingPage` 30, accounting-slip 4, labels 2).
- 역사 문서: 정찰 당시 반대였던 화면 관찰은 과거 증거로 남아 있으나 현재 의미를 정본으로 단정하지 않는다.
- 증거 무결성 예외 1건: 커밋된 과거 실QA 스펙 `clients/desktop/playwright/d02-daily-closing-accounting-slip-real-qa/d02-daily-closing-accounting-slip-real-qa.spec.ts:120,128,137`은 아직 `pre_issued`에서 생성을 찾는다. 파일명이 `-real-qa.spec.ts`라 mock CI 수집 대상은 아니고 런타임 사용자 동작에도 관여하지 않지만, 현재 다시 실행하면 폐기된 의미를 요구하는 **낡은 검증 산출물**이다. 사용자 도달 결함 수에는 포함하지 않는다.

## ⑤ 2차 확보 항목 재현 숫자

격리 PostgreSQL(`product_db`, `slip_db`, `accounting_db`를 공유 DB에서 읽기 복제)과 브랜치 product/slip/accounting JAR, shared auth, 브랜치 renderer를 사용했다. 공유 DB에는 쓰지 않았다. 일마감 POST가 이미 검증 완료 상태로 409를 반환해, 생성 자격을 위한 SALES/PURCHASE 잠금 스냅샷 2건만 격리 accounting DB에 넣고 실제 화면 생성은 정상 API로 수행했다.

| 항목 | 3회차 실측 |
|---|---|
| A 매출 후 같은 날짜·순번 매입 | 매출 `2026/08/14-6` 생성 성공 후 매입 `2026/08/14-6` 생성 성공 |
| B 동일 원천 재생성 | 매출 HTTP **422**, 매입 HTTP **422** |
| C 매출 금액 | 화면 11,000 / 생성 응답 공급가 10,000 + VAT 1,000 = 11,000 / 전표 line 11,000 / 배분 11,000 / DB 11,000 |
| C 매입 금액 | 화면 11,000 / 생성 응답 공급가 10,000 + VAT 1,000 = 11,000 / 전표 line 11,000 / 배분 11,000 / DB 11,000 |
| 원천 행 수 | OUTBOUND **13**, INBOUND **14** |
| 매입 경로 | 매입 화면 생성 후 INBOUND 원천 전표 `2026/08/14-6` 및 PURCHASE 원천 회계전표가 저장됨 |
| 재진입 | 생성 행 버튼 잠금 + 금액 입력 잠금 유지, 다른 활성 버튼 12개 |

격리 DB의 생성 결과는 매출 전표 `2026/08/14-6218`, 매입 전표 `2026/08/14-7145`, 각 DRAFT 1건·line 1건·allocation 1건이며 두 건 모두 `10,000.00 + 1,000.00 = 11,000.00`이다.

## ⑥ #1265 VAT 계약과 정합

PR #1265 head `2ea44c167`의 정본은 VAT 포함 총액에서 `Math.round(total / 1.1)`로 공급가를 먼저 정하고 VAT를 차액으로 얻는 계약이다. 이 PR의 화면 경로도 `DailyClosingPage.tsx:491-493`에서 `Math.round(roundedUnit / 1.1)` 후 차액을 VAT로 계산한다.

`11,000 / 1.1 = 10,000`, `11,000 - 10,000 = 1,000`이므로 이번 매출·매입 실측 `공급가 10,000 + VAT 1,000 = 총액 11,000`은 #1265 계약과 일치한다.

## ⑦ 스크린샷(행 수·경로)

모든 PNG는 headless Chromium에서 `resolveQaShotsDir()`을 거쳐 저장했고, 6장을 원본 해상도로 직접 열어 0행 캡처가 아님을 확인했다.

| PNG | 실측 내용 |
|---|---|
| `screenshots/00-sales-preissued-posted.png` | 매출 선발행 1행(회계반영일자 있는 행) |
| `screenshots/01-sales-before-create.png` | 매출 결과 12행, 생성 전 11,000원 행 |
| `screenshots/02-sales-created-and-blocked.png` | 매출 생성 성공, 해당 버튼 `이미 생성됨` |
| `screenshots/03-purchase-same-seq-enabled.png` | 매출과 같은 날짜·순번의 매입 결과 행 생성 가능 |
| `screenshots/04-purchase-created-and-blocked.png` | 매입 생성 성공, 해당 버튼 `이미 생성됨` |
| `screenshots/05-reentry-lock-and-normal-open.png` | 재진입 후 생성 행 잠금, 다른 정상 행은 계속 사용 가능 |

## ⑧ 미검증 축

- 과거 정찰 모집단의 정확한 `24행(1+23)` 재현은 미검증이다. 현재 복제한 원천이 27행으로 늘어났기 때문이다. 대신 현재 모집단 27행의 회계반영일자 기준 분류는 전수 검증했다.
- 수량 2 이상·복수 라인 한 전표의 반올림/배분과 POSTED 이후 전기·세금계산서 연결은 이번 탭 분류 재판정 범위에서 다시 밟지 않았다.
- 원격 main이 로컬 병합 뒤 `3e4f44cc0`으로 전진했으므로 그 후속 main 변경은 이 검증에 포함하지 않는다.

## ⑨ CI 귀속

- PR head `128ea511b`: 저장소 내부 check **45/45 성공**. Desktop Playwright hard gate, Frontend Desktop, slip-units, slip-it-public, slip-it-core, accounting 계열 모두 성공했다.
- 실패 1개는 외부 `GitGuardian Security Checks`다. 같은 head의 `Credential Plaintext Guard`와 docs 자격 평문 비공개 가드는 성공했으며, GitHub Actions의 `Set up job` 실패는 없다. 따라서 제품 코드/테스트 실패로 귀속하지 않는다.
- 요청서에 적힌 `SlipSalesUpdateIT R9 (expected: 2 / was: 1)`은 이번 PR head에 재현되지 않았다. `slip-it-core`가 성공했고, 병합한 main `1c9ebfc44`의 CI run `32084521369`도 성공했다.
- 로컬 재검증: 대상 Vitest **36/36**, product/slip/accounting `bootJar` **BUILD SUCCESSFUL**, live Playwright **1/1 통과**.

## ⑩ 머지 가능/불가 — 도달 결함 N건

**머지 가능 — 실 사용자가 화면을 통해 재현할 수 있는 도달 결함 0건.**

탭 의미, 생성 버튼 위치, 매출→같은 날짜·순번 매입 생성, 원천별 중복 차단, 11,000원 네 자리, INBOUND 경로, 재진입 잠금이 모두 실제 브랜치 화면과 격리 DB에서 유지됐다. 과거 real-QA 스펙의 폐기 의미 잔재 1건은 증거 무결성 문제로 명시했으나 런타임 도달 결함은 아니다.

## ⑪ 프로세스 회수

- 기동 포트 `28384`, `28386`, `28387`, `5944`, 격리 DB 포트 `25464`: listener **각 0**.
- 격리 컨테이너 `sol1264r3c-pg`: 삭제, 잔여 **0**.
- 임시 `-real-qa.spec.ts`: 삭제, 임시 스펙 파일 **0**.
- 공유 `samhan-*` 컨테이너: **24개 실행 상태 유지**. 중지·교체·변경하지 않았다.
