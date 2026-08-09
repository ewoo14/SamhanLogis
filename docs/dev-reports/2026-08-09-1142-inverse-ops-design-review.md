# #1142 재고 역연산 설계 적대 검증

> 검토일: 2026-08-09 (Asia/Seoul)
> 검토 대상: `2026-08-08-1142-inverse-ops-design.md`
> 성격: 구현 전 설계 검토. 코드·마이그레이션·실 DB 데이터 변경 없음
> DB 조회 방식: `samhan-postgres`에서 매 조회를 `BEGIN READ ONLY`로 시작하고 `ROLLBACK`으로 종료
> 주의: 공유 DB이므로 아래 수치는 각 표에 적은 측정 시각의 snapshot이다.

## 0. 판정

**현재 설계는 그대로 구현하면 안 된다.** 핵심 원칙인 “원 작업을 유일하게 증명하지 못하거나 후속 소비·물리 출고가 있으면 fail-loud” 자체는 맞다. 그러나 다음 두 문제가 동시에 있다.

1. 거부 조건이 아직 부족하다. 진행 중 실사/이동, 전표 원문 revision, 회계 마감과 `lock_flag`, source별 성공 역연산 유일성, 정방향 경로와 공유하지 않는 잠금, `NO_OP` 원 작업을 명시적으로 다루지 않는다.
2. 현재 60건에 엄격히 적용하면 **최소 56건(93.3%) 거부**, 관측 가능한 조건을 모두 통과하는 것은 lot 입고 **4건(6.7%)**뿐이다. 기능이 사실상 과거 데이터 복구 수단으로 작동하지 않는다.

“56건”은 다음 서로 겹치지 않는 전표 집합이다.

| 엄격 거부 근거 | 전표 수 | 근거 |
|---|---:|---|
| 원 재고 작업 없음 | 40 | 네 원 작업 중 어느 것도 현재 재고 DB에서 연결되지 않음. 동일 40건은 현재 활성 품목 정본도 없음 |
| 시리얼 입고 생성 집합 증명 불가 | 7 | `sourceOperationId`/호출 직전 수량 journal이 없으므로 현재 `inbound_slip_no`만으로 “그 호출이 새로 만든 집합”을 증명하지 못함 |
| 시리얼 출고의 물리 미출고/회수 증명 없음 | 9 | 대상 인스턴스는 모두 `SHIPPED`; custody 정본과 반환 증빙 계약이 설계에서 미확정 |
| **합계** | **56** | 집합 간 중복 없음 |

나머지 4건은 모두 batch lot 입고이며, 현재 관측상 전량 미사용·후속 movement 없음·이동 없음·원 INBOUND movement 1:1·balance invariant 정상이다. 다만 실행 직전 재측정은 필요하다.

---

## 1. 먼저 재현한 인용 사실

### 1.1 역연산 없는 API 4개 — 재현됨

현재 `main`에서 다음 정방향 API와 호출을 확인했다.

| 정방향 API | 코드 근거 | 직접 역연산 검색 |
|---|---|---:|
| `POST /inventory/deduct` | `StockController.java:260-265`, `StockService.java:329-368` | 0건 |
| `POST /inventory/instances/ship-batch` | `StockInstanceController.java:150`, `StockInstanceService.java:193-207` | 0건 |
| `POST /inventory/lots/inbound` | `StockController.java:213`, `StockService.java:185-219` | 0건 |
| `POST /inventory/instances/batch` | `StockInstanceController.java:85-114`, `StockInstanceService.java:106-137` | 0건 |

`unship`, `undeduct`, 네 `/reversal` 경로를 `inventory-service/src/main`과 `slip-service/src/main`의 Java/SQL에서 재검색했고 모두 0건이었다. 기존 `release`, `release-batch`, `unrecall`, `resell`은 네 작업의 정확한 반대가 아니다.

### 1.2 품목·금액 수정은 DRAFT/SAVED만 — 재현됨

- `Slip.EDITABLE_STATUSES = {DRAFT, SAVED}` (`Slip.java:63-64`).
- 헤더 수정은 이 집합 밖에서 CONFLICT (`Slip.java:918-923`).
- 라인 추가/제거 API도 DRAFT/SAVED만 허용 (`SlipController.java:422-446`).
- 회계 매출/매입전표의 source는 반대로 `CONFIRMED` 전표만 허용한다 (`SalesAccountingSlipCreateAttemptService.java:124-133`, `PurchaseAccountingSlipCreateAttemptService.java:119-127`).

