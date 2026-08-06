# PR #1097 / 이슈 #1096 — CODEX SOL 5.6 S2 재수렴

- 검증일: 2026-08-07 KST
- 검증 HEAD: `2c78ddde7c2763ac7d0898bc55ae23b2d4212dbf`
- 판정 범위: **실 사용자 도달성 + 증거 무결성만**
- 제약 준수: DB는 `SELECT`만 사용했고, 컨테이너 재빌드·재시작·쓰기 요청과 git 쓰기는 하지 않았다.

## 결론

**BLOCK — 실 사용자 경로로 도달하는 결함 3건이 있다.**

1. D3의 409는 타임스탬프 미세 차이가 아니라, 정상 수정 이력으로 남은 과거 삭제 라인까지 완전성 분모에 넣어 정상 주문 복원을 막는다. 현재 실 데이터에서 그 경로에 놓인 DRAFT 주문은 **3건**, 과거 삭제 라인은 **5개**다.
2. D2는 재기동 재생성을 막았지만, 공식 신규 개발자 full-seed 경로도 함께 껐다. 빈 DB에서 판매전표 **100건**, 견적 **40건**, 주문 **30건**, 합계 **170개 문서**가 생성되지 않는 반면 재고 **200행**과 아로로지스 **20배차·50차량·151정차**는 계속 생성된다.
3. 삭제 견적 목록의 일반 복원 버튼이 별도 QA797 잔재 견적 **3건**을 활성 정본으로 승격할 수 있다. 그중 **1건은 9,999,999,999,999원**이다.

반대급부도 확인했다. 현재 삭제된 주문 3건은 헤더와 라인의 `deleted_at`이 정확히 같아 PM이 제시한 “트랜잭션 안 미세 타임스탬프 차이”로 즉시 409가 되는 건은 **0건**이다. 테스트 라인이 없는 활성 순수 정본 견적 **32건** 중 헤더 합계가 활성 라인 합계와 다른 건도 **0건**이며, V117의 재계산 대상이 되는 순수 정본 견적도 **0건**이다.

## 1. D3 — 정상 수정 이력이 정상 복원을 409로 막는다

### 제시된 의심의 판정

현재 삭제된 주문 3건의 실측 원문은 다음과 같다.

```text
order_no       status  deleted_lines  exact_lines  min_line_deleted_at           max_line_deleted_at
2026/08/01-1  DRAFT               1            1  2026-08-01 01:06:23.579408  2026-08-01 01:06:23.579408
2026/08/01-2  DRAFT               1            1  2026-08-01 01:06:23.620108  2026-08-01 01:06:23.620108
2026/08/01-3  DRAFT               1            1  2026-08-01 01:06:23.643065  2026-08-01 01:06:23.643065
```

따라서 **현재 이미 삭제된 정상 주문 중 시각 미세 차이 때문에 막히는 주문은 0건**이다. 신규 삭제 코드도 단일 `LocalDateTime.now()` 값을 헤더와 현재 활성 라인에 함께 전달하므로 신규 삭제에서 미세 차이가 생기는 구조는 아니다.

### 셋째 가능성 — 과거 수정 라인이 완전성 분모에 섞인다

S2 코드는 주문의 모든 삭제 라인을 센 뒤, 그중 헤더 `deletedAt`과 정확히 같은 라인만 센다.

```java
long deletedLineCount = lines.stream()
        .filter(line -> Boolean.TRUE.equals(line.getIsDeleted()))
        .count();
long restoredLines = lines.stream()
        .filter(line -> Boolean.TRUE.equals(line.getIsDeleted()))
        .filter(line -> deletedAt != null && deletedAt.equals(line.getDeletedAt()))
        .count();
if (deletedLineCount != restoredLines) {
    throw new BusinessException(ErrorCode.CONFLICT, ...);
}
```

그러나 정상 주문 수정은 기존 활성 라인을 `system-partner-order-update`로 soft-delete하고 새 스냅샷 라인을 만든다. 이 과거 라인은 주문 삭제 작업의 일부가 아니지만 `deletedLineCount`에는 포함된다.

읽기 전용 실측 원문:

```text
order_no          status  active_lines  historical_deleted_lines  historical_deleted_by
2026/06/08-1980  DRAFT              1                         3  system-partner-order-update
2026/06/08-1982  DRAFT              1                         1  system-partner-order-update
2026/06/08-1983  DRAFT              1                         1  system-partner-order-update
```

### 실 사용자 도달 경로

