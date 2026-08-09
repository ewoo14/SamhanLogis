# PR #1129 R4 — 선재 HIGH 흡수 + 끊긴 품목 경고

## ① 선재 HIGH: SlipLockSeeder 범위

- 시더 전표 날짜 근거: `services/slip-service/src/main/java/com/samhanair/logis/slip/seed/SlipSeeder.java:342`, `:351`, `:381`에서 CONFIRMED spec은 OUTBOUND 4건(`idx 45~48`)과 INBOUND 1건(`idx 97`)이다.
- 날짜 계산 근거: `SlipSeeder.java:518~521`의 `2026-01-01.plusDays(idx % 129)`에 따라 `2026-02-15`, `2026-02-16`, `2026-02-17`, `2026-02-18`, `2026-04-08`이다.
- 맞춘 방식: `SlipSeeder.confirmedSeedDates()`(`:528~533`)가 실제 `buildSpecs()`에서 CONFIRMED 날짜를 파생하고, `SlipLockSeeder`(`:52~56`)가 그 집합의 최소/최대 날짜를 사용한다. 별도 날짜 상수를 복제하지 않는다.
- 범위: `2026-02-15 ~ 2026-04-08`. 조회 조건은 기존과 동일하게 `CONFIRMED + lockFlag=false + isDeleted=false`이다.
- 잠기는 건수: fresh seed의 CONFIRMED 전표 **5건**. `SlipLockSeederTest`가 5개 target을 받아 5개 모두 `lock()` 호출되는 것을 고정한다. 범위 밖 전표를 대상으로 추가 조회하지 않는다.

## ② 끊긴 품목 화면 경고

- 판정: 전표 상세의 라인 `productId`를 중복 제거해 기존 `POST /api/products/lookup`으로 벌크 조회한다. 성공 응답에 없는 ID만 삭제 후보로 보고, 요청 실패 chunk는 `unresolvedProductIds`로 분리해 삭제로 오인하지 않는다.
- 성능: 라인별 호출이 아니라 `productApi.ts:139`의 벌크 호출이며, product-service 계약 상한 100개에 맞춘 chunk 단위다. 상세 화면은 전표당 이 조회를 1회 query로 수행한다.
- 표시: `SlipDetailPage.tsx:4135~4138`에 UUID 없이 `이 전표는 삭제된 품목을 포함합니다. 저장된 품목명은 유지됩니다.` 경고를 표시한다.
- 삭제 허용: 품목 삭제 API/권한을 차단하거나 변경하지 않았다.
- 오탐 0건: 정상 전표의 모든 품목이 bulk lookup에 있으면 `findMissingProductIds` 결과가 `[]`이고, lookup 실패도 경고하지 않는다. `productLinkWarning.test.ts`에서 정상 전표 0건 및 실패 조회 0건을 검증한다.

## 양방향 RED → 동시 GREEN 실행 원문

RED:

```text
npx vitest run src/renderer/utils/productLinkWarning.test.ts
Error: Failed to load url ./productLinkWarning ... Does the file exist?
```

GREEN:

```text
./gradlew :services:slip-service:test --tests '*Seeder*' --rerun-tasks
BUILD SUCCESSFUL in 52s
18 actionable tasks: 18 executed

npx vitest run src/renderer/utils/productLinkWarning.test.ts
✓ src/renderer/utils/productLinkWarning.test.ts (3 tests)
Test Files 1 passed (1)
Tests 3 passed (3)
```

추가로 `./gradlew :services:slip-service:test --tests '*SlipLockSeederTest*' --rerun-tasks`도 종료코드 0으로 통과했다.

## 새로 보인 표면 목록만

- 전체 웹 타입체크 기존 오류: `clients/desktop/src/renderer/routes/BankTransactionPage.tsx:424`의 `autoSelectSingleResult`, `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx:711`의 `resultSelectionMode`. 이번 R4에서 수정하지 않았다.
- `lookupProductPresence`는 이번 경고 표면에 필요한 신규 API helper이며, 네트워크 장애 시 미확정으로 보수 처리한다.

## 신규 파일

- `services/slip-service/src/test/java/com/samhanair/logis/slip/seed/SlipLockSeederTest.java`
- `clients/desktop/src/renderer/utils/productLinkWarning.ts`
- `clients/desktop/src/renderer/utils/productLinkWarning.test.ts`
- `docs/dev-reports/2026-08-09-1051-r4-lockrange-and-warning.md`

실 DB INSERT/UPDATE/DELETE, Docker 재배포, 기존 끊긴 행 및 QA 잔재 수정, `docker-compose.prod.yml` 변경, commit/push는 수행하지 않았다.
