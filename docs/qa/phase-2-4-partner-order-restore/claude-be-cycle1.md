# Phase 2.4 Partner-Order RESTORE — BE 코드 리뷰 (Claude Cycle 1)

**리뷰 일시**: 2026-05-30  
**브랜치**: `feat/phase-2-4-partner-order-restore` (HEAD 9d3bcfd4)  
**리뷰 범위**: git diff d4bda209..HEAD BE 부분  
**결론**: **CONDITIONAL APPROVE** — P1 결함 1건, P2 결함 2건, Minor 3건

---

## 결함 목록

### [P1] PartnerOrderRevisionService.java:164~228 — restore() 내 삭제 주문 undelete 이후 라인 활성화 로직 오류

**문제**:  
`restore()` 메서드에서 soft-deleted 주문을 `restoreFromDeleted()`(undelete) 한 직후, `replaceLines()` 를 호출한다. 그런데 `PartnerOrder.getLines()` 는 `deletedAt == null` 인 라인만 반환한다. soft-deleted 주문의 라인은 `softDeleteCascade()` 에서 전부 `deletedAt != null` 상태로 soft-delete 되어 있으므로, `getLines()` 가 빈 리스트를 반환한다. 따라서 `replaceLines()` 내부의 기존 라인 soft-delete 루프(`for line in this.lines if deletedAt == null → markDeleted`) 는 실제로 아무 것도 처리하지 않고, 이후 `addLine()` 으로 새 라인만 추가된다. 기능적으로는 원하는 결과(새 라인 삽입)를 얻지만, 코드 주석(service 165~167행, "undelete 후 lines 컬렉션은 soft-deleted 라인만 있으므로 replaceLines 가 모두 교체")과 실제 JPA 컬렉션 상태 사이에 위험한 불일치가 있다.

**핵심 위험**: `PartnerOrder.lines` 는 `@OneToMany` 컬렉션이며 `@SQLRestriction("is_deleted = false")` 가 걸려 있다. Hibernate 는 이 컬렉션을 lazy load 할 때 is_deleted=false 행만 로드한다. 따라서 undelete 후 `markRestored()`(BaseEntity 수준에서 is_deleted=false 전환)는 인메모리 엔티티의 `isDeleted` 필드를 false 로 바꾸지만, 이미 로드된 `lines` 컬렉션에 soft-deleted 라인이 포함되어 있지 않다. 결국 `replaceLines()` 가 호출될 때 `this.lines` 는 사실상 빈 리스트이며, 더 나쁜 경우 이전에 활성 상태로 일부 라인이 로드된 상황이라면 의도치 않은 중복 markDeleted가 발생할 수 있다. IT 케이스 7번은 `from-estimate → delete → restore` 흐름만 검증하므로, 중간에 update 로 라인 변경이 있었던 경우(create → edit → delete → restore) 는 커버가 안 된다.

**권장**: 서비스 주석이 "undelete 후 라인은 모두 soft-deleted 상태" 라는 가정에 의존하고 있으므로, `restoreFromDeleted()` 내부 또는 직후에 `entityManager.refresh(order)` 를 호출하거나, `@SQLRestriction` 우회를 위해 native query 로 라인을 포함하여 재조회하는 방식으로 컬렉션을 명확히 갱신해야 한다. 또는 `replaceLines()` 가 삭제된 라인까지 모두 탐색하도록 `this.lines` (SQLRestriction 우회 포함 전체 컬렉션) 기준으로 동작하게 수정해야 한다. 최소 조건: create→edit(라인 변경)→delete→restore 흐름의 IT 케이스를 추가해 라인 정합성 검증 필수.

---

### [P2] PartnerOrderRevisionService.java:220~221 — restore() 내 `orderRepository.saveAndFlush` 와 `capture()` 순서 — 트랜잭션 부분커밋 위험

**문제**:  
`restore()` 에서 `orderRepository.saveAndFlush(order)` 로 주문 변경을 flush 한 뒤, 같은 트랜잭션 내에서 `capture(saved, RESTORE, ...)` 를 호출한다. `capture()` 내부에서 다시 `revisionRepository.saveAndFlush(revision)` 를 호출한다. 이 구조 자체는 정상이지만, `capture()` 내 `DataIntegrityViolationException` 1회 재시도 로직이 실패 후 `ResponseStatusException(409)` 를 던질 때, 이미 `saveAndFlush` 된 주문 상태 변경(헤더/라인 교체)은 트랜잭션 내에서 flush 된 상태이다. Spring의 `@Transactional` 은 트랜잭션 전체를 rollback 하므로 최종적으로는 rollback 된다. 그러나 `DataIntegrityViolationException` 이 발생한 시점에서 Hibernate 세션이 이미 오염되어(markRollbackOnly 전환) 1회 재시도가 같은 세션에서 정상 동작하지 못할 가능성이 있다.