```text
판매관리 → 거래처 주문 → DRAFT 주문 수정·저장
→ 기존 라인이 정상 수정 이력으로 soft-delete
→ 같은 주문 삭제
→ 주문 목록(삭제행 포함)의 복원 버튼
→ POST /api/v1/partner-orders/{orderNo}/restore
→ 과거 수정 라인 시각 != 헤더 삭제 시각
→ deletedLineCount != restoredLines
→ 409 CONFLICT
```

FE는 목록 조회에 `includeDeleted: true`를 사용하고, 삭제행에서 `restorePartnerOrder`를 호출한다(`SalesPartnerOrderListPage.tsx:162,182,188,358`). 즉 API만 존재하는 사문화 경로가 아니다.

현재 당장 이 순서로 막힐 실 문서는 **3건**이다. 이 3건을 삭제하면 현재 활성 라인 3개는 새 삭제 시각을 받지만, 과거 수정 라인 5개는 예전 시각을 유지한다. 따라서 세 주문 모두 복원 시 409가 된다.

## 2. D2 — 재기동 차단과 신규 full-seed 셋업을 구분하지 않았다

### 근거 원문

공식 시작 스크립트는 `infrastructure/env-templates/.env.dev-seed`를 읽는다(`start-local-full.ps1:70,302-307`). S2 후 표준 변수는 다음과 같다.

```text
SAMHAN_INVENTORY_SEED_TEST_DATA=true
SAMHAN_SLIP_SEED_TEST_DATA=false
SAMHAN_PARTNER_ORDER_SEED_TEST_DATA=false
SAMHAN_AROLOGIS_SEED_TEST_DATA=true
```

`docker-compose.local-all.yml`도 주문 시더를 `false`, 아로로지스 시더를 `true`로 고정한다.

반면 같은 `.env.dev-seed`의 legacy fallback은 아직 다음처럼 남아 있다.

```text
SLIP_SEED_TEST_DATA=true
PARTNER_ORDER_SEED_TEST_DATA=true
```

표준 변수가 우선하므로 공식 스크립트에서는 `false`가 적용된다. 그러나 표준 변수 없이 legacy 변수만 가져가는 수동 경로에서는 다시 `true`가 된다. 즉 “항상 OFF”도 아니고 “fresh DB에서는 ON”도 아닌, 실행 진입점에 따라 결과가 갈리는 셋째 상태다.

### 실 사용자 도달 경로와 건수

```text
신규 개발자 → 빈 PostgreSQL 볼륨 → start-local-full.ps1
→ .env.dev-seed 표준 변수 로드
→ 판매전표/견적/주문 시더 미기동
→ /sales/slips, /sales/estimates, /sales/partner-orders 표본 0건
```

시더 원문의 기대 생성량은 다음과 같다.

```text
SlipSeeder          100 slip
EstimateSeeder       40 estimate
PartnerOrderSeeder   30 order
합계                170 document
```

동시에 `InventoryBalanceSeeder`는 100 product × 2 warehouse = **200행**을 만들고, `DispatchSeeder`는 결정식상 **20배차·50차량·151정차**를 만든다. 따라서 빈 DB의 공식 개발 셋업은 문서 표면만 빈 비대칭 fixture가 된다.

삭제행 포함 조회로 바뀐 시더 멱등 조건은 이미 “기존 DB의 정상 재기동에는 재생성하지 않되, 행 자체가 없는 빈 DB에는 생성”을 구분할 수 있다. 전역 플래그 OFF는 그 구분을 무효화해 신규 셋업까지 막는다.

## 3. QA 잔재 — migration 자동 승격은 0건이나 일반 복원으로 3건 승격 가능

### 실 데이터 경계

읽기 전용 집계:

```text
QA797 활성 견적 29건 / 삭제 견적 3건
QA797 활성 판매전표 192건 / 삭제 판매전표 16건
QA-1039 활성 창고 2건: QA-1039-SANGIL, QA-1039-CHOWOL
561,600원 활성 판매전표 라인 보유 문서 4건
```

QA797 제품 UUID 3개(`QA797-PART-01`, `QA797-PART-02`, `QA797-GEN-01`)는 V117의 101개 product UUID 집합에 없다. 따라서 V117이 이 QA797 문서를 새로 활성화하거나 삭제하는 건수는 **0건**이다. QA-1039 창고도 V16/V117의 대상 테이블이 아니므로 상태 변화 **0건**이다.

561,600원 라인의 product UUID `d7f488a5-6259-379c-8035-ed551e75a102`는 V117 집합에 포함된다. 따라서 금액 문자열 때문에 정본으로 승격되는 것이 아니라, 테스트 product UUID 참조 라인으로 정리된다. 현재 해당 금액을 가진 활성 판매전표는 **4건**이다.

### 도달 결함 — 삭제 QA 견적의 일반 복원

