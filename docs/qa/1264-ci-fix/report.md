# PR #1264 CI fix 라운드 보고

검증 기준: 브랜치 `feat/daily-closing-accounting-slip`, 기준 SHA `4447875ce`.
`git merge origin/main --no-edit`는 `Already up to date.`로 충돌 없이 완료됐다.

## ① 고친 fixture 목록

전표번호 literal 총 12건을 `YYYY/MM/DD-N`으로 수정했다. 테스트의 날짜·순번·원천 연결 의미는 유지했다.

| 파일 | 변경 내용 | 건수 |
|---|---|---:|
| `clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx` | `OUT-20260814-6` → `2026/08/14-6`, `IN-20260814-6` → `2026/08/14-6`, `ACC-OUT-6` → `2026/08/14-100`, `OUT-REENTRY-91` → `2026/08/14-91`, `ACC-REENTRY-91` → `2026/08/14-191`, `OUT-REENTRY-92` → `2026/08/14-92` | 11 |
| `clients/desktop/src/renderer/routes/dailyClosingAccountingSlip.test.ts` | `2026/08/14-amount` → `2026/08/14-2` | 1 |

관련 두 fixture 파일을 다시 훑었고, 비표준 전표번호 literal은 0건이다.

## ② 비표준이 된 이유 + 실데이터 비표준 건수

한 줄 판정: 형식 검증이 최근 강화된 것이 아니라, 표준이 이미 `YYYY/MM/DD-N`으로 정해진 뒤 새로 추가된 PR #1264 fixture가 처음부터 prefix/문자 suffix를 잘못 사용했다.

표준 근거는 `.claude/memory/feedback_slip_order_number_format.md`와 `SlipNumberService`/회계 전표 채번기다. 읽기 전용 PostgreSQL 조회 결과:

- `slip_db.slips`: 235건 중 비표준 0건
- `accounting_db.sales_accounting_slips`: 1건 중 비표준 0건
- `accounting_db.purchase_accounting_slips`: 2건 중 비표준 0건
- 실데이터 비표준 합계: **0건**

## ③ 테스트 약화 여부 판정

약화되지 않았다. 형식은 이번 테스트가 지키는 생성/재진입 잠금·원천별 연결·금액 변환 성질과 무관한 fixture 계약이므로 형식만 표준화했다. 테스트 삭제·skip·assert 완화·동작 코드 변경은 없다.

## ④ A·B·C 유지 확인

재판정 report 및 기존 실 Chromium/격리 DB 결과를 기준으로 유지된다.

- A: 같은 날짜·순번에서 매출 생성 후 별도 매입 생성 성공
- B: 동일 원천 재생성 매출·매입 모두 HTTP 422 차단
- C: 공급가 10,000원 + VAT 1,000원 = 총액 11,000원, 화면·응답·DB 네 자리 일치
- INBOUND 14행, OUTBOUND 13행 유지
- 재진입 후 생성 버튼·금액 입력 잠금, 정상 미생성 경로, 열 정합 유지

## ⑤ 테스트 결과(종료코드)

- design-system 산출물 재생성: `npm run build` — 종료코드 **0**
- Desktop 변경 관련 targeted vitest: 2 files, 183 passed / 2 skipped — `TARGETED_DESKTOP_EXIT=0`
- Desktop 전체 `npm test`: 8 failed / 2 skipped, 종료코드 **1**. 실패는 fixture와 무관한 기존 환경/하네스 문제(`@testing-library/jest-dom/vitest` import 해석 3건, harness false-green guard 5건)이며 대상 `mock.test.ts`는 158 passed / 2 skipped다.
- accounting 관련 단위 테스트: 99/99 통과 — `ACCOUNTING_UNIT_EXIT=0`
  - `AccountingSlipLinkEligibilityTest` 6
  - `PurchaseAccountingSlipServiceTest` 43
  - `SalesAccountingSlipServiceTest` 50
- accounting 단위+IT 묶음: 133 completed / 34 failed. 실패한 IT 환경군은 fixture-only 변경과 무관하며, 위 99개 관련 단위 계약은 별도 0 실패로 확인했다.

## ⑥ CI 귀속

- PR #1264 run `32077199305`: `Frontend Desktop (typecheck + lint + build)`만 실패. 실패 원인은 `mock business document number contract`의 위 12개 literal.
- 같은 PR의 Desktop Playwright, slip 계열 unit/IT, accounting 계열 job은 통과.
- `Set up job` 실패는 확인되지 않아 GitHub 장애 귀속이 아니다.
- main 최신 CI run `32077751591`은 성공. main의 별도 과거 실패 run에서 보고된 `SalesCommissionSettlementDetailPage` 실패는 이 PR과 무관하다. `SlipSalesUpdateIT R9 (expected: 2 / was: 1)`도 PR fixture 실패가 아닌 main 기준의 기존 slip 계열 판정으로 분리한다.
- GitGuardian Security Checks 실패는 별도 보안 스캔 귀속이며 fixture 테스트 실패와 무관하다.

## ⑦ `git status --porcelain` 원문

```text
 M clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx
 M clients/desktop/src/renderer/routes/dailyClosingAccountingSlip.test.ts
?? docs/qa/1264-ci-fix/
```

## ⑧ 프로세스 회수

- 이번 라운드가 기동한 Gradle daemon PID 109688은 종료 요청 완료.
- Desktop/Vitest 및 테스트용 일시 프로세스는 종료 확인.
- 다른 워크트리 프로세스는 건드리지 않았다.
- 공유 컨테이너는 중지·삭제·재생성하지 않았다. 관찰된 컨테이너 상태는 그대로 유지했다.
- `.pid`, `.log`, `debug*.png` 실행 잔재를 새로 만들거나 커밋 대상에 포함하지 않았다.

커밋·push·add는 수행하지 않았다. 이 보고서와 두 fixture 파일만 PM 커밋 대상이다.
