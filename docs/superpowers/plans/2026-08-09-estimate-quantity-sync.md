# 종합견적서 수량 동기화 전환 구현 계획

> **이번 세션 실행 방식:** inline 실행. 커밋·push는 하지 않는다.

**목표:** 종합견적서 홈멀티 파생 수량을 `HOME_MULTI` 서버 규칙 기반으로 계산하고, 조회 실패 시 기존 계산과 금액을 보존한다.

**구조:** 순수 TypeScript evaluator가 규칙의 source/target graph를 검증·계산한다. estimate-app bootstrap이 product-service의 내부 규칙 목록을 주입하고, EJS의 `recomputeHomeDerived`는 유효한 규칙이 있을 때만 evaluator 결과를 적용한다. legacy 계산은 fallback으로 남겨 조회 장애와 불완전한 규칙에서 화면을 사용할 수 있게 한다.

**검증:** estimate-app Jest 회귀, 규칙 evaluator 테스트, 기존 order-app quantity-sync 테스트, desktop slipLineDraft 테스트를 관련 범위로 실행한다.

## 작업

1. RED-A 원문과 실패하는 evaluator 계약 테스트 작성·실패 확인.
2. order-app evaluator 패턴을 estimate-app `src/quantitySync.ts`로 이식하고 테스트 GREEN.
3. estimate-app 서버 bootstrap에 `HOME_MULTI` 규칙을 안전하게 조회·주입하고 조회 실패를 빈 목록으로 처리.
4. EJS에서 규칙 상태를 초기화하고 `recomputeHomeDerived`에 규칙 적용 경계를 연결하되 legacy fallback과 가격 계산을 보존.
5. desktop `setOptions` 의존을 변경하지 않고 테스트로 판단을 고정.
6. RED-A~D 원문, 표본, 미판정 항목을 개발 보고서에 기록하고 관련 테스트를 fresh 실행.