따라서 개발책임자가 확정한 품목·금액 변경 목적을 달성하려면 상태만 한 단계 내리는 것으로 부족하고 DRAFT/SAVED까지 내려가야 한다.

### 1.3 되돌림 후보 60건 — 재현됨

측정 시각: **2026-08-09 04:18:53.050348 KST**, `slip_db`.

| 상태 | INBOUND | OUTBOUND | 합계 |
|---|---:|---:|---:|
| INSPECTING | 2 | 7 | 9 |
| COMPLETED | 17 | 10 | 27 |
| SHIPPING | 0 | 5 | 5 |
| DELIVERED | 0 | 10 | 10 |
| CONFIRMED | 1 | 8 | 9 |
| **합계** | **20** | **40** | **60** |

단, 이 60은 상태 기준 후보일 뿐이다. 실제 원 재고 작업이 연결된 전표는 20건뿐이었다.

---

## 2. 실 데이터 계보 재분류

측정 시각: **2026-08-09 04:21:52.958604~04:27:41.884945 KST**.

| 분류 | 전표 수 | 추가 수치 | 판정 |
|---|---:|---:|---|
| 원 작업 하나 이상 확인 | 20 | INBOUND 11 + OUTBOUND 9 | 아래 세부 판정 필요 |
| 네 원 작업 모두 없음 | 40 | 활성 품목 정본도 없는 전표 40 | `ORIGINAL_OPERATION_NOT_FOUND` 또는 `UNKNOWN_LINEAGE` |
| deduct 원 작업 | 0 | 활성 DEDUCT movement 전체도 0 | 표본 0 — deduct 역연산 가능성 판정 불가 |
| lot inbound | 4 | 모두 같은 product+warehouse 그룹 | 관측상 통과 |
| instance inbound | 7 | 16개 instance | 생성 집합 증명 불가로 전부 거부 |
| ship-batch | 9 | 14개 SHIPPED instance | custody 증명 전까지 거부 |

현재 활성 품목 기준으로 60건 중 시리얼 품목 전표는 16건, batch 품목 전표는 4건이며, 나머지 40건은 품목 정본이 활성 상태로 존재하지 않았다. BUNDLE 전표는 0건이었다(측정 시각 **2026-08-09 04:27:07.080611 KST**). 따라서 40건의 원 작업 부재를 “정상적인 재고 제외 no-op”라고 판정할 근거도 없다.

---

## 3. 설계가 놓친 또는 구체화하지 않은 거부 조건

이 절이 본 검토의 본체다. “0건”은 안전하다는 뜻이 아니다. 요청에 따라 표본 0이면 **판정 불가**로 적는다.

### 3.1 원 작업 결과가 `APPLIED`인지 `NO_OP`인지 증명되지 않음

정방향 코드는 다음 경우 조용히 no-op/기존 결과를 반환한다.

- 비상품/BUNDLE: lot·instance·movement를 만들지 않음 (`StockService.java:187-190,330-331`, `StockInstanceService.java:110-112`).
- 동일 lot 존재: 새 입고 없이 기존 lot 반환 (`StockService.java:194-204`).
- instance batch 기존 수량이 목표 이상: 신규 생성 없이 기존 집합 반환 (`StockInstanceService.java:118-123`).

설계는 원 작업이 없으면 `ORIGINAL_OPERATION_NOT_FOUND`로 전체 거부한다. 그러나 “정상적으로 실행됐고 결과가 NO_OP”인 경우에는 재고 역연산 없이 slip 상태만 되돌리는 것이 맞을 수 있다. 현재는 성공 outcome journal이 없어 `NO_OP`, 호출 실패, seed/legacy, 데이터 유실을 구분할 수 없다.

- 실 데이터: 원 작업 없음 40전표.
- 그 40전표의 활성 품목 정본 없음: 40전표.
- 현재 BUNDLE/비상품 후보: 0전표 → 정상 no-op 표본은 **판정 불가**.

