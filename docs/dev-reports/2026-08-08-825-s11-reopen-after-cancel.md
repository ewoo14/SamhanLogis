# PR #1120 / 이슈 #825 S11 — 취소 후 Enter 재검색

## 범위

S10의 draft 보존 계약을 유지하면서, `WarehouseAutocomplete` 검색 모달을 취소한 뒤 outer 입력값을 다시 수정하지 않고 Enter로 동일 후보를 재검색할 수 있게 했다.

- 수정 대상: `WarehouseAutocomplete` 전용
- 수정하지 않음: 공용 `SearchResultSelectionModal`, `AsyncAutocomplete`
- 커밋/push: 하지 않음
- 신규 파일: `docs/dev-reports/2026-08-08-825-s11-reopen-after-cancel.md` (본 보고서)

## 구현

`WarehouseAutocomplete`가 검색 모달 취소 시 재검색 가능 상태를 ref로 기록한다. 이후 Enter가 들어오면 현재 draft를 다시 계산한다.

- 후보 2건 이상: 선택 모달 재오픈
- 후보 1건: `autoSelectSingleResult`가 켜진 기존 계약대로 자동확정
- 후보 0건: 모달을 열지 않고 현재 빈 결과 상태 유지
- `pick` 확정 시 재검색 상태 제거 → 확정 후 Enter로 재오픈하지 않음
- 포커스 이벤트에는 모달 재오픈 동작을 추가하지 않음

## 조합별 확인

1. 취소 → Enter → 재오픈 → 다시 취소 → 다시 Enter: S5 Playwright에서 두 번 반복 후 후보 모달 재오픈 및 목표 창고 확정 통과.
2. 후보 1건 Enter: WarehouseAutocomplete 단위 테스트에서 `autoSelectSingleResult` 자동확정 및 모달 미표시 통과.
3. 후보 0건 Enter: WarehouseAutocomplete 단위 테스트에서 모달 미표시·빈 결과 유지 통과. S5의 내부 검색 0건 상태에서 확정 잠김·취소 가능 단정도 유지.
4. 확정 후 Enter: WarehouseAutocomplete 단위 테스트에서 확정 라벨 유지 및 모달 미재오픈 통과.
5. 결재자·은행거래·AsyncAutocomplete 소비처: design-system 전체 테스트 및 S5 기존 소비처 mock 검증에서 기존 Enter 선택 경로 유지.

## 검증 원문

### design-system 전체

```text
Test Files  26 passed (26)
Tests       207 passed (207)
```

포함된 AsyncAutocomplete 테스트: `34 passed`.

### Desktop Playwright mock 전체

실행 조건:

```text
CI=1
VITE_API_BASE_URL=http://127.0.0.1:1
AUDIT_BASE_URL=http://127.0.0.1:5173
playwright.config.ts webServer 자체 기동
```

종료 집계 원문:

```text
Running 667 tests using 2 workers
  3 flaky
    [chromium] › playwright\permission-groups\permission-groups.spec.ts:33:3
    [chromium] › playwright\sp-d4-remaining-pages-permission-migration\sp-d4-remaining-pages-permission-migration.spec.ts:1055:3
    [chromium] › playwright\supplier-profile\supplier-profile.spec.ts:652:3
  664 passed (6.8m)
```

최종 유효 실행의 failed 수: `0`. S5 대상 spec의 병합전환 테스트는 통과했다.

참고로 첫 재현 실행에서는 S10 회귀가 그대로 확인됐다.

```text
Running 667 tests using 2 workers
  1 failed
    playwright\825-s5-verification\825-s5-verification.spec.ts:127:3
  666 passed (6.7m)
```

### 빌드/정적 확인

```text
@samhan/design-system npm run build: exit 0
git diff --check: exit 0
```

## 변경 통계

`git diff --stat`:

```text
3 files changed, 88 insertions(+), 1 deletion(-)
```

- 삭제 줄 수: **1**
- 신규 파일 목록: `docs/dev-reports/2026-08-08-825-s11-reopen-after-cancel.md` (untracked 보고서; `git diff --stat`에는 미포함)

## 잔여 사항

최종 전체 mock의 flaky 3건은 이번 변경 파일/소비처와 무관한 기존 스펙에서 발생했다. 대상 S5 회귀는 0 failed로 확인했다.
