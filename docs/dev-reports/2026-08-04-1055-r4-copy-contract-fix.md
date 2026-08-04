# 1055 R4 — VIRTUAL 창고 수량 복사 계약 수정

## 라운드 시작 기록

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1055`
- 저장소 루트: `C:/dev/Samhan-Public/.claude/worktrees/t1055`
- 브랜치: `fix/1055-zero-stock-warehouse-visibility`
- 시작 HEAD: `f22875f8e09f3ef938560d9b9c2f2c2c28d10212`
- 시작 상태: 기존 미추적 파일 `docs/dev-reports/2026-08-04-1055-r3-sol-review.md` 존재. 이번 라운드 파일은 별도로 생성함.

## 설계 및 조사

조사 후 공용 `DataGrid` 수정 여부와 근거:

- 별도 CSV/엑셀 내보내기 경로는 `InventoryStockBalancePage`와 `DataGrid`에서 발견되지 않았다. 대상은 Ctrl+C 단일 경로다.
- `DataGrid`에 선택적 `copyValue(row)`를 추가했다. 기존 소비자는 필드를 생략하므로 기존 `format`/`String` 동작을 유지한다.
- 페이지의 세 수량 컬럼(`availableQty`, `reservedQty`, `totalQty`)만 `copyValue`를 지정해 VIRTUAL은 `—`, 그 외는 기존 공용 fallback과 같은 원시 숫자 문자열을 복사한다.
- 페이지에서 행 변환을 하지 않은 근거: summary/0 재고 판정 등 업무 원시값을 보존해야 하며, 공용 계약을 통해 화면 렌더와 복사 값을 명시적으로 맞추는 편이 국소 변환보다 안전하다.

## RED-A·RED-B

구현 전 테스트를 먼저 추가하고 원 코드에서 실행했다.

### RED-A 원문

명령:

```text
npm test -- --run src/components/DataGrid/DataGrid.copy-contract.test.tsx
```

```text
❯ DataGrid copy display contract > RED-A: VIRTUAL 행 복사는 화면 표시값 — 를 사용한다
AssertionError: expected "spy" to be called with arguments: [ '—' ]
Received: [ "0" ]
Number of calls: 1
Test Files 1 failed | Tests 1 failed | 1 passed
```

화면 셀은 `—`였으나 복사 인자는 `0`으로 확인됐다.

### RED-B 원문

명령:

```text
npm test -- --run src/components/DataGrid/DataGrid.copy-contract.test.tsx -t "RED-B"
```

초기 RED-B 후보는 화면 서식(`1,234`)을 기대하도록 작성했으며, `copyValue` 지원을 제거한 원 코드로 일시 재현한 결과:

```text
❯ DataGrid copy display contract > RED-B: VIRTUAL 이 아닌 행의 복사 결과는 기존 숫자 서식을 유지한다
AssertionError: expected "spy" to be called with arguments: [ '1,234' ]
Received: [ "1234" ]
Number of calls: 1
Test Files 1 failed | Tests 1 failed | 1 skipped
```

이 결과는 불변식 2(비-VIRTUAL 기존 복사값 불변)를 재확인하게 했다. 실제 기존 `DataGrid` 복사값은 `format`이 없는 이 페이지에서 `1234`였으므로, RED-B를 최종 계약인 원시값 `1234`로 교정했다. 교정된 RED-B는 원 코드와 동일한 정상 경로를 보존하는 회귀 테스트이며, 공용 기본 fallback을 바꾸지 않는 것을 검증한다.

## 영향 조사

전수 조사 명령:

```text
rg -n --hidden --glob '!node_modules' --glob '!dist' "DataGrid|getCellDisplayValue|useClipboard|col\.format|col\.render" clients
rg -n --hidden --glob '!node_modules' --glob '!dist' "(export|download|toCsv|CSV|csv|excel)" clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx clients/web/design-system/src/components/DataGrid
```

DataGrid 사용 화면 목록:

1. `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx` — 이번 수정 대상.
2. `clients/desktop/src/renderer/routes/warehouse/DpsByProductPage.tsx` — 기존 컬럼 계약 유지.
3. `clients/desktop/src/renderer/routes/sales-query/SalesQueryPage.tsx` — 기존 `format`/기본 복사 유지.
4. `clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx` — 기존 `format`/기본 복사 유지.
5. `clients/desktop/src/renderer/routes/HometaxExportPage.tsx` — 기존 컬럼 계약 유지.
6. `clients/desktop/src/renderer/components/SlipCleanupHistoryTab.tsx` — 기존 컬럼 계약 유지.
7. `clients/desktop/src/renderer/components/DispatchSmsHistoryTab.tsx` — 기존 컬럼 계약 유지.

Storybook의 `DataGrid.stories.tsx`는 컴포넌트 시나리오로 별도 확인 대상이다. 공용 API에 선택 필드를 추가하되 미사용 소비자 동작은 변경하지 않는 낮은 영향·호환적 변경이다.

## 종료조건 검증

새로 가능해진 조합:

| 창고유형 | 컬럼 | Ctrl+C/내보내기 값 |
|---|---|---|
| `VIRTUAL` | `availableQty` | `—` |
| `VIRTUAL` | `reservedQty` | `—` |
| `VIRTUAL` | `totalQty` | `—` |
| `HEADQUARTERS`·`VEHICLE`·`CONSIGNMENT` | 세 수량 컬럼 | 기존 원시 숫자 문자열 |
| 모든 DataGrid 타 화면 | 기존 컬럼 | 기존 fallback |

별도 CSV/엑셀 export 경로는 없으므로 Ctrl+C가 유일한 내보내기 경로다. 각 조합은 코드 계약과 RED/GREEN 테스트로 확인했다.

검증 명령·출력 원문:

```text
npm test -- --run src/components/DataGrid/DataGrid.copy-contract.test.tsx
Test Files 1 passed | Tests 2 passed

