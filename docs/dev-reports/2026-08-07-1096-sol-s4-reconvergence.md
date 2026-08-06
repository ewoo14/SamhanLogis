# PR #1097 / 이슈 #1096 — SOL 5.6 S3·S4 표면 재수렴

- 검증 HEAD: `fcf9721d107d8bac7e19f2bb7b8679da6ea87e93`
- 판정 범위: 실 사용자 경로의 도달성, 증거 무결성
- 제약 준수: git 쓰기 0회, DB는 `SELECT`만 수행, 컨테이너 쓰기·재빌드·재시작 0회, 테스트 실행 0회

## 결론 — BLOCK

도달 결함은 **2건**이다.

1. 배포 후 혼합 QA797 견적 4건은 정상 삭제 뒤 일반 복원이 409로 막힌다. 다만 직접 원인은 S4의 `QA797-` 판정이 아니라, V117이 네 견적에서 **정본 라인만** cleanup actor로 삭제한 뒤 S2 완전성 가드가 그 과거 삭제 라인을 현재 헤더 삭제 배치에 포함시키는 결합이다.
2. 반대 방향으로, 현재 삭제된 순수 QA797 견적 `2026/07/27-1` **1건**은 QA 라인이 활성 상태라 S4 판정을 우회하고 일반 복원된다. 이 건은 지금 데스크톱 견적 목록의 복원 버튼으로 도달 가능하다.

PM의 첫 질문에는 제시된 두 갈래 밖의 셋째 가능성이 있다. 정상 견적 삭제는 헤더만 soft-delete하고 라인은 삭제하지 않는다. 따라서 현재 미적용 DB에서 혼합 4건을 삭제하면 S4의 `삭제 라인 QA797` 조건에는 걸리지 않는다. 그러나 V117 적용 후에는 QA 라인이 아니라 정본 라인이 먼저 삭제되고, 그 과거 삭제 이력 때문에 별도 409가 발생한다.

## 1. 첫 각도 — 혼합 견적 4건

### 실데이터

읽기 전용 재집계 결과는 PM 수치와 일치한다.

```text
QA797 라인 보유 견적       32건
  순수 QA797               28건
  혼합                       4건
현재 삭제 상태               3건
혼합이면서 삭제 상태          0건
헤더에만 QA797 표식           0건
```

혼합 4건은 `2026/07/17-1`, `2026/07/17-2`, `2026/07/17-5`, `2026/07/17-20`이다. 각 견적의 라인 구성은 동일하다.

```text
QA797-PART-01  product_id=7de11ab7-e70c-421e-80a4-7c6b51a2c6e9
QA797-PART-02  product_id=ed278526-0e16-427d-8a92-2ca06164254a
AC1000CNCDEH-85 product_id=d35ab633-c3db-3187-acb0-b19262eb5fae  ← 정본 라인
```

V117의 테스트 품목 목록에는 정본 라인 UUID `d35ab633-...`만 있고 두 QA797 UUID는 없다(`V117__soft_delete_test_seed_documents.sql:96`). 따라서 V117의 `estimate_lines` 갱신(`:117-119`)은 혼합 4건에서 정본 라인만 `deleted_by='issue-1096-test-seed-cleanup'`으로 삭제하고 QA797 두 라인은 활성으로 남긴다. 헤더는 활성 라인이 있으므로 `:141-147`의 순수 테스트 헤더 삭제 대상이 아니다.

### 정상 삭제 뒤 복원이 막히는 원문

정상 삭제는 `EstimateService.java:385-388`에서 다음과 같이 헤더만 삭제한다.

```java
Estimate estimate = loadOrThrow(id);
estimate.markDeletedWithName(callerOrSystem(callerId), resolveActorName(callerName, callerId));
```

라인 cascade 호출은 없다. 이후 일반 복원은 `EstimateService.java:417-426`에서 모든 과거 삭제 라인을 분모로 세고, 헤더의 현재 `deletedBy`와 같은 라인만 복원 가능으로 센다.

```java
long deletedLineCount = allLines.stream()
        .filter(line -> Boolean.TRUE.equals(line.getIsDeleted()))
        .count();
long restorableLines = allLines.stream()
        .filter(line -> Boolean.TRUE.equals(line.getIsDeleted()))
        .filter(line -> deletedBy != null && deletedBy.equals(line.getDeletedBy()))
        .count();
if (deletedLineCount != restorableLines) {
    throw new BusinessException(ErrorCode.CONFLICT, ...);
}
```

V117 적용 후 혼합 견적 하나를 사용자 U가 정상 삭제하면 `deletedLineCount=1`(과거 cleanup 정본 라인), `restorableLines=0`(헤더 actor=U, 라인 actor=cleanup)이므로 **항상 409**다. 영향 실데이터는 **4건**이다.

S4의 QA 판정 자체는 이 4건에서 false다. `isNonCanonicalQaResidue`는 삭제 라인만 검사하는데 삭제된 정본 라인에는 `QA797-`가 없고, QA797 라인은 활성 상태이기 때문이다(`EstimateService.java:451-458`). 즉 PM의 우려 결과는 맞지만 원인은 다른 셋째 갈래다.

