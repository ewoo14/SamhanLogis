# PR #1117 / 이슈 #1111 S5 — 삭제 경로 구성품 가드

> 기준 브랜치: `feat/1111-bundle-components-to-base-product`  
> 기준 HEAD: `cafbde4de`  
> 작업일: 2026-08-07 KST  
> 범위: 부모 품목 DELETE의 구성품 동의 가드·구성품 동시 soft-delete·화면 관문

## 1. 판단 — 전환 경로와 같게

삭제도 전환 PATCH와 **같게** 했다.

- 확인 Boolean: `confirmBundleChildrenDeletion=true`
- 집합 확인: `expectedBundleComponentSetToken=<활성 구성품 집합 토큰>`
- 전달 위치: DELETE query parameter
- 구성품 0건: 두 파라미터 없이 삭제 허용
- 구성품 1건 이상: 두 값이 모두 현재 활성 집합 토큰과 일치해야 허용

이유는 사용자가 배워야 하는 규칙을 하나로 유지하고, 화면 확인과 직접 API 호출의 서버 계약을 동일하게 하기 위해서다. PATCH에서 이미 사용 중인 토큰 발급·재계산·stale 집합 거부 규칙을 재사용했으며, 삭제 전용 body DTO를 추가하지 않았다. DELETE body가 없는 기존 호출과도 충돌하지 않는다.

## 2. 변경 내용

- `ProductController.delete()`가 기존 `products.admin DELETE` 권한 검사와 헤더를 그대로 유지하면서 두 query parameter를 받는다.
- `ProductService.delete()`는 기존 2-인자 API를 호환 overload로 보존한다.
- BUNDLE만 부모 row lock 후 활성 구성품을 관측하고, 구성품이 있으면 Boolean+집합 토큰을 검증한다.
- 확인을 통과한 경우 같은 actor로 `BundleComponentService.removeBundleChildren()`를 호출한 뒤 부모와 기존 exposure을 soft-delete한다.
- 구성품 0건 BUNDLE과 GENERAL은 구성품 삭제 서비스를 호출하지 않고 기존 부모/exposure 삭제를 유지한다.
- `ProductFormPage` 편집 화면에 `products.admin DELETE` 권한 보유자용 `품목 삭제` 버튼과 구성품 건수 확인창을 추가했다. 구성품이 있으면 카탈로그에서 발급받은 집합 토큰을 DELETE query로 보낸다. 삭제 버튼이 없는 기존 화면의 S4 진단도 함께 해소한다.

## 3. RED-A / RED-B 동시 GREEN

### RED-A

```text
① 구성품 있는 품목 삭제 → 확인 없이는 화면·API 모두 거부
② 확인 후 삭제 → 구성품도 함께 정리 · 활성 고아 0
```

구현 결과:

- 화면: 구성품 3건 fixture에서 확인창 문구에 `3`이 표시되고 취소 시 DELETE가 호출되지 않는다.
- API/service: Boolean 누락, 토큰 누락, stale 토큰은 `INVALID_INPUT`으로 거부되고 부모는 삭제되지 않는다.
- 정상 토큰: 부모 `is_deleted=true`, 구성품은 `removeBundleChildren()`를 통해 동일 actor로 soft-delete된다. 이 라운드에는 기존 DB 고아 13행을 정리하지 않았고, fixture/unit 경로로 동시 정리 계약만 검증했다.

### RED-B

```text
③ 구성품 0건 품목은 확인 없이 삭제된다
④ GENERAL · MATERIAL 삭제 무영향
⑤ 전환 경로 가드 그대로
⑥ 노출 soft-delete 등 기존 동작 그대로
⑦ 권한 검사 그대로
```

구현 결과:

- ③ 실측: unit fixture에서 `BUNDLE + 활성 구성품 0건` 1건을 확인 없이 삭제했고, `bundleComponentService`는 0회 호출됐다. `GENERAL` 1건도 같은 방식으로 삭제됐다. 따라서 이번 fix가 막으면 안 되는 정상 경로는 **2개 fixture / 2개**이며 모두 통과했다.
- ④ GENERAL은 구성품 repository를 조회하지 않는다. MATERIAL은 DELETE 경로에서 category를 위험 전환 조건으로 해석하지 않으므로 기존 동작을 유지한다.
- ⑤ 기존 `assertBundleChildrenDeletionConfirmed(Product, UpdateProductRequest)`와 PATCH 호출부는 변경하지 않았다. SET→GENERAL, SET→MATERIAL의 기존 테스트가 그대로 통과한다.
- ⑥ 부모 삭제 전 기존 `assertNotReferencedByEnabledQuantitySyncRule()`를 유지하고, 기존 exposure 조회·soft-delete도 그대로 실행한다.
- ⑦ `@RequirePermission(page = "products.admin", action = PermissionAction.DELETE)`를 유지했다. 화면 버튼도 같은 DELETE 권한이 있을 때만 노출한다.

## 4. 고아 13행의 화면·집계 노출

이번 라운드에서는 13행을 SELECT 외 어떠한 방식으로도 수정하지 않았다.

