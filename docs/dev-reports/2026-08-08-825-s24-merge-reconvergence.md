# PR #1120 / 이슈 #825 — S24 머지 재수렴 적대검증

## 머지 판정

**보류.** 이번 라운드에서 재현된 제품 결함은 0건이다. 그러나 개발책임자가 필수로 지정한 두 도달성 축인 (1) 실제 native 붙여넣기·한글 IME·자동완성 replacement와 (2) 실제 POST 본문을 독립 증거로 확정하지 못했다. 두 항목은 제품 결함으로 세지 않고 **증거 무결성 차단 사항**으로 분리한다. 따라서 이 결과를 “결함 0, 머지 가능”으로 사용하면 안 된다.

`#1141`의 `HQ-001 · 본사창고Q`는 지시대로 결함에 포함하지 않았다.

## 1. S23 제거 뒤 회귀 도달 결과

좁은 Chromium spec과 `WarehouseAutocomplete` spec을 같은 명령으로 다시 실행했다.

| 도달 경로 | 실측 결과 |
|---|---|
| CS-001 명시확정 뒤 표시값 소실·dropdown 재개방 | 재현되지 않음. S15 Chromium에서 명시확정 뒤 라벨 유지, 재-Enter 뒤에도 동일 값 유지 |
| 확정 뒤 Enter로 창고 무음 변경 | 재현되지 않음. 단건 자동확정과 다건 명시확정 모두 재-Enter 전후 값 동일 |
| 취소·backdrop 뒤 `창` draft 보존 | 재현됨. 취소와 backdrop 모두 `창` 유지 |
| backdrop 뒤 300ms 보존 | 컴포넌트 spec에서 300ms 뒤 `창`, `aria-expanded=false` |
| Escape 1회 dropdown/검색 모달만, 2회 바깥 모달 | S15 Chromium 통과 |
| 붙여넣기·IME·자동완성 | 제품 결함은 재현하지 못했으나 실제 native 이벤트 도달은 아래 EI-1 때문에 미확정 |

원문:

```text
WarehouseAutocomplete.test.tsx
Test Files  1 passed (1)
Tests       21 passed (21)
Duration    3.14s

825-s15-final-reconvergence.spec.ts
Running 4 tests using 1 worker
4 passed (8.3s)
```

## 2. 이슈 #825 원 기능 도달 결과

### 후보 2건 이상·복수선택과 단수 강제

공용 선택 계층의 관련 spec만 좁게 실행했다.

```text
ProductAutocomplete.test.tsx                 7 passed
SearchResultSelectionModal.test.tsx           9 passed
MultiSelectAutocomplete.test.tsx              7 passed
AsyncAutocomplete.test.tsx                   34 passed
Test Files                                    4 passed
Tests                                        57 passed
```

- `SearchResultSelectionModal`: 단수 모드는 한 후보만 확정하고, 복수 모드는 복수 후보를 체크 후 확정했다.
- `ProductAutocomplete`: 후보 2건 이상에서 복수 모달을 열어 UUID 없이 복수 확정했다.
- `MultiSelectAutocomplete`: 두 후보를 연속 추가하고 각각 칩으로 남겼다.
- 실제 Desktop 결재자 화면은 S15 Chromium에서 다건 검색 모달을 열고 Enter로 확정한 뒤 칩 1개와 UUID 비노출을 확인했다.
- 실제 Desktop 은행거래 화면은 단수 radio 한 건만 확정했고, blur·재-Enter 뒤 표시값이 유지됐다.
- 수금계획 화면은 `resultSelectionMode` 미지정 기존 dropdown에서 Enter 확정했다.

### 미확정 발행 차단

S15 Chromium에서 창고가 미확정인 상태로 발행 버튼이 disabled였고 Enter를 보내도 병합 POST 계수는 0이었다.

```text
await expect(submit).toBeDisabled()
await submit.press('Enter')
expect(mergePosts).toBe(0)
```