### 사용자 도달 경로와 현재 표면의 한계

백엔드 정상 경로는 권한이 붙은 `DELETE /slips/estimates/{id}` → `POST /slips/estimates/{id}/restore`다(`EstimateController.java:185-203`). 삭제행은 목록 native query에 포함되고, 데스크톱은 삭제행에 복원 버튼을 노출해 `restoreEstimate`를 호출한다(`EstimateListPage.tsx:253-267`, `estimateApi.ts:308-313`).

다만 현재 데스크톱에는 견적 DELETE 호출/삭제 버튼 배선이 없다. 저장소 전체 데스크톱 호출부에서 견적 DELETE 소비자는 0건이다. 따라서 “같은 데스크톱 화면에서 사용자가 삭제 버튼을 누른다”는 정확한 시퀀스는 현재 존재하지 않는다. 정상 DELETE endpoint를 사용하는 클라이언트/관리 호출 뒤에는 데스크톱 복원 버튼으로 409가 재현된다. 이 표면 차이는 숨기지 않는다.

## 2. 반대 방향 — 통과하면 안 되는 QA 잔재가 통과한다

현재 삭제 상태인 QA797 견적은 3건이다.

| 견적번호 | 헤더 deleted_by | 삭제 QA 라인 | 현재 S4 결과 |
|---|---|---:|---|
| `2026/07/22-1` | `PM-LIVE-QA` | 1 | QA797 판정으로 409 |
| `2026/07/22-2` | `PM-LIVE-QA` | 1 | QA797 판정으로 409 |
| `2026/07/27-1` | 사용자 UUID | 0 (QA 2라인 모두 활성) | **복원 통과** |

`2026/07/27-1`은 순수 QA797 견적이지만 라인이 활성이다. S4는 `isDeleted=true` 라인만 QA 표식을 검사하므로 false가 된다. 이어서 삭제 라인 수와 복원 가능 라인 수가 모두 0이라 완전성 가드도 통과하고, `markRestoredWithNameCleared()`가 헤더를 활성화한다.

실 사용자 경로는 다음과 같다.

```text
견적서 관리 목록 GET /slips/estimates
→ 삭제행 2026/07/27-1 표시
→ RESTORE 권한 사용자에게 복원 버튼 표시
→ POST /slips/estimates/{id}/restore
→ 200, 순수 QA797 헤더 활성화
```

현재 도달 건수는 **1건**이다. 헤더 memo/partnerName/estimateNo에만 `QA797-` 표식이 있고 라인에는 없는 견적은 **0건**이므로, 헤더 전용 표식 경로는 현재 실데이터 도달 결함으로 세지 않는다.

## 3. 양방향 RED

### RED-A — 정본 혼합 견적 오차단

```text
given  혼합 4건 중 하나에 V117 적용
       → 정본 라인 1개만 cleanup actor로 삭제, QA797 라인 2개 활성
when   사용자가 정상 DELETE endpoint로 헤더 삭제
and    목록의 복원 버튼으로 일반 복원
then   기대: 헤더만 복원하고 과거 cleanup 라인은 삭제 유지
actual: deletedLineCount=1, restorableLines=0 → 409
```

### RED-B — 순수 QA 잔재 오통과

```text
given  2026/07/27-1: 삭제 헤더 + 활성 QA797 라인 2개 + 삭제 라인 0개
when   목록의 복원 버튼으로 일반 복원
then   기대: 비정본 QA 잔재 409, 행 보존
actual: QA 검사 대상 0개, 0 != 0은 false → 헤더 복원
```

두 RED는 같은 수정으로 한쪽만 닫으면 안 된다. “QA797 하나라도 있으면 견적 전체 차단”으로 RED-B만 닫으면 혼합 정본을 다시 차단한다.

## 4. fix 지시서 — 불변식만

1. **일반 삭제 배치 불변식**: 견적 정상 DELETE가 헤더만 삭제하는 한, 일반 복원은 헤더를 복원할 수 있어야 하며 과거 다른 actor가 삭제한 라인을 복원하거나 현재 배치의 분모로 요구하면 안 된다.
2. **혼합 보존 불변식**: 전체 라인 그래프에 정본 라인이 하나라도 존재하는 혼합 견적은 QA 라인 존재만으로 문서 전체를 비정본 처리하지 않는다. 정본 라인이 과거 cleanup으로 삭제돼 있어도 그 provenance를 보존한 채 헤더 복원 가능성을 잃지 않는다.
3. **순수 QA 차단 불변식**: 헤더의 `deleted_by`가 cleanup actor인지와 무관하게, 전체 원본 라인 그래프가 QA797 잔재인 견적은 라인의 현재 `is_deleted` 값과 무관하게 일반 복원을 409로 차단하고 모든 행을 보존한다.
4. **판정 집합 불변식**: QA provenance 판정은 `삭제 라인 중 any`가 아니라 활성·삭제를 포함한 전체 라인 그래프의 문서 분류로 계산한다. 혼합과 순수를 구분해야 한다.
5. **양방향 고정 불변식**: 동일 변경에서 RED-A의 혼합 4건 복원 허용과 RED-B의 순수 QA 1건 차단을 동시에 고정한다.