**추가 계약 필요:** source journal에 `APPLIED | NO_OP_EXISTING | NO_OP_EXCLUDED`를 저장하고, 검증된 NO_OP는 역연산 단계 성공으로 처리해야 한다. “원 작업 없음”을 무조건 전체 거부로 두면 정상 no-op 경로까지 막는다.

### 3.2 source 품목 정본 삭제·분류 변경

현재 전표 라인은 품목 UUID snapshot을 갖지만 정방향 API는 product-service의 **현재** `goods`, `productType`, `serialManaged`를 다시 읽어 경로를 고른다. 과거 작업의 시리얼/batch/재고 제외 분류가 바뀌거나 품목이 soft-delete되면 현재 정본으로 원 경로를 재구성할 수 없다.

- 활성 품목 정본이 없는 후보: **40/60전표**.
- 과거 분류가 실제로 변경됐는지: 이력 source fingerprint가 없어 **판정 불가**.

**추가 거부 조건:** `SOURCE_PRODUCT_SNAPSHOT_MISSING_OR_DRIFTED`. 단, 신규 source journal에 당시 `goods/productType/serialManaged/productCode` snapshot이 있으면 현재 품목 삭제만으로 거부하지 않고 journal을 정본으로 써야 한다.

### 3.3 원 재고 작업 뒤 전표 원문이 revision으로 바뀜

inventory source fingerprint뿐 아니라 slip의 원 라인 snapshot도 작업 당시 값이어야 한다. 현재 `restoreFromSnapshot`은 상태를 유지한 채 헤더와 라인을 통째 교체할 수 있고 (`Slip.java:2200-2249`), 마감 lock만 도메인에서 직접 검사한다. 원 inventory 작업 이후 revision이 있으면 현재 라인 수량을 원 작업 기대값으로 사용해서는 안 된다.

- revision이 있는 후보: 22전표.
- `completed_at` 뒤 revision이 있는 후보: **2전표, EDIT revision 6건** (`2026/01/30-1`, `2026/04/08-1`).
- 두 전표는 현재 원 재고 작업도 없어 이미 거부 집합에 포함된다.

**추가 거부 조건:** source operation에 저장된 slip revision/fingerprint와 현재 revision이 다르면 `SOURCE_SLIP_REVISED_AFTER_OPERATION`. current line을 다시 hash하는 것만으로는 원 작업 snapshot을 복원하지 못한다.

### 3.4 진행 중 실사 snapshot

설계는 후속 “실사 조정”을 언급하지만, `PLANNED/IN_PROGRESS` 실사도 이미 warehouse/product의 기대수량 snapshot을 잡고 있다. 그 사이 역연산하면 실사 결과가 stale해지고, 완료 시 역연산분을 다시 `ADJUST`할 수 있다.

- inventory 전체: PLANNED 3, IN_PROGRESS 2, COMPLETED 3, CANCELLED 1.
- 60 후보의 product+warehouse와 진행 중 실사가 겹치는 전표: **22전표**.
- 실제 원 작업이 확인된 20전표와 진행 중 실사 교차: **0전표** → 이번 실제 역연산 표본에서는 **판정 불가**.
- 완료 실사와 60 후보 교차: 14전표; 실제 원 작업 20과 교차 0전표.
- 후보 product+warehouse의 ADJUST movement: 0그룹 → **판정 불가**.

**추가 거부 조건:** `OPEN_INVENTORY_AUDIT_EXISTS`. 또는 해당 실사를 명시적으로 invalidate/rebase하는 계약이 먼저 있어야 한다.

### 3.5 진행 중 창고 이동

완료된 이동만 볼 것이 아니라, source lot이 아직 배정되지 않은 REQUESTED/APPROVED 이동도 product+source warehouse 재고를 점유할 수 있다. 역연산 직후 이동 승인과 경합할 수 있다.

- inventory 전체 REQUESTED 이동: 3건.
- source/destination lot이 이미 묶인 이동: 0건.
- 후보 product+warehouse와 진행 중 이동 교차: 0전표 → **판정 불가**.
- 후보 lot을 source/destination으로 직접 참조한 이동: 0전표 → **판정 불가**.

