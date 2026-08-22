# PR #1268 리모컨 축 세로 절단 — 1라운드 보고

## 1. `bundle_component_estimate_setting` 원천 판정

사용 가능하다. PR #1272의 V47 저장소가 카테고리별 `component_kind`, `component_variant`, `component_shape`, `is_default`, `qty_mode`를 제공한다. 구성품 납품가는 별도 `bundle_component.context_delivery_price`를 우선하고, 없을 때 제품 납품가로 fallback하는 기존 `/components` 계약을 유지했다.

## 2. 서버가 보내는 필드

`ComponentRow`/`db-catalog.components()` 경로에서 구성품 납품가(`deliveryPrice`→`price`), 종류(`kind`), 변형(`variant`→`feat`), 모양(`componentShape`), 기본 여부(`isDefault`), 수량 모드(`qtyMode`), 기본수량(`defaultQty`→`qty`)를 보낸다. 카테고리 설정이 있으면 종류·변형·모양·기본 여부·수량 모드를 설정값 우선으로 해소한다.

## 3. 제거한 리모컨 하드코딩

- 종합견적서: 상업 리모컨의 `AWR-WE13N`/`AWR-WG00N`/`AR-EH05` 직접 반환, 싱글의 리모컨 모델 정규식 gate, `컬러유선리모컨`/`컬러유선` 문자열 정규식 선택, 싱글 sweep의 고정 리모컨·모양 배열, 구성품 단가를 `PRICE_INC.single`로 다시 덮는 경로를 제거했다.
- 주문서웹: 같은 상업 리모컨 직접 반환, 싱글 리모컨 모델 gate/정규식 선택, 고정 모양 배열, 컬러 fallback 가격을 제거했다.
- 양쪽 모두 `d03ConfiguredVariants_()`/`d03ConfiguredShapes_()`와 구성품 `variant`를 사용한다. 별칭 문자열(`컬러유선리모컨`, `유선리모컨`)은 기존 저장값 호환용 canonical 정규화 함수에만 남겼다.

## 4. 설정 채움 및 migration 3중 확인

- 이번에 추가한 설정 채움: **AWR-WG00N 문맥 납품가 91,000원 update 1개 SQL 규칙**. 운영 데이터 기준 영향 구성품은 정찰의 컬러유선 65세트 대상이며, 실제 update 행 수는 운영 DB에 쓰지 않아 미실측이다.
- 신규 migration: **V48** `V48__remote_color_context_delivery_price.sql`.
- 현재 워크트리/`origin/main`/열린 PR의 최고 번호: 각각 병합 전 워크트리 V47, `origin/main` V47, 열린 PR #1269·#1271·#1270 등 V46 이하. 따라서 V48 충돌 없음.
- 격리 Postgres fresh 기동 결과: `flyway_schema_history` 최신 원문 `48|remote color context delivery price|t`, `47|category component settings|t`, `46|canon price variant defaults off|t`; `bundle_component_estimate_setting` 테이블 존재 1건.

## 5. 4상태 실측

운영 seed가 있는 라이브 스택/공유 DB는 읽기·쓰기를 하지 않았다. 격리 DB는 migration만 적용되어 품목 seed가 없으므로 **Playwright 4상태 숫자 실측은 미검증**이다.

정찰 및 요구 기준의 기대값은 다음과 같다.

| 상태 | 구성품 납품가 | 무선 대비 세트가 차액 | 상태 |
|---|---:|---:|---|
| 무선 | 16,000 | 0 | 정찰값, 라이브 미검증 |
| 유선통합 | 56,000 | +40,000 | 정찰값, 라이브 미검증 |
| 유선컬러 | 91,000 | +75,000 | V48 설정값, 라이브 미검증 |
| 제외 | 0 | -16,000 | 계산 계약, 라이브 미검증 |

## 6. 하드코딩값 ≠ DB값 대조표

