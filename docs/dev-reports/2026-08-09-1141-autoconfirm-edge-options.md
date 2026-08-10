# #1141 자동확정 직후 후속 키 표시 문제 — 결정 시트

| 접근 | 가르는 근거 | 잃는 것 | 33ms / 140ms 처리 |
|---|---|---|---|
| **A1. 전체 확정 라벨을 선택** | 시간 대신 DOM selection이 “다음 입력은 현재 표시값을 교체한다”는 편집 의미를 부여한다. selection이 유지된 동안 키·붙여넣기·IME는 라벨을 덮어쓴다. | 확정 뒤 계속 친 글자는 기존 검색어까지 포함한 라벨 전체를 지운다. 예: `H` 뒤 `Q`는 `HQ`가 아니라 `Q`가 된다. 선택 강조가 크게 보인다. | 다른 포인터/커서 조작이 없다면 33ms와 140ms 모두 `Q`가 전체 라벨을 교체한다. 시간에 의존하지 않는다. 입력은 보존되지만 기존 `H`를 잃는다. |
| **A2. 사용자가 친 접두는 남기고 합성된 완성 suffix만 선택 — 권장** | 자동확정 전 사용자 draft 길이를 경계로 삼는다. `H`는 남기고, 합성된 `Q-001 · 본사창고`만 selection으로 둔다. 다음 `Q`는 선택 suffix를 교체해 논리 검색어 `HQ`를 만든다. ArrowRight/End/클릭처럼 selection을 접는 조작은 완성 수락이라는 별도 관측 근거가 된다. | 확정 라벨 일부가 선택 강조된다. selection/IME/붙여넣기/접근성 계약을 명시해야 하며, 자동확정 때마다 같은 항목을 재확정할 수 있다. “자동확정 즉시 완전히 끝난 필드”였던 기존 인상이 “인라인 완성 중”으로 바뀐다. | selection은 시간이 아니라 사용자 조작까지 유지된다. 따라서 33ms와 140ms 모두 `H`+`Q`가 `HQ`로 진행되고, 재자동완성 뒤에도 라벨 suffix는 붙지 않는다. 정상 `Q`를 삼키지 않는다. |
| **B. 확정값과 입력값 분리(칩/배지 또는 비포커스 overlay)** | 확정 identity는 별도 칩/배지에, input에는 사용자가 친 query만 둔다. 라벨과 query가 같은 DOM value를 차지하지 않으므로 suffix 결합 자체가 불가능하다. | 화면 구조와 포커스 순서가 바뀐다. 단일 선택을 교체할 때 기존 칩을 언제 해제할지 새 계약이 필요하고, 다른 입력 화면과 시각 일관성이 깨진다. | 33ms와 140ms 모두 input의 `H` 뒤에 `Q`가 붙어 `HQ`가 된다. 라벨은 별도 층이므로 정상 입력 손실도 라벨 suffix도 없다. |
| **C. `beforeinput` / composition의 `inputType`·`data`로 분류** | paste(`insertFromPaste`), IME(`insertCompositionText`), 자동완성 replacement(`insertReplacementText`)는 종류를 구분할 수 있다. 그러나 문제의 빠른 `Q`와 느린 `Q`는 모두 `insertText`, `data='Q'`이다. 이벤트에는 “자동확정 전에 이미 이어 친 키”라는 원인이 없다. | 일반 키 핵심 사례를 해결하지 못한 채 브라우저·React 이벤트 분기와 IME 복잡도만 늘어난다. | 33ms/140ms가 같은 `insertText`이므로 둘을 다르게 처리할 비시간 근거가 없다. **단독 후보 탈락**. 다만 A2/B/F에서 입력 연산을 정확히 적용하는 보조 정보로는 쓸 수 있다. |
| **D. 확정 직후 잠깐 readOnly** | readOnly 해제 시각만 근거라 사용자 의도를 관측하지 않는다. | 빠른 정상 입력 손실, 포커스·스크린리더 상태 변화, 모바일 키보드 영향. | 33ms `Q`는 막히고 140ms `Q`는 라벨 뒤에 붙는다. 100ms guard와 같은 실패를 재현하므로 **후보 탈락**. blur/refocus까지 잠그면 시간창은 아니지만 이어치기 전체를 잃는다. |
| **E. 부분일치 단건은 자동확정하지 않고 exact/Enter/blur에서만 확정** | 후보 수가 1이라는 사실과 “사용자가 검색을 끝냈다”를 분리한다. 코드·이름 exact, Enter, blur라는 명시 근거가 있을 때만 확정한다. | `autoSelectSingleResult`의 무조작 즉시확정 이점이 사실상 사라진다. 한 건만 보여도 Enter/전체 입력이 필요하다. | 33ms와 140ms 모두 아직 draft `H`에 입력되므로 `HQ`가 된다. 정상 입력은 보존되고 라벨 suffix가 없다. |
| **F. 논리 query와 표시 라벨을 분리하되 현재 외형 유지** | 자동확정 전 query를 별도 상태로 보존하고, 후속 input 연산은 표시 라벨이 아니라 query에 적용한다. 클릭/selection 변경이 있으면 그때부터 라벨 편집으로 전환할 수 있다. | 두 문자열과 caret 매핑이 생겨 A2보다 구현·검증 면적이 크다. paste, delete, 범위 교체, IME 조합마다 query/표시 동기화 규칙이 필요하다. | 다른 커서 조작 없이 들어온 `Q`는 33ms·140ms 모두 보존 query `H`에 적용되어 `HQ`가 된다. 시간과 무관하지만 A2보다 자체 편집 엔진에 가까워진다. |

