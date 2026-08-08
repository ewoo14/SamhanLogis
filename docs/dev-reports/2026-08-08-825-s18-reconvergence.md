# PR #1120 / 이슈 #825 — S18 재수렴 적대검증 보고서

## 판정

실 사용자가 밟을 수 있는 결함 **3건**을 재현했다.

1. 검색 모달 backdrop 취소는 즉시에는 `창`을 보존하지만 120ms blur 정리 뒤 빈 값으로 소실된다.
2. `Ctrl+A` 뒤 `HQ`를 연속 입력하면 `H`에서 단건 자동확정된 라벨 뒤에 다음 키 `Q`가 붙어 `HQ-001 · 본사창고Q`가 표시된다.
3. 확정 뒤 창고 input을 다시 열어 dropdown이 보이는 상태에서 Escape를 누르면 dropdown뿐 아니라 바깥 병합전환 모달도 닫힌다.

S15 원 결함인 `CS-001` 명시확정 후 표시값 소실·dropdown 재개방·즉시 Enter 무음 변경은 재현되지 않았다. 현재 source의 기능 변경 지점은 제시된 `setOpen(!preserveDraft)` 및 확정 callback의 두 ref 대입과 일치했다.

## 1차 각도 — 취소·backdrop·ref 수명

### S18-1. backdrop 취소 뒤 보존된 draft가 120ms 후 소실된다

#### 재현 절차

1. `/sales/partner-orders`에서 병합전환을 연다.
2. 출고 창고에 `창`을 입력해 `출고 창고 검색 결과` 모달을 연다.
3. 검색 모달 backdrop을 클릭한다.
4. 모달이 닫힌 직후와 300ms 후 input 상태를 읽는다.

#### 실측 원문

```text
{"tag":"backdrop-immediate","value":"창","focused":false,"expanded":"false","selectionVisible":false,"submitDisabled":true}
{"tag":"backdrop-300ms","value":"","focused":false,"expanded":"false","selectionVisible":false,"submitDisabled":true}
```

#### 왜 실 사용자가 밟는가

backdrop 클릭은 검색 모달의 기본 닫기 조작이다. 사용자가 별도 조작을 하지 않고 0.3초 기다리는 것만으로 보이는 검색어가 `창`에서 빈 값으로 바뀐다.

#### 상태 전이

backdrop의 `onMouseDown`이 `closeSelection()`을 먼저 실행해 marker를 세운다. Modal close cleanup이 input focus를 복원하면서 marker를 소비하고 dropdown을 닫지만, 같은 pointer 동작의 후속 focus 이동으로 input blur가 다시 발생한다. 새로 예약된 120ms `handleBlur`가 선택값이 없는 상태의 `selectedLabel`인 빈 문자열을 draft에 써서 소실된다.

### 취소 버튼과 dropdown 개방 동작

취소 버튼 경로는 300ms 후에도 보존됐다.

```text
{"tag":"cancel-settled","value":"창","expanded":"false","listboxes":0,"focused":true,"selectionVisible":false,"outerVisible":true,"submitDisabled":true}
```

- S17 이전 제시 코드에서는 복원 focus가 `setOpen(true)`를 실행하므로 취소·backdrop 뒤 기존 dropdown이 열렸다.
- 현재 취소 버튼 경로에서는 복원 focus가 marker를 소비하며 `setOpen(false)`를 실행하므로 draft `창`을 보존한 채 dropdown은 닫힌다.
- 취소 버튼 뒤 즉시 Enter는 아무 동작도 하지 않았다. 사용자가 검색어를 편집하면 후보 모달은 다시 열린다. `창` 뒤 `x` 입력 후 Backspace로 `창`에 돌아온 실제 조작에서 `selectionVisible=true`를 확인했다.
- backdrop 경로에서는 S18-1 때문에 `창` 자체가 사라진다. input을 클릭하면 빈 검색어의 전체 후보 dropdown은 `expanded=true`로 열리지만, 원래 검색 모달을 다시 보려면 `창`을 다시 입력해야 한다.

