# 이슈 #1108 S3 — 동의 집합과 실제 삭제 집합 결박

## 결론

S2의 Boolean 확인만으로는 동의 시점의 구성품과 삭제 시점의 구성품을 구분할 수 없었다.
카탈로그 응답에 서버가 활성 구성품 UUID 집합을 SHA-256으로 만든 불투명
`componentSetToken`을 추가하고, 수정 요청에 `expectedBundleComponentSetToken`을 담도록 했다.
UUID 자체는 화면에 노출하지 않는다.

품목 수정은 먼저 부모 Product 행을 `PESSIMISTIC_WRITE`로 잠근 뒤 활성 구성품을 읽어 토큰을
재계산한다. 구성품 replace-all도 같은 부모 행을 먼저 잠그므로 둘은 같은 부모에 대해 직렬화된다.
토큰이 다르면 확인 Boolean이 true여도 `INVALID_INPUT`으로 중단하고, 구성품 삭제와 품목 변경을
수행하지 않는다. 화면은 실패 후 최신 edit seed를 재조회하므로 현재 건수를 보고 다시 확인한다.

## 네 RED 실행 원문

### RED-A — 정상 경로

```text
./gradlew :services:product-service:test --tests "*Bundle*" --tests "*ProductService*"
BUILD SUCCESSFUL
```

`update_setToGeneral_removesChildrenAfterExplicitConfirmation`와
`update_materialTransition_removesChildrenAfterExplicitConfirmation`가 확인 토큰을 함께 보낸
정상 세트→단일/자재 전환을 통과시키고 기존 `removeBundleChildren` 호출을 보존한다.

### RED-B — 경합 차단

동일 건수 집합 교체는 `update_rejectsSameCountWhenTheConsentedComponentSetWasReplaced`에서,
동시 삭제로 현재 집합이 0건이 되는 경우는
`update_rejectsWhenTheConsentedComponentsWereDeletedBeforeSave`에서 각각 차단했다.
`update_rejectsBothComponentCountIncreaseAndDecreaseAfterConfirmation`에서 N→M 증가와 N→M
감소도 밟았다. 건수만 비교하지 않고 UUID 집합 토큰을 비교하므로 증가·감소·동일 건수 교체를
모두 같은 계약으로 거부한다. 각 테스트는 `removeBundleChildren`가 호출되지 않는 것을 검증한다.

### RED-C — 서버 판정

`ProductService`가 요청의 숫자나 Boolean을 삭제 건수로 사용하지 않는다. 서버가 잠금 안에서
직접 읽은 활성 집합을 기준으로 토큰과 건수를 계산한다. `expectedBundleComponentSetToken`이
없거나 현재 토큰과 다르면 활성 구성품이 있는 요청은 거부한다. API 직접 호출도 동일한 경로다.

### RED-D — 기존 게이트 유지

확인 필드와 토큰을 모두 생략한 요청은 구성품이 있을 때 차단된다. 구성품 0건이고 확인 필드가
없는 BUNDLE 전환은 `componentCount > 0` 게이트 밖에서 기존처럼 통과한다. 확인 시도 토큰이
있는데 현재 0건이면 빈 집합과 비교하여 오래된 확인을 거부한다.

## ① 새 조합을 실제로 밟은 결과

| 조합 | 결과 |
|---|---|
| 동시 추가: N→M 증가 | 현재 토큰 불일치로 중단, 삭제 호출 없음 |
| 동시 삭제: N→0 | 현재 빈 집합 토큰 불일치로 중단, 삭제 호출 없음 |
| 동시에 세트→단일 | 부모 행 잠금으로 두 수정/구성품 replace-all이 직렬화되고, 두 번째 요청은 잠금 후 최신 Product/집합을 판정 |
| 확인 후 오래 방치 | 새 구성품 ID가 생기거나 기존 ID가 soft-delete되면 토큰 불일치로 재확인 요구 |
| 같은 건수 구성품 교체 | 토큰 불일치로 중단(건수 비교만으로는 통과하는 결함을 방지) |
| 구성품 0건 일반 전환 | 확인 없이 통과, 삭제 없음 |

경합 창이 닫혔다는 근거는 두 구현 경로가 모두 부모 Product의 동일한
`findByIdForUpdate`를 먼저 실행한다는 점이다. 품목 수정은 그 잠금 보유 트랜잭션에서 토큰 검증 후
기존 soft-delete를 수행하고, replace-all은 동일 잠금 뒤에 기존 집합 교체를 수행한다. 따라서
검증 완료와 삭제 완료 사이에 같은 부모의 구성품 replace-all이 끼어들 수 없다.

## ② 식별자 grep 전수

```text
rg -n "confirmBundleChildrenDeletion|expectedBundleComponentSetToken|componentSetToken|BundleComponentConsentToken|findByIdForUpdate|removeBundleChildren" services/product-service/src/main clients/desktop/src/renderer
```

결과를 확인해 요청 필드는 `UpdateProductRequest`와 `ProductFormPage` 한 경로에, 응답 토큰은
`ProductCatalogResponse`→`ProductCatalogController`→카탈로그 타입→폼 한 경로에 연결했다.
운영 `removeBundleChildren` 호출부는 기존 ProductService 두 곳뿐이며 수정 전 게이트가 공통으로
선행된다.

## ③ 변경 파일 참조 테스트

```text
./gradlew :services:product-service:test --tests "*Bundle*" --tests "*ProductService*"
BUILD SUCCESSFUL

cd clients/desktop && npx vitest run src/renderer/routes/ProductFormPage.test.tsx
ProductFormPage.test.tsx — 6 tests passed

npx tsc -p tsconfig.web.json --noEmit
exit 0

git diff --check
exit 0
```

Docker, 서비스 재기동·재빌드, 로컬 full suite는 실행하지 않았다. 실 DB는 공유 QA 점유 중이라
접근하지 않았다.

## 남은 차단

- 커밋·푸시하지 않았다. 개발책임자의 머지 trigger가 필요하다.
- 실제 라이브 DB에서의 최종 QA는 #1097 점유가 끝난 뒤 별도 수행해야 한다.
- 기존 워크트리에 있던 `docs/dev-reports/2026-08-07-1108-s2-fix-directive.md`와
  `docs/dev-reports/2026-08-07-1108-s2-reconvergence-and-live-qa.md`는 이번 작업에서 만들거나
  수정하지 않았다.
