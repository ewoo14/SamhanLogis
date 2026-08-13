# #896 종합견적서 수량 동기화 구현 라운드 보고

일자: 2026-08-09  
브랜치: `feat/896-qty-sync-chip-track`  
HEAD: `8632458f5` 기준, commit/push 없음

## 결론

estimate-app에 서버 규칙 evaluator·bootstrap 주입·legacy fallback 경계를 구현했지만, 현재 실행 DB에서 활성 `quantity_sync_rule`이 0건으로 측정되어 실제 서버 규칙 기반 GREEN 및 전후 금액 표본 판정을 중단했다. 규칙을 임의로 시드하거나 전제를 수정하지 않았다.

## RED-A 원문

변경 전 `clients/web/estimate-app/views/index.ejs:8333`의 `recomputeHomeDerived`는 다음 하드코딩 경로였다.

```text
실내기 품명 정규식 → n1w/n4w/c360 집계
→ HOSE_1W/HOSE_4W/HOSE_I_* 수량 설정
→ recomputeHomeBranches()
→ recomputeHomeRemotes()
→ recomputeFootAll()
→ recomputeHomePanels()
```

구체적으로 `/(실내기|벽걸이)/`, `1-way`, `4-way`, `360` 정규식으로 source를 집계하고, `HOME_MANUAL_*` 잠금만 예외로 두었다. 이 원문은 기존 `legacy-quantity-golden`으로 재현했으며 H-01~H-08 및 옵션 갈래가 기존 수량으로 동작했다.

## 구현한 경계

- `public/quantitySync.js`가 `HOME_MULTI` 규칙의 source/target, factor/multiplier, `SUM`, `ZERO`, `FLOOR`, `ADD/REPLACE`를 평가한다.
- `lib/db-catalog.js`가 product-service internal `/quantity-sync-rules?estimateCategory=HOME_MULTI`를 조회한다.
- `lib/code.js`가 bootstrap에 규칙을 주입하고 조회 실패 시 `[]`로 둔다.
- `ProductInternalController`에 internal 규칙 read endpoint를 추가했다.
- `index.ejs:8360`은 유효한 서버 evaluator 결과가 있을 때 target 수량을 적용하고, 규칙 목록이 비었거나 graph/catalog가 불완전하면 기존 계산을 fallback한다.
- 금액 계산 함수와 단가/수동잠금 경로는 변경하지 않았다.

## RED-B — 전후 수량·금액

판정 불가.

실측 명령:

```text
docker exec samhan-postgres psql -U samhan -d product_db -At -F '|'
  -c "select rule_key,estimate_category,enabled,aggregation,inactive_behavior,conflict_policy,condition_json from quantity_sync_rule where is_deleted=false order by priority,rule_key;"
```

결과: 행 0건. 따라서 실 서버 규칙으로 홈멀티 표본을 만들 수 없고, 전환 전후 같은 입력의 같은 수량·같은 금액을 판정할 수 없다. 기존 실제 catalog-shaped golden은 가격 snapshot이 없어 금액은 `null`이며, 금액 회귀의 증거로 사용하지 않았다.

## RED-C — order-app 회귀

order-app은 수정하지 않았다. 관련 테스트는 **42/42 통과**했다.

```text
src/__tests__/quantitySyncS03.test.ts
src/__tests__/quantitySyncS03Integration.test.ts
src/__tests__/samhanApi.test.ts
```

## RED-D — 규칙 조회 실패

evaluator 단위 테스트에서 `null`/비활성 규칙은 `null`을 반환하고, estimate-app은 기존 계산으로 fallback한다. estimate-app 전체 테스트 **14 suites / 202 tests 통과**로 기존 fallback 수량·금액 경계를 확인했다. 단, 실제 product-service 장애를 띄운 live UI 판정은 이번 DB 전제 불일치로 하지 않았다.

## #1114 실측 및 판단

`slipLineDraft.ts:39,82-87,127`의 `setOptions`는 `isSetOptionsEqual`을 통해 `isLineContentEqual`에 실제 사용된다. 테스트 `slipLineDraft.test.ts:202-222`는 `remoteExcluded`, `materialIncluded`, `remoteOption` 변경을 자동증식 차이로 판정한다.

따라서 `setOptions`를 지우면 desktop의 현재 자동증식/내용 비교가 깨진다. 개발책임자 결정에 따른 desktop 옵션 배선 제거는 이번 라운드에 적용하지 않았고, 라벨만 바꾸는 미봉책도 하지 않았다. 직접 회귀 테스트는 **40/40 통과**했다.

## 검증 결과

- estimate-app Jest: **14 suites / 202 tests 통과**
- estimate-app typecheck: `typecheck OK: 17 JavaScript files`
- product-service `ProductInternalControllerTest`: Gradle `BUILD SUCCESSFUL`
- order-app quantity-sync 관련: **3 files / 42 tests 통과**
- desktop `slipLineDraft.test.ts`: **40 tests 통과**
- `git diff --check`: 통과
- 일반 desktop `npm test`: 기존 pretest 환경 가드에서 중단됨. `design-system/dist/index.d.ts`, `desktop/out/main/index.js`가 없다는 사유이며, Vitest 본체는 직접 실행해 40/40 확인했다.

## 신규 파일

- `clients/web/estimate-app/public/quantitySync.js`
- `clients/web/estimate-app/src/quantitySync.ts`
- `clients/web/estimate-app/test/quantity-sync.test.js`
- `clients/web/estimate-app/test/quantity-sync-bootstrap.test.js`
- `docs/superpowers/plans/2026-08-09-estimate-quantity-sync.md`
- 본 보고서

## 기존 파일 변경

- `clients/web/estimate-app/lib/code.js`
- `clients/web/estimate-app/lib/db-catalog.js`
- `clients/web/estimate-app/views/index.ejs`
- `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductInternalController.java`

## 못 한 것 / 다음 판정 조건

- 현재 DB에 HOME_MULTI 규칙이 0건이므로 RED-B와 실제 RED-A→GREEN UI 표본은 판정하지 못했다.
- 규칙 seed가 반영된 DB 또는 CI fixture가 제공되면 H-01 표본(실내기 1대)을 source로 지정해 판넬·리모컨·유연호스 target 수량과 각 단가×수량 소계를 전후 비교해야 한다.
- `tools/legacy-gas/**`는 변경하지 않았다.