## 1. 현재 구현 확정

대상: `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx`

### 값이 바뀌는 흐름

- 선택 라벨은 `${warehouse.code} · ${warehouse.name}`이다: **165~168행**.
- 사용자가 입력하면 `handleChange`가 DOM의 새 값을 `draft`와 `lastTypedDraftRef`에 넣는다: **239~245행**.
- `resultSelectionMode`가 있고 검색 결과가 1건이면 즉시 `pick(nextCandidates[0])`을 호출한다: **247~250행**.
- `pick()`은 부모 선택값을 `onChange(w.id, w)`로 확정한 뒤, input draft를 사용자 검색어가 아니라 전체 라벨 `${w.code} · ${w.name}`으로 치환하고 `open=false`로 닫는다: **286~292행**.
- 렌더 값은 `open`이 닫힌 뒤 `selectedLabel`이고, controlled `<input value>`에 그대로 들어간다: **308~309행**, **328~335행**.

즉 `H`가 1건을 만들면 input의 relevant value는 `H`에서 `HQ-001 · 본사창고`로 바뀐다. 부모 identity와 저장용 `warehouse.code`는 이미 확정됐으므로, 뒤의 `Q`는 표시 draft만 `HQ-001 · 본사창고Q`로 만든다. 기존 실서버 검증도 이 표시 상태에서 POST의 `warehouseCode`가 `HQ-001`임을 확인했다(`docs/dev-reports/2026-08-08-825-s25-live-post-integrity.md:81~103`).

### 확정 후 커서·선택 범위

- 이 컴포넌트에는 `select()`나 `setSelectionRange()` 호출이 **0개**다. 전달받은 `ref` 외에 selection을 관리하는 내부 input ref도 없다.
- `pick()`은 focus를 이동시키지 않는다. 기존 실 Chromium 기록도 자동확정 뒤 `focused:true`, dropdown 닫힘을 확인했다(`docs/dev-reports/2026-08-08-825-s20-reconvergence.md:184`).
- 따라서 focused text input의 controlled value가 긴 라벨로 교체된 뒤 브라우저 기본 동작대로 selection은 라벨 끝에 접힌다. 범위는 `[L, L]`이다. 현재 실데이터 `HQ-001 · 본사창고`는 `L=13`이므로 `[13, 13]`; 테스트 fixture의 `HQ-001 · 본사 창고`는 `L=14`이므로 `[14, 14]`다.
- 이 “끝에 접힌 caret + selection 없음” 때문에 다음 `insertText('Q')`가 라벨 뒤에 붙는다. blur 후 **203~236행**의 exact 검사/복원 경로가 selectedLabel을 다시 보여 주므로 표시만 복구된다.