## 5. S3 — 409 완화 재수렴

S3에서 새 도달 결함은 찾지 못했다.

정상 삭제 호출은 `PartnerOrderDeleteService.java:80`에서 `LocalDateTime.now()`를 한 번 만들고 `softDeleteCascadeWithName`에 전달한다. 도메인은 `PartnerOrder.java:419-425`에서 같은 `actorUserId`와 같은 `deletedAt` 객체를 헤더 및 당시 활성 라인 모두에 전달한다. 트랜잭션 하나에서 수행되므로 정상 사용자 삭제 배치의 actor·시각은 동일하다.

복원은 헤더와 actor+시각이 같은 라인 집합이 하나라도 있으면 그 집합만 복원하고, 과거 `system-partner-order-update` 라인은 남긴다. 현재 삭제 주문 3건은 각각 삭제 라인 1개, actor+시각 일치 라인 1개, 활성 라인 0개로 전제가 성립한다. 정상 main 호출부에서 구형 `softDeleteCascade(String)` 사용은 0건이며 테스트 호출만 1건이다.

따라서 `deletedLineCount > 0 && deletionBatchLines.isEmpty()` 완화가 정상 경로에서 부분 복원을 통과시키는 반례는 현재 코드·실데이터에서 없다. cascade가 일부 라인만 표식하는 중간 상태도 같은 트랜잭션 원자성 때문에 사용자 관측 상태가 되지 않는다.

## 6. S4 opt-in과 재기동

코드·설정 경로 판정은 다음과 같다.

- `SAMHAN_FULL_SEED_TEST_DATA`는 compose에서 slip-service와 partner-order-service에 명시 전달된다(`docker-compose.local-all.yml:256,344`). 관련 compose YAML의 `env_file` 지시는 0건이다.
- slip/estimate/order 시더는 각각 기존 개별 플래그 또는 full-seed 플래그가 true일 때 활성화된다. `application.yml`은 full-seed 환경변수를 기본 false로 매핑한다.
- `SAMHAN_FULL_SEED_TEST_DATA=true`와 dev profile의 신규 DB에서는 판매전표 100건, 견적 40건, 주문 30건 생성 경로가 열린다.
- 끈 상태에서는 시더 bean이 활성화되지 않는다. 다시 켜더라도 판매전표·견적·주문 모두 삭제행 포함 결정적 번호 조회로 기존 정리분을 skip하므로 soft-delete 문서를 재생성하지 않는다.

PM 전제는 맞다. `.env.dev-seed`의 legacy `SLIP_SEED_TEST_DATA=true`는 compose에 자동 전달되지 않고, slip 설정은 `${SAMHAN_SLIP_SEED_TEST_DATA:${SLIP_SEED_TEST_DATA:false}}`라 `SAMHAN_` 값이 우선한다. partner-order compose의 개별 플래그도 명시적으로 false다.

현재 Flyway 최고 버전은 product **30**, slip **115**, partner_order **14**로 V31/V117/V16은 모두 미적용이다.

## 7. full-seed 산물 식별성과 cleanup 묶음 복구

full-seed 산물은 다음 표식을 가진다.

- 판매전표: 헤더 memo `[Stage 2 시드]`, 첫 라인 note `Stage 2 시드`, 결정적 번호/제품 UUID
- 견적: 헤더 memo `[P2 시드]`, 첫 라인 note `P2 시드`, 결정적 번호/제품 UUID
- 주문: 라인 remark `Seed sample remark #N`, 결정적 주문번호/제품 UUID

따라서 다음 정리에서 시더 산물을 다시 식별할 수 있다. 현재 DB에도 주문 marker 기준 30문서가 식별된다. 다만 V117의 현재 UUID 목록은 혼합 4건에서 정본 라인을 테스트 라인으로 분류하는 실데이터 반례가 있으므로, 다음 정리는 제품 UUID 하나만으로 문서의 QA/정본 성격을 단정하면 안 된다.

`deleted_by='issue-1096-test-seed-cleanup'` 묶음 되돌리기는 보존되어 있다. V31/V117/V16은 물리 삭제하지 않고 같은 actor를 각 대상 행에 기록하며, 각 migration 끝에 actor 한정 복구 UPDATE가 표기돼 있다. S4의 일반 견적 복원 409는 이 DB-level 묶음 복구를 제거하지 않는다. 현재는 세 migration이 미적용이라 actor 행 수는 product/slip/estimate/order 관련 테이블 모두 0이다.

## 이번 라운드가 보지 않은 것

- 검증 품질, 테스트 충분성, Javadoc 배치 문제
- 전체 테스트 스위트 및 CI 상태
- 컨테이너 재기동·재빌드와 실제 migration 적용
- DB 쓰기를 동반하는 실제 DELETE/RESTORE 호출
- V117의 혼합 4건 외 전체 101개 제품 UUID 업무 분류의 정당성
- 현재 데스크톱에 견적 삭제 버튼이 없는 것이 별도 제품 결함인지 여부

## 신규 파일

- `docs/dev-reports/2026-08-07-1096-sol-s4-reconvergence.md`
