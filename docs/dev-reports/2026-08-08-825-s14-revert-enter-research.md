# PR #1120 / 이슈 #825 S14 — Enter 재검색 되돌림

> 검증일: 2026-08-08  
> 기준 작업 트리 HEAD: `362a8e092`  
> 커밋·push: 하지 않음

## 결론

S11의 `WarehouseAutocomplete` Enter 재검색과 S13의 확정 상태 분리를 제거했다. Enter는 다시 컴포넌트의 일반 후보 선택 동작만 수행하며, 닫힌 상태에서는 특별한 재검색을 하지 않는다.

S10의 draft 보존(`취소·바깥 클릭 후 입력 보존`)과 중첩 Escape 동작은 유지했다. `AsyncAutocomplete` 및 결재자·은행거래 소비처는 변경하지 않았다.

## 변경 범위

- `WarehouseAutocomplete.tsx`
  - S11 `canReopenSelectionRef` 및 취소 후 Enter 재검색 분기 제거
  - S13 `hasConfirmedSelectionRef` 및 확정 후 Enter 차단 분기 제거
  - S10 `preserveDraftOnNextFocusRef`, `lastTypedDraftRef`, 취소 복원 로직 유지
- `WarehouseAutocomplete.test.tsx`
  - S11 Enter 재진입/Enter 단건 확정 테스트 제거
  - S13 `확정 직후 Enter는 다른 창고를 자동 선택하지 않는다` 테스트 제거
  - 기존 선택 확정, draft 보존, 중첩 Escape, 기본 Enter/IME 테스트 유지
- `825-s5-verification.spec.ts`
  - 재진입 제스처를 `Enter`에서 `fill('')` 후 `fill('창')`로 변경
  - 기존 “취소 후 모달 재진입 및 목표 창고 확정” 단정은 유지

## 검증

### design-system 전체

실행: `clients/web/design-system`에서 `npm test`

```text
Test Files  26 passed (26)
      Tests  205 passed (205)
```

`0 failed`, exit 0. S11/S13 Enter 전용 테스트 3개를 되돌린 뒤의 집계다.

### Desktop Playwright mock 전체

실행 조건:

```text
CI=1
VITE_MOCK_MODE=1
VITE_API_BASE_URL=http://127.0.0.1:1
clients/desktop> npx playwright test --reporter=line
```

```text
Running 667 tests using 2 workers
667 passed (7.6m)
```

`0 failed`, `0 skipped`, exit 0. 출력 말미의 기존 진단성 console 문구는 테스트 실패가 아니었다.

### typecheck / build

- `clients/web/design-system> npm run typecheck`: exit 0
- `clients/web/design-system> npm run build`: exit 0
- `clients/desktop> npm run typecheck`: exit 0
- `clients/desktop> npm run build`: exit 0

빌드의 폰트 경로 resolve 경고와 기존 Vite dynamic import 경고 외 오류 없음.

## diff 통계

되돌림 적용 직후 `git diff --stat` 원문:

```text
 .../825-s5-verification.spec.ts                    |   6 +-
 .../WarehouseAutocomplete.test.tsx                 | 116 +--------------------
 .../WarehouseAutocomplete.tsx                      |  31 ------
 3 files changed, 5 insertions(+), 148 deletions(-)
```

삭제 줄 수: **148줄**.

## 프로세스·산출물

- Playwright orphan test-server 1개를 종료했다.
- 공유 Docker 스택 재기동 없음, DB write 없음.
- 신규 파일: `docs/dev-reports/2026-08-08-825-s14-revert-enter-research.md`(본 보고서)
- 커밋·push 없음.
