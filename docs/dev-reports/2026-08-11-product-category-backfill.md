# 제품구분 카테고리 백필 구현 보고서

## 1. 착수 전 확인

공유 `product_db`는 `BEGIN TRANSACTION READ ONLY`와 `SHOW transaction_read_only=on`을 확인한 뒤 조회만 했다. 쓰기·배포·Git 조작은 하지 않았다.

| 확인 항목 | 결과 |
|---|---:|
| 활성 제품 | 3,084건 |
| `classification_manual=true` | 0건 |
| 수동행 분포 | 해당 없음 (전체 활성행 false) |
| 정찰본 보수 규칙 재현 | 자동 916건 / 미분류 2,168건 |
| `category_id` | `NOT NULL` |
| Flyway 기준 | `origin/main` product-service V37 → 이번 V38 |

기존 카테고리 트리 API는 활성 루트부터 재귀 반환하고, 데스크톱 등록·수정 화면은 API가 반환한 값을 필수 선택값으로 사용한다. 따라서 루트 `UNCLASSIFIED(미분류)`는 화면에 노출되고, 기존 `categoryId` 필터·카운트 계약도 그대로 적용된다.

## 2. 단일 자동분류 규칙

`ProductNameCategoryClassifier`가 시트 신규 적재와 V38 Java Flyway migration에서 공통으로 호출하는 유일한 규칙 원천이다. 품목명은 공백 제거·소문자화 뒤 다음 순서로 평가한다.

```text
배관/부속 예외: 일자발|받침|거치|브라켓|앵글
실외기:         실외기
실내기:         실내기
서비스:         서비스|수수료|운임|설치비|절삭|철거비|출장비|작업비|시운전비
제어:           리모컨|리모콘|중앙제어|제어기|컨트롤러|와이파이.*키트|wifi.*키트|wi-fi.*키트|통신.*키트|중계기
배관/부속:      자재|부자재|받침대|받침|가대|필터|판넬|패널|데코커버|윈드가이드|몰딩|키트|kit|보드|발통|드레인|호스|분기관|배관|배수펌프|냉매관|동관|분배헤더|헤더|커버|케이블|전선|테이프|엘보|소켓|밸브|캡
공조:           전열교환기|erv
벽걸이:         벽걸이
천장형:         시스템천장형|천장형|카세트|1-?way|4-?way|360cst|실링
미일치:         UNCLASSIFIED (미분류)
```

품목명에서 미일치일 때만 `bundle_component.component_kind`를 그 구성품의 `component_product_code → products.model_code` 방향으로 역산한다. `OUTDOOR→OUTDOOR`, `INDOOR→INDOOR`, `REMOTE→CONTROL`, `ACCESSORY/PANEL/MATERIAL/FOOT→PIPING`이다. OUTDOOR·INDOOR가 동시에 있으면 보수적으로 미분류이다. 세트 자신에게는 역산하지 않는다.

## 3. 구성품·받침대 사전 검증

| 항목 | 결과 |
|---|---:|
| 활성 구성품 연결 제품 | 401건 |
| 역할 충돌 | 11건 |
| 구성품 순증 | 41건 (개발책임자 94건 수치 폐기) |
| 받침대 계열 전수 | 18건 |
| 그중 실외기 이름 | 11건 |
| 그중 실내기 이름 | 2건 |
| 실외기 전체 / 받침대 예외 / 본체 후보 | 171 / 11 / 160건 |

11개 역할 충돌은 모두 `ACCESSORY+INDOOR/OUTDOOR`이고 품목명에 실내기·실외기가 명시되어 품목명 우선으로 해소된다. 실외기 받침대 예외 11건은 모두 `PIPING`으로 먼저 확정되며, 정상 실외기 본체 후보 160건은 예외에 매칭되지 않는다.

받침대 계열 중 실외기·실내기 이름 교집합 전수는 다음 13건이다. 실외기 11건은 개발책임자 제시 목록과 일치한다.

```text
실내기 받침대
실외기 거치대 (소)
실외기 일자발
실외기 일자발 (전면 4~6HP)
실외기 일자발 (전면 8~12HP)
실외기거치대
실외기거치대(벽걸이)
실외기거치대(스텐드)
실외기받침대 (2건)
실외기실내받침대
원터치형 베란다 실외기 받침대
중대형 실내기받침대
```

역할 충돌 11건도 전수 확인했다.