**추가 거부 조건:** `OPEN_TRANSFER_EXISTS`를 lot 직접 참조뿐 아니라 product+source warehouse 예약 단계까지 정의해야 한다.

### 3.6 회계 마감의 두 층과 `lock_flag`

#1123으로 머지된 `SlipClosedDateGuard`는 `slip_closing_baselines`/`slip_closing_date_rules`와 예외 권한을 검사하며, 생성·수정·상태 전이에 동일 적용된다 (`SlipClosedDateGuard.java:25-62`). 기존 월마감은 별도로 CONFIRMED 전표에 `lock_flag=true`를 찍고, `Slip.requireNotLocked()`가 mutation을 차단한다 (`Slip.java:1413-1439`). 회계 서비스는 또 `accounting_periods` CLOSED 기간의 분개·세금계산서 변경과 역분개를 막는다 (`AccountingPeriodGuard.java:27-45`, `JournalService.java:148-161`).

측정 시각: **2026-08-09 04:22:35~04:22:54 KST**.

| 마감 층 | 60 후보 교차 | 실제 원 작업 20과 교차 | 판정 |
|---|---:|---:|---|
| #1123 baseline/manual closed-date rule | 0 | 0 | 현재 rule row 0 — 표본 **판정 불가** |
| slip `lock_flag=true` | 5 | 0 | 명시 거부 필요 |
| CLOSED 회계기간(2026-02, 2026-04) | 30 (2월 22 + 4월 8) | 0 | 회계 역처리 필요 시 차단 |

설계의 `CLOSED_OR_UNAUTHORIZED_CONTEXT` 한 줄로는 부족하다. preflight와 commit 직전 재검증 양쪽에서 세 층을 각각 판정하고, 권한 bypass가 각 층에서 동일한지도 정해야 한다. 현재 #1123은 MASTER/전용 CREATE 예외가 있지만, `lock_flag`와 회계 역분개는 같은 예외 계약이 아니다.

### 3.7 source당 성공 역연산 유일성

설계의 공통 멱등 유일 범위는 `(reversalOperationId, operationType)`이다. 이것만으로는 **다른 두 요청 ID가 같은 source 작업을 각각 역연산**하는 것을 DB 차원에서 막지 못한다. deduct는 원 movement가 남으므로 두 번째 키가 같은 원 movement를 다시 가산할 위험이 특히 크다.

문서 후반의 “같은 원 movement에 성공 역이동 최대 1건” 원칙은 맞지만, 공통 journal 유일키와 instance/lot source 유일키로 구체화되지 않았다.

**추가 거부/DB 계약:** `(sourceOperationId, operationType)` 또는 각 원 movement/생성 batch별 성공 reversal unique, 그리고 `(reversalOperationId, operationType)`의 payload hash unique를 둘 다 가져야 한다.

### 3.8 soft-delete된 계보를 “없음”으로 오인

entity의 `@SQLRestriction("is_deleted = false")`만 사용하면 과거 원 movement/lot/instance나 이미 성공한 reversal journal이 soft-delete된 경우 `NOT_FOUND`로 보인다. 역연산 계보 조회는 일반 repository 필터를 우회해 삭제 행까지 읽고, soft-delete 자체를 별도 충돌로 판정해야 한다.

- 현재 후보의 soft-delete 원 작업 계보 표본: 별도 source journal이 없어 완전 판정 불가.
- 활성 instance audit log가 후보 instance와 겹치는 전표: 0 → **판정 불가**.

**추가 거부 조건:** `SOURCE_LINEAGE_SOFT_DELETED` / `REVERSAL_JOURNAL_TAMPERED`.

### 3.9 물리 custody 증거의 freshness

설계는 물리 미출고/회수를 증명하라고 하지만 authoritative source, 증명 시각, 만료, 동시 변경 잠금이 없다. 오래된 “창고에 있음” 확인 뒤 실제 상차가 발생할 수 있다.

- OUTBOUND SHIPPING/DELIVERED/CONFIRMED 후보: **23전표**.
- delivery batch가 연결된 후보: 19전표.
- 서명 필드가 있는 후보: 0전표.
- 실제 원 ship-batch가 있는 9전표: instance 14개 모두 현재 SHIPPED.
- 그 9전표 중 상태가 CONFIRMED인 전표: 2; 나머지 INSPECTING/COMPLETED: 7.
- “미출고 또는 회수 완료”를 권위 있게 증명하는 현재 필드/테이블: 확인하지 못함.

