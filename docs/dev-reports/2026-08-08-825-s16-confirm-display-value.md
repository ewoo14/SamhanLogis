# PR #1120 / 이슈 #825 — S16 확정 표시값 fix 라운드 보고

## 결론

S16 fix를 중단한다. RED-first 조건에 따라 현재 코드에서 미커밋된
`WarehouseAutocomplete` 회귀 테스트를 실행했으나 실패하지 않았다. 따라서
결함 표면을 아직 정확히 짚지 못한 상태에서 생산 코드를 수정하지 않았다.

## RED-A 원문

명령:

```text
npm test -- --run src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx -t "모달 확정 후 포커스가 복원되어도 확정 창고 표시값과 dropdown 상태를 유지한다" --reporter verbose
```

출력:

```text
✓ src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx
  > WarehouseAutocomplete opaque option DOM contract
  > 모달 확정 후 포커스가 복원되어도 확정 창고 표시값과 dropdown 상태를 유지한다

Test Files  1 passed (1)
Tests       1 passed | 10 skipped (11)
```

종료코드: `0` (Vitest 결과의 `1 passed`로 확인).

## RED-B(회귀 울타리) 원문

실행하지 않았다. RED-A가 재현되지 않아 사용자 지시의 중단 조건에 해당한다.

## 동시 GREEN 원문

실행하지 않았다. RED가 아니므로 fix 및 GREEN 검증 단계로 진행하지 않았다.

## 근본 원인 판정 상태

사용자가 제시한 “확정 시 표시값이 설정되지 않는 지점 하나”라는 전제를
확인할 수 없었다. 현재 테스트는 `선택 확정` 버튼에 `keydown Enter` 후 `click`을
보내도 확정 표시값과 `aria-expanded=false`를 만족한다. 이 결과만으로는
실제 Playwright 재현 경로와 테스트 경로가 다르거나, 테스트의 포커스 복원
시퀀스가 결함을 재현하지 않는 셋째 가능성을 배제할 수 없다.

따라서 추측성 수정은 하지 않았다.

## §8 필수 3절

### ① 새로 가능해진 상태·화면 조합과 결과

없음. 생산 코드 변경이 없으므로 새 상태·화면 조합을 만들지 않았다.

### ② 제거·이동·개명 식별자 grep 전수 확인

없음. 제거·이동·개명한 식별자가 없다.

### ③ 변경 파일을 참조하는 테스트 전부 실행 결과

생산 변경 파일이 없다. 지정된 RED 테스트 1건만 실행했고 결과는 `1 passed`였다.
RED가 아니므로 §7 범위의 회귀 울타리와 typecheck는 실행하지 않았다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-08-825-s16-confirm-display-value.md`