삭제 견적 7건을 S2 복원 조건으로 대입한 결과, 7건 모두 `deletedLineCount == sameActorDeletedLines`를 만족한다. 그중 QA797 삭제 견적은 다음 3건이다.

```text
2026/07/22-1  deleted_by=PM-LIVE-QA  total=7,900원
2026/07/22-2  deleted_by=PM-LIVE-QA  total=9,999,999,999,999원
2026/07/27-1  deleted_by=a000...001  total=290,000원
```

실 사용자 경로:

```text
판매관리 → 견적 관리(/sales/estimates)
→ 삭제됨 행에 표시되는 복원 버튼
→ POST /slips/estimates/{id}/restore
→ S2 actor 완전성 조건 통과
→ 헤더 및 라인 활성화 + 라인 합계 재계산
→ QA797 견적이 활성 정본 목록에 재등장
```

`EstimateListPage.tsx:253-267`은 삭제행에 실제 복원 버튼을 렌더링한다. 특히 2026/07/22-2는 S2가 삭제 라인까지 함께 복원하므로 **9,999,999,999,999원 라인이 활성화**된다. 마이그레이션이 자동으로 승격하는 결함은 아니지만, 변경된 일반 복원 경로로 한 번의 사용자 조작만에 도달한다.

## 4. D1 및 V16·V117 삭제 경계

### D1 — 순수 정본 금액 변경 0건

V117의 합계 UPDATE는 이번 migration이 방금 삭제한 라인을 가진 헤더만 대상으로 한다.

```sql
WHERE e.is_deleted=FALSE
  AND EXISTS (
      SELECT 1 FROM estimate_lines l
      WHERE l.estimate_id=e.id
        AND l.deleted_by='issue-1096-test-seed-cleanup'
  );
```

읽기 전용 사영 결과:

```text
V117 대상 활성 견적       1,985건
  테스트 전용             1,981건
  혼합                        4건
테스트 라인 없는 순수 정본    32건
순수 정본 헤더/라인 불일치      0건
순수 정본 재계산 변경           0건
```

혼합 4건은 테스트 라인만 빠지고 정본 라인 2개씩 남는다. 헤더 총액은 모두 남은 정본 라인 합계 **231,000원**으로 수렴한다. 기존 총액은 565,400원 1건, 1,001,000원 3건이므로 이번 변경은 D1을 의도대로 해소하며 순수 정본 견적에는 닿지 않는다.

### 삭제 대상 사영

```text
V16 주문       2,017 부모 / 2,047 테스트 라인 / 혼합 부모 0
V117 견적      1,985 부모 / 1,985 테스트 라인 / 혼합 부모 4
V117 판매전표  2,152 부모 / 2,165 테스트 라인 / 혼합 부모 89
```

혼합 문서는 정본 라인이 하나라도 남으면 부모를 삭제하지 않는다. 현재 데이터에서 테스트 UUID 집합 밖 정본 라인을 직접 삭제하는 건수는 **0건**이다.

`qa-seed` 제품 `TEST-BUNDLE-SET-01`은 101개 집합에 포함되지만 세 문서 DB에서 활성 참조가 **0건**이다. 따라서 `qa-seed` 때문에 추가 삭제되는 문서는 **0건**이다.

PostgreSQL의 `CURRENT_TIMESTAMP`는 트랜잭션 시작 시각이므로 Flyway 트랜잭션 안 여러 문장에서 호출해도 값이 흔들리지 않는다. S2의 `max(line.deleted_at)`은 삭제 작업 식별자를 명시적으로 맞춘다는 장점은 있으나, 이번 실 DB에서 관측한 D3 정상복원 차단의 원인은 시각 정밀도가 아니라 과거 수정 라인의 혼입이다.

## 5. fix 지시서 — 불변식만