```text
AC023CN1DBC1, AC023CN1PBH1, AC032CN1DBC1, AC032CN1PBH1, AC040CN1DBC1, AC040CN1PBH1
  → ACCESSORY,INDOOR / 품목명: 무풍 1way 냉방전용·냉난방 실내기
AC023CX1DBC1, AC023CX1PBH1, AC032CX1DBC1, AC032CX1PBH1, AC040CX1DBC1
  → ACCESSORY,OUTDOOR / 품목명: 무풍 1way 냉방전용·냉난방 실외기
```

## 4. 두 신호 합산 최종 분포

| 코드 | 제품구분 | 건수 | 구성품 순증 |
|---|---|---:|---:|
| OUTDOOR | 실외기 | 201 | 41 |
| INDOOR | 실내기 | 415 | 0 |
| INDOOR_WALL | 벽걸이형 | 40 | 0 |
| INDOOR_CEILING | 시스템 천장형 | 61 | 0 |
| PIPING | 배관/부속 | 167 | 0 |
| CONTROL | 계장/제어 | 29 | 0 |
| HVAC | 공조(HVAC) | 11 | 0 |
| SERVICE | 서비스/요금 | 34 | 0 |
| UNCLASSIFIED | 미분류 | 2,126 | 0 |

## 5. V38 감사와 rollback

V38은 루트 `UNCLASSIFIED`를 기존 활성 루트의 `MAX(display_order)+1`에 멱등 생성한다. `product_category_backfill_audit`에 migration key, 제품 ID, 이전/적용 카테고리 ID·코드, 사유, rollback 상태 및 BaseEntity 7 audit 열을 먼저 기록한다. 활성·`classification_manual=false`이며 실제 카테고리가 달라지는 행만 적용한다.

rollback은 다음 순서로 운영자가 명시 실행할 수 있다.

```sql
/* 역사적으로 조건부 검증 없이 제품만 갱신한 SQL — 사용하지 않는다.
UPDATE products p
   SET category_id = a.previous_category_id,
       modified_at = CURRENT_TIMESTAMP,
       modified_by = 'V38-rollback'
  FROM product_category_backfill_audit a
 WHERE a.migration_key = 'V38-PRODUCT-CATEGORY-BACKFILL'
   AND a.product_id = p.id
   AND a.rolled_back_at IS NULL
   AND a.is_deleted = FALSE
   AND p.is_deleted = FALSE
   AND p.classification_manual = FALSE
   AND p.category_id = a.applied_category_id;
*/

/* 역사적으로 잘못된 전건 완료 처리 SQL — 사용하지 않는다.
UPDATE product_category_backfill_audit
   SET rolled_back_at = CURRENT_TIMESTAMP,
       rolled_back_by = '운영자식별자',
       modified_by = 'V38-rollback'
 WHERE migration_key = 'V38-PRODUCT-CATEGORY-BACKFILL'
   AND rolled_back_at IS NULL
   AND is_deleted = FALSE;
*/
```

현재 rollback은 다음 CTE SQL을 사용한다. `:actor`는 공백이 아닌 수행자 식별자로 바인딩한다.
제품 갱신과 감사 완료 표시는 `RETURNING` 결과로 연결되어 실제 복원된 행만 완료 처리한다.

```sql
WITH restored AS (
    UPDATE products p
       SET category_id = a.previous_category_id,
           modified_at = CURRENT_TIMESTAMP,
           modified_by = :actor
      FROM product_category_backfill_audit a
     WHERE a.migration_key = 'V38-PRODUCT-CATEGORY-BACKFILL'
       AND a.product_id = p.id
       AND a.rolled_back_at IS NULL
       AND a.is_deleted = FALSE
       AND p.is_deleted = FALSE
       AND p.classification_manual = FALSE
       AND p.category_id = a.applied_category_id
     RETURNING a.id
)
UPDATE product_category_backfill_audit a
   SET rolled_back_at = CURRENT_TIMESTAMP,
       rolled_back_by = :actor,
       modified_at = CURRENT_TIMESTAMP,
       modified_by = :actor
  FROM restored r
 WHERE a.id = r.id;
```

구현 클래스의 `V38__ProductCategoryBackfill.rollback(connection, actor)`도 동일한
조건·원자성·`RETURNING` 연결을 사용한다.

## 6. RED와 조합 검증

