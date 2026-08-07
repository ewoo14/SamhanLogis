# PR #1120 / 이슈 #825 S3 — 대표 소비처 mock fixture 및 발동 시점 대조

> 검증일: 2026-08-08
> 기준 HEAD: `67a5a9383`
> 범위: S2 대표 소비처 3건의 실제 화면 진입 mock QA, #1050/#1063 모달 발동 계약 대조

## 1. 결론

- 대표 소비처 3건을 실제 화면에 진입해 검색·모달·확정을 수행했고, 격리 환경에서 **3/3 PASS**했다.
- 첫 S2 spec은 대표 은행거래 화면 대신 이미 모달이 붙어 있던 `DepositorMappingPage`를 검사하고, fixture 7건을 정확히 2건으로 잘못 고정하고 있었다. 은행거래 화면으로 교체하고 후보 수를 “2건 초과” 계약으로 단정하도록 고쳤다.
- 모든 실행은 `VITE_API_BASE_URL=http://127.0.0.1:1`로 수행했다. mock handler가 없는 endpoint가 실제 localhost backend로 빠져 green이 되는 경로를 차단했다.
- #1050/#1063 계약은 후보가 2건 이상이 된 시점에 모달을 여는 동작을 정하고 있다. 현재 `WarehouseAutocomplete`의 `onChange` 후보 계산 직후 모달 open은 이 계약과 같다. 구현 변경은 하지 않았다.
- 세 화면 모두 첫 부분 입력에서 모달이 열려 검색어를 끝까지 입력할 수 없는 현상이 재현됐다.

## 2. 변경 내용

수정한 신규 QA spec:

- `clients/desktop/playwright/825-s2-slice1-contract/825-s2-slice1-contract.spec.ts`

변경 사항:

1. 첫 케이스를 `DepositorMappingPage`에서 실제 S2 대표 소비처인 `BankTransactionPage`로 교체했다.
2. 은행거래 화면의 기본 날짜 범위가 2026년 6월 fixture 밖이므로, 화면의 실제 조회 필터를 2026-06-01~2026-06-30으로 설정하고 조회한 뒤 미매칭 행에 진입한다.
3. 거래처 후보 수를 정확히 2건이 아니라 2건 이상으로 단정한다. 후보가 7건인 mock도 계약상 유효하다.
4. 병합전환은 `창고` 전체를 한 번에 넣지 않고 첫 부분 입력 `창`에서 모달이 뜨는 것을 단정한다.

wrapper 기본값, `WarehouseAutocomplete` 구현, 거래처 소비처 14곳은 수정하지 않았다. S2 이후 opt-in 검색 결과는 결재자·은행거래·병합전환 및 기존 선행 소비처에만 존재하며, 나머지 14개 거래처 소비처의 소스 diff는 없다.

## 3. 계약 원문 대조

정본은 S1이 확인한 `#1050`/`#1063`의 design-system 공용 계약(`SearchResultSelectionModal` + `AsyncAutocomplete`)이다.

원문 인용:

> “유지하며 1건을 dropdown에 남긴다. 모달 계약은 2건 이상일 때만 적용한다.”

출처: `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx:355`

> “지정하면 2건 이상 후보를 공용 선택 모달로 표시한다. 기존 dropdown이 기본값이다.”

출처: `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx:66`

현재 Warehouse 구현은 입력 `onChange`에서 후보를 다시 계산한 뒤 다음 분기를 탄다.

- 1건이고 `autoSelectSingleResult=true`: 즉시 확정
- 2건 이상이고 `resultSelectionMode`가 지정됨: 후보를 저장하고 공용 모달 open
- 그 외: 기존 dropdown 유지

따라서 계약이 “Enter 또는 blur에서만 모달을 연다”고 정한 것이 아니며, 현재 발동 시점은 계약과 같다. `Enter`와 `blur`는 후보를 확정하는 기존 선택 경로이고, 다건 모달의 발동 게이트가 아니다.

wrapper 기본값도 확인했다.

- `AsyncAutocomplete`: `autoSelectSingleResult = false`, `minChars = 1`
- `WarehouseAutocomplete`: `autoSelectSingleResult = false`, `resultSelectionMode` 미지정 시 legacy dropdown
- 미적용 소비처에는 `resultSelectionMode` opt-in을 추가하지 않았다.

## 4. 세 화면의 부분 입력 관찰

| 화면 | 첫 부분 입력 | 결과 | 끝까지 입력 가능 여부 |
|---|---|---|---|
| 결재자 검색 | `팀` | 2건 이상 checkbox 모달 즉시 표시 | **불가**. 모달이 먼저 열려 다음 글자를 combobox에 계속 입력할 수 없다. |
| 은행거래 거래처 | `P` | 2건 이상 radio 모달 즉시 표시 | **불가**. 모달이 먼저 열려 다음 글자를 combobox에 계속 입력할 수 없다. |
| 병합전환 출고창고 | `창` | 2건 이상 radio 모달 즉시 표시 | **불가**. 모달 취소 후에야 입력을 계속할 수 있다. `HQ`로 다시 검색하면 1건이 즉시 확정된다. |

이 현상은 세 소비처 모두에서 재현됐지만, 현 단계에서는 계약과 일치하므로 수정하지 않고 개발책임자 보고 대상으로 남겼다.

## 5. 격리 검증

실행 위치: `clients/desktop`

```powershell
$env:VITE_API_BASE_URL='http://127.0.0.1:1'
$env:VITE_MOCK_MODE='1'
npx playwright test playwright/825-s2-slice1-contract/825-s2-slice1-contract.spec.ts --reporter=line
```

결과:

```text
Running 3 tests using 1 worker
3 passed (8.1s)
```

검증한 단정:

- 은행거래 거래처: 실제 `/accounting/bank-transactions` 진입 → 6월 조회 → 미매칭 거래처 검색 → 거래처 검색 결과 모달 → 단일 확정 → UUID 미노출
- 결재자: 실제 `/admin/approval-line-config` 진입 → 결재자 검색 → checkbox 모달 → 2건 일괄확정 → 칩 2개 → UUID 미노출
- 병합전환 출고창고: 실제 `/sales/partner-orders` 진입 → 병합전환 열기 → 창고 다건 모달 취소 → `HQ` 1건 즉시확정 → UUID 미노출

## 6. 신규 파일 목록

- `clients/desktop/playwright/825-s2-slice1-contract/825-s2-slice1-contract.spec.ts` — S2에서 생성된 spec을 S3에서 보완
- `docs/dev-reports/2026-08-08-825-s3-playwright-fixture-and-trigger-contract.md`

커밋·push는 하지 않았다.
