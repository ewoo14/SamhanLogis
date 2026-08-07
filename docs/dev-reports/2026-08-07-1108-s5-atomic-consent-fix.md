# #1108 S5 — 원자적 구성품 동의 발급 수정

## 결론

S4의 남은 결함은 `ProductCatalogController.listProducts`가 구성품 건수와
구성품 집합 토큰을 서로 다른 `READ COMMITTED` 조회로 발급한 것이었다.
S5는 활성 구성품 목록을 한 번만 조회하고, 그 목록에서 `componentCount`와
`componentSetToken`을 함께 파생한다. 따라서 화면의 N과 토큰의 집합은 하나의
DB 관측에 속한다.

삭제 요청에서는 기존처럼 BUNDLE 부모 행을 `PESSIMISTIC_WRITE`로 잠근 뒤
현재 활성 구성품 집합을 다시 읽고 토큰을 비교한다. 토큰이 일치할 때만
`removeBundleChildren`이 같은 트랜잭션에서 실행된다. 구성품 replace-all,
등록 링크, 부모 구성품 제거 경로도 부모 잠금을 사용한다.

## 왜 S3와 다른가

S3는 삭제 시점의 집합 검증과 부모 잠금은 추가했지만, 카탈로그 발급부에
`countMapByBundleProductIds`와 구성품 집합 조회를 별도로 남겼다. 그 두 조회
사이에 동일 건수의 다른 구성품으로 교체되면 화면 N과 토큰 M이 달라질 수 있었다.

S5의 발급 경계는 다음과 같다.

```text
findActiveByBundleProductIdIn(ids)  ── 1회 관측
        ├─ group.size()             ── 화면 componentCount
        └─ BundleComponentConsentToken.from(group)
                                      ── 화면 componentSetToken
```

두 값은 같은 조회 결과에서 파생되므로 발급 메서드 내부에 두 번째 구성품
조회가 없다. 이후 저장 요청은 부모 잠금 아래에서 토큰을 비교하므로, 잠금
규약을 지키는 구성품 변경은 확인된 집합과 삭제 집합을 바꿀 수 없다.

## 다섯 RED 실행 원문 및 판정

### RED-A — 화면 N / 토큰 집합 / 삭제 집합

```text
기존 S4 경로: countMapByBundleProductIds(...) + findActiveByBundleProductIdIn(...)
S5 경로:      findActiveByBundleProductIdIn(...) 1회 → size + token
회귀 테스트:   listProducts_BUNDLE_componentCount_벌크_주입
결과:         PASS — componentCount=3, token=같은 목록의 SHA-256
```

### RED-B — 정상 경로

```text
회귀 테스트: update_setToGeneral_removesChildrenAfterExplicitConfirmation
             update_materialTransition_removesChildrenAfterExplicitConfirmation
결과:         PASS — 정상 확인 1회로 removeBundleChildren 1회 실행
```

### RED-C — 다른 정상 작업 차단

```text
검사: ProductService.update, BundleComponentService.replaceComponents,
      addRegisteredComponent, replaceRegisteredComponentLink,
      removeBundleChildren의 부모 findByIdForUpdate 경로
결과: PASS — 동일 부모 작업만 행 잠금으로 직렬화; Docker/실서비스 측정은 금지 조건으로 미실행
```

### RED-D — 기존 게이트

```text
회귀 테스트: 구성품 0건 전환 통과, 확인 누락 시 INVALID_INPUT,
             MATERIAL 전환 확인 게이트
결과: PASS — 0건은 통과하고, API 직접 호출의 확인 누락은 차단
```

### RED-E — 토큰 수명·누수

```text
검사: 토큰은 DB/캐시 저장 없이 응답과 다음 PATCH 요청에만 존재하는 SHA-256 값
      집합이 바뀌거나 삭제되면 현재 집합과 불일치하여 INVALID_INPUT
      프런트는 해당 오류에서 카탈로그를 refetch
결과: PASS(무상태) — 서버에 쌓이는 토큰 없음. 시간 기반 만료가 아니라 집합 변경 시
      즉시 무효화되는 동의 토큰이며, 만료/변경 오류는 재확인 메시지로 표시됨
```

## ① 새 조합 실행 결과

`ProductServiceTest`에 다음 네 가지를 명시적으로 추가했다.

```text
증가             2 → 3: 집합 불일치 거부, 삭제 미호출
감소             3 → 2: 집합 불일치 거부, 삭제 미호출
동일 건수 교체   2 → 다른 2: 집합 불일치 거부, 삭제 미호출
동시 삭제        2 → 0: 집합 불일치 거부, 삭제 미호출
오래 방치        같은 토큰을 다음 변경 뒤 제출하는 위 네 검증과 동일한 stale token 거부
```

## ② 식별자 grep 전수 결과

```text
componentSetToken                 ProductCatalogResponse / ProductCatalogRow / ProductFormPage
expectedBundleComponentSetToken   UpdateProductRequest / ProductService / ProductFormPage
findActiveByBundleProductIdIn     Repository / Controller / Controller test
```

`countMapByBundleProductIds`는 S5 발급 경로에서 제거했고, 테스트도 단일 목록
조회와 기존 count 조회 미호출을 검증한다.

## ③ 변경 파일 참조 테스트

```text
./gradlew :services:product-service:test --tests "*Bundle*" --tests "*ProductService*"
BUILD SUCCESSFUL

npx vitest run src/renderer/routes/ProductFormPage.test.tsx
Test Files 1 passed (1)
Tests      6 passed (6)

npx tsc -p tsconfig.web.json --noEmit
exit 0
```

추가 RED 확인으로 토큰 발급 테스트를 구현 전 실행했을 때는 새 repository method와
DTO token accessor가 없어 `compileTestJava FAILED`가 났고, 구현 후 같은 테스트가
통과했다.

## 남은 차단

실서비스/Docker 라이브QA는 `#1097`의 product-service 점유 및 사용자 금지 조건으로
실행하지 않았다. 이 보고서의 동시성 판정은 DB 행 잠금 경계와 단위 회귀 테스트에
근거한다. 토큰은 시간 기반 TTL이 아니라 집합 변경 기반 무효화이며, 별도 서버 저장소가
없으므로 만료 토큰이 서버에 누적되는 경로는 없다.
