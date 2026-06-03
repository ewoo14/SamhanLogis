# Slice: phase-2-6c 전환 모달 재게이트 (⑥ B/C feature #5)

> branch `feat/phase-2-6c-convert-modal-regate` / 2026-06-04 / clients/desktop. **프로덕션 src 무변경**(테스트 전용).
> 주문→출고전표 전환 모달 + 재고현황 화면 8 시나리오 재게이트.

## 1. 근본원인

- **시나리오 1~5(전환 모달)**: Phase 2.6a 부분전환으로 전환 모달 submit 활성 조건이 `출고 창고(WarehouseAutocomplete) 선택 + 라인 qty>0` 으로 진화. 기존 테스트는 qty 만 채우고 **창고 미선택** → submit disabled → `toBeEnabled()` timeout.
- **시나리오 6~8(재고현황)**: 페이지는 정상 로드(`header-page-title`="재고 현황")이나 `getByText('재고 현황')` 가 사이드바/제목/h3/빈상태 셀 등 **4개 매칭 → strict mode violation**.

## 2. 수정 (테스트 정합)

- `openConvertModal` 헬퍼에 **출고 창고 선택** 추가: WarehouseAutocomplete `input[role="combobox"]` 에 'HQ-001' 입력 → `role="option"` (HQ-001 본사창고) 클릭. 모든 시나리오 공통 precondition.
- `gotoStockBalance` 헬퍼의 페이지 로드 대기를 `getByText('재고 현황')`(다수 매칭) → `getByTestId('header-page-title')` 한정.

## 3. 검증

- phase-2-6c **8/8 green** → testIgnore 해제 재게이트. desktop tsc 0. 프로덕션 컴포넌트 무변경(전환 모달은 이미 창고+qty 요구 — 테스트만 미반영이었음).
