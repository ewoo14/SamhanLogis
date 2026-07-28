# #896 슬3 기준일 정합 구현 계획

## 목표

라이브 GAS의 기준일 `2026-07-01`을 네 카테고리에 반영하되, 관리 화면에서 사용자가 수정한 행은 보존한다. 기존 V22/V23 및 편집 기능은 변경하지 않는다.

## 구현 경계

1. `V26` 신규 Flyway migration을 추가한다.
   - 대상: `commercialMulti`, `homemulti`, `oldProducts`, `singleSets`
   - 조건: `created_by = 'V22_MIGRATION'`
   - 변경: `effective_date = DATE '2026-07-01'`
2. fresh PostgreSQL Testcontainers에서 V1~V25를 먼저 적용하고, 사용자 수정 행을 재현한 다음 V26을 적용하는 migration IT를 추가한다.
3. RED에서 기존 네 행의 낡은 날짜와 사용자 수정 행 보존 실패를 확인하고, V26 적용 후 네 행 정합 및 S-2를 GREEN으로 확인한다.
4. 기존 `EstimatePricingConfigPage` price schedule 테스트를 실행해 S-4를 확인한다.
5. dev-report에 결정, RED/GREEN 원문, fresh Postgres 적용, 회귀 및 개별 numstat을 기록한다.

## 검증 명령

```text
./gradlew :services:product-service:test --tests '*PriceChangeScheduleMigrationIT'
cd clients/web/estimate-app && npm test -- --runInBand test/EstimatePricingConfigPage.priceSchedule.test.tsx test/EstimatePricingConfigPage.test.ts
git diff --check
git diff --numstat -- <each changed file>
```

