# PR #1154 R6 UUID 복원 fix 보고서

- 일자: 2026-08-09 KST
- 브랜치: `feat/896-partner-master-load`
- HEAD 기준: `8ec180196`
- 대상: partner-service Ecount CSV/XLSX 적재
- 원칙: commit/push 없음, 공유 DB와 `partner_code=1068689215` 미접촉

## 1. 판정

후보 ㉠만 적용했다. `importCsv`와 `importXlsx`는 트랜잭션으로 감싸지 않고, 두 진입점의 `upsertPartner` 호출만 자기 프록시를 통과시켰다. 따라서 `upsertPartner`의 `@Transactional`이 실제 적용되고, native 조회로 찾은 삭제행은 같은 persistence context의 managed entity가 된다.

후보 ㉡ `@SQLRestriction` 우회 native 복원 update는 넣지 않았다. ㉠만으로 RED-A/B가 GREEN이 되었고, managed 삭제행의 dirty checking UPDATE가 원 UUID를 유지하므로 별도 복원 update는 중복이다. 두 후보를 동시에 넣지 않은 근거는 아래 실측이다.

## 2. 현재 RED-A 원문 — 수정 전

실 PostgreSQL Testcontainers `PartnerMasterLoadIT`에서 importer로 생성하고 실제 관리자 DELETE API로 soft-delete한 뒤 같은 CSV를 재적재했다.

```text
imported=0, updated=1
RED-A SELECT partner_code='RED-UUID-RESTORE' before_uuid=6621194e-1f0f-4fab-8acf-4651948bbf9f active_uuid=5ad4a5fc-7f32-4ac4-b832-01b6a398d17d rows=5ad4a5fc-7f32-4ac4-b832-01b6a398d17d|false,6621194e-1f0f-4fab-8acf-4651948bbf9f|true
```

관리자 DELETE 응답은 `HTTP 200`이었다. 이는 R5의 detached `save()` → restriction 부착 merge SELECT → 신규 UUID INSERT 연쇄를 재현한 원문이다.

## 3. 적용 변경

`EcountPartnerImporter`에 `@Lazy @Autowired` 자기 프록시와 두 개의 행 단위 위임 helper를 추가했다.

```java
private UpsertResult upsertPartnerInRowTransaction(...) {
    EcountPartnerImporter target = transactionalProxy == null ? this : transactionalProxy;
    return target.upsertPartner(...);
}
```

운영 Spring bean에서는 프록시를 통해 `@Transactional upsertPartner`가 실행되고, Mockito 단위 테스트의 직접 인스턴스에서는 기존처럼 자기 호출 fallback이 사용된다. `importCsv`/`importXlsx`에는 `@Transactional`을 추가하지 않았다.

## 4. RED-A~D 실 PostgreSQL 결과

### RED-A — 삭제행 UUID 복원

```text
BUILD SUCCESSFUL
RED-A SELECT partner_code='RED-UUID-RESTORE' before_uuid=838df90b-2582-4488-8ce1-e31b92b26938 active_uuid=838df90b-2582-4488-8ce1-e31b92b26938 rows=838df90b-2582-4488-8ce1-e31b92b26938|false
```

DB SELECT에서 활성 UUID가 삭제 전 UUID와 같고, 해당 코드의 행은 `is_deleted=false` 한 건뿐이다.

### RED-B — 참조 고아 방지

partner-service가 소유한 실제 FK 자식 `partner_credit_history`를 도메인 repository로 생성해 삭제 전 UUID를 참조시킨 뒤, 실제 관리자 DELETE API와 재적재를 수행했다.

수정 전:

```text
RED-B SELECT orphan_reference_rows=1 reference_rows=1 partner_code='RED-FK-RESTORE'
```

수정 후:

```text
RED-B SELECT orphan_reference_rows=0 reference_rows=1 partner_code='RED-FK-RESTORE'
```

`partner_orders`는 partner-service Testcontainers schema가 소유하지 않는다. 따라서 R4 공유 환경의 주문 참조 2건은 이 IT에서 재현하지 않았고, 그 교차 서비스 참조 검증은 미수행으로 남긴다. 공유 DB 표본은 만들거나 수정하지 않았다.

### RED-C — status 축 보존

```text
RED-C SELECT status FROM partners WHERE partner_code='RED-STATUS-PRESERVE' => SUSPENDED
```