### 2주문 선택·발행 경로

관련 `d2-order-merge` 한 테스트만 별도로 실행했다. 같은 거래처 주문 2건을 선택해 `2건 선택됨`, 창고 선택, 발행 버튼 enabled, 성공 응답까지 도달했다.

```text
같은 거래처 2주문 병합 발행 성공은 기존 payload/결과 계약을 유지한다
1 passed (6.4s)
```

다만 이 성공을 POST 본문 정합성 증거로 쓰지 않았다. 이유는 EI-2에 기록한다.

## 3. 제거 부작용

### 제거 식별자 잔존

S23과 같은 세 명령을 다시 실행했다. 세 명령 모두 일치 없음으로 `rg` exit 1이었다.

```text
rg -n "STALE_INPUT_GUARD_WINDOW_MS|staleInputGuard|userInputIntentRef|draftRef" \
  clients/web/design-system/src/components/WarehouseAutocomplete
exit=1

rg -n "onPaste=|onCompositionStart=|onBeforeInput=|onInput=" \
  clients/web/design-system/src/components/WarehouseAutocomplete
exit=1

rg -n "STALE_INPUT_GUARD_WINDOW_MS|staleInputGuard|userInputIntentRef" \
  clients/desktop/src clients/desktop/playwright \
  --glob '*.ts' --glob '*.tsx' --glob '*.spec.ts' \
  --glob '!clients/desktop/playwright/825-s15-final-reconvergence/**'
exit=1
```

repo 전체 검색에서 나온 `FreeTextChipInput.draftRef`, `CollaborativeTextField.onCompositionStart`, `VehicleGroupCard.onInput` 등은 이름만 같은 다른 컴포넌트의 독립 구현이며 S23 제거 대상 참조가 아니다.

### 제거된 동작을 계속 단언하는 테스트

제거된 stale guard, inputType 분기, DOM intent handler를 직접 참조하거나 그 존재를 단언하는 테스트는 없었다. `WarehouseAutocomplete`의 세 테스트는 제거된 장치가 아니라 “입력값이 보인다”는 결과를 단언한다. 단, native 이벤트를 만들지 않는 문제는 EI-1로 분리했다.

### 공용 컴포넌트 사용처

Desktop production source의 `WarehouseAutocomplete` 사용은 **4파일 6인스턴스**다.

```text
MergeConvertDialog.tsx             1
SalesPartnerOrderDetailPage.tsx    1
SlipFormPage.tsx                   2
TransferFormPage.tsx               2
합계                               6
```

관련 Desktop 3개 spec 128건과 design-system build/typecheck, Desktop typecheck에서 이 공용 변경으로 인한 실패는 없었다.

## 4. S23 증거 수치 재현

S23 보고서의 명령을 그대로 재실행했다.

```text
WarehouseAutocomplete             21/21 passed
Desktop 관련 3개 spec             128/128 passed
S15 Chromium                       4/4 passed
design-system build                exit 0
design-system typecheck            exit 0
desktop typecheck                  exit 0
desktop typecheck real-QA scope    50/50 passed
```

build의 폰트 3건은 기존과 동일한 runtime resolve 경고였고 명령 exit는 0이었다.

## 5. 증거 무결성 차단 사항

### EI-1 — 붙여넣기·IME·자동완성 native 도달 미확정

**재현 절차**

1. S23과 같은 `WarehouseAutocomplete.test.tsx` 21건을 실행한다.
2. 이름이 `allows paste replacement`, `allows IME composition input`, `allows autocomplete replacement`인 세 테스트의 이벤트 원문을 확인한다.
3. 실제 이벤트 종류를 검색한다.

**실측 원문**

