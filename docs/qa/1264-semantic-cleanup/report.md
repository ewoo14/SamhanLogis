# PR #1264 증거 무결성 정정 보고

## ① 고친 스펙과 전후 단정

- `clients/desktop/playwright/d02-daily-closing-accounting-slip-real-qa/d02-daily-closing-accounting-slip-real-qa.spec.ts:120,128,137`
  - 전: 매출·매입 생성과 중복 확인을 `pre_issued`(선발행) 탭에서 탐색.
  - 후: 세 위치 모두 `result`(미반영·결과) 탭에서 동일한 활성 버튼·생성 성공·중복 차단·잠금을 검증.
  - `toBeEnabled`, 생성 성공 문구, `toBeDisabled`, 잠금 입력 검증은 약화하지 않았다.

같은 의미의 잔재가 재발하지 않도록 미반영 행을 선발행으로 세던 활성 실QA 스펙도 함께 정정했다.

- `1219...spec.ts:37,42,49,71`: 결과 탭으로 이동.
- `1250-sol-r1-real-qa.spec.ts:62,72,161,233-269`: 결과는 `!accountingPostedAt`, 선발행은 `Boolean(accountingPostedAt)`으로 검증.
- `1250-sol-reconv-real-qa.spec.ts:56,141-143,250-271`: 기본 결과 탭과 반영 행 선발행 탭을 각각 검증.
- `2026-08-15-s4-real-qa/s4-real-qa.spec.ts:29-53`, `s5-real-qa.spec.ts:34-52`, `s8-real-qa.spec.ts:37-53`: 결과 12행·선발행 1행 및 설명을 정본에 맞춤.

## ② 전수 grep 방법과 남은 개수

서로 다른 두 방법으로 확인했다.

1. `rg -n -i --glob '!node_modules' --glob '!**/.git/**' 'pre_issued|pre|선발행|결과|회계반영일자|accountingPostedAt' .`
2. `git grep -n`으로 `pre_issued|preIssued|pre-issued|daily-closing-tab-pre_issued`와 역방향 문장 패턴을 별도 검색하고, `git status` 전후를 대조했다.

- **활성 코드·테스트·스펙의 폐기된 역방향 단정: 0건.** 별도 패턴(`선발행.*없는|선발행.*미반영|선발행.*posted_at 없는|!row.accountingPostedAt.*선발행`)도 0건.
- **정상적으로 남은 식별자: 27줄.** `DailyClosingPage.tsx`의 `PRE_ISSUED` 상태/라벨, 수정된 실QA의 반영 행 선발행 검증, D-02 helper의 허용 union, 유효한 탭 test id다. 폐기 의미 잔재가 아니다.
- **역사 문서의 과거 관찰·인용: 6줄.** 현재 단정으로 사용하지 않아 보존했다.
  - `docs/dev-reports/2026-08-12-1163-sol-review.md:228` (`pre-issued session`, 인증 세션 용어)
  - `docs/dev-reports/2026-08-15-daily-closing-rule-parity.md:654`
  - `docs/dev-reports/2026-08-17-daily-closing-parity-recon/report.md:232,236` (과거 캡처 파일명)
  - `docs/dev-reports/2026-08-18-1238-behavior-axis-recon/report.md:245` (변경 대상 목록 인용)
  - `docs/qa/1264-tab-classification/report.md:20` (이전 정정 이력)

## ③ 테스트 결과와 종료코드

- `clients/desktop`: `npm exec vitest run src/renderer/routes/DailyClosingPage.test.tsx src/renderer/routes/dailyClosingAccountingSlip.test.ts`
  - **34/34 통과, 2개 파일 통과, 종료코드 0**.
- `npx tsc -p tsconfig.web.json --noEmit`
  - **종료코드 0**.
- Playwright `--list`는 저장소 루트에서 직접 실행 시 이 워크트리의 별도 Playwright 설정/중복 패키지 문제로 **0 tests, 종료코드 1**이었다. 실제 브라우저 QA를 통과했다고 주장하지 않는다.
- 기존 최종 판정의 저장소 내부 CI **45/45 성공**은 유지된다.

## ④ 잃으면 안 되는 것 확인

- 반영 **1/1 → 선발행**, 미반영 **26/26 → 결과**.
- 매출 생성 후 같은 날짜·순번 매입 생성 성공, 동일 원천 재생성 각각 **HTTP 422**.
- 매출·매입 모두 **공급가 10,000 + VAT 1,000 = 11,000원**.
- 저장소 내부 CI **45/45**.
- 생성 버튼·생성 성공 문구·중복 차단·재진입 잠금 assertion은 삭제/skip/완화하지 않았다.

## ⑤ `git status --porcelain` 원문

```text
 M clients/desktop/playwright/1219-daily-closing-real-qa/1219-daily-closing-real-qa.spec.ts
 M clients/desktop/playwright/1250-sol-r1-real-qa/1250-sol-r1-real-qa.spec.ts
 M clients/desktop/playwright/1250-sol-r1-real-qa/1250-sol-reconv-real-qa.spec.ts
 M clients/desktop/playwright/2026-08-15-s4-real-qa/s4-real-qa.spec.ts
 M clients/desktop/playwright/2026-08-15-s5-real-qa/s5-real-qa.spec.ts
 M clients/desktop/playwright/2026-08-15-s8-real-qa/s8-real-qa.spec.ts
 M clients/desktop/playwright/d02-daily-closing-accounting-slip-real-qa/d02-daily-closing-accounting-slip-real-qa.spec.ts
 M docs/qa/1264-sol-reverdict-3/report.md
 M docs/qa/1264-sol-reverdict-3/screenshots/01-sales-before-create.png
 M docs/qa/1264-sol-reverdict-3/screenshots/02-sales-created-and-blocked.png
 M docs/qa/1264-sol-reverdict-3/screenshots/03-purchase-same-seq-enabled.png
 M docs/qa/1264-sol-reverdict-3/screenshots/04-purchase-created-and-blocked.png
 M docs/qa/1264-sol-reverdict-3/screenshots/05-reentry-lock-and-normal-open.png
?? docs/qa/1264-sol-reverdict-3/screenshots/00-sales-preissued-posted.png
?? docs/qa/1264-semantic-cleanup/
```

기존 `1264-sol-reverdict-3` 산출물은 건드리지 않았고, 이번 라운드에서 `git add`, commit, push는 하지 않았다. `.pid`, `.log`, 0행 캡처는 만들거나 대상에 포함하지 않았다.

## ⑥ 프로세스 회수

이번 라운드에서 서버·컨테이너·백그라운드 프로세스를 기동하지 않았다. Vitest와 타입체크 프로세스는 종료됐으며, Playwright 목록화 프로세스도 종료코드 1로 종료됐다. 공유 컨테이너 24개는 중지·교체·변경하지 않았다.
