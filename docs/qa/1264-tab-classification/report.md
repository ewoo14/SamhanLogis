# PR #1264 — 일마감 탭 분류 역전 검증 보고서

## ① 레거시 원문 인용

- `tools/legacy-gas/일마감 프로그램/Code.js:738` — `if (datePattern.test(String(item['회계반영일자']).trim())) pre.push(item);`
- `tools/legacy-gas/일마감 프로그램/Code.js:744` — `return { status: 'success', main: main, pre: pre, sum: main.concat(pre) };`
- `tools/legacy-gas/일마감 프로그램/Index.html:211-212` — `main`은 `결과`, `pre`는 `선발행`으로 화면에 매핑된다.

따라서 레거시 정본은 `회계반영일자 있음 → 선발행`, `없음 → 결과`다.

## ② 뒤집기 전/후 탭별 행 수

정찰 보고서 A-2의 전체 실측은 24행이다.

| 상태 | 뒤집기 전 현행 | 뒤집은 후 기대값 | 라이브 재측정 |
|---|---:|---:|---|
| 회계반영일자 있음 → 선발행 | 결과 1행 | 선발행 1행 | 미수행 |
| 회계반영일자 없음 → 결과 | 선발행 23행 | 결과 23행 | 미수행 |

코드 변경은 `DailyClosingPage.tsx:813-815`의 조건을 `RESULT → !accountingPostedAt`, `PRE_ISSUED → Boolean(accountingPostedAt)`로 뒤집었다.

## ③ 생성 버튼 이동과 실제 생성 확인

생성 버튼은 기존 소계행 렌더링을 유지하되, 분류 조건을 뒤집어 미반영 `결과` 탭으로 함께 이동한다. 테스트에서 결과 탭의 매출·매입 버튼을 실제 클릭했고, 매출 생성 호출 및 재진입 잠금을 확인했다.

- 자동 테스트: `DailyClosingPage.test.tsx` 30/30 통과
- 별도 포트 JAR + 격리 DB Chromium 라이브 클릭: 미수행
- 따라서 라이브 실제 생성 증거는 아직 없음

## ④ 폐기 해석 정정 건수

- 코드: 2건 — 분류 조건 1건, 레거시 의미 주석 1건
- 문서: 0건 — 정찰 보고서는 당시 현행/레거시 차이를 기록한 증거 문서라 수정하지 않음
- 테스트: 1개 테스트 이름과 양방향 단정, 관련 탭 선택 12건 정정
- 열 순서·열 매핑: 0건 변경 (#1270 범위 보존)

전수 grep 결과, 현행 코드에 `미반영=선발행`을 단정하는 주석은 없었다. `CURRENT-WORK.md`와 정찰 문서의 과거 결정/현행 관찰 문구는 역사적 증거로 남겨 두었다.

## ⑤ RED 원문(양방향)

RED 실행:

```text
vitest ... DailyClosingPage.test.tsx
30 tests | 3 failed
```

실패 단정은 반영 행이 선발행에, 미반영 행이 결과에 있어야 한다는 양방향 기대와 기존 분류가 충돌함을 보였다. 이후 조건을 뒤집고 테스트를 보정했다.

GREEN 실행:

```text
npm test -- --run src/renderer/routes/DailyClosingPage.test.tsx
Test Files  1 passed (1)
Tests       30 passed (30)
```

## ⑥ 잃으면 안 되는 것 재현

| 항목 | 이번 라운드 증거 |
|---|---|
| 매출 생성 후 같은 날짜·순번 매입 생성 | 자동 테스트 통과 |
| 동일 원천 재생성 HTTP 422 차단 | 기존 계약 테스트/코드 보존, 라이브 미수행 |
| 화면·전표·배분·DB 11,000원 | 기존 PR 증거 보존, 라이브 미수행 |
| INBOUND 14행 · OUTBOUND 13행 | 라이브 미수행 |
| 실제 INBOUND 엔드포인트·저장소 경로 | 코드 변경 없음, 기존 테스트 통과 |
| 재진입 후 생성 버튼·금액 잠금 | 자동 테스트 통과 |
| fixture 전표번호 표준 형식 | 코드 변경 없음 |

이번 변경은 분류 조건과 테스트의 탭 선택만 건드렸고, 금액·열·API 계약은 변경하지 않았다. 라이브 재현을 수행하지 않았으므로 위 표의 라이브 항목을 완료로 주장하지 않는다.

## ⑦ #1270 겹침 여부

겹침 없음. `DailyClosingPage.tsx`의 열 배열·열 매핑·렌더 순서는 수정하지 않고, 탭 분류 조건만 수정했다.

## ⑧ 스크린샷(행 수·경로)

이번 라운드의 확정 QA PNG는 생성하지 못했다. 요구된 `resolveQaShotsDir()` 경유 Chromium 라이브 캡처도 미수행이다. 따라서 0행 debug 캡처를 증거로 사용하지 않았다.

## ⑨ `git status --porcelain` 원문

```text
 M clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx
 M clients/desktop/src/renderer/routes/DailyClosingPage.tsx
```

커밋·푸시는 하지 않았다. 시작 전 요구된 `git merge origin/main --no-edit`는 Git이 자동 merge commit(`3c68da937`)을 생성했다.

## ⑩ 프로세스 회수

- 이번 라운드에서 장기 JAR·컨테이너·Chromium 프로세스: 기동하지 않음
- 테스트 프로세스: 종료 확인
- 공유 컨테이너 24개: 중지·교체·변경하지 않음
- `.pid`, `.log`, 0행 캡처: 생성하지 않음

