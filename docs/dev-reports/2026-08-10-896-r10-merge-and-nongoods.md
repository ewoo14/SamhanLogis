# PR #1126 R10 fix — main 병합 및 비상품 수량 동기화

검증 기준: `feat/896-qty-sync-chip-track`, 병합 전 `00f0f20ab`, `origin/main=bdc9b99b667db1ea1cc204529fe3de83ec3225f1` (`6c73926c7` 포함).

## ① 충돌 통합

| 축 | 통합 결과 | 확인 |
|---|---|---|
| 수량 동기화 축 | `EstimateItemsCatalogPage.tsx`의 규칙 CRUD·칩 UI·대상 선택을 보존 | 병합 충돌은 import 1곳뿐이었고 수량 동기화 코드는 유지 |
| 품목 상태 축 | `isSelectableProductStatus`와 `#1133` 상태 기반 후보 필터를 보존 | 단종·미판매 제외, 품절 후보 표시·수량 잠금 경로 유지 |
| goodsType 축 | `GOODS/NON_GOODS`와 가격 입력 규칙을 보존하고 provider 동기화 보강 | 일반 품목 수량 보존, 비상품 가격 입력 시 수량 1 |

충돌 파일은 `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx` 하나였습니다. `#1133`의 상태 import/filter와 이 PR의 quantity-sync import를 병합했습니다. `#1133`의 나머지 3개 겹침 파일은 자동 병합됐습니다.

`clients/web/estimate-app/views/index.ejs`의 `recomputeHomeDerived`는 조기 return 없이 레거시 계산을 모두 수행한 뒤 `serverOwnedTargets`에 든 모델만 서버 규칙 값으로 덮는 R6 구조를 유지합니다(현재 8401–8455 부근). 따라서 판넬·유연호스·분기관·발통·리모컨 레거시 계산을 제거하지 않았습니다.

## ② 비상품 원인 확정

### fix 전 RED 원문

R9 실 라이브 원문:

```text
실 견적 작성 화면에서 '운임'(goodsType=NON_GOODS)을 선택
수량을 7로 두고 납품가 12,345원 입력·blur
⟹ 수량 7 그대로. 1이 되어야 함.
```

원 구현에는 비상품 계산 자체가 있었습니다(`estimateLineModel.ts:8-14`, `EstimateFormPage.tsx:1254-1270`). 그러나 가격 입력의 `CollaborativeSlipInput`은 사용자 입력 시 provider에 `unitPrice`만 기록했고(`EstimateFormPage.tsx`의 가격 필드), `coeditLinesToDraftLines`는 provider의 기존 `quantity=7`을 다시 읽었습니다. 결과적으로 로컬에서 계산한 `1`이 공동편집 provider 재구성에서 `7`로 덮였습니다. 이는 `#1133` 병합에서 빠진 것이 아니며, 수량 동기화 배선이 가격 핸들러의 결과를 덮은 결함입니다.

TDD RED 원문:

```text
1 failed
resolvePriceInputQuantitySync is not a function
```

### fix

- `resolvePriceInputQuantitySync`를 추가해 계산 결과와 provider 동기화 필요 여부를 하나의 계약으로 만들었습니다.
- 사용자 가격 입력 시 비상품 수량을 local state와 provider 양쪽에 `1`로 기록합니다(`EstimateFormPage.tsx:1257-1285`).
- 원격 가격 동기화에도 같은 비상품 규칙을 적용합니다(`EstimateFormPage.tsx:2337-2340`).
- 일반 품목은 기존 수량을 그대로 반환합니다.

## RED 결과와 검증

- fix 전 RED: 위 helper 미구현으로 1 failed / 2 passed.
- fix 후 `npm test -- --run src/renderer/routes/estimateLineModel.test.ts`: **3 tests passed**.
- `npm run typecheck`: TypeScript node/web 및 real-QA scope **통과**.
- 실 라이브 Playwright: **1 passed**.

실 라이브 시나리오:

1. 실제 API 로그인 후 `운임`을 선택한다.
2. 수량을 `7`로 입력하고 캡처한다.
3. 납품가 `12,345`를 입력·blur한다.
4. 수량이 `1`인지 assertion 한다.

캡처:

- [fix 전 상태 — 수량 7](../qa/2026-08-10-896-r10/01-nongoods-before-price-quantity-7.png)
- [fix 후 동작 — 수량 1](../qa/2026-08-10-896-r10/02-nongoods-after-price-quantity-1.png)

실 API의 `운임` 응답에서 `goodsType=NON_GOODS`를 확인했습니다. 공유 DB에 견적을 저장하지 않았습니다.

## 신규 파일 목록

이번 R10에서 생성한 파일:

- `clients/desktop/playwright/896-r10-nongoods-real-qa/896-r10-nongoods-real-qa.spec.ts`
- `clients/desktop/playwright/896-r10-nongoods-real-qa/playwright.config.ts`
- `docs/qa/2026-08-10-896-r10/01-nongoods-before-price-quantity-7.png`
- `docs/qa/2026-08-10-896-r10/02-nongoods-after-price-quantity-1.png`
- 본 보고서

`origin/main`에서 함께 들어온 `#1133` 파일들은 병합 유입 파일이며 R10 신규 생성물로 세지 않았습니다.

## 못 한 것 / 범위 제외

- 리모컨 중복, 유연호스 제외·I형, 판넬 옵션 무시는 지시대로 손대지 않았습니다.
- 규칙 0건 리모컨 선재 누적, 주문서 규칙 소비 경로·옵션 평가기도 손대지 않았습니다.
- `OUT_OF_STOCK` 500은 관찰만 했습니다.
- 캡처 실행 중 잘못 생성된 `clients/desktop/docs/qa/...` PNG 2장은 올바른 `docs/qa/2026-08-10-896-r10/`로 회수했고 잘못된 경로에는 남기지 않았습니다.
