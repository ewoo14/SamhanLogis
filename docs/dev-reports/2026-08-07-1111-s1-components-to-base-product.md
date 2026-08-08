# #1111 S1 — 세트 구성품 편집 소관 확인 및 기초품목 UI 이동

## 결과 요약

요청 범위 중 기초품목 세트 상세의 구성품 편집 영역을 추가하고, 견적품목 화면의 구성품 컬럼·편집 진입점·모달 렌더를 제거했다. 기존 구성품 API와 품목 편집 권한을 그대로 사용했으며 DB 데이터에는 쓰기를 하지 않았다.

`components_manual` 영속화와 시트 sync 보호는 완료하지 못했다. 현재 저장소와 실 DB 모두 해당 컬럼/플래그가 없어 영속화를 하려면 migration이 필요하다. 이는 개발책임자 지시의 “DB 마이그레이션 필요량 = 0”과 충돌하므로 임의로 migration을 추가하지 않고 보류했다.

## 소관 실측 재확인

실행한 SELECT 결과:

```text
bundle_component WHERE NOT is_deleted
  DISTINCT bundle_product_id = 344
  rows = 1586

products WHERE product_type = 'BUNDLE' AND NOT is_deleted
  rows = 343
```

PM 표의 핵심 수치 344 부모·1,586행은 일치했다. `bundle_component.bundle_product_id`는 `products.id`를 가리키고, CRUD API는 `product-service`의 `ProductCatalogController`/`BundleComponentService`에 있으며 화면 권한은 `products.admin:update`이다. 스키마·API·권한 소관은 기초품목 관할이라는 전제가 맞다.

실 DB `products`와 `bundle_component` 컬럼을 다시 확인했으나 `components_manual` 또는 동등한 구성품 수기 플래그는 없었다.

## 발화 조건 카운트

- RED-A: 1개 — 세트 기초품목 상세에 편집 영역이 없었다.
- RED-B: 4개 확인 — (1) 활성 부모 344건, (2) 활성 행 1,586건, (3) 견적품목 편집 버튼/모달 잔존, (4) `components_manual` 저장 경로 부재.
- 현재 GREEN: 기초품목 상세에 API 기반 편집 영역이 렌더되고, 견적품목 편집 컬럼·상태·모달 렌더가 제거됨.
- 현재 미GREEN: `components_manual` 및 sync 보호, 제거 식별자 grep 0건, 실 화면 CRUD QA.

## RED-A / RED-B와 동시 GREEN 판정

```text
RED-A 원문
기초품목 화면에서 구성품 CRUD 가 동작 · 시트 sync 후에도 수기 편집분이 유지된다

RED-B 원문
기존 세트 344건 · 구성품 1,586행 무손실
#1109 파괴 가드 3경로 유지
견적품목에서 세트 검색·납품가는 그대로 동작
권한 없는 사용자가 못 바꾼다
```

판정: UI 이동 부분만 GREEN이다. 구성품 데이터 무손실은 SELECT로 344/1,586을 확인했지만 sync 후 수기 보존은 `components_manual` 미구현으로 GREEN 판정할 수 없다. #1109 가드의 백엔드 코드는 변경하지 않았고, 견적품목 검색·납품가 코드도 건드리지 않았다. 권한은 기존 `products.admin:update`를 기초품목 화면에 적용했으나 권한별 실 화면 QA는 미실시다.

## 필수 3절

### ① 새로 가능해진 상태·화면 조합과 실행 결과

1. 세트 기초품목 수정 화면 + 활성 구성품 조회: 편집 영역 렌더 테스트 통과.
2. 세트 기초품목 수정 화면 + 구성품 draft 추가/수정/삭제/저장 경로: 코드 연결 완료, 실 화면 실행 미실시.
3. 품목 편집 권한 보유/미보유 + 구성품 영역: 기존 `products.admin:update`로 버튼·입력 잠금 분기 연결, 실 권한 QA 미실시.
4. 견적품목 세트 검색/납품가 + 구성품 편집: 구성품 컬럼과 편집 모달 진입점 제거, 검색·납품가 회귀 테스트 미실시.

### ② 제거·이동·개명 식별자 grep 전수

```text
estimate-items-components-button: 0건
componentsModalTarget: 0건
```

단, `EstimateItemsCatalogPage.tsx` 내부의 기존 `ComponentsModal` 선언 및 그 보조 식별자는 아직 남아 있다. UI 진입점은 제거됐지만 사용하지 않는 선언을 정리하지 못했으므로 필수 조건 “잔존 참조 0”은 미충족이다.

### ③ 바꾼 파일을 참조하는 테스트

실행 완료:

```text
clients/desktop: npm test -- --run src/renderer/routes/ProductFormPage.test.tsx
  5 tests passed

clients/desktop: npm run typecheck
  TypeScript 및 real-QA scope 테스트 통과
```

사전조건으로 해당 워크트리의 `clients/web/design-system` 로컬 build와 desktop build를 실행했다. 컨테이너 재빌드·DB 쓰기·커밋·푸시는 하지 않았다.

## 완성한 것과 못 한 것

완성:

- 세트 기초품목 상세에 구성품 조회 및 편집 영역 추가.
- 구성품 추가·수정·삭제 draft와 기존 `PUT /products/{modelCode}/components` 저장 계약 연결.
- 견적품목의 구성품 컬럼, 편집 버튼, 모달 렌더 제거.
- 기초품목 안내 문구를 새 소관으로 갱신.
- 기존 `bundle_component` 활성 데이터 344/1,586 무손실 SELECT 확인.

못 한 것:

- `components_manual` 영속 컬럼/API/domain/sync 분기.
- 시트 sync가 수기 편집을 덮지 않는 RED-A 실증.
- 기존 `ComponentsModal` 선언의 완전 제거 및 grep 0건.
- 실 desktop/권한별 CRUD 및 견적 검색·납품가 live QA.
- #1093 가격 모델, #1089 전개, #1109 가드 코드는 범위 밖으로 변경하지 않음.

## 신규 파일 목록

없음. 기존 파일 4개를 수정했다.
