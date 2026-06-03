# WarehouseAutocomplete 통합 — 설계

> ⓒ 3순위. 잔여 `WarehouseSelector`(plain select) → `WarehouseAutocomplete`(AC-1 타이핑 검색) 일원화. FE only(desktop).

## 문제

`WarehouseAutocomplete` 는 design-system 에 작성·export 됐고 `MergeConvertDialog`/`SalesPartnerOrderDetailPage` 에 통합됐으나, 작성 폼 헤더(`SlipFormPage` 출발/도착, `TransferFormPage` 출발/도착)는 구 `WarehouseSelector` 가 남아 창고 선택 UX 비일관.

## 설계

- 4곳(`SlipFormPage` 2 + `TransferFormPage` 2) `WarehouseSelector` → `WarehouseAutocomplete` 교체. import 포함.
- props 동등 매핑: `value: string | null`(상태가 이미 `useState<string|null>(null)`), `onChange(id)`(WA `(id, warehouse)` 중 id 소비), `warehouses/required/error/hideVirtual` 그대로. SlipFormPage `hideVirtual` 보존, TransferFormPage 가상창고 포함 + 동일창고 error 보존.
- 신규 컴포넌트 작성 금지(DS 재사용). 프로덕션 로직 무변경(컴포넌트 교체만).

## 검증

- desktop `tsc --noEmit` 0.
- 실 Playwright(비격리 게이트) slip-form-v20 / d2-6d-inventory-lookup / phase-2-6a-order-convert 회귀 0.
- UUID 비공개 유지(WA 도 코드+이름 표시, id 비노출).

## 범위 밖

DS `WarehouseSelector` deprecate/제거(미사용 확정 후 별도).