**핵심 위험**: `DataIntegrityViolationException` 은 Spring의 DataAccessException 계층이며, Hibernate 5/6에서 이 예외 발생 시 EntityManager 가 `javax.persistence.RollbackException` 상태로 전환되는 구현이 있다. 같은 트랜잭션 내 재시도가 이미 rollback-only 상태인 세션에서 시도되면 재시도도 실패하게 된다. EstimateRevisionService 에서도 동일 패턴이 사용되고 있다면 기존 검증된 패턴의 미러라고 볼 수 있으나, 확인이 필요하다.

**권장**: `saveWithNextRevisionNo()` 를 별도 `@Transactional(propagation = REQUIRES_NEW)` 메서드로 분리하거나, 재시도 로직을 새 트랜잭션에서 실행하는 helper 서비스로 격리하는 것이 안전하다. 최소 조건: EstimateRevisionService 의 동일 패턴이 기 검증된 경우 동일 전략을 명시적으로 주석에 기재.

---

### [P2] GlobalExceptionHandler.java:49 — `ResponseStatusException` 핸들러가 `ErrorCode.INTERNAL_ERROR` 로 고정

**문제**:  
`handleResponseStatus()` 메서드가 `ApiResponse.fail(ErrorCode.INTERNAL_ERROR, ex.getReason())` 로 응답을 생성하고 있다. `ex.getStatusCode()` 로 HTTP 상태코드는 올바르게 전달되지만, `errorCode` 필드는 항상 `INTERNAL_ERROR` 로 고정된다. 즉 409 CONFLICT 응답의 `error.code` 가 `INTERNAL_ERROR` 로 노출된다. FE 가 `error.code` 기준으로 분기 처리를 하는 경우 409(복원 가드/채번 충돌) 와 500(서버오류) 를 구분할 수 없다.

**권장**: `ResponseStatusException` 의 HTTP 상태코드에 따라 적합한 `ErrorCode` 를 매핑하거나, `ApiResponse.fail(String errorCode, String message)` 오버로드를 추가하여 status-to-errorCode 매핑 로직을 구현한다. 최소한 409는 `ErrorCode.CONFLICT` 등 별도 코드를 사용해야 한다.

---

### [Minor-1] PartnerOrderRevisionService.java:164~168 — 복원 가드 순서 (requireRestorable 위치)

**문제**:  
처리 순서가 "(1) 주문 로드 → (2) revision 로드 → (3) requireRestorable → (4) undelete → (5) wasConfirmed 캡처" 이다. soft-deleted 주문의 경우 `getStatus()` 가 삭제 이전 마지막 status 를 반환하는데, `DELETABLE_STATUSES = {DRAFT, CONFIRMING}` 이므로 삭제 가능한 주문이 CONFIRMING 상태였다면 `requireRestorable()` 에서 409를 반환한다. 이는 의도된 동작인지 모호하다. CONFIRMING 상태에서 삭제된 주문은 복원 자체도 불가한가?

**권장**: 설계서 §3.3a 에서 "삭제된 주문도 복원 가능" 의 범위를 명확히 정의하고, CONFIRMING 상태로 soft-delete 된 주문에 대한 복원 정책을 주석에 명시.

---

### [Minor-2] PartnerOrderRevisionRestoreIT.java:282~287 — case2 `rev1LineCount` 변수 단언 버그

**문제**:  
케이스 2 `case2_draftRestore_headerAndLinesMatchRev1AndRestoreRevisionCreated()` 에서 다음 코드가 있다:

```java
int rev1LineCount = revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId)
    .stream().filter(r -> r.getRevisionNo() == 1).findFirst()
    .map(r -> r.getRevisionNo()).orElseThrow();
assertThat(rev1LineCount).isEqualTo(1); // rev1 revisionNo=1
```

`map(r -> r.getRevisionNo())` 로 revision 의 `revisionNo` 값(=1)을 추출하고, `assertThat(rev1LineCount).isEqualTo(1)` 로 단언한다. 변수명이 `rev1LineCount`(라인 수 의도)인데 실제로는 `revisionNo`(=1) 를 검증한다. 의미 없는 단언(revisionNo=1 은 항상 1이어야 하는 채번 결과이지 라인 수가 아님). 실제로 rev1 스냅샷의 라인 수가 2개인지를 검증하려는 의도였던 것으로 보인다.

**권장**: `rev1LineCount` 변수를 제거하거나, 실제로 스냅샷 JSON 을 파싱해 라인 수를 검증하는 단언으로 교체.

---

### [Minor-3] V7 SQL — `revision_type` VARCHAR(16) 에 `DELETE` 미포함 DDL 주석

**문제**:  
`V7__add_partner_order_revisions.sql` 의 `revision_type` 컬럼 주석이 `-- CREATE / EDIT / STATUS / RESTORE` 이며, `DELETE` 가 누락되어 있다. `PartnerOrderRevisionType` enum 에는 `DELETE` 가 존재하고 `PartnerOrderDeleteService` 에서 실제로 사용한다.

**권장**: 주석을 `-- CREATE / EDIT / STATUS / RESTORE / DELETE` 로 수정.

---

## 점검 결과 요약

