# Slice: WarehouseAutocomplete 통합 (잔여 WarehouseSelector 일원화)

> ⓒ 3순위 / branch `feat/warehouse-autocomplete-integration` / 2026-06-03 / FE only(desktop).

## 1. 배경

design-system `WarehouseAutocomplete`(AC-1 — 창고 코드/이름 타이핑 → combobox 후보)는 이미 작성되어 `MergeConvertDialog`·`SalesPartnerOrderDetailPage`(전환/병합 출고 창고)에 통합돼 있었으나, **작성 폼의 헤더 창고 선택은 구 `WarehouseSelector`(plain `<select>`)** 가 잔존해 창고 선택 UX 가 비일관(타이핑 검색 불가).

## 2. 변경 (4곳 일원화)

| 파일 | 변경 |
|---|---|
| `SlipFormPage.tsx` | 출발/입고 창고 + 도착/출발(옵션) 창고 2곳 `WarehouseSelector` → `WarehouseAutocomplete` (import 포함) |
| `TransferFormPage.tsx` | 출발 창고 + 도착 창고 2곳 `WarehouseSelector` → `WarehouseAutocomplete` (import 포함) |

- props 호환: `value`(둘 다 `string | null`), `onChange(id)` (WA 는 `(id, warehouse)` 전달 — id 만 소비), `warehouses`/`required`/`error`/`hideVirtual` 동일. **기능·동작 동등**(SlipFormPage hideVirtual 보존, TransferFormPage 가상창고 포함·동일창고 error 보존).
- 잔여 `WarehouseSelector` 컴포넌트 사용 0(routes/components). DS `WarehouseSelector` 컴포넌트 자체는 보존(타 잠재 사용처 호환).

## 3. 검증

- `clients/desktop` `tsc --noEmit` 오류 0.
- 실 Playwright(mock 회귀, 비격리 게이트): `slip-form-v20` + `d2-6d-inventory-lookup` + `phase-2-6a-order-convert` **30 passed / 0 failed** — 창고 선택 변경 회귀 0. phase-2-6a 는 AC-1 combobox 헬퍼 선례.
- CI Desktop Playwright 게이트로 재확인.

## 4. 후속

- DS `WarehouseSelector` 미사용 확정 시 deprecate/제거 검토(별도).
