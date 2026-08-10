# PR #1133 R11 fix — 이름 유일성 복구와 상태 fail-closed

## 판정

R11 수정은 코드·대상 테스트·라이브 지연/실패 경로에서 의도대로 동작한다.

- `reactivate()`는 기존 `assertNameAvailable()`을 재사용한다. 이름이 같은 자기 자신은 제외하고, ACTIVE 중복 이름은 409가 된다.
- 저장 견적 라인의 수량은 품목 상태가 `ACTIVE`로 확정된 경우에만 편집 가능하다. 조회 전·부분 응답·조회 실패는 `status=null`로 낮춰 라인만 잠근다.
- 상태 effect는 협업 provider와 분리된 상태로 유지했다. 화면 전체 잠금이나 협업 동기화 변경은 없다.

## Fix 전 RED 원문

### ① 이름 검사

명령:

```text
.\gradlew.bat :services:product-service:test --tests 'com.samhanair.logis.product.it.ProductCatalogControllerIT' --no-daemon
```

```text
ProductCatalogControllerIT > POST_products_단종된_이름은_재사용할_수_있다() FAILED
    java.lang.AssertionError at ProductCatalogControllerIT.java:143
39 tests completed, 1 failed
BUILD FAILED
```

기존 IT는 수정하지 않았다. 실패 당시 `reactivate`의 기대 HTTP 409, 실제 HTTP 204였다.

### ②·③ 상태 lookup

기존 프런트 테스트를 안전한 계약으로 먼저 바꾼 뒤 실행한 RED 원문:

```text
estimateLineStatus.test.ts (5 tests | 3 failed)
× 조회 실패 ... expected status null, received status ACTIVE
× 응답에 없는 품목 ... expected status null, received status ACTIVE
× 수량은 ... isQuantityEditable is not a function
```

R10 실측의 원문도 동일했다. lookup 지연 중 `10 → 13` 입력이 가능했고, 실패 시 `13`이 편집 가능했으며 badge/잠금이 없었다.

## ① 같은 규칙을 지나는지

공통 helper 하나를 사용한다.

- 부분 수정 경로: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:596-599`
  - 이름이 실제로 달라질 때만 `assertNameAvailable(req.name(), product.getId())`
- 공통 검사 본체: 같은 파일 `:639-653`
- reactivate 경로: 같은 파일 `:685-688`
  - `assertNameAvailable(product.getName(), product.getId())` 후 `product.reactivate()`

따라서 규칙을 복제하지 않았고, R8의 무조건 검사로 되돌리지 않았다. 이름 그대로 되살리기는 자기 자신을 제외하므로 통과하고, 다른 ACTIVE 품목과 중복되는 되살리기는 409가 된다.

## ② 늦은 상태 조회의 시간창

`clients/desktop/src/renderer/utils/estimateLineStatus.ts:12-14`의 `isQuantityEditable()`를 수량 입력의 mobile/desktop callback과 `readOnly`에 공통 적용했다.

```text
productId 없음       → 편집 가능(빈 신규 행)
productId + ACTIVE   → 편집 가능
productId + 그 외    → 해당 라인만 readOnly
```

상태 effect 자체는 `EstimateFormPage.tsx:909-925`에서 그대로 provider와 분리되어 있다. 따라서 조회를 기다리느라 협업 전체를 막지 않는다. 늦은 응답이 사용자 입력값을 덮는 병합도 하지 않는다.

## ③ lookup 실패 fail-closed

`estimateLineStatus.ts:20-27`에서 다음을 보장한다.

- lookup 성공이어도 응답에 없는 productId는 `status=null`
- 예외 시 productId가 있는 모든 라인을 `status=null`
- 두 경우 모두 `isQuantityEditable()`가 false이므로 수량 잠금 유지
- 화면에는 `상태 확인 중`을 표시

조용한 fail-open은 남아 있지 않다. 이 설계를 선택한 근거는 수량을 열어 주는 것이 데이터 훼손 방향이고, 상태 미확정은 보수적으로 입력을 차단해 재시도/확정 후에만 열 수 있기 때문이다.

## 라이브 QA

실행 스펙: `clients/desktop/playwright/1095-r11-real-qa/1095-r11-status-real-qa.spec.ts`

실제 product-service R11 JAR를 `127.0.0.1:28084`에 반영하고 health `UP` 확인 후, 단품 `AM080AXVHHH1`로 저장 견적 `2026/08/10-10`을 만들었다. 보고서·JSON·캡처에는 자격·UUID를 남기지 않았다.

- [01 active editable](../qa/2026-08-10-1095-r11/01-r11-active-editable.png)
- [02 status unknown locked](../qa/2026-08-10-1095-r11/02-r11-status-unknown-locked.png)
- [03 active unlocked](../qa/2026-08-10-1095-r11/03-r11-active-unlocked.png)
- [04 delayed lookup locked](../qa/2026-08-10-1095-r11/04-r11-late-status-locked.png)
- [05 failed lookup locked](../qa/2026-08-10-1095-r11/05-r11-status-lookup-failed-locked.png)
- [원문 evidence](../qa/2026-08-10-1095-r11/r11-evidence.json)

라이브 스펙 결과:

```text
1 passed (6.9s)
```

②는 lookup route를 지연시켜 도착 전 라인이 잠긴 상태를 캡처했고, ③은 lookup을 abort해 실패시킨 뒤에도 잠금과 안내가 유지되는 것을 캡처했다.

### R10 경로 및 제한

이번 라운드에는 Google Sheets write를 시도하지 않았다. 따라서 공유 시트의 공란을 `OUT_OF_STOCK`으로 바꾸는 R10의 native 상태 전환 자체는 재실행할 수 없었다. 대신 허용된 API 상태 전환 `DISCONTINUED → ACTIVE`로 같은 저장본의 현재 상태 재조회·잠금·해제를 확인했다. `OUT_OF_STOCK` badge 자체는 R10 캡처와 기존 실측을 보존하며, 새 라운드에서 허위로 PASS 처리하지 않는다.

R10의 협업 결과(끊김 0/3, 반영 404ms / 383ms / 395ms)는 provider 코드를 변경하지 않았고, 상태 effect도 분리 상태를 유지했다.

## 상태 분포 전후

라이브 API 원문(양쪽 동일):

```text
             before  after
