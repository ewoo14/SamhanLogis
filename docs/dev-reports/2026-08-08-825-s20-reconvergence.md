# PR #1120 / 이슈 #825 — S20 재수렴 적대검증 보고서

## 판정

도달성 결함 **2건**을 실 Chromium 경로에서 재현했다.

1. **S20-1 / S18-1 미종결** — 검색 모달 backdrop 취소 뒤 `창`은 300ms 후 다시 빈 값으로 소실된다. S19의 `else if`는 실 화면 표시값을 보존하지 못한다.
2. **S20-2 / S19 신규 정상 경로 차단** — 확정 라벨 접두 suffix를 전부 조기 return 하는 조건 때문에, 확정 직후 커서 끝에서 시작하는 키 입력·paste·한글 IME 조합·replacement/autocomplete 계열 입력이 모두 무시된다.

S18-2의 원래 표시/내부선택 불일치와 S18-3의 dropdown Escape 전파는 닫혔다. S18-1은 닫히지 않았다. 지정된 3개 변경 외 다섯째 도달 결함은 찾지 못했다.

기능 변경 전제는 맞았다. GitHub commit API로 HEAD `6153a5df5`를 조회한 결과 `WarehouseAutocomplete.tsx`의 기능 변경은 제시된 3개 hunk, **+13/-0**뿐이며 새 timer/marker/ref는 없다. 같은 commit에는 단위 테스트 +73줄과 S19 보고서가 추가되어 있으나 기능 fix는 아니다.

## 실행 경계

- 코드 수정 없음.
- DB는 `SELECT`만 실행했다.
- Docker 재기동·재배포 없음.
- Desktop mock 전체 스위트 미실행.
- 추가 도달 측정용 Playwright 파일은 임시 생성·실행 후 삭제했다. 최종 신규 파일은 이 보고서 하나다.
- 첫 Playwright 시도는 잘못 수동 기동한 Vite config가 hash route를 대시보드에 고정해 폐기했다. 해당 프로세스만 종료한 뒤 저장소 `playwright.config.ts`의 자체 webServer로 재실행한 최종 결과만 아래 수치에 사용했다.

## 1차 각도 — fix가 정상 경로를 막는가

### S20-2. 확정 라벨 뒤의 정상 입력을 모두 폐기한다

#### 재현 절차

1. `/sales/partner-orders`에서 병합전환을 연다.
2. 출고 창고에 `H`를 입력해 `HQ-001 · 본사창고`를 단건 자동확정한다.
3. 포커스와 커서를 그대로 둔 채 차례로 `2` 키 입력, clipboard paste, 한글 composition input, `insertReplacementText` input을 전달한다.
4. 각 이벤트 뒤 input 표시값과 dropdown/바깥 모달 상태를 읽는다.

#### 실측 원문

```text
{"tag":"confirmed-H","value":"HQ-001 · 본사창고","focused":true,"expanded":"false","outerVisible":true,"selectionVisible":false}
{"tag":"keyboard-suffix-2","value":"HQ-001 · 본사창고","focused":true,"expanded":"false","outerVisible":true,"selectionVisible":false}
{"tag":"paste-suffix","value":"HQ-001 · 본사창고","focused":true,"expanded":"false","outerVisible":true,"selectionVisible":false}
{"tag":"ime-suffix","value":"HQ-001 · 본사창고","focused":true,"expanded":"false","outerVisible":true,"selectionVisible":false}
{"tag":"replacement-suffix","value":"HQ-001 · 본사창고","focused":true,"expanded":"false","outerVisible":true,"selectionVisible":false}
```

`HQ-001 · 본사창고2`를 포함해 모든 suffix가 표시되지 않고 검색도 시작되지 않았다. 이벤트 원인을 보지 않고 다음 값만 검사하기 때문이다.

```ts
if (selectedWarehouse && nextDraft.startsWith(selectedLabel) && nextDraft !== selectedLabel) {
  setDraft(selectedLabel)
  return
}
```

#### 왜 실 사용자가 밟는가

단건 자동확정은 첫 글자 `H`에서 즉시 발생한다. 사용자는 자동확정 시점을 알기 전에 다음 글자를 계속 입력할 수 있고, 확정된 input의 커서 끝에서 추가 입력하거나 붙여넣는 것도 일반적인 수정 동작이다. 한글 창고명을 이어 입력할 때는 IME composition input도 같은 `handleChange`로 들어온다. 이 경로에서는 `lastTypedDraftRef`, 후보 계산, 모달 재개방까지 모두 조기 return 아래에 있어 새 검색에 도달하지 못한다.

#### 같은 접두 창고 DB 확인

읽기 전용 조회 결과 현재 활성·미삭제 창고는 8건이다.

```text
00003          | 초월창고 S18          | HEADQUARTERS
2              | 상일창고 S18          | HEADQUARTERS
CS-001         | 거래처 위탁창고       | CONSIGNMENT
HQ-001         | 본사창고              | HEADQUARTERS
QA-1039-CHOWOL | 초월창고 QA-1039-초월 | HEADQUARTERS
QA-1039-SANGIL | 상일창고 QA-1039-상일 | HEADQUARTERS
VH-001         | 1호차 차량재고        | VEHICLE
VR-001         | 가상창고              | VIRTUAL
```

