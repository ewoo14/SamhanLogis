# #1051 슬라이스 C — synthetic product UUID 생성 차단

## 결론

정찰 보고서의 ABSENT 303행은 생성 경로가 두 개였다.

| 경로 | ABSENT | 코드 근거 |
|---|---:|---|
| SlipSeeder | 300행 | `services/slip-service/src/main/java/com/samhanair/logis/slip/seed/SlipSeeder.java:401`의 100개 시드 전표 라인 생성 루프가 product master 조회 없이 결정적 UUID를 직접 만들었다. 정찰 표본 `TEST-MODEL-*` 300행과 일치한다. |
| 주문전환 fixture | 3행 | `clients/desktop/src/renderer/api/mock.ts:12383`, `:12415`의 두 `poLines` 분기가 catalog lookup 없이 `p-aj040`를 직접 넣었다. 정찰의 `2026/05/30-1~-3`, `Product A` 3행 provenance와 일치한다. |

DB FK는 사용할 수 없다. `slip_db`와 `product_db`가 별도 DB이므로 이번 계약 지점은 slip-service의 product-service 내부 API 벌크 조회다.

## 변경 내용

1. `SlipSeeder`에 `ProductClient`를 주입했다.
2. 시드 저장 전에 `HvacSeedProductCatalog`의 100개 deterministic product ID를 한 번에 조회한다.
3. 응답에 100개 활성 master가 모두 없으면 `IllegalStateException`으로 즉시 중단하며, 전표 저장은 시작하지 않는다. 누락 시 “product-service seed를 먼저 완료”해야 한다고 명시한다.
4. 시드 라인의 `productName/modelName` snapshot은 synthetic 문자열이 아니라 product-service 응답 master에서 채운다.
5. 주문전환 fixture의 `p-aj040`는 실제 dev seed 품목 UUID `2e40fa30-10b2-3a9b-a99c-570ac92287ad`로 교체했다. 화면 전용 다른 mock 데이터의 `p-aj040`는 이번 저장 경로가 아니므로 보존했다.

기존 `SlipService.create`/`EstimateService.create/update`의 벌크 검증과 `addLine`의 `requireExists`는 이미 존재하므로 변경하지 않았다. 기존 행, 삭제 정책, 조회 snapshot 관측성(D), 관리자 삭제 정책(E)도 변경하지 않았다.

## RED-A / RED-B 동시 검증

신규 테스트: `services/slip-service/src/test/java/com/samhanair/logis/slip/seed/SlipSeederProductIntegrityTest.java`

- RED-A: product lookup가 빈 목록이면 `IllegalStateException`이 발생하고 `slipRepository.save` 호출은 0회.
- RED-B: 정상 100개 catalog를 반환하면 100개 전표를 모두 저장하고 각 전표에 라인이 남는다.
- 실행 결과 XML 원문 요약: `tests="2" skipped="0" failures="0" errors="0"`.
- 정상 데이터가 막힌 건수: **0건**. 정상 시더 로그 원문: `완료 — 신규 100건, skip 0건 (총 100건)`.
- 누락 데이터가 저장된 건수: **0건**. 누락 테스트에서 `save`는 0회였다.

## (a) 새 조합 전수 실행 결과

| 조합 | 결과 |
|---|---|
| 100개 master 전부 ACTIVE | GREEN — 100건 생성 |
| lookup 응답 0개 | GREEN — 명확한 중단, 0건 저장 |
| lookup 응답 일부 누락 | 동일한 크기 검증으로 중단하도록 구현 |
| lookup 응답에 SOFT_DELETED/비활성 상태 포함 | ACTIVE만 집계하므로 중단 |
| duplicate ID 응답 | map 크기/expected ID 집합 검증으로 중단 |
| product-service 4xx/5xx/네트워크 실패 | 기존 `ProductClient.lookup` 예외 전파, 시드 저장 전 중단 |
| 정상 사용자 전표/견적 생성 | 기존 벌크 계약 유지, 이번 테스트에서 0건 차단 |
| 기존 끊긴 행 조회/삭제 | 코드 변경 없음, 데이터 변경 없음 |

## (b) 식별자 grep 전수

제거한 저장 경로 식별자 `p-aj040`를 전수 검색했다.

- 주문전환 저장 fixture 경로: `mock.ts:12383`, `:12415` — 제거 완료.
- 잔여 `p-aj040`: `mock.ts:1997`, `:2050`, `:5361`, `:5401`, `:5403`, `:12745`, `:15580`, `:15596`, `:17110` — 화면/재고/전표 상세 mock 전용 경로로 보존했다.
- `SlipSeeder`의 product UUID 생성은 공통 `HvacSeedProductCatalog`를 사용하며 product master 벌크 선행 검증 뒤에만 실행된다.
- `git diff --check` 통과.

## (c) 함께 실행한 테스트

| 명령 | 결과 |
|---|---|
| `./gradlew :services:slip-service:test --tests "*SlipSeederProductIntegrityTest" --rerun-tasks` | GREEN, 2 tests, failures 0 |
| `./gradlew :services:slip-service:test --rerun-tasks --no-daemon` | 5분 제한 초과, 테스트 요약 미출력. 성공으로 간주하지 않음. 첫 실행은 120초 제한으로 종료됐고, 재실행은 잔여 Gradle worker의 `output.bin` lock으로 한 번 실패한 뒤 worker 정리 후 재실행했으나 5분 내 완료하지 못함. |
| `clients/web/design-system`: `npm ci`, `npm run build` | GREEN. 로컬 dist 전제 생성. |
| `clients/desktop`: `npm run typecheck` | 기존 오류 2건으로 실패: `BankTransactionPage.tsx:424`의 `autoSelectSingleResult`, `MergeConvertDialog.tsx:711`의 `resultSelectionMode`. 이번 diff와 무관. |
| `clients/desktop`: `npx playwright test playwright/phase-2-6a-order-convert/phase-2-6a-order-convert.spec.ts --reporter=line` | 180초 제한 초과, assertion 요약 미출력. runner가 종료 중 `EPIPE`를 냈으며 GREEN으로 간주하지 않음. |

## 신규 파일

- `docs/dev-reports/2026-08-09-1051-slice-c-block-synthetic-uuid.md`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/seed/SlipSeederProductIntegrityTest.java`

## 금지 작업 확인

실 DB INSERT/UPDATE/DELETE, Docker 재배포, 기존 끊긴 행 수정·삭제, 추가 git commit/push는 수행하지 않았다. 시작 조건에 따라 `origin/main` 45커밋을 병합하는 merge commit은 생성됐다.