**추가 거부 조건:** custody proof가 없거나 reversal lock 획득 뒤 생성된 것이 아니면 `PHYSICAL_CUSTODY_UNPROVEN_OR_STALE`.

### 3.10 라인 그룹 경계

시리얼 정방향은 같은 product의 여러 라인을 한 그룹으로 합쳐 한 번 호출한다 (`SlipService.java:1160-1191`). reversal key/fingerprint가 line 기준과 product 그룹 기준을 섞으면 한 라인만 되돌리거나 같은 그룹을 두 번 되돌릴 수 있다.

- 동일 전표 내 같은 product가 2라인 이상인 후보: 0전표 → **판정 불가**.

**추가 계약:** source operation unit을 `slip + phase + product + warehouse`로 고정하고, 구성 line ID 집합과 합계수량을 fingerprint에 포함해야 한다.

---

## 4. 요청된 후속 사건별 실측

측정 시각: **2026-08-09 04:25:36~04:30:34 KST**.

| 상황 | 대상 표본 | 사건이 있는 전표/인스턴스 | 판정 |
|---|---:|---:|---|
| 입고 lot 부분 소비 (`quantity != initialQuantity` 또는 비-AVAILABLE) | lot inbound 4전표 | 0전표 | 표본 사건 0 — **판정 불가** |
| 후보 lot의 후속 movement | lot inbound 4전표 | 0전표 | **판정 불가** |
| 다른 전표가 같은 후보 lot 참조 | lot inbound 4전표 | 0전표 | **판정 불가** |
| 후보 lot 창고 이동 | lot inbound 4전표 | 0전표 | **판정 불가** |
| 시리얼 재배정/후속 출고 | instance inbound 7전표, 16개 | **5전표, 12개 instance, 다른 OUTBOUND 9전표** | 명확히 거부 |
| 시리얼 회수 | instance inbound 7전표 | 0개 | **판정 불가** |
| outbound serial이 SHIPPED 외 상태로 후속 전이 | ship-batch 9전표 | 0전표 | 후속 상태 표본은 **판정 불가**, 단 현재 SHIPPED 자체가 custody 미반환 증거 |
| 후보 product+warehouse ADJUST | 실제 원 작업 20전표 | 0전표 | **판정 불가** |
| 진행 중 실사 | 실제 원 작업 20전표 | 0전표 | **판정 불가**; 60 전체로는 22전표 교차 |
| 진행 중 이동 | 60전표 | 0전표 | **판정 불가** |
| #1123 날짜 마감 | 60전표 | 0전표 | rule 데이터 0 — **판정 불가** |
| slip 회계마감 lock | 60전표 | 5전표 | 거부 |
| CLOSED accounting period | 60전표 | 30전표 | 회계 역처리 포함 시 거부/역마감 필요 |
| 원 작업 뒤 slip revision | 60전표 | 2전표, revision 6건 | 원 snapshot 없으면 거부 |

deduct 원 작업이 실 DB에 0건이므로 “원 deduct lot을 다른 전표가 부분 소비/참조”한 위험은 이번 데이터로 판정할 수 없다.

---

## 5. 과잉 거부 — 60건 중 몇 건이 막히는가

### 5.1 설계 문구를 엄격하게 적용한 결과

| 결과 | 전표 수 | 비율 |
|---|---:|---:|
| 거부 | **56** | **93.3%** |
| 관측상 provisional eligible | **4** | **6.7%** |
| 합계 | 60 | 100% |

56건 중 “명백한 후속 소비”는 시리얼 입고 5전표뿐이다. 나머지는 주로 원 작업/활성 품목/생성 집합/custody 증명 부재다. 즉 안전 원칙은 맞지만, source journal과 custody 정본 없이 구현하면 기능은 대부분의 정상/legacy 상태를 **판단하지 못해서 거부하는 기능**이 된다.

### 5.2 과잉 거부를 줄이되 fail-loud를 깨지 않는 방법