npm test                         # clients/web/design-system
Test Files 26 passed | Tests 173 passed

npm run typecheck                # clients/web/design-system
Exit code 0

npm run typecheck                # clients/desktop
Exit code 0
real-QA typecheck: 50 passed, 0 failed

npx playwright test playwright/datagrid/datagrid-interaction.spec.ts --reporter=line
Running 7 tests using 1 worker
7 passed (10.5s)

npx playwright test playwright/phase-2-6c-inventory-deduction/phase-2-6c-inventory-deduction.spec.ts --reporter=line
Running 9 tests using 1 worker
9 passed (10.9s)

git diff --check
Exit code 0
```

desktop typecheck 중 기존 로컬 미추적 real-QA 스펙 경고가 있었지만 가드 허용 모드로 진행됐고 최종 `50 passed`였다. 새 QA 하네스 절대경로/`docs/qa` 하드코딩은 추가하지 않았다.

## 동시 GREEN

두 테스트와 영향 테스트의 동시 GREEN 원문:

```text
DataGrid.copy-contract.test.tsx
  ✓ RED-A: VIRTUAL 행 복사는 화면 표시값 — 를 사용한다
  ✓ RED-B: VIRTUAL 이 아닌 행의 복사 결과는 기존 원시 숫자값을 유지한다
Test Files 1 passed | Tests 2 passed

phase-2-6c-inventory-deduction.spec.ts
  ✓ 시나리오 9: VIRTUAL 수량 Ctrl+C — 화면 표시값(—) 복사
Running 9 tests using 1 worker
9 passed (10.9s)

datagrid-interaction.spec.ts
Running 7 tests using 1 worker
7 passed (10.5s)
```

시나리오 9는 실제 `VR-001` 행의 세 셀 화면값 `—`을 확인한 뒤 Ctrl+C 결과가 `—\t—\t—`임을 확인했다.

## 변경 파일

수정 파일:

- `clients/web/design-system/src/components/DataGrid/DataGrid.tsx`
- `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx`
- `clients/desktop/playwright/phase-2-6c-inventory-deduction/phase-2-6c-inventory-deduction.spec.ts`

신규 파일:

- `clients/web/design-system/src/components/DataGrid/DataGrid.copy-contract.test.tsx`
- `docs/dev-reports/2026-08-04-1055-r4-copy-contract-fix.md`

기존 미추적 파일(이번 라운드 변경 아님):

- `docs/dev-reports/2026-08-04-1055-r3-sol-review.md`

커밋·push는 수행하지 않았다.
