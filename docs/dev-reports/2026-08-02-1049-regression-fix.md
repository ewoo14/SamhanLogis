# PR #1050 / #1049 Playwright 회귀 수정 보고서

## 조사 기록

- 저장소 구조 확인: 실패 스펙은 `clients/desktop/playwright/product-catalog/product-catalog.spec.ts`, 대상 구현은 `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx`에 있다. 이 작업은 데스크톱 mock Playwright 경로만 대상으로 한다.
- 최초 지정 명령(`npx playwright test ... -g "시나리오 0b"`)은 종료 코드 1만 반환하고 표준 출력이 없어 실패 locator 원문을 확보하지 못했다. 공유 서버/프로세스 상태를 변경하지 않고 별도 Vite 포트로 재현하기로 했다.
- 별도 mock Vite(`127.0.0.1:5175`)에서 실패를 재현했다. 실제 `toBeVisible` 대상은 `locator('li[role="option"]').filter({ hasText: 'AJ036NCH3CH' }).first()`이며, 5초 동안 해당 요소가 생성되지 않았다(스펙 240행).
- ② 판정: 구현 회귀다. 스펙은 `기초품목 선택 추가` 정상 경로를 수행하고, 새 멀티셀렉트 모달에서 검색 결과를 선택한 뒤 `현재 카테고리에 추가`를 누르는 계약이다. 검색 결과 자체가 사라져 기초품목 추가가 불가능하므로 옛 UI 단언 드리프트(①)가 아니라 기존 기능 차단이다. `노출 품목 관리` 단언은 이 실패 이전에 통과했다.
