# 검증 SHA

`78449f57469d85b996bb2161725e3327cd70bac6` — PR #1264 head, `fix: 재진입 시 잠금이 풀리던 것 — 서버 상태를 정본으로 (#1264)`

- 최초 `wdcp` 확인값은 `a61a7b750db22245c6587291c718cd45ff69e11c`(`fix/daily-closing-parity`)로 PR head와 달랐다.
- 금지된 `wdc02`는 건드리지 않고, `wdcp`만 위 PR head에 detached 전환해 검증했다.
- 시작 상태의 기존 미추적 `docs/dev-reports/2026-08-17-daily-closing-parity-recon/`은 건드리지 않았다.

## ② 이전 결함 재현 시도 결과

이전 SOL 판정의 도달 결함 두 건을 PR head 서비스와 실제 공유 데이터 복제 없는 조회 경로로 다시 시도했다.

1. **재진입 후 중복 생성 버튼 재활성화**: 재현되지 않았다.
   - 2026-08-13 INBOUND, 원천 `2026/08/13-1`, 연결 회계전표 `2026/08/13-6831`(DRAFT)을 사용했다.
   - 첫 진입: `회계전표 생성` 버튼 비활성, `이미 생성됨` 표시.
   - 페이지 재진입: 같은 버튼 비활성, `이미 생성됨` 유지.
2. **재진입 후 금액 입력 잠금 해제**: 재현되지 않았다.
   - 첫 진입과 재진입 모두 해당 원천행의 금액 input 3개가 disabled였다.
   - 같은 화면의 미연결 2전표 금액 input 6개는 계속 활성이라 과잉 전면 잠금도 없었다.

단, 재판정에서 별도 사용자 도달 결함 두 건을 확인했다.

- **도달 결함 1 — 매입 화면의 원천 구분 오표기**: 매입(INBOUND) 탭인데도 화면 제목이 `출고전표 원본행`, 기준일이 `출고일`로 표시된다. 실제 데이터는 INBOUND 3행이며 사용자는 매입 원천을 출고 원천으로 오인한다.
- **도달 결함 2 — POSTED 원천 금액과 회계전표 금액 불일치**: 매출·매입 양쪽에서 일마감 11,000원, 회계전표 생성/배분/저장 10,000원으로 갈린 원천이 실제 존재한다. eligibility도 두 건 모두 `AMOUNT_MISMATCH, ALREADY_ALLOCATED`를 반환한다.

## ③ fix가 막은 정상 경로

정상 미생성 경로는 막히지 않았다.

- 매출 정상 경로: 2026-08-03 OUTBOUND 1전표·4행, 소계 `1,739,100원`.
  - 회계전표 생성 버튼 1개 활성.
  - 금액 input 12개 활성, 비활성 0개.
- 매입 정상 경로: 2026-08-03 INBOUND 3전표·12행.
  - 회계전표 생성 버튼 3개 활성.
- 연결된 DRAFT 전표만 서버 `linkedSlips`에 따라 잠기고, 같은 날짜의 미연결 전표 2건은 계속 생성·편집 가능했다.

## ④ 분모 sweep

PR head product/slip/accounting JAR을 각각 18084/18186/18187에서 실행하고, 공유 DB에는 쓰기 API를 호출하지 않은 채 2026-08-01~31을 전수 조회했다.

| 구분 | 비어 있지 않은 날짜 조합 | 원본행 | 원천전표 | linked | unlinked |
|---|---:|---:|---:|---:|---:|
| OUTBOUND | 6 | 24 | 21 | 1 | 20 |
| INBOUND | 5 | 36 | 27 | 2 | 25 |
| 합계 | 11 | 60 | 48 | 3 | 45 |

- fix가 매입/매출 중 한쪽만 처리하는 분모 누락은 재현되지 않았다.
- 전액 연결 DRAFT, 금액 불일치 POSTED, 미연결 정상 경로를 모두 포함했다.

## ⑤ 금액 3자리 일치

| 경로 | 일마감/API 표시 원천 | 생성·allocation | DB 저장 `total_amount` | 판정 |
|---|---:|---:|---:|---|
| 2026-08-13 INBOUND → `2026/08/13-6831` DRAFT | 600,600 | 600,600 | 600,600 | 일치 |
| 2026-08-14 OUTBOUND → `2026/08/14-851` POSTED | 11,000 | 10,000 | 10,000 | **불일치 1,000** |
| 2026-08-14 INBOUND → `2026/08/14-970` POSTED | 11,000 | 10,000 | 10,000 | **불일치 1,000** |

- DB는 `sales_accounting_slips`/`purchase_accounting_slips`와 각 allocation 합계를 read-only SQL로 직접 확인했다.
- 두 POSTED 불일치는 매출·매입 양방향에서 같은 계열로 재현되어 도달 결함 1건으로 묶었다.

## ⑥ 라이브QA 스크린샷 목록