| 번호 | 점검 항목 | 결과 | 비고 |
|------|-----------|------|------|
| 1 | 복원 정합성: 헤더 역적용+라인 전량교체 | P1 | 삭제 주문 undelete 후 lines 컬렉션 일치 불확실 |
| 1b | status/slipNo 등 slip 연동 필드 역적용 제외 | OK | `restoreHeader` 는 partnerCode/bizCode/dueDate/memo 만 처리 |
| 2 | 채번 race — MAX+1 saveAndFlush 1회 재시도 → 409 | P2 | DataIntegrityViolation 후 동일 세션 재시도 Hibernate 상태 |
| 2b | partial unique 정합 | OK | `uq_partner_order_revisions_no_active` WHERE is_deleted=FALSE |
| 3 | 캡처 훅 CREATE×2(confirm+fromEstimate)/EDIT/DELETE 누락 0 | OK | 4개 경로 모두 캡처 확인 |
| 3b | draft create 별개 제외 여부 | OK | PartnerOrderDraft 는 별도 엔티티, revision 대상 외 |
| 3c | cancel STATUS 死코드 여부 | Minor | STATUS 타입은 cancel() 경로 hookup 없음 — 향후 슬라이스 예정이면 주석 명시 필요 |
| 4 | 삭제복원: findByIdIncludingDeleted nativeQuery @SQLRestriction 우회 | OK | nativeQuery=true → @SQLRestriction 적용 안 됨 |
| 4b | delete capture가 softDelete 전(활성 라인) | OK | `PartnerOrderDeleteService`: capture() 후 softDeleteCascade() |
| 4c | DELETABLE_STATUSES 와 복원가드 정합 | Minor-1 | CONFIRMING 삭제 주문 복원 정책 모호 |
| 5 | UUID 비공개: displayNameOrNull 전 캡처경로 적용 | OK | 서비스 내 displayNameOrNull 호출, DTO 에 actorId 미포함 |
| 5b | actor controller→service→capture 전달 | OK | 컨트롤러가 callerId/callerName 헤더 추출 후 service.restore 전달 |
| 6 | V40가 V39 7-action 정합 | OK | V40 기존 role_page_permission_templates + account_page_permissions 패턴 준수 |
| 6b | page code 컨트롤러 @RequirePermission 일치 | OK | 목록/상세=`history.view` VIEW / 복원=`revisions` RESTORE |
| 6c | 배포순서 리스크 | OK | V40 auth-service 배포 후 partner-order-service 배포 |
| 7 | 트랜잭션 경계: capture가 변경 트랜잭션 내 | OK | @Transactional restore() 내에서 capture() 호출 |
| 7b | GlobalExceptionHandler 다른 4xx 안 깨나 | P2 | 409 등 errorCode 가 INTERNAL_ERROR 로 고정됨 |
| 8 | BaseEntity/Soft Delete/도메인 메서드 체인/한국어 Javadoc | OK | 컨벤션 준수 |

---

## 긍정적 평가

- **복원 설계**: "제외목록 방식"(CONFIRMING/CANCELED 만 거부) 채택 — 확장성 우수. `slipResyncRequired` 플래그 분리도 적절.
- **UUID 비공개 가드**: `displayNameOrNull()` 헬퍼 분리 + static public 메서드로 단위 테스트 용이하게 설계.
- **채번 race 가드**: partial UNIQUE index + saveAndFlush + 1회 재시도 패턴 일관.
- **삭제 복원**: `findByIdIncludingDeleted` native query + `restoreFromDeleted()` 도메인 메서드 분리로 BaseEntity `markRestored()` 재사용.
- **캡처 훅 완결성**: 4개 경로(confirm/fromEstimate/update/delete) 모두 동일 트랜잭션 내 capture — 부분 커밋 없음.
- **IT 케이스 7번**: 삭제 후 복원 end-to-end 플로우 포함, 단조증가 검증, @MockBean 격리 패턴 준수.
- **한국어 Javadoc**: entity/service/controller 전방위 적용.
- **V7 DDL**: partial UNIQUE + 타임라인 조회 복합 인덱스 구성 적절.

---

## 수정 필요 항목 (머지 전)

1. **[P1 필수]** restore() 내 soft-deleted 주문 undelete 후 `lines` 컬렉션 정합 보장 — `entityManager.refresh(order)` 또는 native query 기반 재조회 추가. create→edit→delete→restore 흐름 IT 케이스 추가.
2. **[P2 권장]** `DataIntegrityViolationException` 재시도를 별도 트랜잭션(`REQUIRES_NEW`)으로 격리 — 동일 Hibernate 세션 오염 방지.
3. **[P2 권장]** `GlobalExceptionHandler.handleResponseStatus()` 의 `ErrorCode.INTERNAL_ERROR` 고정 문제 해소 — 409/404 등 HTTP status 별 적합한 errorCode 매핑.
4. **[Minor-2 필수]** IT 케이스 2의 `rev1LineCount` 무의미 단언 수정.
5. **[Minor-3 선택]** V7 DDL 주석에 `DELETE` 추가.

---

*리뷰어: Claude BE Agent (Cycle 1)*  
*대상 commit 범위: afcb61bd ~ 9d3bcfd4 (7 commits)*