첫 적재에서 `NO`로 SUSPENDED를 만들고, 두 번째 적재에서 `YES`를 보냈다. 기존 비활성 거래처는 활성화되지 않았다.

### RED-D — created_at 3개

기존 `PartnerMasterLoadIT`의 R3 테스트 3개를 포함해 전체 테스트가 통과했다.

```text
:services:partner-service:test --tests 'com.samhanair.logis.partner.seed.PartnerMasterLoadIT'
BUILD SUCCESSFUL
```

등록일자 있는 신규행은 등록일자 자정, 등록일자 있는 기존행은 등록일자 자정으로 교정, 등록일자 없는 행은 연속 적재해도 created_at 불변 조건을 유지했다.

## 5. 트랜잭션 범위 변화

전체 적재 트랜잭션으로 확대되지 않았다.

- `importCsv`/`importXlsx`: 기존처럼 비트랜잭션 진입점
- 각 정상 행의 `upsertPartner`: 프록시를 통한 별도 행 단위 트랜잭션
- staging upsert와 집계 루프의 기존 범위: 유지
- 7,253행을 하나의 트랜잭션으로 묶지 않음

따라서 한 행의 upsert 실패가 전체 적재를 롤백시키는 범위 변화는 만들지 않았다. `@Transactional`을 진입점에 추가하는 방식은 의도적으로 선택하지 않았다.

## 6. 새 상태·조합 점검

- 삭제행만 있음: RED-A에서 실제 관리자 DELETE 후 재적재 — 원 UUID 단일 활성행으로 복원
- 활성행만 있음: 기존 정본 7,253행 이중 적재 — UUID/값/분포 멱등성 유지
- 활성행+삭제행 둘 다 있음: R4에서 관찰된 dual-row 상태를 기준으로 active lookup이 우선되고, 새 재적재가 추가 UUID를 만들지 않도록 확인했다. 공유 DB에는 접근하지 않았다.
- 삭제행이 정본에 없음: 기존 코드 분기대로 파일에 없는 삭제행을 부활시키지 않는다. 테스트 fixture는 각 테스트 후 폐기되는 임시 PostgreSQL이다.
- status SUSPENDED + 파일 YES: RED-C에서 status 보존

## 7. 실행한 검증

```text
gradlew :services:partner-service:test --tests '...PartnerMasterLoadIT.RED_A_...' --no-daemon
  수정 전: FAILED — expected original UUID, actual new UUID
  수정 후: BUILD SUCCESSFUL

gradlew :services:partner-service:test --tests '...PartnerMasterLoadIT.RED_B_...' --no-daemon
  수정 전: FAILED — orphan_reference_rows=1
  수정 후: BUILD SUCCESSFUL — orphan_reference_rows=0

gradlew :services:partner-service:test --tests '...PartnerMasterLoadIT.RED_C_...' --no-daemon
  수정 후: BUILD SUCCESSFUL

gradlew :services:partner-service:test --tests '...PartnerMasterLoadIT' --no-daemon
  BUILD SUCCESSFUL

gradlew :services:partner-service:test \
  --tests '...EcountPartnerImporterTest' \
  --tests '...PartnerMasterLoadIT' --no-daemon
  BUILD SUCCESSFUL
```

모든 IT는 Testcontainers PostgreSQL을 사용했다. Mockito repository save echo 테스트만으로 RED-A를 판정하지 않았다.

## 8. 신규 생성 파일

- `docs/dev-reports/2026-08-09-1154-r6-uuid-restore-fix.md` — 본 보고서

수정 파일:

- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java`
- `services/partner-service/src/test/java/com/samhanair/logis/partner/seed/PartnerMasterLoadIT.java`

기존 untracked `clients/desktop/playwright/1154-r4-sol-reconv-real-qa/`는 이번 라운드 생성물이 아니며 건드리지 않았다.

## 9. 못 한 것

- 공유 DB `partner_code=1068689215` 복구/삭제/UPDATE/INSERT: 금지 조건에 따라 하지 않음
- `partner_orders` 2건을 포함한 교차 서비스 실제 DB 참조 IT: partner-service Testcontainers schema 밖이므로 미수행
- commit/push: PM 대행 조건에 따라 하지 않음
- QA 스크린샷 spec: 이번 변경은 백엔드 transaction/IT fix이며 새 UI QA spec은 만들지 않음
