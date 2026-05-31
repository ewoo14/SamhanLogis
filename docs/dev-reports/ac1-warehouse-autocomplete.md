# 슬라이스 AC-1 — 창고 자동완성 (dev-report)

- **작성일**: 2026-05-31
- **브랜치**: `feat/ac-1-warehouse-autocomplete`
- **spec**: `docs/superpowers/specs/2026-05-31-ac1-warehouse-autocomplete-design.md`
- **이니셔티브**: 마스터데이터 자동완성(거래처/창고/품목) ①/3. AC-2 품목·AC-3 거래처 후속.

## 1. 목표/배경
슬라이스 C 가 전환 모달에 `WarehouseSelector`(드롭다운)를 도입. 개발책임자 요청으로 **입력 즉시 자동완성**(type-to-search)으로 전환. design-system 기존 `AccountCodeSelect` typeahead idiom 을 창고용으로 이식.

## 2. 결정 (DECISIONS D-AC-01~03)
- **D-AC-01**: 마스터데이터 자동완성 = 3분할(창고→품목→거래처) 순차, 공용 AccountCodeSelect idiom 재사용.
- **D-AC-02**: 신규 `WarehouseAutocomplete`(AccountCodeSelect 패턴), 기존 `WarehouseSelector`(드롭다운) 보존.
- **D-AC-03**: 전환 모달만 교체, API 본문 warehouseCode 만(UUID 비공개), 슬라이스 C 게이트/에러/로딩 로직 유지.

## 3. 변경 (커밋 `4cb264fa`)
- **design-system 신규** `WarehouseAutocomplete`(.tsx/.module.css/.stories.tsx/index.ts) + `index.ts` export. AccountCodeSelect 이식: 코드 prefix/이름 부분일치 검색, 키보드 ↑↓/Enter/클릭/blur match, hideVirtual, FormField(label/required/error) 통합, role=combobox/listbox 접근성. `Warehouse` 타입은 WarehouseSelector 원본 재사용.
- **desktop** `SalesPartnerOrderDetailPage` 전환 모달: `WarehouseSelector` → `WarehouseAutocomplete`(동일 props). convertWarehouse/convertWarehouseError/제출 게이트/warehouseCode 전송 유지. 타 사용처 무변경.
- **Playwright** `phase-2-6a-order-convert`: 창고 선택을 `<select>` → combobox 입력+후보 클릭 방식으로 갱신(헬퍼 `selectWarehouseAutocomplete`).

## 4. 함수 단위 문서
- `WarehouseAutocomplete(props)`: 입력 → `searchWarehouses(code prefix → name 부분일치, hideVirtual 필터)` → 후보 listbox(activeIndex 키보드 네비) → `onChange(warehouseId, warehouse)`. WarehouseSelector 와 동일 시그니처(drop-in). 선택 표시 "code · name". blur 시 미확정이면 부모 null 복원.

## 5. 테스트
- design-system: typecheck 0 / lint 0(기존 warning) / build ✓ / Storybook story 5종.
- desktop: typecheck 0 / lint 0 / Playwright `phase-2-6a-order-convert` **11 passed**(입력→자동완성→선택→전환).
- Docker 실 QA(머지 전): 실 전환 모달 창고명 입력→자동완성→선택→전환 성공 실 캡처([[feedback_no_fake_data_ever]]).

## 6. 배포 / 후속
- design-system + desktop 빌드(백엔드/Flyway 무관).
- AC-2 품목(모델명/품목명) / AC-3 거래처(명/코드/정보) 동일 패턴. 타 화면 창고 드롭다운 autocomplete 전환 후속. 4종 완료 후 공용 typeahead 추출 재평가.