### 같은 패턴을 쓰는 자동완성

`AsyncAutocomplete`도 구조가 같다.

- 1건 응답이면 `pick()` 호출: `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx:353~363`.
- `pick()`이 draft를 `getInputLabel(item)`으로 치환하고 input을 닫음: 같은 파일 **233~244행**.
- selection 제어 없이 controlled displayValue를 input에 넣음: **564~566행**, **648~655행**.

따라서 `AsyncAutocomplete`의 **single-value** wrapper인 `PartnerAutocomplete`와 `ProductAutocomplete`도 같은 suffix 문제를 공유한다. 비동기 검색은 debounce/stale-response guard 때문에 사용자가 응답 전에 계속 치면 이전 1건 응답을 버릴 수 있지만, 1건 응답으로 자동확정된 뒤 다시 입력하는 경로는 Warehouse와 동일하다. `ProductAutocomplete`는 기본값 자체가 `autoSelectSingleResult=true`다(`ProductAutocomplete.tsx:160~166`, `:200`).

반면 `MultiSelectAutocomplete`의 1건 자동확정은 선택을 칩으로 추가하고 input을 비우는 경로라 “확정 라벨 뒤 suffix”를 그대로 공유하지 않는다(`AsyncAutocomplete.tsx:356~360`, `MultiSelectAutocomplete.tsx:198~220`). B안의 선행 사례다.

## 2. 시간 아닌 근거 판정

핵심 사실은 “33ms 입력”과 “140ms 입력”이 서로 다른 원인의 이벤트가 아니라 둘 다 사용자가 친 `insertText('Q')`라는 점이다. 이벤트 분류로 과거 의도를 복원하려는 C/D는 이 정보를 만들지 못한다. 선택 가능한 해법은 다음 중 하나처럼 **편집 의미 자체를 정하는 것**이다.

1. selection으로 “계속 입력 = 합성 suffix 교체”를 정한다(A2).
2. query와 committed label이 같은 input value를 공유하지 않게 한다(B/F).
3. 명시적인 검색 종료 근거가 올 때까지 확정하지 않는다(E).

A2의 중요한 차이는 A1처럼 전체 라벨을 선택하지 않는 것이다. 자동확정 전 사용자가 실제로 친 접두를 보존하므로 `H` 다음 `Q`가 `Q`가 아니라 `HQ`가 된다. selection이 ArrowRight/End/클릭으로 접히면 그때는 사용자가 완성을 수락한 것으로 볼 수 있다. 이는 시간 대신 실제 사용자 조작을 근거로 삼는다.

## 3. 실 사용 빈도

### 켜져 있는 화면 수

제품 route 기준 `autoSelectSingleResult`가 실제로 켜지는 파일은 **7개 화면**이다.

| 경로 종류 | 화면 수 | 화면 | #1141과 같은 라벨 suffix 구조 |
|---|---:|---|---|
| Warehouse single | 1 | `MergeConvertDialog.tsx:704~712` — 병합전환 출고 창고 | **공유** |
| Partner single | 1 | `BankTransactionPage.tsx:414~424` — 은행거래 거래처 매칭 | **공유** |
| Product single | 3 | `EstimateFormPage.tsx:2184~2209`, `SafetyStockAlertsPage.tsx:292`(wrapper 기본 true), `SlipFormPage.tsx:2474`, `:2554`(같은 화면의 두 분기, wrapper 기본 true) | **공유** |
| multiple/chip | 2 | `ApprovalLineConfigPage.tsx:784~804`, `EstimateItemsCatalogPage.tsx:1251` + `ProductAutocomplete.tsx:248` | input을 비우고 칩으로 옮겨 직접 공유하지 않음 |

