# #1092 S5 — 작성자 열 및 빈 필드 표시 fix

## 범위

PR #1121 이슈 #1092 슬라이스 1의 S4 라이브QA BLOCK 두 건만 수정했다.

- 통합 목록에 필수 `작성자` 열을 추가했다. 라벨은 정확히 `작성자`이며 `담당`으로 표기하지 않는다.
- 통합 목록에서 계열이 필드를 보유하지 않거나 API 값이 비어 있을 때 `—`를 렌더링하지 않고 빈칸으로 표시한다.
- `requester_id`는 작성 actor UUID이므로 화면에 노출하지 않았다.
- 담당 축, 웹 화면, snapshot 복구, 판매전표 전환, 운임절삭은 변경하지 않았다.

## 구현

- `EstimateListPage.tsx`
  - 통합 컬럼에 `작성자`를 추가했다.
  - `partnerCode`, `partnerName`, `writtenAt`, `writer`의 null fallback을 빈 문자열로 바꿨다.
  - 행별 작성자 셀에 테스트 식별자를 부여했으며 값 자체는 모델의 표시 가능한 writer만 사용한다.
- `estimateUnifiedListModel.ts`
  - 현재 API 표본 수를 코드 주석에 고정하지 않도록 설명을 정리했다.
- `EstimateListPage.test.tsx`
  - API 표본 개수를 고정 숫자 43/4로 박지 않고 테스트 로컬 변수로 만들었다.
  - `작성자` 헤더/행 셀과 통합 표 내 `—` 부재를 회귀 테스트로 추가했다.

## 검증

| 명령 | 결과 |
|---|---|
| `npx vitest run src/renderer/routes/EstimateListPage.test.tsx src/renderer/routes/estimateUnifiedListModel.test.ts` | **PASS 2 files / 11 tests** |
| `npm run lint` | **exit 0**. 기존 경고가 있으나 S5 수정 파일의 오류는 없음 |
| `npm run typecheck` | **PASS**. tsc 및 real-QA typecheck 50/50 통과 |
| `npm test` | **판정 불가**. 테스트 도중 `Worker exited unexpectedly`로 Vitest worker가 종료됨. 코드 assertion 실패는 출력되지 않음 |
| 기간 API 직접 조회(인증 없는 셸) | 두 endpoint 모두 **401**. 인증된 UI 기간 필터 성공 응답은 이 세션에서 PASS 판정하지 않음 |

S4에서 이미 확인된 기존 기능 8건은 코드 수정 범위에서 건드리지 않았고, S5 대상 관련 테스트는 11/11 통과했다.

## 안전·무훼손 확인

- 커밋·push하지 않았다.
- Docker 스택을 재기동하지 않았다.
- DB INSERT/UPDATE/DELETE를 실행하지 않았다.
- UUID를 사용자 화면에 추가하지 않았다.
- 기존 S4 QA 캡처와 보고서는 수정하지 않았다.

## 신규 파일

1. `docs/dev-reports/2026-08-08-1092-s5-writer-column-and-blank-fields.md`

S4에서 이미 생성되어 있던 `docs/dev-reports/2026-08-08-1092-s4-live-qa.md` 및 `docs/qa-shots/1092-s4-live-qa/`의 미추적 상태는 보존했다.

## diff 통계

S5 코드/테스트 diff 기준 `git diff --stat`는 **42 insertions, 12 deletions**이다. 삭제 줄 수는 **12줄**이다.