```text
fireEvent.change(input, { target: { value: 'HQ-001 · 본사 창고VH' } })
fireEvent.change(input, { target: { value: 'HQ-001 · 본사 창고창' } })
fireEvent.change(input, { target: { value: 'HQ-001 · 본사 창고VH' } })

onPaste=|onCompositionStart=|onBeforeInput=|onInput=
WarehouseAutocomplete 범위 일치 없음, exit=1
```

세 테스트 모두 `paste`, composition lifecycle, `beforeinput/inputType=insertReplacementText`를 발생시키지 않고 React `change`만 보낸다. S24 환경의 in-app browser 연결 가능 인스턴스도 0개여서 별도 native 입력을 밟지 못했다.

**왜 실 사용자가 밟는가**

클립보드 붙여넣기, 한글 조합 입력, 브라우저/OS 자동완성은 각각 native 이벤트 순서와 조합 상태를 동반한다. 이번 라운드가 실제로 밟은 generic change와 동일하다고 단정할 증거가 없다.

**분류**: 제품 결함 아님 / 증거 무결성 차단. 원 기능·#1141 어느 쪽 결함으로도 계수하지 않음.

### EI-2 — 실제 POST 본문 미확정

**재현 절차**

1. `d2-order-merge`의 2주문 발행 테스트 한 건을 `--trace on`으로 실행한다.
2. 생성된 `0-trace.network`에서 `convert-to-slip-merge`, `warehouseCode`, `HQ-001`을 검색한다.
3. UI → `MergeConvertDialog` → `mergeConvertToSlip` → Axios mock adapter 데이터 흐름을 역추적한다.

**실측 원문**

```text
Playwright: 1 passed (6.4s)
0-trace.network: convert-to-slip-merge 일치 0건
```

원인은 mock mode에서 Axios request interceptor가 `config.adapter`로 응답을 내부 소비하기 때문이다. 브라우저 네트워크 요청이 발생하지 않아 trace에 POST가 없다. 소스상 body 형식은 아래와 같다.

```text
POST /api/v1/partner-orders/convert-to-slip-merge
{ orders, warehouseCode, shippingInfo }
```

또한 이 Playwright fixture에서 선택한 두 번째 주문 `2026/05/31-3`의 상세 mock은 기본 분기로 들어가 `orderNumber: '2026/05/04-1'`, `lineId: 'line-po-001'`을 반환한다. 첫 번째 주문 상세과 같은 값이다. mock 성공 handler는 body의 각 order 값을 검증하지 않고 배열 길이만 이용해 성공 응답을 만든다. 따라서 이 1-pass는 “실제 POST 본문이 두 주문과 HQ-001을 올바르게 담았다”는 증거가 아니다.

**왜 실 사용자가 밟는가**

실 사용자의 병합 발행은 선택한 주문번호·라인·수량·창고 코드가 POST body로 서버에 전달되는 마지막 경계다. 화면 라벨이 맞아도 이 경계 값이 틀리면 다른 주문 또는 창고로 발행될 수 있다. 이번 mock 경로는 그 경계를 관측하지 못했다.

**분류**: 제품 결함 아님 / 증거 무결성 차단. 실제 backend 경로의 원 기능 결함으로 계수하지 않으며 #1141과 무관.

## 6. 이 라운드가 보지 않은 것

- 실제 native clipboard paste 이벤트
- 한글 IME의 compositionstart/update/end 전체 순서
- 브라우저/OS 자동완성의 `insertReplacementText` 실제 이벤트
- 실제 backend로 전송된 병합 POST 원문과 서버가 해석한 주문·라인·창고 값
- Desktop mock 전체 스위트
- Docker 재기동·재배포·DB 쓰기
- #1141로 분리된 자동확정 직후 잔여 키 표시 문제의 수정 여부

따라서 관측한 범위의 제품 결함은 0건이지만, 위 미관측 범위를 포함한 “남은 것이 정말 0건” 판정은 하지 않는다.

## 신규 파일 목록

```text
docs/dev-reports/2026-08-08-825-s24-merge-reconvergence.md
```
