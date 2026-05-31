# 슬라이스 AC-1 — 창고 자동완성 (마스터데이터 자동완성 ①/3)

- **작성일**: 2026-05-31
- **상태**: 설계 확정 (개발책임자 승인 2026-05-31)
- **유형**: FE 단독 (design-system 신규 컴포넌트 + desktop 전환 모달 교체)
- **선행**: 슬라이스 C(창고코드 정렬, #328) — 전환 모달에 `WarehouseSelector`(드롭다운) 도입.
- **이니셔티브**: 마스터데이터 자동완성(거래처/창고/품목) 3분할 중 **AC-1(창고)**. AC-2 품목·AC-3 거래처 후속(동일 패턴).
- **관련 메모리**: [[feedback_uuid_no_user_visibility]], [[feedback_no_fake_data_ever]]

---

## 1. 배경 / 목표

슬라이스 C 가 전환 모달에 design-system `WarehouseSelector`(네이티브 `<select>` 드롭다운)를 도입했다. 개발책임자 요청: **드롭다운 대신 입력과 동시에 자동완성**(type-to-search).

design-system 에 이미 동형 idiom 인 `AccountCodeSelect`(계정과목 typeahead — 코드 prefix/이름 부분일치 검색 + 키보드 네비 + click/Enter/blur match)가 있다. 이를 창고용으로 이식한 `WarehouseAutocomplete` 를 만들고 전환 모달의 드롭다운을 교체한다.

## 2. 결정

| # | 결정 | 근거 |
|---|---|---|
| D-AC-01 | 마스터데이터 자동완성 = **3분할(창고→품목→거래처) 순차 슬라이스**, 공용 `AccountCodeSelect` typeahead idiom 재사용. | 각 독립 검색 백엔드·배선이라 분리. 한 PR 비대화 방지. |
| D-AC-02 | **신규 design-system `WarehouseAutocomplete`** (AccountCodeSelect 패턴). 기존 `WarehouseSelector`(드롭다운)는 **다른 사용처 위해 보존**(제거 X). | 컴포넌트 신규 작성이 아닌 검증된 idiom 이식. 회귀 격리. |
| D-AC-03 | 전환 모달(`SalesPartnerOrderDetailPage`)만 `WarehouseAutocomplete` 로 교체. **API 본문 warehouseCode 만**(UUID 비공개). 슬라이스 C 의 필수 게이트/에러 텍스트/로딩 상태 로직 유지. | AC-1 범위 = 전환 모달. 타 화면 창고 드롭다운은 후속. |

### 제외
- AC-2(품목)·AC-3(거래처) 자동완성.
- 전환 모달 외 다른 화면의 창고 선택 UI(안전재고/이동 등) — 후속.
- 백엔드 변경 없음(`GET /inventory/warehouses` 기존 사용).

## 3. 변경 단위

### 3.1 design-system — 신규 `WarehouseAutocomplete`

`clients/web/design-system/src/components/WarehouseAutocomplete/` 신규(AccountCodeSelect 패턴 이식):
- **검색**: 입력 문자열 → ① 창고코드 prefix(우선) ② 창고명 부분일치. 빈 입력 + 포커스 → 전체(또는 상위 N) 표시(창고 4개라 전체). `hideVirtual` 시 VIRTUAL 제외.
- **UX**: 텍스트 입력 + 후보 드롭리스트(키보드 ↑↓/Enter 선택, 클릭 선택, blur 시 정확 매치 1건이면 확정·아니면 미선택), 선택 시 입력란에 "코드 · 창고명"(또는 창고명) 표시.
- **props**: `warehouses: Warehouse[]`, `value: string | null`(선택 창고 id), `onChange(warehouseId, warehouse)`, `label?`, `placeholder?`, `hideVirtual?`, `required?`, `error?`, `disabled?`. (WarehouseSelector 와 동일 시그니처 — drop-in 교체 가능하게.)
- **Warehouse 타입**: 기존 design-system `Warehouse`(id/code/name/type/active) 재사용(WarehouseSelector 와 공유).
- `index.ts` export 추가. **Storybook story**(기본/검색/hideVirtual/required 에러/disabled).
- 접근성: `role="combobox"` + `aria-expanded`/`aria-activedescendant`(AccountCodeSelect 수준).

### 3.2 desktop — 전환 모달 교체

`clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx`:
- import `WarehouseSelector` → `WarehouseAutocomplete`.
- 전환 모달 본문의 `<WarehouseSelector .../>` → `<WarehouseAutocomplete .../>` (동일 props: warehouses/value/onChange/label/placeholder/hideVirtual/required/error/disabled). 슬라이스 C 의 `convertWarehouse` state, `convertWarehouseError`(미선택/로딩/에러), 제출 게이트(`!convertWarehouse`), `warehouseCode` 전송 로직 **그대로 유지**.
- 다른 곳의 `WarehouseSelector` 사용처 무변경.

## 4. 테스트

- **design-system 단위/스토리**: 검색 필터(코드 prefix/이름 부분일치), 키보드 네비(↑↓/Enter), 클릭 선택, blur match, hideVirtual, required 에러 표시, disabled.
- **desktop Playwright**(`phase-2-6a-order-convert`): 전환 모달에서 창고 **입력→자동완성 후보→선택**→전환 성공. 기존 시나리오(창고 선택 단계)를 autocomplete 입력 방식으로 갱신(셀렉터: 텍스트 입력 + 후보 클릭).
- typecheck/lint 0 err. design-system build(storybook) 통과.
- **Docker 실 QA**: 실 전환 모달에서 창고명 입력→자동완성→선택→전환 성공 실 화면 캡처([[feedback_no_fake_data_ever]]).

## 5. 마이그레이션 / 배포

- 백엔드/Flyway 무관. design-system + desktop 빌드.

## 6. 미해결 / 후속

- AC-2 품목 자동완성(모델명/품목명) / AC-3 거래처 자동완성(명/코드/정보) — 동일 패턴.
- 전환 모달 외 창고 선택 UI 의 autocomplete 전환(안전재고/이동/실사 등) — 후속.
- 공용 typeahead 추출(AccountCodeSelect/WarehouseAutocomplete/ProductAutocomplete/PartnerAutocomplete 공통부) — 3종 완료 후 재평가.