1. **주문 복원 작업 경계**: 복원 완전성의 분모는 “해당 주문에 존재하는 모든 과거 삭제 라인”이 아니라 “바로 그 헤더 삭제 작업이 삭제한 당시 활성 라인 집합”이어야 한다.
2. **과거 이력 비복원**: 정상 수정으로 먼저 삭제된 라인은 목록 인라인 복원에서 되살아나면 안 된다.
3. **정상 삭제 왕복**: 수정 이력이 몇 회 있든 `활성 주문 → 삭제 → 목록 복원` 후 활성 헤더·활성 라인·금액은 삭제 직전 그래프와 같아야 하며 409가 나면 안 된다.
4. **불완전 그래프 fail-loud**: 해당 삭제 작업이 삭제한 라인을 전부 식별할 수 없을 때만 409여야 하며, 헤더만 성공하거나 일부 라인만 성공해서는 안 된다.
5. **fresh/restart 동시 만족**: 이미 cleanup tombstone이 있는 DB의 정상 재기동은 테스트 그래프를 재생성하지 않아야 하고, 행이 전혀 없는 신규 DB의 공식 full-seed 경로는 판매전표 100·견적 40·주문 30을 생성해야 한다.
6. **진입점 결정성**: 표준 변수와 legacy fallback 중 어느 진입점을 쓰더라도 같은 “기존 DB 재기동” 또는 “신규 DB full-seed” 조건에는 같은 결과가 나와야 한다.
7. **서비스 표본 정합**: full-seed가 켜진 서비스가 만드는 재고·배차 표본이 참조하는 문서/품목 표본은 사용자 화면에서 조회 가능한 상태여야 한다. 일부 서비스만 켜진 비대칭은 명시적인 partial-seed 모드에서만 허용해야 한다.
8. **QA provenance 비승격**: 비정본 QA artifact로 식별된 문서는 일반 복원으로 활성 정본에 편입되면 안 된다. 식별은 금액·이름 문자열 추측이 아니라 명시적 provenance여야 한다.
9. **정본 비침범**: 테스트 product provenance가 없는 정본 라인과 순수 정본 헤더 금액은 cleanup 전후 동일해야 한다.

## 6. 양방향 RED

### RED-A — 지워지면 안 되는 것이 지워지는가

```text
Given  테스트 product 라인이 하나도 없는 활성 순수 정본 견적
When   V117 cleanup 사영을 적용
Then   라인 집합과 헤더 total_supply/total_vat/total_amount가 1원도 바뀌지 않아야 한다
```

실 데이터 결과: **GREEN, 32건 중 변경 0건**. 혼합 견적 4건에서도 정본 라인 삭제는 0건이다.

별도 QA 경계에서는 V117에 없는 QA797 UUID로 인해 자동 상태 변경은 0건이다. 다만 일반 복원 RED-C에서 QA 문서 승격이 별도로 발생한다.

### RED-B — 막히면 안 되는 것이 막히는가

```text
Given  정상 수정으로 과거 soft-delete 라인이 있고 현재 활성 라인도 있는 DRAFT 주문
When   사용자가 주문을 삭제한 뒤 목록에서 복원
Then   과거 수정 라인은 삭제 상태로 남고, 삭제 직전 활성 라인만 복원되어야 한다
```

실 데이터 결과: **RED, 3건 모두 409 예정**. 원인은 과거 수정 라인 5개를 완전성 분모에 포함한 것이다.

### RED-C — 정리 잔재가 정본으로 승격되는가

```text
Given  삭제 목록에 남은 비정본 QA797 견적
When   사용자가 일반 복원 버튼을 누름
Then   활성 정본 목록에 편입되면 안 된다
```

실 데이터 결과: **RED, 3건 승격 가능**. 이 중 1건은 9,999,999,999,999원이다.

### RED-D — 신규 셋업이 정상 사용을 막는가

```text
Given  빈 DB와 저장소가 제공하는 공식 .env.dev-seed
When   신규 개발자가 start-local-full.ps1로 기동
Then   문서 시나리오용 판매전표 100·견적 40·주문 30이 생성되어야 한다
```

코드 경로 결과: **RED, 170건 모두 미생성**. 재고 200행과 배차 20건은 생성된다.

## 7. 증거 무결성 확인

PM 전제는 맞다.

```text
product_db max Flyway = 30
slip_db max Flyway = 115
partner_order_db max Flyway = 14
Issue1096S2FixContractTest 절대경로·.claude/worktrees·t1096 일치 = 0건
```

따라서 기존 적용 migration 체크섬 충돌 전제는 현재 세 DB에서 성립하지 않는다.

## 이번 라운드가 보지 않은 것

- 검증 품질, 테스트 강도, 테스트 누락, mock 적절성은 찾거나 판정하지 않았다.
- 전체 테스트 스위트와 좁은 테스트 스위트 모두 실행하지 않았다.
- V16/V117/V31을 실제 DB에 적용하지 않았고, 사영 `SELECT`로 대상·결과 건수만 계산했다.
- 컨테이너 재빌드·재시작·라이브 쓰기 API 호출을 하지 않았다.
- 운영/프로덕션 DB는 보지 않았고 현재 공유 개발 DB만 읽었다.
- 판매전표 복원 서비스의 기존 fail-loud 동작은 이번 S2 변경 대상이 아니므로 재검증하지 않았다.
- QA797 활성 견적 29건·판매전표 192건이 왜 아직 활성인지의 역사와 별도 정리 정책은 조사하지 않았다. 이번 판정은 S2가 자동 변경하는지와 일반 복원으로 승격 가능한지만 보았다.