- 삭제 부모를 먼저 거르는 활성 카탈로그/견적 구성품 목록과 `componentCount`에는 부모가 빠져 보이지 않는다.
- 활성 구성품 전체 건수처럼 부모 삭제 여부를 조인하지 않는 전역 집계에는 계속 포함될 수 있다.
- 자식 모델코드의 `findByComponentProductCode()`는 부모의 `is_deleted`를 추가로 거르지 않으므로, 삭제 부모와 활성 부모가 함께 후보가 되면 부모 링크가 모호해져 구성품이 `GENERAL`처럼 보일 수 있다.
- 부모가 삭제되고 활성 부모가 없는 `QA797-SET-01`의 2행은 부모 화면에는 보이지 않지만 자식 코드 기반 조회 후보에는 남을 수 있다.

위 판정은 S4 SELECT 및 화면 추적 결과를 그대로 기록한 것이며, S5에서는 데이터 정리를 수행하지 않았다.

## 5. 새로 가능해진 조합과 각각의 결과

| 조합 | 결과 | 밟은 경로/근거 |
|---|---|---|
| BUNDLE 구성품 0건 + 확인 없음 | 허용 | `delete_bundleWithoutChildren_doesNotRequireConfirmation` |
| BUNDLE 구성품 1건 | 확인 없음 거부, 정상 토큰만 허용 | 2건 fixture로 동일 규칙 확인 |
| BUNDLE 구성품 다수 | 건수 포함 거부, 정상 토큰 후 부모·자식 동시 정리 | 2건/3건 fixture |
| GENERAL | 구성품 조회 없이 기존 삭제 | `delete_generalProduct_doesNotReadOrRemoveBundleChildren` |
| MATERIAL | DELETE에서 전환 조건으로 취급하지 않아 기존 삭제 유지 | service 분기상 BUNDLE만 가드 |
| Boolean만 전송 | 거부 | partial consent 테스트 |
| 토큰만 전송 | 거부 | `confirmBundleChildrenDeletion`이 true가 아니면 거부 |
| stale/타 집합 토큰 | 거부 | stale token 테스트 |
| 이미 삭제된 품목 재삭제 | `loadOrThrow()`의 기존 활성 행 조회에서 NOT_FOUND | 기존 soft-delete 조회 계약 유지 |
| 동시 삭제 | BUNDLE 부모 row lock으로 직렬화; 선행 삭제 후 후행 요청은 활성 행 조회 실패 | `findByIdForUpdate` 사용, 새 DB mutation 없음 |
| 권한 없음 | controller annotation에서 기존과 동일하게 403 | annotation 미변경 |
| 활성 수량동기화 규칙 참조 | 구성품 가드 이후 기존 참조 차단 유지 | 기존 `assertNotReferencedByEnabledQuantitySyncRule` 유지 |

## 6. 제거·이동·개명 식별자 grep 전수

제거·이동·개명한 기존 식별자는 없다. 다음을 전수 검색했다.

```text
ProductService.delete(UUID, String)       기존 overload 유지
ProductService.delete(UUID, String, Boolean, String) 신규 삭제 계약
ProductController.delete                  기존 endpoint/권한 유지, 호출 인자 확장
ProductFormPage                           기존 화면 파일 내 삭제 mutation 추가
deleteProduct                             신규 desktop API 함수
confirmBundleChildrenDeletion              PATCH/DELETE 동일 명칭 유지
expectedBundleComponentSetToken            PATCH/DELETE 동일 명칭 유지
```

## 7. 테스트 및 검증

RED 후 구현하고 같은 명령을 다시 실행했다.

```text
./gradlew :services:product-service:test --tests com.samhanair.logis.product.service.ProductServiceTest
BUILD SUCCESSFUL — ProductServiceTest 16건

./gradlew :services:product-service:test
BUILD SUCCESSFUL — product-service 전체 테스트, 2분 31초

clients/desktop/node_modules/.bin/vitest.cmd run src/renderer/routes/ProductFormPage.test.tsx --reporter=dot
1 test file / 8 tests passed

npm run typecheck -- --pretty false
exit 0 — tsc node/web 및 real-QA typecheck 통과
```

바꾼 파일을 참조하는 핵심 테스트는 전부 실행했다.

- Java: `ProductServiceTest` — 삭제 0/1/다수, stale/partial consent, GENERAL, 기존 PATCH 전환 회귀 포함
- Desktop: `ProductFormPage.test.tsx` — 화면 확인 취소 및 확인 후 동일 토큰 DELETE 전송 포함
- `:services:product-service:test` 전체 — 변경된 `ProductService`/`ProductController`를 참조하는 product-service 회귀 포함
- desktop `typecheck` — 변경된 API/화면 TypeScript 계약 확인

미실행:

- `components_manual` 라이브 검증 — V32 미배포이므로 지시대로 실행하지 않음
- 컨테이너 재빌드/재기동 및 기존 DB 데이터 정리 — 실행하지 않음

typecheck 출력에는 저장소에 이미 존재하던 real-QA 미추적 로컬 스펙 경고와 npm의 `--pretty` 옵션 경고가 있었지만, 명령 exit code는 0이었다. 해당 로컬 스펙과 고아 데이터는 변경하지 않았다.

## 8. 신규 파일 목록

```text
docs/dev-reports/2026-08-07-1111-s5-delete-gate-fix.md
```

테스트·production 변경은 신규 파일이 아니라 기존 파일 수정이다. 기존 S3 고아 11행, QA797 고아 2행은 그대로 보존했다.
