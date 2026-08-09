# PR #1120 / 이슈 #825 S13 — 확정값 안정성

## 결론

`WarehouseAutocomplete`의 확정 상태와 검색 draft를 분리했다. 모달에서 `CS-001 · 위탁창고`를 확정한 뒤 포커스 복원으로 draft가 비워져도 Enter가 dropdown 첫 후보 `HQ-001 · 본사창고`를 다시 확정하지 않는다.

사용자가 실제로 입력을 변경하면 확정 상태를 해제하므로 S11의 Enter 재검색과 기존 dropdown Enter는 유지된다. `AsyncAutocomplete`는 수정하지 않았다.

## 코드 원인

S11의 모달 재오픈 ref가 확정 시 `false`가 된 뒤에도, 모달 닫힘의 포커스 복원으로 `handleFocus()`가 `draft=''`, `open=true`를 만들었다. 다음 Enter가 S11 분기가 아닌 기존 dropdown 분기의 `candidates[0]`으로 내려가 `CS-001 → HQ-001`을 조용히 덮어썼다.

## 수정

- `hasConfirmedSelectionRef`를 추가해 `pick()` 이후 확정 상태를 보존한다.
- 확정 상태에서 빈 draft로 들어온 Enter는 소비하고 아무 값도 바꾸지 않는다.
- `handleChange()`가 호출되면 확정 상태를 해제해 명시적 새 검색을 허용한다.
- 신규 이벤트/트리거, 공용 `AsyncAutocomplete` 변경 없음.

## RED 원문

S12 실 GUI에서 먼저 확인된 도달 결함 원문을 그대로 고정했다.

```text
Expected: /^CS-001 · /
Received: "HQ-001 · 본사창고"
```

회귀 테스트는 `CS-001`을 확정한 뒤 포커스 복원과 Enter를 거쳐 최종 값 및 `onChange` 호출이 `CS-001`에 고정되는 계약이다.

## 검증 원문

### design-system 대상 테스트

```text
Test Files  1 passed (1)
Tests       6 passed (6)
```

### design-system 전체

```text
Test Files  26 passed (26)
Tests       191 passed (191)
```

AsyncAutocomplete 테스트는 `33 passed`다.

### design-system build

```text
tsc -p tsconfig.build.json && vite build: exit 0
```

### Desktop Playwright mock 전체

실행 조건:

```text
CI=1
VITE_MOCK_MODE=1
VITE_API_BASE_URL=http://127.0.0.1:1
AUDIT_BASE_URL=http://127.0.0.1:5173
```

종료 집계 원문:

```text
Running 665 tests using 2 workers
  2 failed
    playwright\coedit-s3-1-live\check-5177.spec.ts:2:1
    playwright\coedit-s3-1-live\coedit-s3-1-live-qa.spec.ts:16:1
  663 passed (6.9m)
```

두 실패는 이번 변경 파일 및 mock warehouse 경로와 무관한 기존 실서버 live QA 스펙이다. Desktop 전체 실행 자체는 완료됐으며 프로세스는 회수했다.

S12에서 실 GUI로 확인된 조합 ①~⑤(반복 Enter, 입력 변경 재검색, 지움 후 새 검색, 취소 후 재오픈 확정, 1건 자동확정)와 S5의 결재자·은행거래 거래처 소비처 검증을 유지한다. 이번 수정은 WarehouseAutocomplete 전용이며 공용 AsyncAutocomplete의 기존 Enter 확정 경로를 변경하지 않았다.

## 변경 통계

`git diff --stat`:

```text
2 files changed, 64 insertions(+), 1 deletion(-)
```

- 삭제 줄 수: **1**
- 신규 영구 파일: `docs/dev-reports/2026-08-08-825-s13-confirmed-value-stability.md`
- 기존 사용자 파일: `docs/dev-reports/2026-08-08-825-s12-final-reconvergence.md` (수정하지 않음)

커밋·push는 하지 않았다.
