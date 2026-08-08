# #1111 S2 — 구성품 수기 편집 플래그와 라이브 QA

> 라운드 식별자: `S2-1111`  
> 일자: 2026-08-07  
> 상태: 코드 검증 GREEN, 라이브 QA는 필수 표본 부재로 중단

## 1. 플래그 설계와 구현

플래그는 별도 테이블이나 `bundle_component` 행 단위가 아니라 **부모 `products` 행의 세트 단위 컬럼**으로 선택했다.

```text
products.bundle_components_manual BOOLEAN NOT NULL DEFAULT FALSE
```

선택 이유:

- 수기 편집의 의미가 구성품 개별 행이 아니라 “이 세트의 구성품 집합을 사용자가 확정했다”는 세트 단위 사실이다.
- 기존 `usage_scope_manual`, `variable_discount_manual` 등 동일한 제품 단위 override 패턴과 일관된다.
- 구성품 replace-all과 시트 sync가 이미 부모 Product `PESSIMISTIC_WRITE` 잠금 아래 직렬화되므로 별도 동시성 경계가 필요 없다.
- 수기 replace-all 성공 뒤 부모에 `true`를 저장한다. 시트 sync는 해당 부모의 모든 행을 `preservedManual`로 건너뛰며 `seenByParent`에도 넣지 않아 soft-delete도 발생하지 않는다.
- 플래그가 false인 다른 부모는 기존 upsert/soft-delete 경로를 그대로 타므로 sync 전체를 잠그지 않는다.
- `clearBundleComponentsManual()` 도메인 메서드를 제공해 향후 명시적 “시트 기준으로 되돌리기” 경로를 열어 두었다. 현재 UI에는 되돌리기 버튼을 추가하지 않았다.

## 2. RED-A / RED-B와 동시 GREEN

### RED-A 원문

```text
① 수기 편집 후 sync → 편집분 유지
② ComponentsModal 참조 0
```

검증/구현 결과:

- 수기 replace-all 성공 시 `Product.bundleComponentsManual=true`가 영속화되도록 구현했다.
- sync는 manual 부모의 구성품 행을 보존하고 soft-delete도 건너뛰도록 구현했다.
- `EstimateItemsCatalogPage`의 `ComponentsModal`, `SortableComponentRow`, 전용 `componentsModalModel.ts` 및 전용 테스트를 삭제했다.
- 견적품목 페이지·페이지 테스트에서 `ComponentsModal` 선언과 전용 testid 참조는 0건이다. 남은 `components-modal-*` testid는 기초품목 `ProductFormPage`와 그 라이브 QA가 사용하는 현행 편집기 계약이다.
- TDD RED: 플래그 assertion을 먼저 추가한 뒤 `isBundleComponentsManual()` 부재 컴파일 실패를 확인했다.
- GREEN: `BundleComponentServiceTest.replaceComponents_정상교체_기존_soft_delete_후_신규_INSERT` 통과 및 플래그 true assertion 통과.

### RED-B 원문

```text
③ 손 안 댄 세트는 sync 가 갱신한다 (전부 잠그지 않았다)
④⑤⑥ 그대로
```

검증/구현 결과:

- 보호 조건은 부모별 `bundleComponentsManual` 검사 하나뿐이며 false 부모에는 기존 구성품 sync 코드가 실행된다.
- 기존 `QuantitySyncRuleReconvergenceR6IT`, `QuantitySyncRuleReconvergenceR7IT`와 구성품 서비스 전체 테스트를 실행해 기존 sync/구성품 경로 회귀가 없음을 확인했다.
- FE typecheck와 기초품목 구성품 편집 테스트도 통과했다.

### 동시 GREEN 증거

```text
FE: EstimateItemsCatalogPage.test.ts + ProductFormPage.test.tsx
    2 files / 11 tests passed
FE: npm run typecheck
    exit 0
BE: BundleComponentServiceTest + QuantitySyncRuleReconvergenceR6IT + R7IT
    Gradle BUILD SUCCESSFUL / exit 0
```

## 3. ComponentsModal 참조 전수와 라이브 QA

### 참조 전수

확인 축은 다음과 같다.

1. `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx` — 선언·렌더·import 제거
2. `EstimateItemsCatalogPage.test.ts` — 선언 전용 specText 테스트 제거
3. `componentsModalModel.ts` 및 `componentsModalModel.test.ts` — 견적품목 전용 죽은 모델/테스트 삭제
4. `clients/desktop/src/renderer` — 선언명 및 모델 import grep 결과 0건
5. `clients/desktop/playwright` — 남은 `components-modal-*`는 ProductForm 구성품 편집기의 현행 testid이며 삭제 대상이 아님

### 라이브 QA 관문 결과

Vite renderer를 `chromium.launch({ headless: true })`용으로 기동했으나, 필수 표본 실측에서 중단했다. 창은 띄우지 않았고 Vite PID `62992`는 회수했으며 `:5175` listener도 남기지 않았다.

실측:

```text
POST http://localhost:8080/auth/login (dev_master) → HTTP 200
GET  /api/v1/products?category=SINGLE_SET&page=0&size=100 → HTTP 200
GET  /api/v1/products?page=0&size=1000 → HTTP 200
활성 BUNDLE + componentCount > 10 → 존재 (예: AC060CS6PBH1SY, 13건)
활성 BUNDLE + componentCount = 0 → 0건
```

요청은 구성품 0건 세트와 구성품 많은 세트 각각의 실 화면 추가·수정·삭제를 필수로 요구한다. 측정 결과 0건 세트가 없어 해당 관문을 충족할 수 없으므로, QA 데이터를 만들거나 DB를 직접 변경하지 않고 라이브 QA를 중단했다. 따라서 이번 산출물에는 라이브 화면 스크린샷을 첨부하지 않았다.

### 필수 불변식 판정

| 항목 | 판정 |
|---|---|
| 기초품목 구성품 CRUD 코드 경로 | 코드/FE 테스트 GREEN |
| 견적품목 구성품 편집 진입 제거 | 코드 grep 0, FE 테스트 GREEN |
| 수기 편집 보호 + 미편집 sync | BE 구현 및 관련 테스트 GREEN |
| 344 세트 / 1,586행 무손실 | 이번 라운드에서는 DB 변경 QA를 실행하지 않아 미판정 |
| 권한 없는 사용자 | 필수 0건 표본 부재로 라이브 미실행 |
| #1109 파괴 가드 3경로 | 필수 0건 표본 부재로 라이브 미실행 |

## 신규 파일 목록

- `services/product-service/src/main/resources/db/migration/V32__bundle_components_manual.sql`
- `docs/dev-reports/2026-08-07-1111-s2-manual-flag-and-live-qa.md`

삭제 파일:

- `clients/desktop/src/renderer/routes/componentsModalModel.ts`
- `clients/desktop/src/renderer/routes/componentsModalModel.test.ts`
