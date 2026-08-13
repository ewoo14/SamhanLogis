# 2026-08-13 #1143 ProductSpec 무변경 저장 충돌 fix — CODEX LUNA

## 결론

원인은 **1번**이다. 제품 상세 저장 요청은 변경이 없어도 `specs` 배열을 포함하고, `ProductService.update()`는 `replaceSpecs()`에서 기존 활성 `product_spec`을 soft-delete 표시한 뒤 같은 `(product_id, spec_key)`로 새 행을 저장한다. 그러나 기존 행의 `is_deleted=false` UPDATE가 DB에 flush되기 전에 Hibernate INSERT가 실행되어 `ux_product_spec_active`를 위반했다.

수정은 `replaceSpecs()`에서 기존 행을 soft-delete 표시한 직후 `productSpecRepository.flush()`를 호출하는 한 건이다. 따라서 UPDATE가 먼저 반영되고, 이후 동일 키 INSERT가 부분 유니크 인덱스를 위반하지 않는다.

## 세 갈래 원인 판정 근거

### 1. 기존 활성 행을 비활성화하지 않고 새 행을 추가하는가 — **판정: 예, DB 반영 순서 결함**

- `ProductService.update()`의 `req.specs() != null` 경로가 `replaceSpecs()`를 호출한다.
- `replaceSpecs()`는 기존 활성 행에 `markDeleted("system")`를 호출하지만 flush 없이 `saveSpecs()`로 새 행을 추가한다.
- Hibernate flush 원문에서 실패 SQL은 `insert into product_spec ...`였고, 기존 soft-delete UPDATE보다 INSERT가 먼저 실행됐다.
- 수정 후에는 기존 행을 먼저 flush하여 같은 키 재저장이 가능해진다.

### 2. 이번 슬라이스의 특징·형상 저장이 spec 행을 함께 쓰는가 — **판정: 아니오**

- 특징·형상 UI 저장 경로는 `BundleComponentService.replaceComponents()`의 `BundleComponent.seed(... componentVariant, componentShape ...)`로 `bundle_component`를 저장한다.
- `product_spec` repository 호출은 제품 기본 PATCH의 `specs` 전량 교체 경로와 시트 동기화/사양 전용 API에만 있다.
- 따라서 특징·형상 값을 바꾸지 않은 제품 기본 저장의 409 원인은 특징·형상 저장이 아니다.

### 3. 데이터에 이미 중복이 있는가 — **판정: 아니오**

격리 PostgreSQL에서 테스트 fixture를 저장한 직후 다음 중복 집계를 실행했다.

```sql
SELECT product_id, spec_key, COUNT(*) AS active_count
  FROM product_spec
 WHERE is_deleted = FALSE
 GROUP BY product_id, spec_key
HAVING COUNT(*) > 1;
```

실행 원문:

```text
SPEC_ACTIVE_DUPLICATES|[]
```

또한 중복이 없는 제품에 기존 spec 1건만 만든 뒤 무변경 저장을 재현했으므로, 기존 데이터 중복이 원인이 아니라 저장 순서 결함이다.

## RED → GREEN 원문

### RED — 수정 전

테스트: `ProductSpecNoChangeUpdateIT.무변경_제품저장은_기존_spec을_그대로_보존하고_200_경로여야_한다_RED`

```text
ProductSpecNoChangeUpdateIT > ..._RED() FAILED
1 test completed, 1 failed

SQL Error: 0, SQLState: 23505
ERROR: duplicate key value violates unique constraint "ux_product_spec_active"
Detail: Key (product_id, spec_key)=(..., 냉방능력, kW) already exists.
insert into product_spec (...)
```

### GREEN — 수정 후

```text
tests="2" skipped="0" failures="0" errors="0"
SPEC_ACTIVE_DUPLICATES|[]
BUILD SUCCESSFUL
```

두 번째 테스트에서 실제 값 변경(`5.2` → `6.0`)도 정상 교체됨을 확인했다.

## 라이브QA3 불변식 보존 근거