1. 신규 정방향 작업부터 source journal과 `APPLIED/NO_OP_*` outcome을 남긴다.
2. legacy 60은 자동 역연산 대상과 “재고 원 작업 없음이 확정된 상태-only revert”를 분리한다.
3. `NO_ORIGINAL_MUTATION`을 곧바로 오류로 하지 말고, 재고 제외/기존 lot/기존 instance no-op를 별도 증명할 때만 성공 단계로 취급한다.
4. 증명할 수 없는 40건은 자동 통과시키지 않는다. 별도 read-only 증거·수동 판정 큐로 둔다.

---

## 6. 원자성·동시성

### 6.1 한 API 내부 원자성 — 그대로 구현 가능

lot/instance/balance/movement/journal을 inventory-service의 한 로컬 트랜잭션으로 커밋하고 한 행이라도 실패하면 모두 롤백하는 계약은 타당하다. 부분 대상 성공을 금지하는 것도 유지해야 한다.

### 6.2 네 API와 slip/accounting 전체 원자성 — 설계가 보장하지 못함

문서의 “한 API 요청 안에서 전부 성공/롤백”은 다음을 덮지 못한다.

1. 첫 product의 inverse 성공·커밋.
2. 둘째 product 또는 다른 API가 영구 업무 충돌로 실패.
3. durable step은 첫 성공을 기억하지만 전체를 원상태로 돌려주지 못함.
4. slip은 아직 이전 상태, inventory는 일부만 되돌린 상태로 남음.

`PENDING/APPLIED/VERIFIED/BLOCKED` journal은 재시작 내구성이지 전역 원자성이 아니다. 특히 `BLOCKED`가 재시도 불가능하면 부분 성공이 영구화된다.

**필수 보완:**

- 모든 단계의 read-only preflight를 먼저 끝내고, 이후에는 대상 전표를 `REVERT_PENDING`/operation ownership으로 격리해 신규 정방향 mutation을 차단한다.
- step별 inverse의 **정방향 재적용 compensation**까지 정의하거나, 부분 성공 상태를 운영상 완료로 만들 수 있는 수동 복구 명령을 정의한다.
- 어떤 단계도 단독으로 영구 `BLOCKED`가 될 수 있는 상태에서 slip을 DRAFT/SAVED로 확정하지 않는다.
- accounting까지 포함한 전체 step DAG와 보상 순서를 문서화한다.

### 6.3 기존 정방향 경로와 잠금 키를 공유하지 않음

설계는 “모든 정방향/역방향 구현에서 같은 잠금 순서”를 요구하지만 현재 코드는 그렇지 않다.

- `deduct`: FIFO lot 조회에 row lock이 없고 (`StockLotRepository.findAvailableLotsForFifo`), product+warehouse advisory lock도 없다.
- `shipBatch`: advisory lock과 row lock 없이 RESERVED 목록을 읽어 SHIPPED로 바꾼다 (`StockInstanceService.java:193-207`).
- `lots/inbound`: existing lot 조회 뒤 생성 사이 공통 advisory lock이 없다. V22 unique가 최종 방어일 뿐이다.
- `instances/batch`: inboundSlipNo+productId advisory lock은 이미 있어 역방향과 공유 가능하다.
- `StockLot`/`StockInstance`에는 `@Version`이 없고 `StockBalance`만 version이 있다.

역연산에만 새 잠금을 추가하면 정방향 요청은 그 잠금을 무시하므로 TOCTOU가 남는다. **네 정방향 API도 같은 lock namespace와 row-lock 순서로 바꾸는 것이 구현 선행조건**이다.

### 6.4 멱등키

다음 두 유일성이 동시에 필요하다.

1. 요청 재시도 식별: `(reversalOperationId, operationType)` + payload/source fingerprint hash.
2. 다른 요청의 중복 역연산 방지: `(sourceOperationId, operationType)` 또는 원 movement/생성 batch당 성공 reversal 최대 1건.

`reversalOperationId`는 무작위 client 입력보다 `revertJobId + phase + source operation unit`에서 결정적으로 파생하는 편이 안전하다. 같은 job에서 서로 다른 product 그룹이 같은 operation type을 쓰므로 product/warehouse/group 구분자가 없으면 정상 두 번째 그룹이 `REVERSAL_KEY_REUSED`로 막힌다.

---

## 7. 회계와의 경계