| 모델 | 기존 하드코딩 | DB 설정값 | 영향 세트수 | 판정 |
|---|---:|---:|---:|---|
| AWR-WG00N | 91,000 | V48 문맥 납품가 91,000 | 정찰 기준 65 | 일치하도록 설정 seed 추가 |
| AWR-WE13N | 56,000 | V45 문맥 납품가 56,000 | 정찰 기준 62 | 일치 |
| AR-EH05 | 16,000 | V45 문맥 납품가 16,000 | 정찰 기준 62 | 일치 |

정찰 전체 19개 단가표의 257행/65세트 차이는 이번 라운드 판넬·자재 축을 포함하므로 변경하지 않았다.

## 7. RED 원문

추가 테스트 `clients/web/estimate-app/test/d03-option-naming-unify.node.cjs`의 실패 원문:

```text
✖ 컬러유선 리모컨 모델은 설정 구성품에서 해석한다
AssertionError [ERR_ASSERTION]: The input was expected to not match
/if \(opt === '컬러'\) return 'AWR-WG00N'/
```

수정 후 동일 테스트는 `12 pass, 0 fail`이다.

## 8. 잃으면 안 되는 것 재현

- 서버 컴파일: `./gradlew :services:product-service:compileJava --no-daemon` — `BUILD SUCCESSFUL`.
- attestation 주입 통합 테스트: `SAMHAN_GATEWAY_ATTESTATION=codex-1268 ./gradlew :services:product-service:test --tests '*EstimateCatalogInternalControllerIT' --no-daemon` — `10 tests completed`, `BUILD SUCCESSFUL`.
- 프런트: `npm run typecheck` — `typecheck OK: 17 JavaScript files`.
- 옵션 계약: `node --test test/d03-option-naming-unify.node.cjs` — `12 pass, 0 fail`.
- DB catalog Jest: `14 tests passed`.
- attestation 없이 통합 테스트는 보안 가드로 `10 tests failed`; 실패 원인은 `SAMHAN_GATEWAY_ATTESTATION is required for MockMvc integration tests`이다.
- #1241 천원 단위 배분과 판넬·자재 축의 운영 라이브 재현은 이번 격리 데이터에 seed가 없어 미검증이다.

## 9. 스크린샷

Playwright `*-real-qa.spec.ts`를 새로 만들거나 캡처하지 못했다. 격리 renderer `http://localhost:5183/healthz`는 200이었으나, 격리 Postgres에 운영 seed가 없어 양쪽 웹의 행·4상태 가격을 찍을 수 없었다. 따라서 확정 PNG, 장별 행 수, 양쪽 웹 캡처는 **미검증**이다.

## 10. 미검증 축

판넬·자재·할인·받침대·카테고리 리터럴·창고 코드·수량동기화 운영 seed·공유 DB 실측은 범위 밖 또는 격리 seed 부재로 미검증이다.

## 11. `git status --porcelain` 원문

커밋·push·add는 수행하지 않았다. 작업 시작 시 PR #1272 병합 중 `EstimateCatalogInternalController.java` 충돌이 발생했으며, 작업 트리는 해결된 파일을 `UU`로 보유한다. 전체 작업트리는 병합으로 유입된 기존 변경이 많으므로 PM이 인계 시 아래 명령으로 원문을 다시 확인해야 한다.

```text
 M clients/web/estimate-app/test/d03-option-naming-unify.node.cjs
MM clients/web/estimate-app/views/index.ejs
 M clients/web/order-app/index.html
UU services/product-service/src/main/java/com/samhanair/logis/product/web/EstimateCatalogInternalController.java
?? services/product-service/src/main/resources/db/migration/V48__remote_color_context_delivery_price.sql
```

## 12. 프로세스 회수

- 격리 상품 서비스 PID 14040 회수.
- 견적 renderer PID 83356 회수.
- 격리 컨테이너 `codex-1268-pg` 회수.
- 공유 컨테이너 24개는 중지·변경하지 않았다.