완전한 `code · name` 라벨이 다른 창고 라벨의 접두가 되는 self join 결과는 **0행**이었다.

```text
prefix_label | longer_label
-------------+-------------
(0 rows)
```

따라서 현재 DB에는 “같은 완전 라벨 접두의 다른 창고”가 없어 그 특정 데이터 행의 도달 불가는 성립하지 않는다. 다만 커서 끝에서 새 검색을 시작하는 정상 입력 경로 자체는 위 실측처럼 차단된다.

### S18-1 `else if`와 오래된 draft

#### 취소 버튼, 오래된 ref, 직접 지우기

취소 버튼 경로는 300ms 뒤에도 `창`을 보존했다. 취소 후 `x` 입력→Backspace로 `창`에 돌아오면 후보 모달도 다시 열렸다(`selectionVisible:true`). 모달이 focus를 가져가므로 그 순간 input의 controlled 표시값은 빈 값이지만, Escape 취소 뒤 `창`이 복원됐다.

```text
{"tag":"cancel-300ms","value":"창","focused":true,"expanded":"false","outerVisible":true,"selectionVisible":false}
{"tag":"cancel-edit-backspace","value":"","focused":false,"expanded":"false","outerVisible":true,"selectionVisible":true}
```

이전 `창`을 가진 상태에서 일반 blur→빈 input focus→아무 입력 없는 blur를 밟아도 오래된 draft가 화면에 부활하지 않았다. 사용자가 직접 `fill('')`로 지운 경우에는 `lastTypedDraftRef.current=''`가 되어 300ms 뒤에도 빈 값이었다.

```text
{"tag":"first-blur-clears-nonexact","value":"","focused":false,"expanded":"false","outerVisible":true,"selectionVisible":false}
{"tag":"untouched-empty-blur-resurrects","value":"","focused":false,"expanded":"false","outerVisible":true,"selectionVisible":false}
{"tag":"explicit-clear-blur","value":"","focused":false,"expanded":"false","outerVisible":true,"selectionVisible":false}
```

오래된 ref가 화면에 되살아나는 결함은 재현되지 않았고, 직접 지우기는 보존됐다.

### S18-3 `stopPropagation`과 바깥 모달 Escape

확정 후 blur→focus로 dropdown을 연 상태에서 첫 Escape는 dropdown만 닫고 바깥 병합전환 모달을 유지했다. `open=false`가 된 뒤 두 번째 Escape는 input handler의 `if (!open) return`을 지나 document handler에 도달해 바깥 모달을 닫았다.

```text
{"tag":"marker-consumed-next-focus","value":"","focused":true,"expanded":"true","outerVisible":true,"selectionVisible":false}
{"tag":"dropdown-escape-first","value":"CS-001 · 거래처 위탁창고","focused":true,"expanded":"false","outerVisible":true,"selectionVisible":false}
{"tag":"outer-escape-second","outerVisible":false}
```

검색 모달이 열린 중첩 상태의 첫 Escape도 안쪽만 닫았다.

```text
{"tag":"inner-modal-escape","value":"창","focused":true,"expanded":"false","outerVisible":true,"selectionVisible":false}
```

따라서 dropdown을 닫는 첫 Escape와 바깥 모달을 닫는 다음 Escape의 정상 경계는 막히지 않았다.

## 2차 각도 — S18 원 결함 3건 재현 시도

### S20-1. backdrop draft 소실은 여전히 재현된다

#### 재현 절차

1. 병합전환 출고 창고에 `창`을 입력한다.
2. `출고 창고 검색 결과` 모달 backdrop을 클릭한다.
3. 300ms 기다린 뒤 input을 읽는다.

#### 실측 원문

```text
{"tag":"backdrop-300ms","value":"","focused":false,"expanded":"false","outerVisible":true,"selectionVisible":false}
```

#### 왜 실 사용자가 밟는가

backdrop 클릭은 검색 모달의 기본 취소 조작이다. 추가 조작 없이 0.3초만 지나면 검색어가 사라진다.

#### S19 `else if`가 닫지 못한 이유

`else if`가 내부 `draft`에 `lastTypedDraftRef.current`를 다시 써도, 최종 표시식은 blur 완료 상태(`open=false`, marker 소비 완료)에서 `selectedLabel`을 선택한다.

```ts
const displayValue = open || preserveDraftOnNextFocusRef.current ? draft : selectedLabel
```

미확정 상태의 `selectedLabel`은 빈 문자열이므로 보존한 draft가 화면에 도달하지 않는다. 또한 실제 pointer/focus 순서에서 non-empty draft를 캡처한 blur는 `else`의 `setDraft(selectedLabel)`로 갈 수 있다. S19 단위 테스트는 jsdom에서 marker/focus 수명이 달라 이 실 브라우저 순서를 고정하지 못했다.