ACTIVE          2984   2984
DISCONTINUED      83     83
NOT_FOR_SALE      14     14
OUT_OF_STOCK       3      3
```

R11 표본은 최종 `ACTIVE`, tags `{}`로 복구됐다. 신규 견적 표본 `2026/08/10-10`은 R11 검증 중 생성한 자체 표본이다.

## 검증 결과

- `ProductCatalogControllerIT`: 39 tests, BUILD SUCCESSFUL
- `ProductServiceTest`: BUILD SUCCESSFUL
- `estimateLineStatus.test.ts`: 5/5
- `EstimateFormPage.coedit.test.tsx`: 56/56
- 변경 범위 두 파일: 61/61
- `npm run typecheck`: 통과
- `node --test scripts/real-qa-scope.test.cjs`: 50/50
- `git diff --check`: 통과
- 라이브 R11 Playwright: 1 passed

전체 `npm test`는 다음 기존 환경/하네스 2건으로 실패했으며 R11 변경 파일과 무관하다.

```text
build-output-cjs-interop.test.ts
Electron failed to install correctly, please delete node_modules/electron and try installing again

harness-false-green-guard.test.ts
ENOENT ... clients/desktop/scripts/.s20-junction-.../target/writer.mjs
```

## 변경·신규 파일

변경:

- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/service/ProductServiceTest.java`
- `clients/desktop/src/renderer/utils/estimateLineStatus.ts`
- `clients/desktop/src/renderer/utils/estimateLineStatus.test.ts`
- `clients/desktop/src/renderer/routes/EstimateFormPage.tsx`
- `clients/desktop/src/renderer/routes/EstimateFormPage.coedit.test.tsx`

기존 사용자 변경으로 stage하지 않은 파일:

- `services/inventory-service/src/test/java/com/samhanair/logis/inventory/it/SafetyStockControllerIT.java`

신규:

- `clients/desktop/playwright/1095-r11-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1095-r11-real-qa/1095-r11-status-real-qa.spec.ts`
- `docs/qa/2026-08-10-1095-r11/` 아래 PNG 5개와 `r11-evidence.json`
- 본 보고서

스펙/config만 real-QA 추적 집합 검증을 위해 stage했으며 commit/push는 하지 않았다.

## 하지 않은 것

- Google Sheets write: 권한 문제 및 개발책임자 지시로 시도하지 않음
- 품절 BUNDLE 부모/구성품 상태 승계: 수정하지 않음
- main merge, commit, push: 하지 않음
- 공유 DB 직접 INSERT/UPDATE: 하지 않음
