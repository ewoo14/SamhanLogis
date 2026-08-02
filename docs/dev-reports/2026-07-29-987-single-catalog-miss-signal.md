# PR #987 싱글중대형 카탈로그 누락 신호 보완

## 1. RED 원문

수정 전 정본에 4계열 전수 회귀 울타리를 추가하고 실행한 원문이다.

```text
> @samhan/order-app@0.4.0 test
> vitest run src/__tests__/catalogMissingSignal.test.ts


 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/t10-987/clients/web/order-app

 ❯ src/__tests__/catalogMissingSignal.test.ts (11 tests | 4 failed) 102ms
   × 싱글중대형 파생 카탈로그 누락 신호 > 실 bootstrap fixture에서 { kind: '원형 발통', sourceId: '360 CST UV0', targetModel: '발통세트', base: true }가 빠지면 금액 누락 경고를 남긴다 15ms
     → expected true to be false // Object.is equality
   × 싱글중대형 파생 카탈로그 누락 신호 > 실 bootstrap fixture에서 { kind: '일자발', sourceId: '냉난방 프리미엄 스탠드98', targetModel: 'SI-AL700a', base: true }가 빠지면 금액 누락 경고를 남긴다 8ms
     → expected true to be false // Object.is equality
   × 싱글중대형 파생 카탈로그 누락 신호 > 실 bootstrap fixture에서 { kind: '유선리모컨 키트', sourceId: '무풍 1way 냉난방47', targetModel: 'AIM-A01N', remote: '유선리모컨' }가 빠지면 금액 누락 경고를 남긴다 9ms
     → expected true to be false // Object.is equality
   × 싱글중대형 파생 카탈로그 누락 신호 > 실 bootstrap fixture에서 { kind: '실링용 드레인펌프', sourceId: '싱글 실링61', targetModel: 'ADP-F075SP' }가 빠지면 금액 누락 경고를 남긴다 11ms
     → expected true to be false // Object.is equality

 Test Files  1 failed (1)
      Tests  4 failed | 7 passed (11)
   Start at  16:12:32
   Duration  1.09s (transform 52ms, setup 0ms, collect 45ms, tests 102ms, environment 0ms, prepare 221ms)

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
```

실패 지점은 `catalogMissingSignal.test.ts:401`의 `expect(missing.hidden).toBe(false)`이며, 네 계열 모두 누락 상태에서 경고 영역이 계속 `hidden=true`였다.

## 2. 무엇을 고쳤는지와 선택 이유

- `clients/web/order-app/index.html`의 싱글중대형 카드에 `singleCatalogWarnings`를 추가했다. 홈멀티·상업멀티와 같은 `.catalog-warning`, `role="alert"`, `aria-live="polite"` 계약을 사용한다.
- `setSingleDerivedQty_()`를 추가해 네 자동 파생 target을 한 경계로 처리한다. 실제 target ID가 있으면 기존처럼 수량을 반영하고, 없으면 정확한 fallback 모델명과 파생 사유만 `SINGLE_CATALOG_MISSING_MODELS`에 기록한다. 없는 행을 `singleQty`에 넣지 않으므로 누락 품목은 합계·선택 건수에 들어가지 않는다.
- `recomputeSingleDerived()`가 매번 누락 기록을 초기화한 뒤 발통·일자발 계산과 유선리모컨·실링펌프 계산을 모두 실행하고, 마지막에 한 번 렌더링한다. 이 경계를 초기 계산·source 입력·옵션 변경·snapshot 복원에 연결해 여러 계열의 동시 누락과 이전 경고 잔류를 막았다.
- 공통 legacy quantity 추출 하네스와 SOL2 싱글 잠금 하네스에도 새 helper 추출을 연결했다. 이는 계산식 변경이 아니라 정본 helper를 기존 테스트 VM에 주입하기 위한 테스트 경계 보정이다.

홈멀티·상업멀티가 이미 사용하는 `renderCatalogWarnings_()`를 재사용한 이유는 카테고리별 문구 계약을 갈라놓지 않기 위해서다. 공통 문구가 모델명과 함께 `누락된 품목은 주문 금액에 반영되지 않았습니다`를 포함하므로 사용자는 금액 영향까지 알 수 있다.