### S18-2. 원래의 suffix 표시 불일치는 닫힘

`H`에서 HQ-001이 자동확정된 뒤 `Q`를 연속 입력해도 표시값은 확정 라벨로 유지되고, 조기 return은 `onChange`를 호출하지 않으므로 내부 선택도 HQ-001로 유지된다.

```text
{"tag":"confirmed-H","value":"HQ-001 · 본사창고","focused":true,"expanded":"false","outerVisible":true,"selectionVisible":false}
{"tag":"keyboard-suffix-2","value":"HQ-001 · 본사창고","focused":true,"expanded":"false","outerVisible":true,"selectionVisible":false}
```

즉 S18의 “라벨 뒤 Q가 보이고 내부 선택과 어긋남”은 닫혔지만, 그 방식이 S20-2 정상 입력 차단을 만들었다.

### S18-3. dropdown Escape 전파는 닫힘

위 `dropdown-escape-first`에서 `outerVisible:true`를 확인했다. 바깥 병합전환 모달은 살아 있었다.

## 3차 각도 — S15/S18 통과 항목 양방향 회귀

| 동작 | S20 결과 |
|---|---|
| 취소 버튼 후 `창` 보존, 300ms, dropdown 닫힘 | 통과 — `cancel-300ms`: `value:"창"`, `expanded:false` |
| 취소 후 `창→x→Backspace→창` 후보 모달 재개방 | 통과 — `selectionVisible:true` |
| Escape 한 번에 안쪽 검색 모달만 닫힘 | 통과 — `inner-modal-escape`, 바깥 유지 |
| 미확정 발행 버튼 disabled · POST 0건 | 통과 — `{"disabled":true,"mergePosts":0}` |
| `Ctrl+A` 후 `HQ` 목표 창고 자동확정 | 통과 — `value:"HQ-001 · 본사창고"` |
| 결재자·은행거래 Enter 확정 · UUID 비노출 | 통과 — S15 Playwright 2개 대상 포함 4/4 |
| `resultSelectionMode` 미지정 dropdown Enter(수금계획) | 통과 — S15 Playwright 4번째 대상 포함 4/4 |
| 명시확정 후 300ms 표시값 유지 · dropdown 닫힘 | 통과 — `explicit-confirm-300ms`: CS-001, `expanded:false` |
| 확정 후 blur→focus marker 소비 | 통과 — 다음 focus에서 `value:""`, `expanded:true`; 첫 Escape 후 CS-001 복원 |
| backdrop 취소 후 `창` 300ms 보존 | **실패 — S20-1**, `value:""` |

명시확정 실측:

```text
{"tag":"ctrl-a-HQ","value":"HQ-001 · 본사창고","focused":true,"expanded":"false","outerVisible":true,"selectionVisible":false}
{"tag":"explicit-confirm-300ms","value":"CS-001 · 거래처 위탁창고","focused":true,"expanded":"false","outerVisible":true,"selectionVisible":false}
```

## 4차 각도 — S19 증거 무결성

S19 보고서에 적힌 좁은 명령을 현재 HEAD에서 재실행했다.

### WarehouseAutocomplete

```text
Test Files  1 passed (1)
Tests       15 passed (15)
Exit code: 0
```

### Desktop 관련 spec

```text
MergeConvertDialog.test.tsx                 9 passed
SalesPartnerOrderDetailPage.coedit.test.tsx 20 passed
SlipFormPage.test.tsx                       99 passed
Test Files 3 passed (3)
Tests      128 passed (128)
Exit code: 0
```

### S15 Playwright

```text
Running 4 tests using 1 worker
4 passed (10.3s)
Exit code: 0
```

### Desktop typecheck

```text
real-QA cleanup scope: tests 2, pass 2, fail 0
real-QA scope:         tests 50, pass 50, fail 0
Exit code: 0
```

따라서 S19의 `15/15 · 128/128 · 4/4 · typecheck exit 0` 수치 자체는 재현된다. 다만 S15 기존 드라이버의 backdrop 단언은 닫힘 직후까지만 읽고 300ms를 기다리지 않으므로 S20-1을 검출하지 못한다. S19의 “S18-1 닫힘” 해석은 해당 green 수치로 뒷받침되지 않는다.

### 결함 2의 “S17 회귀가 아닌 선재 결함” 판정

판정 근거는 재현된다.

- GitHub commit API에서 S17 commit `276e5d77d`의 source patch는 `handleFocus`의 `setOpen(!preserveDraft)`와 명시확정 callback의 기존 ref 대입뿐이었다.
- 그 부모 `a80dfce98`의 source를 GitHub contents API로 조회하자 이미 다음 분기가 존재했다.

```text
if (autoSelectSingleResult && nextCandidates.length === 1) {
  pick(nextCandidates[0]!)
}
```

따라서 자동확정 자체와 그 직후 후속 입력 표면은 S17 이전부터 존재했다. S19의 “선재 결함” 판정은 유지된다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-08-825-s20-reconvergence.md`