### `lastTypedDraftRef` 선택 라벨 재유입 여부

확정 시 ref에 들어간 `CS-001 · 거래처 위탁창고`가 이후 취소에서 사용자가 입력하지 않은 검색어로 복원되는 경로는 재현되지 않았다. 검색 모달은 `handleChange`에서만 다시 열리고, 그 진입에서 ref가 새 검색어로 먼저 갱신된다.

```text
{"tag":"confirmed","value":"CS-001 · 거래처 위탁창고"}
{"tag":"confirm-new-query-cancel","value":"창","focused":true,"expanded":"false"}
```

### `preserveDraftOnNextFocusRef` 잔존 여부

명시확정 후 Modal cleanup의 focus 복원이 marker를 소비했다. 그 뒤 blur→focus를 한 번 더 수행하자 일반 focus 동작인 빈 draft와 전체 dropdown 개방이 나타났다. marker가 다음 focus까지 잘못 남은 상태는 아니었다.

```text
{"tag":"explicit-confirm-300ms","value":"CS-001 · 거래처 위탁창고","focused":true,"expanded":"false","listboxes":0,"selectionVisible":false}
{"tag":"subsequent-focus-marker-consumed","value":"","focused":true,"expanded":"true","listboxes":1,"selectionVisible":false}
```

backdrop에서도 marker는 close cleanup focus에서 소비됐다. S18-1은 marker 잔존이 아니라 그 뒤 새로 예약되는 blur timer 때문에 발생한다.

## 2차 각도 — S15 통과 항목 회귀

### S18-2. `HQ` 연속 입력 시 자동확정 라벨 뒤에 `Q`가 붙는다

#### 재현 절차

1. 검색 모달을 취소해 input에 `창`이 보이는 상태로 돌아온다.
2. `Ctrl+A`를 누른다.
3. 실제 키 입력 순서대로 `H`, `Q`를 누른다.

#### 실측 원문

```text
{"tag":"HQ-after-H","value":"HQ-001 · 본사창고","focused":true,"expanded":"false","selectionVisible":false,"submitDisabled":true}
{"tag":"HQ-after-Q","value":"HQ-001 · 본사창고Q","focused":true,"expanded":"false","selectionVisible":false,"submitDisabled":true}
{"tag":"HQ-after-blur","value":"HQ-001 · 본사창고","focused":false,"expanded":"false","selectionVisible":false,"submitDisabled":true}
```

#### 왜 실 사용자가 밟는가

요구된 조작 자체가 `Ctrl+A` 후 `HQ` 입력이다. 첫 키 `H`만으로 후보가 1건이 되어 자동확정되지만, 사용자가 이미 이어서 누른 `Q`가 확정 라벨 뒤에 입력된다. blur하면 복구되지만 그전까지 내부 선택은 HQ-001이고 표시값은 사용자가 확정한 적 없는 `HQ-001 · 본사창고Q`라 서로 어긋난다.

### S15 항목별 결과

| 동작 | S18 결과 |
|---|---|
| 취소 클릭 후 `창` draft 보존 | 통과 — 300ms 후에도 `창`, dropdown 닫힘 |
| backdrop 클릭 후 `창` draft 보존 | **실패 — S18-1**, 즉시는 `창`, 300ms 후 `""` |
| Escape 한 번에 안쪽 검색 모달만 닫힘 | 통과 — S15 Playwright 실제 경로 통과 |
| 미확정 상태에서 발행 버튼 disabled · POST 0건 | 통과 — S15 Playwright 실제 경로 통과 |
| `Ctrl+A` 후 `HQ` 입력으로 목표 창고 자동확정 | **표시 회귀 — S18-2**, `H`에서 확정 후 `Q`가 라벨에 추가됨 |
| 결재자·은행거래 Enter 확정 · UUID 비노출 | 통과 — 두 실제 화면 Playwright 통과 |
| `resultSelectionMode` 미지정 시 dropdown Enter | 통과 — 수금계획 실제 화면 Playwright 통과 |

