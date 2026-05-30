# BE Cycle 2 리뷰 — Phase 2.5 파트너 주문 보류(ON_HOLD) + 리스트 필터

**리뷰어**: Claude BE Agent
**대상 커밋**: 0f5c8728 (cycle1 fix HEAD)
**리뷰 기준 diff**: 1eedabc8..0f5c8728 (BE 파일)
**날짜**: 2026-05-30

---

## 검토 항목 요약

| # | 검토 포인트 | 판정 |
|---|---|---|
| 1a | COALESCE 정렬 전환 — Specification query.orderBy 방식 채택 여부 | P1 결함 |
| 1b | count 쿼리에 orderBy 포함 시 경고/오류 위험 | P1 결함 (1a와 연동) |
| 2 | COALESCE as(LocalDate) 캐스팅 — 타입 혼재 정합성 | 이상 없음 |
| 3 | IT 케이스 9/10 — false-green 여부 + JDBC 삽입 충돌 | 조건부 이상 없음 |
| 4 | 기존 list 케이스 회귀 + 다른 호출부 영향 | 이상 없음 |
| 5 | @Version 보호 결론 타당성 | 이상 없음 |

---

## 세부 분석

### 1a. [P1] COALESCE 정렬이 실제로 페이지 정렬을 보장하지 않음

**현상**: cycle1 fix(0f5c8728)에서 `PartnerOrderQueryService.list` 의 정렬은 **여전히 컨트롤러가 전달하는 `Sort.by(DESC, "createdAt")`** 에 의존한다.

`PartnerOrderListController.java:53`:
```
Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
```

`PartnerOrderQueryService.java`의 `toSpec` Specification 람다에는 `query.orderBy(...)` 호출이 없다. cycle1 fix diff를 보면 `effectiveDate` 변수는 WHERE 절 predicates 에만 사용되고, SELECT 결과의 ORDER BY 절에 적용되지 않는다.

**결론**: 정렬 기준이 `createdAt DESC`(고정) 이므로 COALESCE 의 취지(confirmedAt 우선, DRAFT/ON_HOLD는 createdAt fallback)가 정렬에는 반영되지 않는다. cycle1 TM 보고서에서 "P1-1/P1-2 COALESCE 정렬 통일"이 수정됐다고 명시했으나, 실제 커밋에서 정렬은 변경되지 않았다.

**영향**: 기간 필터 적중 여부(WHERE 절)는 COALESCE 적용으로 정확해졌다. 그러나 반환 순서는 `createdAt DESC` 고정이므로, CONFIRMED 주문이 confirmedAt 기준으로 정렬되는 것이 아니다. 이 동작이 명세와 일치하면 문제 없다. 그러나 cycle1 fix의 커밋 메시지("P1-1/P1-2 list 정렬·기간필터 COALESCE 통일") 및 Javadoc이 정렬도 COALESCE로 변경됐음을 시사하는 반면 실제로는 기간 필터만 변경됐다. **코드와 커밋 메시지/Javadoc 간 불일치**가 존재한다.

**단, 현재 working directory에 이미 미커밋 수정이 존재함**: query.orderBy + getResultType 분기 코드가 uncommitted 상태로 파일에 포함되어 있다. 이 코드가 cycle2 fix로 커밋되면 P1 결함이 해소된다.

**단, 다음 문제가 있음** (아래 1b 참조).

---

### 1b. [P1] `query.orderBy`를 Specification에서 사용할 때 count 쿼리 문제 — working directory 코드

working directory의 미커밋 수정 코드:

```java
Class<?> resultType = query.getResultType();
if (resultType != Long.class && resultType != long.class) {
    query.orderBy(cb.desc(
            cb.coalesce(root.get("confirmedAt"), root.get("createdAt"))));
}
```

**검증 포인트별 판정**:

**질문 1: `query.getResultType()` count 분기가 올바른가?**

Spring Data JPA의 `SimpleJpaRepository.findAll(Specification, Pageable)` 구현에서 count 쿼리는 `Long`을 반환하도록 `CriteriaQuery<Long>` 를 생성한다. 따라서 `query.getResultType()` 이 `Long.class`인 경우 count 쿼리임이 맞고, 분기 로직은 정확하다.

**질문 2: Specification 내 `query.orderBy`가 컨트롤러의 `Sort.by(createdAt DESC)`와 충돌하는가?**