### 7.1 개발책임자 결정과 설계 문구는 API 경계에서는 모순이 아님

다음 두 사실이 코드로 확인된다.

1. slip의 `confirm()`은 상태만 CONFIRMED로 바꾸며 회계 API를 호출하지 않는다 (`SlipService.java:1398-1403`, `Slip.java:1228-1242`).
2. 회계 매출/매입전표는 사용자가 별도 명령으로 만들며 source slip이 CONFIRMED인지 검사한다 (`SalesAccountingSlipCreateAttemptService.java:118-147`, `PurchaseAccountingSlipCreateAttemptService.java:113-142`).

따라서 “네 inventory inverse API 자체가 회계를 건드리지 않는다”는 것은 맞다. 개발책임자의 “계산서를 추후에 바꾸기 위해 회계도 손대야 한다”는 결정은 **범위 B 전체 오케스트레이터가 회계를 함께 처리해야 한다**는 뜻과 양립한다.

### 7.2 하지만 현재 전체 설계는 회계 step이 없어 불완전

- source slip을 SAVED로 내려도 기존 회계 allocation은 자동 삭제/무효화되지 않는다.
- `SalesAccountingSlip`/`PurchaseAccountingSlip`에는 `voidSlip()` 도메인 메서드는 있지만 현재 service/controller에는 void/delete 명령이 없다.
- `linkTaxInvoice()`는 있으나 unlink 계약은 찾지 못했다.
- 발행 세금계산서 취소는 역분개를 만들며, 원 분개 일자가 CLOSED 기간이면 차단된다.

실 데이터 측정 시각 **2026-08-09 04:27:52.048482 KST**:

- 활성 sales accounting slip 0, purchase accounting slip 0.
- 후보 60과 연결된 allocation 0.
- 전체 활성 journal 133, tax invoice 19이지만 후보와 연결된 회계 chain은 0.
- 활성 sales allocation 1건은 `2026/07/27-64` 원천으로 후보 60과 무관하다.

후보 연결 표본이 0이므로 실제 연동 되돌림 성공 가능성은 **판정 불가**다.

**필수 보완:** inventory preflight 전에 source allocation → 회계전표 상태 → tax invoice 상태 → journal/reversal → accounting period를 전부 연결하고, 회계 chain이 있으면 회계 취소/삭제·재생성 step을 범위 B saga에 넣어야 한다.

### 7.3 개발책임자 질문

**질문 1 — CONFIRMED 전표에 회계 chain이 있으면 어떤 정책으로 되돌릴까요?**

| 선택지 | 결과/대가 |
|---|---|
| (a) 회계 chain이 하나라도 있으면 자동 revert 전부 거부 | 가장 안전하지만 “계산서를 추후 변경” 목적을 달성하지 못함 |
| **(b) DRAFT 회계전표는 삭제/재생성, POSTED/ISSUED는 void/cancel+역분개 후 재생성 (권장)** | 개발책임자 결정과 일치. 대신 #1144 계약, unlink, CLOSED 기간, 외부 전자세금계산서 취소까지 큰 saga가 필요 |
| (c) slip만 되돌리고 회계는 그대로 둠 | 금액·품목이 서로 달라져 허용 불가 |

**질문 2 — CLOSED 회계기간의 전표는 어떻게 할까요?**

| 선택지 | 결과/대가 |
|---|---|
| **(a) 역마감 후에만 범위 B 허용 (권장)** | 현재 회계 가드와 일관. 운영 절차가 한 단계 늘어남 |
| (b) 범위 B 전용 예외 권한으로 CLOSED 기간 역분개 허용 | 편하지만 마감 불변성을 약화하고 감사/재마감 자동화가 필요 |
| (c) CLOSED 기간은 영구 자동 거부 | 단순·안전하지만 과거 계산서 수정 목적을 제한 |

---

## 8. 권한

현재 관련 권한은 서로 다르다.

- slip 처리/complete: `slip.transfer.process UPDATE`.
- 기존 버전 복원: `slip.audit-revert RESTORE`.
- lot/instance inbound: `inventory.stock-balance CREATE`.
- deduct/release: `inventory.list UPDATE`.
- ship-batch: `inventory.stock-balance UPDATE`.
- 회계전표 생성/게시: `accounting.*-slip.accounting CREATE/UPDATE`.
- #1123 마감 예외: `slip.closed-date-exception CREATE` 또는 MASTER.