따라서 **전체 opt-in 화면은 7개, 동일한 single-input 위험 화면은 5개, WarehouseAutocomplete에서 켜진 화면은 1개**다. WarehouseAutocomplete의 다른 소비처는 이 prop을 켜지 않아 #1141 경로가 없다.

### 실 창고 수와 접두 분포

2026-08-09 현재 `inventory_db.warehouses`를 `BEGIN READ ONLY`로 조회했다. `deleted_at IS NULL AND is_deleted=false`는 **8개**이며, 병합전환은 `hideVirtual`이라 `VR-001`을 제외한 **7개**를 검색한다.

| 코드 | 이름 | 타입 | 병합전환 후보 |
|---|---|---|---|
| `00003` | 초월창고 S18 | HEADQUARTERS | O |
| `2` | 상일창고 S18 | HEADQUARTERS | O |
| `CS-001` | 거래처 위탁창고 | CONSIGNMENT | O |
| `HQ-001` | 본사창고 | HEADQUARTERS | O |
| `QA-1039-CHOWOL` | 초월창고 QA-1039-초월 | HEADQUARTERS | O |
| `QA-1039-SANGIL` | 상일창고 QA-1039-상일 | HEADQUARTERS | O |
| `VH-001` | 1호차 차량재고 | VEHICLE | O |
| `VR-001` | 가상창고 | VIRTUAL | X |

컴포넌트의 실제 검색식(코드 prefix + 이름 substring, `WarehouseAutocomplete.tsx:83~97`)으로 “처음 1건이 되는 입력 길이”를 계산했다.

| 목표 코드 | 코드 입력에서 최초 1건 | 전체 코드 전에 자동확정? | 이름 입력에서 최초 1건 |
|---|---:|---|---:|
| `00003` | `00` (2자) | O | `초월창고 S` (6자) |
| `2` | `2` (1자) | X — 전체 코드도 1자 | `상일창고 S` (6자) |
| `CS-001` | `C` (1자) | O | `거` (1자) |
| `HQ-001` | `H` (1자) | O | `본` (1자) |
| `QA-1039-CHOWOL` | `QA-1039-C` (9자) | O | `초월창고 Q` (6자) |
| `QA-1039-SANGIL` | `QA-1039-S` (9자) | O | `상일창고 Q` (6자) |
| `VH-001` | `V` (1자) | O | `1호` (2자) |

수치 판정:

- 코드 첫 글자만으로 1건이 되는 목표: **4/7 = 57.1%**. 단, 코드가 원래 한 글자인 `2`를 빼면 “첫 글자 뒤 이어치기” 위험은 **3/7 = 42.9%**다.
- 전체 코드를 다 치기 전에 1건이 되는 목표: **6/7 = 85.7%**.
- 전체 이름을 다 치기 전에 1건이 되는 목표: **7/7 = 100%**.
- 따라서 Warehouse 화면 수는 1개로 좁지만, 그 화면에서 코드·이름을 자연스럽게 끝까지 치려는 사용자는 대부분 자동확정 경계를 밟는다. 데이터상 드문 edge로 우선순위를 낮출 근거는 없다.
- 실제 “분당 몇 회 발생”하는지는 입력 이벤트 telemetry가 없어 숫자로 단정할 수 없다. 위 수치는 트래픽 빈도가 아니라 **현재 실데이터에서의 도달 비율**이다.

## 4. 권장안과 개발책임자 판단

### 권장: A2 — 사용자 접두 보존 + 합성 suffix selection

권장 이유:

