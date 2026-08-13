# PR #1126 / Issue #896 — 수량 동기화 칩 UI 라운드

일자: 2026-08-09  
브랜치: `feat/896-qty-sync-chip-track`  
HEAD 기준: `08579f984` + 본 라운드 작업

## 결론

견적품목 메뉴의 기존 카테고리 셀 안에 수량 동기화 종속 품목 칩을 추가했다. 기존 product-service의 수량 동기화 CRUD를 사용하며, 행 품목을 source로 하고 칩 품목을 target으로 저장한다. 규칙 조회 결과는 새로고침 후 target 칩으로 복원된다.

`tools/legacy-gas/**`는 변경하지 않았다. `recomputeHomeDerived`도 제거하지 않았다.

## RED-A~D 원문

### RED-A — 구현 전 실패 원문

추가한 `clients/desktop/src/renderer/routes/quantity-sync-chip.contract.test.ts`를 구현 전에 실행했다.

```text
❯ src/renderer/routes/quantity-sync-chip.contract.test.ts (1 test | 1 failed)
× #896 RED-A — 견적품목 수량 동기화 칩 UI > 기준 품목 행에 종속 품목을 칩으로 선택·저장하고 재조회할 UI 계약이 존재한다
→ expected ... to contain 'listQuantitySyncRules'
```

현재 GREEN 원문:

```text
✓ src/renderer/routes/quantity-sync-chip.contract.test.ts (1 test)
Test Files 1 passed
Tests 1 passed
```

### RED-B — 저장 규칙 발화

이번 라운드에서는 칩 UI와 product-service CRUD 배선까지 구현했다. 실 GUI에서 UI로 만든 규칙을 종합견적서와 주문서에 입력해 양쪽 발화를 판정하는 라이브 QA는 실행하지 못했다. SQL seed는 사용하지 않았다.

### RED-C — 규칙 없는 품목의 수량·금액 반대급부

금액 표본을 포함한 실 GUI 전후 비교는 실행하지 못했다. 기존 금액 계산 코드와 `recomputeHomeDerived`는 변경하지 않았다.

### RED-D — 기존 견적품목 메뉴 축

관련 Vitest는 통과했다.

```text
EstimateItemsCatalogPage.test.ts: 4 passed
ProductCatalogPageModel.test.ts: 17 passed
quantity-sync-chip.contract.test.ts: 1 passed
총 22 tests passed / 3 files passed
```

## 서버 API로 부족했던 것

- 서버 CRUD는 이미 있었지만 desktop API client가 없었다.
- 견적품목 행에 규칙을 조회·target 칩으로 복원하는 UI가 없었다.
- 기준 품목 source와 칩 target을 기존 API request shape으로 조립하는 FE 저장 경로가 없었다.

서버 endpoint나 migration은 추가하지 않았다.

## 변경 파일

- `clients/desktop/src/renderer/api/quantitySyncApi.ts` — 기존 CRUD API client와 DTO 타입
- `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx` — 기존 카테고리 셀에 칩 선택·삭제·저장 UI, 규칙 조회/저장 배선
- `clients/desktop/src/renderer/routes/quantity-sync-chip.contract.test.ts` — RED-A/GREEN 계약 테스트
- `docs/dev-reports/2026-08-09-896-quantity-sync-chip-ui.md` — 라운드 보고

## 검증 및 못 한 것

- 통과: 관련 desktop Vitest 22/22, `git diff --check`
- 실패/환경 차단: `npx tsc -p tsconfig.web.json --noEmit`
  - 기존 환경에 `@samhan/design-system/dist/index.d.ts`가 없어 다수 파일의 모듈 해석이 시작 단계에서 실패했다.
- 못 한 것: 실제 로그인 GUI QA, 서버에 UI로 생성한 규칙의 새로고침 확인, estimate-app/order-app 양쪽 발화와 금액 전후 표본, Playwright 캡처