설계의 서비스 전용 internal API는 직접 호출면을 줄이는 장점이 있지만, **누가 범위 B job을 요청·승인할 수 있는지**는 별도 업무 정책이다. 정답을 만들지 않는다.

**질문 3 — 실행 권한 모델을 고르십시오.**

| 선택지 | 결과/대가 |
|---|---|
| (a) `slip.audit-revert RESTORE` 보유자가 단독 요청, service identity가 실행 | 기존 모델 재사용, 가장 빠름. 재고·회계 고위험 작업에 단독 권한이 너무 넓을 수 있음 |
| **(b) 전용 `slip.inverse-ops EXECUTE` + 고위험 상태 이중 승인 (권장)** | 역할 분리와 감사가 명확. UI·승인 만료·재요청 상태가 추가됨 |
| (c) MASTER만 | 구현은 단순하지만 일상 업무 병목과 과도한 MASTER 의존 |

추가로 CONFIRMED/DELIVERED/CLOSED 기간과 대량 수량의 승인 강화 기준도 개발책임자가 정해야 한다.

---

## 9. 그대로 구현해도 되는 부분 / 고쳐야 하는 부분

### 9.1 그대로 유지할 부분

- 원 작업과 대상 집합을 유일하게 증명하지 못하면 fail-loud.
- 후속 소비·재배정·물리 custody 미반환 시 타 lot/instance로 추정 복원하지 않음.
- 한 inventory API 내부의 전부 성공/전부 롤백.
- 원 movement 삭제 금지, 연결된 reversal movement와 성공 감사 append-only.
- 단순 현재 상태가 목표 상태라는 이유로 멱등 성공 처리하지 않고 성공 journal을 확인.
- gateway 공개 경로가 아닌 internal service identity 경로.
- UUID/instance ID를 사용자 응답에 노출하지 않음.
- 성공 업무 감사와 실패 재시도 queue를 분리.
- 60건을 상태가 아니라 실제 원 mutation별로 다시 분류하는 기준선 절차.

### 9.2 구현 전에 반드시 고칠 부분

1. `NO_OP` source outcome을 성공 가능한 별도 상태로 설계.
2. source 당시 product 분류와 slip revision snapshot을 journal에 저장.
3. 진행 중 실사/이동, 세 층의 마감, 회계 chain을 명시적 preflight 조건으로 추가.
4. 정방향 4 API도 역방향과 같은 advisory/row lock namespace를 사용.
5. source당 성공 reversal unique와 요청 멱등 unique를 둘 다 정의.
6. 네 API+slip+accounting 사이 부분 성공 후 영구 BLOCKED의 복구/정방향 재적용 계약 정의.
7. custody 정본, freshness, 승인자를 결정.
8. 시리얼 grouped line의 operation unit과 key 파생식을 확정.
9. soft-delete 계보를 포함하는 forensic repository/query 정의.
10. #1144 회계 삭제/재생성 계약이 실제 main에 준비되기 전에는 CONFIRMED 범위 B를 완료로 보지 않음.

---

## 10. 최종 구현 게이트

다음이 문서와 테스트로 닫히기 전에는 구현 착수 승인을 권하지 않는다.

- [ ] 60건 baseline에서 `APPLIED / NO_OP / NOT_FOUND / AMBIGUOUS` 구분
- [ ] 거부 56건의 업무 처리 경로와 legacy 수동 판정 정책
- [ ] 정방향/역방향 공통 lock key와 lock 순서
- [ ] source reversal unique constraint
- [ ] 진행 중 audit/transfer 가드
- [ ] #1123, `lock_flag`, accounting CLOSED의 우선순위와 예외 권한
- [ ] accounting/tax invoice/journal step 및 부분 실패 보상
- [ ] custody authoritative source
- [ ] `REVERT_PENDING` 중 다른 mutation 차단
- [ ] 실패 위치별 crash/retry/compensate 상태표

## 11. 신규 파일

- `docs/dev-reports/2026-08-09-1142-inverse-ops-design-review.md`

그 외 신규·수정 파일은 없다.