1. **두 RED를 동시에 만족할 수 있다.** 33ms와 140ms 모두 같은 selection 편집 규칙을 타며 `Q`가 검색어에 반영된다.
2. **현재 한 줄 input 외형을 유지한다.** B처럼 칩 구조와 단일선택 교체 UX를 새로 만들지 않는다.
3. **A1의 입력 손실을 피한다.** 전체 라벨이 아니라 합성된 부분만 덮으므로 `H`+`Q`가 `HQ`로 남는다.
4. **F보다 상태가 적다.** 브라우저의 검증된 selection 편집 모델을 이용하므로 별도 query/caret 연산 엔진을 만들지 않는다.
5. **E보다 자동확정 이점을 보존한다.** 단건 identity는 즉시 확정하되, 사용자가 계속 치면 검색어가 계속 정교해진다.

단, 이는 버그를 “숨기는” 수정이 아니라 자동확정을 **인라인 완성 UX**로 정의하는 업무 결정이다.

### 개발책임자 질문

자동확정 후 동작을 다음 중 어느 계약으로 확정할지 판단이 필요하다.

- **(a) A2 권장:** 사용자가 친 접두는 남기고 합성 suffix를 선택한다. 계속 타이핑하면 검색어를 이어가고, ArrowRight/End/클릭/Tab으로 selection을 접으면 완성을 수락한다.
- **(b) E:** 부분일치 단건은 확정하지 않고 exact/Enter/blur에서만 확정한다. 가장 단순하지만 즉시확정을 포기한다.
- **(c) B:** 확정값을 칩/배지로 분리한다. 의미는 가장 명확하지만 화면 구조를 바꾼다.

본 결정 시트의 추천은 **(a)**다. 수락 키 중 Tab을 “완성 수락 후 다음 필드 이동”으로 볼지, selection을 유지한 채 이동할지는 구현 전에 접근성 계약으로 함께 고정해야 한다.

## 5. RED 초안

### 공통 양방향 RED

- **RED-A:** 자동확정 직후 이어 친 키가 라벨 뒤에 붙지 않는다. `[33ms, 140ms]` 각각에서 `H` 자동확정 뒤 `Q`를 입력해도 표시값이 `HQ-001 · 본사창고Q`가 아니다.
- **RED-B:** 정상 입력이 삼켜지지 않는다. `[33ms, 140ms]` 각각에서 사용자가 친 `Q`가 검색 진행에 반영된다. 단순히 라벨을 유지하는 것만으로 PASS 처리하지 않는다.

### 권장 A2에서 관측할 구체 RED

1. `H` 입력 직후 표시 라벨은 `HQ-001 · 본사창고`, selection은 사용자 접두 뒤부터 라벨 끝까지인 `[1, 13]`이다.
2. 33ms 뒤 `Q` 입력 시 브라우저 편집 결과는 논리 검색어 `HQ`이고, 재자동완성 후 selection 시작점이 `2`로 전진한다. `Q`가 삼켜지거나 라벨 뒤 suffix가 되면 RED다.
3. 같은 단정을 140ms에서도 반복한다. 시간에 따른 결과 차이가 생기면 RED다.
4. `insertFromPaste`, `insertCompositionText`, `insertReplacementText`도 선택 suffix를 교체해 사용자 입력을 보존한다.
5. ArrowRight/End/클릭으로 selection을 명시적으로 접은 뒤 입력하는 경우는 “완성 수락 후 편집” 계약으로 별도 RED를 둔다. 이 경로를 자동확정 잔여 키와 같은 것으로 처리하지 않는다.
6. `AsyncAutocomplete` single-value 대표 1건에도 같은 양방향 RED를 둔다. Warehouse만 고치고 Partner/Product의 공유 구조를 남기면 회귀 방지 범위가 불완전하다.

## 신규 파일

- `docs/dev-reports/2026-08-09-1141-autoconfirm-edge-options.md`

제품 코드, 테스트 코드, DB 데이터는 수정하지 않았다.