### S18-3. 창고 dropdown Escape가 바깥 병합전환 모달까지 닫는다

#### 재현 절차

1. 병합전환에서 `CS-001`을 명시확정한다.
2. input에서 다른 곳으로 focus를 옮겼다가 input을 다시 focus해 기존 창고 dropdown을 연다.
3. Escape를 한 번 누른다.

#### 실측 원문

```text
{"tag":"subsequent-focus-marker-consumed","value":"","focused":true,"expanded":"true","listboxes":1,"selectionVisible":false}
{"tag":"dropdown-escape-outer-visible","outerVisible":false}
```

#### 왜 실 사용자가 밟는가

선택을 바꾸려 input을 다시 클릭하면 전체 창고 dropdown이 열리는 것이 정상 경로다. 사용자가 후보 보기를 취소하려 Escape를 누르면 `WarehouseAutocomplete`가 dropdown을 닫은 뒤 같은 keydown이 바깥 `Modal`의 document Escape handler까지 도달해 병합전환 작업 전체가 닫힌다.

이 결함은 “검색 결과 모달이 열린 상태에서 Escape 한 번으로 안쪽 모달만 닫기” 경로와 별개다. 그 중첩 모달 경로는 통과했다.

## 3차 각도 — S15 원 결함 재현 시도

`CS-001` 명시확정은 현재 닫혔다.

```text
{"tag":"explicit-confirm-300ms","value":"CS-001 · 거래처 위탁창고","focused":true,"expanded":"false","listboxes":0,"selectionVisible":false}
{"tag":"explicit-immediate-enter","value":"CS-001 · 거래처 위탁창고","focused":true,"expanded":"false","listboxes":0,"selectionVisible":false}
{"tag":"explicit-enter-stability","stable":true,"before":"CS-001 · 거래처 위탁창고"}
{"shown":"CS-001 · 거래처 위탁창고","selectedOptions":["CS-001거래처 위탁창고"]}
```

- 표시값은 확정 라벨이다.
- 기존 dropdown은 다시 열리지 않았다.
- 전체 후보 dropdown을 후속 focus로 열어 확인한 내부 `aria-selected=true` 항목도 CS-001이었다.
- 확정 직후 Enter는 표시값과 선택을 바꾸지 않았다.

## 4차 각도 — S17 증거 무결성

S17과 같은 좁은 명령을 현재 HEAD에서 실행했다.

### WarehouseAutocomplete

```text
npm test -- --run src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx

Test Files  1 passed (1)
Tests       12 passed (12)
PROCESS_EXIT_CODE=0
```

S17 GREEN 주장 `12 passed`와 일치한다.

### S15 Playwright

```text
npx playwright test playwright/825-s15-final-reconvergence/825-s15-final-reconvergence.spec.ts --reporter=line

Running 4 tests using 1 worker
4 passed (7.9s)
PROCESS_EXIT_CODE=0
```

S17 GREEN 주장 `4 passed`와 일치한다. S17의 `1 failed / 3 passed`, 입력값 `""` RED는 fix 이전 상태의 역사 수치이므로 현재 source에서 같은 명령을 실행하면 재현되지 않고 위 GREEN이 나온다. 현재 상태 수치와 S17의 GREEN 수치 사이 불일치는 없다.

### Desktop typecheck

```text
npm run typecheck

real-QA cleanup scope: 2 passed, 0 failed
real-QA scope: 50 passed, 0 failed
PROCESS_EXIT_CODE=0
```

S17 GREEN 주장 `50 passed`와 일치한다. 전체 Desktop mock suite는 실행하지 않았다.

## 신규 파일

- `docs/dev-reports/2026-08-08-825-s18-reconvergence.md`