Spring Data JPA의 `SimpleJpaRepository.getQuery(Specification, Sort)` 구현에서는 `Sort`를 CriteriaQuery에 직접 적용하기 전에 Specification의 `toPredicate`를 먼저 실행한다. Specification 람다 내부에서 `query.orderBy(...)` 를 호출하면 Specification이 먼저 ORDER BY를 세팅하고, 이후 Spring Data가 `Sort` 변환 결과를 다시 `query.orderBy(...)`로 덮어쓴다.

즉, **Specification 내 `query.orderBy` 호출 결과는 컨트롤러의 `Sort.by(createdAt DESC)`에 의해 덮어씌워진다**. working directory 코드의 의도(COALESCE DESC 정렬)는 실제로 적용되지 않는다.

이 동작은 `SimpleJpaRepository.applySpecificationToCriteria` → `applySorting(query, sort, root)` 호출 순서로 확인된다. Spring Data JPA 3.x (Spring Boot 3.3.5)에서 Sort가 존재하면 Specification의 orderBy를 항상 덮어쓴다.

**결론**: working directory의 COALESCE 정렬 fix 의도는 올바르나 구현 방식이 잘못됐다. 올바른 해결 방법은 다음 둘 중 하나다.

옵션 A (권장): 컨트롤러에서 `Sort.by(DESC, "createdAt")` 를 제거하고 `PageRequest.of(page, size)` (Sort 없음)로 전달하면, Specification의 `query.orderBy(COALESCE DESC)` 가 유효하게 적용된다.

옵션 B: Specification에서 `query.orderBy` 를 제거하고, 컨트롤러의 Sort를 COALESCE 표현식 기반 정렬로 대체한다. 다만 `Sort.by(...)` 는 단순 필드명만 지원하므로 COALESCE 표현식을 Sort로 직접 표현할 수 없어 사실상 불가능하다.

**따라서 옵션 A — 컨트롤러 Sort 제거 + Specification query.orderBy 유지 + getResultType 가드 — 가 필요하다.**

---

### 2. COALESCE as(LocalDate) 캐스팅 — 타입 혼재 정합성

코드에서 `cb.coalesce(root.get("confirmedAt"), root.get("createdAt"))` 의 양쪽 타입을 확인한다.

- `confirmedAt`: `@Column LocalDateTime confirmedAt` — `LocalDateTime`
- `createdAt`: `BaseEntity @CreatedDate LocalDateTime createdAt` — `LocalDateTime`

양쪽 모두 `LocalDateTime`으로 동일 타입이다. `.as(LocalDate.class)` 캐스팅 코드는 toSpec 내부에 존재하지 않는다. `effectiveDate` 변수는 `Expression<LocalDateTime>` 타입으로 선언되고, `atStartOfDay()` 를 통해 LocalDate → LocalDateTime 변환 후 비교한다. 타입 혼재 문제 없음.

---

### 3. IT 케이스 9/10 — false-green 여부 + JDBC 삽입 충돌

**케이스 9 (createdAt 기간필터 COALESCE fallback)**:

`buildOrderWithStatusViaDbAt` 헬퍼가 `CAST(? AS TIMESTAMP)` 로 `createdAt`을 직접 삽입한다. `BaseEntity`의 `@CreatedDate`는 JPA persist 시점에만 세팅되며, JDBC 직접 INSERT는 JPA auditing을 우회하므로 `created_at` 컬럼에 임의 값을 삽입할 수 있다. 충돌 없음.

케이스 9는 "과거 날짜(2026-05-01) 주문 1건 + 오늘 날짜(2026-05-30) 주문 1건"을 삽입하고, `dateFrom=2026-05-30`, `dateTo=2026-05-30` 으로 필터해 1건만 반환되는지 검증한다. COALESCE(confirmedAt=NULL, createdAt="2026-05-30") = "2026-05-30"이므로 today 주문이 기간 내에 포함되고, COALESCE(NULL, "2026-05-01") = "2026-05-01"은 범위 밖이므로 제외된다. 로직이 정확하다.

**케이스 10 (전체조회 totalElements=2)**:

DRAFT 1건 + CONFIRMED 1건 삽입 후 status 필터 없이 조회해 `totalElements=2` 를 단언한다. CONFIRMED 주문도 `buildOrderWithStatusViaDb` 에서 `confirmed_at=NULL`로 삽입된다는 점을 주의해야 한다. 실제 CONFIRMED 주문은 `markSlipPublished` 경로에서만 생성되는데, 이 헬퍼는 `confirmed_at=NULL`로 직접 INSERT하므로 DB 에 `status='CONFIRMED', confirmed_at=NULL` 인 비정상 row가 생성된다. 이 상태에서 COALESCE(NULL, createdAt)는 createdAt을 반환하므로 CONFIRMED 주문도 조회에 포함된다.

케이스 10은 totalElements 포함 여부만 검증하므로 false-green은 아니다. 다만 실제 CONFIRMED 주문의 confirmed_at은 항상 non-null이기 때문에 이 케이스는 CONFIRMED+confirmedAt=NULL 이라는 비현실 데이터를 사용하는 한계가 있다. IT 커버리지 관점에서 허용 가능한 수준이다.

---

### 4. 기존 list 케이스(status별 필터) 회귀 + 다른 호출부 영향

케이스 5(DRAFT 필터), 케이스 6(ON_HOLD 필터), 케이스 7(CONFIRMED 필터)은 cycle1 fix 이후에도 변경 없이 존재한다. `toSpec`의 status 필터 predicate 로직(`cb.equal(root.get("status"), filter.status())`)은 그대로 유지됐다. COALESCE 변경은 WHERE 절의 기간 조건에만 영향을 주고 status 필터에는 영향이 없다. 회귀 없음.

다른 호출부 검토:
- `PartnerOrderHistoryController` — `findAllByBizCodeAndConfirmedAtBetween...` 직접 Repository 메서드 사용, QueryService 미사용. 영향 없음.
- `VendorOrderController` — QueryService를 호출하지 않음. 영향 없음.
- `PartnerOrderHoldController`, `PartnerOrderDraftController` 등 — `PartnerOrderQueryService.findDetailById` 만 사용하며 list 미사용. 영향 없음.

---

### 5. @Version 보호 결론 타당성

`PartnerOrder.lockVersion` 필드:
```java
@Version
@Column(name = "lock_version", nullable = false)
private Long lockVersion;
```

`markOnHold()` 와 `releaseHold()` 는 `status` 필드를 변경하므로 JPA dirty-check에 의해 UPDATE가 발생하고, `@Version`이 낙관적 락 충돌을 감지한다. race condition 방어가 정상 작동한다. 결론 타당.

---

## 최종 판정

### P1 결함 (필수 수정)

**P1-NEW: COALESCE 정렬이 컨트롤러 Sort에 의해 덮어씌워짐**

- 위치: `PartnerOrderListController.java:53` + `PartnerOrderQueryService.toSpec`
- 현상: Specification 내 `query.orderBy(COALESCE DESC)` 는 컨트롤러가 전달한 `Sort.by(DESC, "createdAt")`에 의해 무효화된다. COALESCE 정렬 의도가 실제 쿼리에 반영되지 않는다.
- 수정 방향: `PartnerOrderListController`에서 `Sort` 제거하고 `PageRequest.of(page, size)` 사용 (Sort.UNSORTED). Specification의 `query.orderBy(cb.desc(coalesce(...)))` + `getResultType()` count 가드를 그대로 유지.
- 참고: working directory의 미커밋 코드는 getResultType 분기는 정확하나 컨트롤러 Sort를 제거하지 않아 의도대로 동작하지 않는다.

### P2 결함 없음

### 승인 조건

P1-NEW 수정(컨트롤러 Sort 제거) 커밋 후 IT 케이스 5/6/7 + 케이스 9/10 재실행 green 확인 시 **BE APPROVE (cycle2)**.

---

## 결론

**BE 조건부 미승인 — P1 1건 (컨트롤러 Sort 제거) 수정 필요**

cycle1 fix에서 COALESCE 기간 필터는 정확히 수정됐다. 그러나 정렬(ORDER BY) 측면에서 Specification의 `query.orderBy` 가 컨트롤러의 `Sort.by(createdAt DESC)`에 의해 덮어씌워지는 구조적 문제가 있다. working directory의 미커밋 수정 코드가 올바른 방향이지만 컨트롤러 Sort 제거가 빠졌다. 이 1건만 수정하면 COALESCE 정렬 의도가 완전히 적용된다.