| 조합 | 검증 결과 |
|---|---|
| 자동분류 성공 신규 | `실외기` → OUTDOOR |
| 자동분류 실패 신규 | 모델명형 품목 → UNCLASSIFIED |
| 수동분류 기존 | `classification_manual=true` 행은 V38 대상 제외 |
| 자동분류 기존 | OUTDOOR/INDOOR/PIPING으로 감사 후 변경 |
| 미분류 기존 | UNCLASSIFIED로 감사 후 변경 |
| 미분류 품목 견적 노출 | category_id 유효값 유지, 견적·정액DC 축 변경 없음 |
| soft-delete 후 재등장 | 같은 모델 코드의 삭제행을 `markRestored()`해 기존 카테고리 보존 |
| 구성품 역산 | 구성품 품목만 OUTDOOR로 보정, 세트 자신은 미변경 |

## 7. 테스트 결과

- RED: 분류기 부재, V38 migration 부재, 시트의 OUTDOOR/UNCLASSIFIED/재등장 보존 실패를 각각 확인했다.
- 격리 Testcontainers PostgreSQL: V38 감사·수동 불가침·rollback·구성품 OUTDOOR 역산 통과.
- 명칭 개정 RED: 새 코드값을 기대하도록 바꾼 분류기 테스트 2건이 기존 반환값 때문에 실패함을 확인했다.
- 명칭 개정 GREEN: 분류기·V38·시트 동기화 대상 테스트 — **BUILD SUCCESSFUL**, 39초.
- `./gradlew.bat :services:product-service:test` — **BUILD SUCCESSFUL**, 2분 31초.

## 8. 신규 파일

- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductNameCategoryClassifier.java`
- `services/product-service/src/main/java/db/migration/V38__ProductCategoryBackfill.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/service/ProductNameCategoryClassifierTest.java`
- `services/product-service/src/test/java/db/migration/V38__ProductCategoryBackfillTest.java`
- `docs/superpowers/specs/2026-08-11-product-category-backfill-design.md`
- `docs/superpowers/plans/2026-08-11-product-category-backfill.md`
- `docs/dev-reports/2026-08-11-product-category-backfill.md`

## 9. 현재 명칭 검증 (UNCLASSIFIED / 미분류)

개발책임자 용어를 정본으로 반영했다. 분류 규칙·우선순위·구성품 역산·감사·rollback에는 변경이 없다.

| 구분 | 개정 전 | 개정 후 | 건수 |
|---|---|---|---:|
| 실외기 | OUTDOOR | OUTDOOR | 201 |
| 실내기 | INDOOR | INDOOR | 415 |
| 벽걸이형 | INDOOR_WALL | INDOOR_WALL | 40 |
| 시스템 천장형 | INDOOR_CEILING | INDOOR_CEILING | 61 |
| 배관/부속 | PIPING | PIPING | 167 |
| 계장/제어 | CONTROL | CONTROL | 29 |
| 공조(HVAC) | HVAC | HVAC | 11 |
| 서비스/요금 | SERVICE | SERVICE | 34 |
| 미분류 | UNCLASSIFIED / 미분류 | UNCLASSIFIED / 미분류 | 2,126 |

합계 3,084건으로 개정 전후 모든 카테고리별 분류 건수는 동일하다.

### 이전 코드 문자열 전수 검색 및 처리

`rg -n "UNCLASSIFIED" .`를 실행했다. 제품 서비스(migration·시더·서비스·테스트·mock) 결과는 0건이고, 프런트에는 해당 카테고리 코드 참조가 없었다. 남은 결과는 다음과 같이 제품구분 범위와 분리되어 있다.

| 검색 위치 | 건수 | 처리 |
|---|---:|---|
| `services/product-service/**` | 0 | 모두 `UNCLASSIFIED`로 개정 완료 |
| 이 보고서 | 2 | 개정 전후 대조표의 과거값 1건과 이 검색 근거 문장 1건. 실행 코드 아님 |
| `docs/dev-reports/2026-08-03-1015-r20-reconvergence.md` | 2 | 과거 전표 분석 marker, 제품 카테고리 아님 — 보존 |
| `docs/dev-reports/migration-be-m3-dc-config-service.md` | 2 | DC 거래처그룹 enum 문서, 제품 카테고리 아님 — 보존 |
| `services/slip-service/**` | 2 | 전표 지역그룹 상수, 제품 카테고리 아님 — 보존 |
| `services/dc-config-service/**` | 8 | 거래처그룹 enum·시더·테스트, 제품 카테고리 아님 — 보존 |

모델코드 접두어 기반 분류는 추가하지 않았다. 위 두 신호로 판정되지 않는 품목은 `UNCLASSIFIED(미분류)`에 그대로 남는다.