모든 캡처는 임시 라이브 스펙 `clients/desktop/playwright/1264-sol-reverdict-real-qa/`에서 `resolveQaShotsDir()`를 거쳐 `docs/qa/1264-sol-reverdict/screenshots/_local/`에 저장했다. 자격은 `resolveQaCredential()`만 사용했다. 스펙은 검증 후 회수했다.

| 파일 | 화면 데이터행 | 확인 내용 |
|---|---:|---|
| `01-sales-normal-path.png` | 4 | 매출 정상 원본행, 17열 좌측 |
| `02-sales-after-reentry.png` | 4 | 매출 재진입, 정상 원본행 유지 |
| `03-purchase-normal-path.png` | 12 | 매입 정상 원본행, stub 아님 |
| `04-purchase-after-reentry.png` | 12 | 매입 재진입, 정상 원본행 유지 |
| `05-sales-unlinked-normal-right.png` | 4 | 17열 우측, 생성 버튼 활성·1,739,100원 |
| `06-purchase-full-link-first-entry.png` | 3 | DRAFT linked 첫 진입, `이미 생성됨`·600,600원 |
| `07-purchase-full-link-reentry.png` | 3 | DRAFT linked 재진입, 잠금 유지 |

열 검증:

- 헤더는 정확히 17개다.
- 매출 4행은 병합 첫 행 17셀 + 후속 3행 각 10셀, 매입 12행은 4행 그룹마다 `17,10,10,10` 패턴이다. 빠진 데이터가 아니라 앞 7개 열의 `rowSpan=4` 병합 결과다.
- 좌·우 스크롤 캡처로 17열의 헤더/데이터 위치를 대조했고, stub/빈 표는 없었다.
- 단, 매입 화면의 `출고전표 원본행`/`출고일` 표기는 데이터 의미와 맞지 않아 도달 결함으로 판정했다.

증거 무결성 정정:

- `03`과 `04`의 SHA-256은 동일하다. 재진입 전후 화면 변화가 없어서 같은 픽셀이 다시 캡처된 것이며 별도 시점의 상이한 이미지로 주장하지 않는다.
- `06`과 `07`의 SHA-256도 동일하다. 잠금 유지 결과가 픽셀 단위로 같으며 별도 상태 변화 증거 두 장으로 세지 않는다.

## ⑦ 미검증 축

- 공유 DB write 금지 때문에 신규 회계전표 생성 버튼을 실제 클릭하지 않았다. 신규 생성 HTTP 응답은 이번 라운드 미검증이다.
- POSTED 금액 불일치 두 건의 최초 생성 시점 입력값/작성 경위는 미검증이다. 현재 사용자 화면·eligibility·DB 저장값의 불일치는 직접 재현했다.
- 인앱 브라우저 backend는 조회 결과 0개여서 사용할 수 없었고, 저장소 Chromium Playwright 실서버 실행으로 대체했다.

## ⑧ CI 판정

**CI red.** `gh pr checks 1264` 재조회 결과:

- `Frontend Desktop (typecheck + lint + build)` 실패.
  - `src/renderer/api/mock.test.ts` 문서번호 계약에서 이 PR의 fixture `OUT-REENTRY-91`, `ACC-REENTRY-91`, `OUT-REENTRY-92` 등이 위반으로 검출됐다.
  - 공식 결과: test file 1 failed / 300 passed, test 1 failed / 2477 passed / 2 skipped.
- `GitGuardian Security Checks` 실패는 함께 남아 있다.
- 그 외 빌드·서버·Playwright/Detox·가드 job은 통과 상태다.

CI red는 도달 결함 수에는 넣지 않았지만 머지 게이트는 닫혀 있다.

## ⑨ 머지 가능/불가 — 도달 결함 2건

**머지 불가 — 도달 결함 2건.**

1. 매입(INBOUND) 화면이 `출고전표 원본행`/`출고일`로 오표기된다.
2. 실제 POSTED 매출·매입 원천에서 일마감 11,000원과 회계전표 생성·배분·저장 10,000원이 갈린다.

이전 라운드의 재진입 중복 버튼·금액 잠금 두 결함은 사라졌고 정상 미생성 경로도 살아 있다. 그러나 새 도달 결함과 Frontend Desktop CI red 때문에 머지할 수 없다.

## ⑩ 프로세스 회수

- 이번 라운드 기동 Vite 5942: 회수, 잔여 0.
- 이번 라운드 기동 product/slip/accounting Java 18084/18186/18187: 전부 회수, 잔여 0.
- Playwright/1264 관련 node·java 프로세스: 잔여 0.
- 격리 컨테이너: 기동 0, 잔여 0.
- 공유 `samhan-*` 컨테이너: 24개 그대로 유지. 중지·재시작·교체 0.
- 회계전표 생성·수정 API 호출 0건. 공유 회계 DB 업무 write 0건.
- 임시 라이브 스펙과 `test-results`는 회수했다.
- `git add`/`commit`/`push`: 수행하지 않았다.