## 3. 4계열 전수 회귀 울타리

테스트는 `clients/web/order-app/src/__tests__/fixtures/singleSetsBootstrap.fixture.json`의 실 bootstrap `singleSets` subset만 사용한다. 전체 원본 행 수는 `originalSingleSetRows: 288`로 확인하고, findings에 실측된 원천·target 행의 `id`·`model`·`name`을 그대로 보존했다.

테스트 코드의 네 전수 case 선언:

```ts
const cases = [
  { kind: '원형 발통', sourceId: '360 CST UV0', targetModel: '발통세트', base: true },
  { kind: '일자발', sourceId: '냉난방 프리미엄 스탠드98', targetModel: 'SI-AL700a', base: true },
  { kind: '유선리모컨 키트', sourceId: '무풍 1way 냉난방47', targetModel: 'AIM-A01N', remote: '유선리모컨' },
  { kind: '실링용 드레인펌프', sourceId: '싱글 실링61', targetModel: 'ADP-F075SP' },
];
```

각 case는 정상 카탈로그에서 경고 없음·파생 target 수량 1을 먼저 단언한다.

```ts
const full = runSingleRecompute(fixture.rows, scenario.sourceId, target.id, scenario.targetModel, scenario);
expect(full.hidden).toBe(true);
expect(full.textContent).toBe('');
expect(full.targetQuantity).toBe(1);
```

그 다음 같은 실 rows에서 해당 target 한 행만 제거하고, 네 계열 모두 다음을 단언한다.

```ts
const catalogWithoutDerived = fixture.rows.filter((row) => row.model !== scenario.targetModel);
expect(catalogWithoutDerived).toHaveLength(7);
const missing = runSingleRecompute(catalogWithoutDerived, scenario.sourceId, target.id, scenario.targetModel, scenario);

expect(missing.hidden).toBe(false);
expect(`${missing.textContent}${missing.innerHTML}`).toContain(scenario.targetModel);
expect(`${missing.textContent}${missing.innerHTML}`).toContain('주문 금액에 반영되지 않았습니다');
expect(missing.targetQuantity).toBe(0);
```

즉 원형 발통은 `발통세트`, 일자발은 `SI-AL700a`, 유선리모컨 키트는 `AIM-A01N`, 실링용 드레인펌프는 `ADP-F075SP`의 모델명 신호·금액 미반영 문구·누락 target 수량 0을 각각 확인한다. 별도로 `id="singleCatalogWarnings"`가 정확히 1개인지도 단언한다.

## 4. GREEN 출력 원문

실행 시간처럼 매번 달라지는 줄은 제외했다.

싱글 누락 신호 targeted test:

```text
> @samhan/order-app@0.4.0 test
> vitest run src/__tests__/catalogMissingSignal.test.ts

 ✓ src/__tests__/catalogMissingSignal.test.ts (12 tests)

 Test Files  1 passed (1)
      Tests  12 passed (12)
```

order-app Vitest 전체:

```text
> @samhan/order-app@0.4.0 test
> vitest run

 Test Files  17 passed (17)
      Tests  191 passed (191)
```

estimate-app Jest 전체:

```text
> @samhan/estimate-app@2.0.0 test
> jest --passWithNoTests --runInBand

Test Suites: 9 passed, 9 total
Tests:       182 passed, 182 total
Snapshots:   0 total
Ran all test suites.
```

## 5. 이 라운드가 보지 않은 것

- `services/**` 백엔드, Docker 기동·재빌드, DB 접근과 실제 catalog 행 변경
- `clients/desktop/**`, `tools/legacy-gas/**`, 모노레포 전체 스위트와 원격 CI 로그
- 인증을 통과한 실제 주문 화면에서의 브라우저 클릭·픽셀·반응형·접근성·인쇄 검증
- 실제 운영 API에서 target 행을 삭제·비활성화한 E2E, 주문 저장·전송·백엔드 수신 금액
- estimate-app의 인증 후 실제 GUI. 이번 라운드에서는 요청된 Jest 전체만 실행했다.
- 수정 후 별도 mutation 주입 실행과 실제 운영 카탈로그 가격 합계의 숫자 대조