라이브QA3 보고서와 스크린샷 8장은 수정 전 정상 기준으로 보존되어 있다.

```text
ITEM_1|PASS|부자재 추가→수량2·컬러·사각→PUT 200→재조회 유지; RERENDER_ERROR_COUNT|0
ITEM_2|PASS|6개 제품·분류 응답 nested raw UUID=0
ITEM_3|PASS|규칙 재오픈 3칩→무변경 PUT 200→재조회 3칩
ITEM_8|PASS|PANEL/REMOTE 특징 후보 변경
ITEM_9|PASS|형상=(없음),원형,사각 initial='' PANEL/REMOTE enabled
ITEM_10|PASS|특징·형상 저장/재조회 유지, 모델코드 불변
ITEM_11|PASS|다섯 표면 노출
ITEM_13|PASS|무변경 PUT 200·AUTO AC110BXADHH1:6+AC110CNMDHH1:4 / 합 9 HTTP400 한국어 / FIXED AWR-WE13N=45,375
```

이번 코드 변경은 `ProductService.replaceSpecs()`와 그 회귀 IT만 건드렸고, `BundleComponentService`, 특징·형상 옵션, 수량동기화, UUID 응답, 활성 타깃 로직은 변경하지 않았다. 라이브 UI 재실행은 하지 않았으며, 위 보존 근거는 `docs/dev-reports/2026-08-13-1143-liveqa3-sol.md` 및 `docs/qa/2026-08-13-1143-liveqa3/`의 기존 실행 원문이다.

## 못 한 것

- 이 라운드에서는 격리 서비스 왕복 Live QA와 신규 스크린샷을 다시 실행하지 못했다. 변경 범위가 product-service의 flush 순서 1건과 해당 통합 회귀 테스트이며, 라이브QA3 정상 축은 위 문서/스크린샷으로 재확인했다.

## 검증 원문

```text
npm run typecheck
Exit code: 0
real-QA 보조 테스트: tests 51, pass 51, fail 0

& .\gradlew.bat :services:product-service:test --no-daemon
BUILD SUCCESSFUL
15 actionable tasks: 1 executed, 14 up-to-date
```

데스크톱 전체 `npm test`는 사용자 사전 공지와 동일하게 1건만 실패했다.

```text
Failed Tests 1
FAIL src/renderer/routes/SlipFormPage.test.tsx
  SlipFormPage outbound date contract
  preserves a user-edited N when M changes and exposes an M/N validation error
  SlipFormPage.test.tsx:1680
  Expected: "2026-08-14"
  Received: "2026-08-10"
```

그 외 출력된 테스트는 PASS이며, 이 브랜치와 무관한 위 1건은 수정하지 않았다.

특징·형상 저장 경로의 변경 부재도 관련 모듈 테스트를 별도로 실행해 확인했다.

```text
& .\gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.service.BundleComponentServiceTest --no-daemon
BUILD SUCCESSFUL
```

## 라운드 종료 점검

```text
git status --short
 M services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java
 D tools/.s24-build-only/build/deep/tracked-writer.mjs
?? docs/dev-reports/2026-08-13-1143-fix-spec-conflict-luna.md
?? docs/qa/2026-08-12-1143-reconv/reconv-api-probe.ps1
?? docs/qa/2026-08-12-1143-reconv/reconv-expand-all.ps1
?? services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSpecNoChangeUpdateIT.java
```

삭제된 추적 파일 확인: **`tools/.s24-build-only/build/deep/tracked-writer.mjs`가 현재 존재하지 않고 `git ls-files --deleted`에 잡힌다.** 이 삭제는 이번 fix의 대상이 아니므로 복원하지 않았다(사용자 지시대로 git 변경 계열 명령도 사용하지 않았다).

이번 라운드에서 생성한 격리 Testcontainers PostgreSQL과 테스트 프로세스는 종료되었고, 작업 전용 서비스/renderer/임시 dump 컨테이너는 없었다. 공유 DB에는 쓰지 않았다.
