# PR #1103 / Issue #1102 — S5 조회 중 단가 재fix

## 판정

S3 직전 상태에서 실제 거래처·품목 선택 흐름으로 RED를 재현했다. `shouldAutoFill` 자체가
거짓인 것이 아니라, 거래처 bulk refresh의 후보 0건 정리와 단건 최근단가 조회가 같은
라인 state를 경쟁적으로 갱신해 실제 단건 조회의 busy 표시가 사라지는 것이 원인이었다.

S5는 `lookupLoading`을 단건 조회의 유일한 표시 근거로 사용하지 않는다. 실제
`getPriceMemory` Promise를 시작할 때 라인별 generation token을 등록하고, 그 token이
현재 세대일 때만 pending을 해제한다. 거래처 전환과 직접 입력은 이전 세대를 즉시 무효화한다.

## :1331 네 조건의 실제 발동 조사

대상 코드는 `clients/desktop/src/renderer/routes/SlipFormPage.tsx:1300-1324`다.

| 조건 | 실제 R1 선택 흐름 | 판정 |
|---|---|---|
| `partnerId` | 거래처 A 선택 handler가 `selectedPartnerIdRef`와 state를 설정한 뒤 품목 선택으로 진입 | `true` |
| `productId` | 품목 A의 `id`가 `applyProductSelection`에 전달됨 | `true` |
| `shouldAutoFill` | 초기 라인은 `priceSource=null`, `unitPrice='0'`; `shouldAutoFillPrice`가 자동채움을 허용 | `true` |
| `!dcResult` | 거래처 DC가 아직 없거나, DC 조회가 pending/miss이면 `dcResult=null` | `true` |

따라서 네 조건은 R1 경로에서 실제로 모두 만족하는 순간이 있다. 전제가 틀린 것이 아니며,
제3의 원인은 이 계산 뒤의 state 경쟁이었다.

거짓이 되는 경우도 확인했다. 거래처 미선택이면 `partnerId=false`, 품목 미선택이면
`productId=false`, 사용자가 직접 입력한 단가(`priceSource='USER'`) 또는 자동채움 대상이
아닌 기존 단가면 `shouldAutoFill=false`, 이미 유효한 DC 계산 결과가 있으면 `!dcResult=false`다.

## RED 실행 원문

S3 직전 상태에서 아래 실제 흐름 테스트를 추가했다. fixture에 `lookupLoading: true`를
주입하지 않고 거래처·품목 버튼을 연속 클릭했으며, `getPriceMemory`만 deferred로 남겼다.

```text
npm run test -- --run src/renderer/routes/SlipFormPage.test.tsx
FAIL ... 실제 거래처·품목 선택 직후 최근단가 조회 중에는 확정 단가와 출처 note를 숨긴다
expected '1000' to be ''
96 tests | 1 failed | 95 passed
```

추가 계측에서 같은 시점의 `data-lookup-loading`은 `true`였지만 input은 `1000`이었다.
즉 S3의 플래그 계산만으로는 화면 표시를 증명할 수 없었다. 거래처 선택에서 시작된
후보 0건 bulk refresh의 `setLines(...lookupLoading:false)`가 품목 선택이 세운 상태를
덮는 경쟁도 함께 확인했다.

## S5 변경과 S3와의 차이

- 후보 0건 bulk refresh는 거래처 handler가 이미 stale busy를 정리하므로, 뒤늦게 모든
  라인을 `lookupLoading:false`로 덮어쓰지 않는다.
- 단건 조회는 `getPriceMemory` 호출 직전에 실제 Promise 수명을 라인별 generation으로
  등록한다. DC 조회가 pending인 동안에는 catalog fallback을 유지하는 기존 계약을 보존한다.
- input과 가격 출처 note의 masking은 `priceLookupPendingIds`라는 별도 실제 조회 상태를
  사용한다. 따라서 `lookupLoading` 하나를 반복해서 가드하지 않는다.
- 거래처 전환·사용자 직접 입력은 이전 generation을 무효화하고, 늦은 응답은 새 pending을
  해제하거나 화면을 덮을 수 없다.

## GREEN / 타입검사

```text
npm run test -- --run src/renderer/routes/SlipFormPage.test.tsx
Test Files  1 passed
Tests       96 passed

npm run typecheck
Exit code 0
real-QA cleanup scope: 2 passed
real-QA scope: 50 passed
```

typecheck 출력에는 기존 미추적 로컬 real-QA 스펙 경고가 있었으나, 명령은 종료코드 0이며
타입 오류는 없었다. 로컬 full suite는 게이트로 사용하지 않았다.

## 남은 차단

- Docker/서비스 재기동, commit, push는 하지 않았다.
- 라이브QA는 이 워크트리에서 수행하지 않았다. 다음 라운드에서 거래처 A→품목 A 선택 직후
  `getPriceMemory` 완료 전 단가와 note가 숨겨지는지, miss/failure fallback과 직접 입력
  우선순위가 유지되는지 확인해야 한다.
