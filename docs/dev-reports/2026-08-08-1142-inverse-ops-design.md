# 이슈 #1142 선행조건 — 재고 역연산 API 4종 설계안

> 작성일: 2026-08-08 (Asia/Seoul)  
> 문서 성격: CODEX SOL 5.6 설계안 작성 라운드 — 구현·마이그레이션 아님  
> 개발책임자 결정: 되돌리기 **범위 B — 임의의 이전 단계로 되돌리기**  
> 근거: `2026-08-08-1142-inventory-inverse-ops.md` 및 요청문에 인용된 범위 B 경계 조사 결론

## 0. 결론

네 역연산은 `slip-service` 안의 상태 변경 메서드가 아니라, 원 재고를 소유하는
`inventory-service`의 **조건부 내부 명령**이어야 한다. 호출자가 수량을 임의로 더하고 빼는
API가 아니라, 원 작업 마커를 서버가 다시 읽어 그 작업만 정확히 상쇄하는 계약이다.

가장 중요한 원칙은 다음과 같다.

1. 원 작업과 대상 재고를 유일하게 증명하지 못하면 실행하지 않는다.
2. 물리 출고, 후속 소비, 회수, 재판매, 이동, 실사 조정 등 후속 사건이 있으면 자동으로
   추정 복원하지 않는다.
3. 한 API 요청 안에서는 전부 성공하거나 전부 롤백한다. 가능한 행만 일부 되돌리지 않는다.
4. 같은 역연산 키의 재호출은 추가 변화 없는 `ALREADY_REVERSED`로 끝난다.
5. 원 `DEDUCT`/`INBOUND` 기록은 삭제하지 않고 연결된 역이동과 성공 감사를 append-only로 남긴다.
6. 네 API는 일반 재고 수정 권한으로 직접 호출할 수 없게 하고, 범위 B 오케스트레이터의
   내부 호출 경로로 제한한다.

범위 B에서 단계별 목표는 다음처럼 분리한다.

- `complete` 취소: 수량형 차감은 원 예약분으로, 시리얼 출고는 `RESERVED`로 복원한다.
- `accept` 취소: 위 복원이 성공한 뒤 기존 예약 해제 계약으로 `AVAILABLE`까지 복원한다.
- INBOUND `complete` 취소: 그 전표가 새로 만든 lot/instance만 취소한다.
- 회계·세금계산서는 `CONFIRMED` 이후 별도 명령이며, #1144 규칙 11의 삭제 후 재생성을 따른다.
  네 재고 API가 회계 역분개를 수행하지 않는다.

---

## 1. 가장 먼저 가를 것 — 되돌릴 수 없는 사건과 거부 조건

### 1.1 판단 원칙

`inventory-service`가 현재 상태만 보고 “아마 원래 것”을 골라 복원해서는 안 된다. 실행 직전
읽기 검증과 동일 트랜잭션 안의 잠금 검증을 모두 통과한 경우만 실행한다. 하나라도 위반하면
전체 요청을 `409 CONFLICT`로 거부하고 재고는 한 행도 바꾸지 않는다.

`404`는 원 전표/원 작업 자체가 없는 경우에만 사용한다. 이미 역연산된 것은 오류가 아니라
`200 ALREADY_REVERSED`다. 권한·호출 경로 위반은 `403`, 입력 형식 오류는 `400`이다.

### 1.2 공통 거부 조건

다음은 네 API 모두의 공통 fail-loud 조건이다.

| 코드 후보 | 거부 조건 | 거부 이유 |
|---|---|---|
| `ORIGINAL_OPERATION_NOT_FOUND` | 원 재고 작업 또는 원 마커가 없음 | 하지 않은 작업을 역연산할 수 없음 |
| `ORIGINAL_OPERATION_AMBIGUOUS` | 같은 키로 후보가 둘 이상이며 정확한 대상을 가를 수 없음 | 다른 전표/라인의 재고를 훼손할 위험 |
| `SOURCE_FINGERPRINT_MISMATCH` | 품목·창고·수량·전표/라인 마커가 요청의 기대값과 다름 | 호출 이후 원 데이터가 바뀌었거나 잘못된 요청 |
| `DEPENDENT_OPERATION_EXISTS` | 원 작업 뒤 이동·출고·회수·재판매·실사·조정 등 후속 사건이 존재 | 역연산이 후속 사건의 근거를 파괴함 |
| `PHYSICAL_CUSTODY_NOT_RETURNED` | 이미 외부로 나간 물건의 물리 회수/미출고를 증명할 수 없음 | 장부만 복원하면 실재고가 부풀려짐 |
| `REALLOCATED_TO_OTHER_SLIP` | 대상 수량·lot·instance가 다른 전표에 예약 또는 배정됨 | 타 전표 재고를 빼앗게 됨 |
| `CONCURRENT_MODIFICATION` | 사전검증 뒤 잠금 시점의 버전·상태·수량이 달라짐 | TOCTOU로 잘못된 snapshot을 되돌릴 위험 |
| `PARTIAL_TARGET_SET` | 요청한 품목 그룹 일부만 안전하고 일부는 안전하지 않음 | 부분 취소로 전표 수량과 실재고가 갈라짐 |
| `REVERSAL_KEY_REUSED` | 같은 `reversalOperationId`를 다른 원 작업에 사용 | 멱등 키 충돌 또는 오용 |
| `CLOSED_OR_UNAUTHORIZED_CONTEXT` | 허용된 범위 B 작업·권한·내부 호출 증명이 없음 | 역연산 API의 범용 오용 차단 |
| `MISSING_REASON` | 사유 또는 요청 행위자/작업 상관관계가 없음 | 사후 책임 추적 불가 |
| `LOCK_TIMEOUT` | 정해진 시간 안에 동일 재고 잠금을 얻지 못함 | 무리한 실행보다 재시도 가능한 충돌로 종료 |

다음 행위는 자동 우회 수단으로 허용하지 않는다.

- 부족분을 다른 lot에서 가져와 원 lot를 맞추기
- `ADJUST`로 숫자만 맞추기
- 안전한 instance만 골라 부분 soft-delete하기
- 원 작업이 불명확한 legacy 데이터를 `lotNo`나 생성시각 추정만으로 취소하기
- 이미 출고된 실물을 회수 확인 없이 `AVAILABLE` 또는 `RESERVED`로 되살리기

이 경우 자동 역연산은 거부하고 읽기 전용 증거와 거부 코드를 운영자에게 제공한다. 재고 실사나
수동 조정은 별도 업무이며 이 API의 성공으로 간주하지 않는다.

### 1.3 API별 추가 거부 조건

#### A. deduct 역연산

- 원 `DEDUCT` movement가 `reference_type='SLIP'`, 해당 전표 ID, 품목, 창고로 유일하게
  식별되지 않음
- 원 movement별 `lot_id`가 없거나 lot이 hard-delete/전송/병합 등으로 복원 불가능함
- 원 movement 수량 합이 기대 차감량과 다름
- 같은 원 movement를 가리키는 성공 역이동이 이미 있으나 멱등 키 계보가 불일치함
- 해당 OUTBOUND 물품이 실제로 출고·인도됐고 물리 회수 또는 미출고가 증명되지 않음
- 복원 대상 lot에 원 차감 이후 `ADJUST`, `TRANSFER_OUT`, 별도 취소 등 계보를 바꾸는 movement가 있음
- `fromReservation=true`였는지 증명할 수 없어 `reserved`와 `available` 중 어디로 복원할지 알 수 없음
- balance의 현재 수치가 역연산 delta를 적용해도 invariant를 만족하지 않음

다른 전표가 같은 lot을 FIFO로 추가 차감했다는 사실만으로 원 movement의 lot·수량이 사라지는 것은
아니다. 그러나 물리 재고 반환이 증명되지 않거나 후속 조정 때문에 원 lot 계보가 달라졌다면 거부한다.
복원 시 다른 lot로 재배분하지 않는다.

#### B. instances/ship-batch 역연산

- `(outboundSlipNo, productCode)` 대상 중 하나라도 `RECALLED` 또는 `AVAILABLE` 등 기대한
  `SHIPPED` 상태가 아님
- 하나라도 다른 회수전표, 재판매, 재출고, 수동 상태변경의 대상이 됨
- 대상 instance 수가 전표 라인의 기대 수량과 다름
- 대상의 `outboundPartnerCode`, `outboundAt`, `outboundSlipNo` 계보가 원 출고 snapshot과 다름
- 물리 출고 뒤 아직 반환되지 않은 instance가 하나라도 있음
- 다른 OUTBOUND 전표 마커가 섞여 있음

성공 목표는 `SHIPPED → RESERVED`다. accept 당시 예약 마커인 `outboundSlipNo`는 유지하고,
complete가 붙인 `outboundPartnerCode`와 `outboundAt`은 성공 감사에 원값을 보존한 뒤 제거한다.
곧바로 `AVAILABLE`로 보내지 않는다. 이후 단계인 accept 취소가 기존 `release-batch`를 호출한다.

#### C. lots/inbound 역연산

- 원 API가 새 lot을 만들지 않고 기존 lot을 조기 반환했던 호출임
- `inboundLineId`가 없고 같은 전표·품목의 복수 lot 중 원 생성 lot을 유일하게 가를 수 없음
- `quantity != initialQuantity`, 상태가 `SOLD_OUT`/`IN_TRANSIT`, 또는 원 INBOUND 뒤 차감·이동·실사·조정이 있음
- lot 수량 일부가 다른 전표에 소비·예약·이동됨
- 원 `INBOUND` movement와 lot 생성이 1:1로 연결되지 않음
- 해당 lot을 취소한 뒤 balance가 음수가 되거나 invariant가 깨짐
- 원가/FIFO 계보를 보존할 수 없음

lot은 전량 미사용 상태일 때만 취소한다. 성공 시 hard delete가 아니라 soft-delete하고, balance의
`available`과 `total`을 원 입고량만큼 함께 줄이며, 원 `INBOUND`를 참조하는 음수 역이동을 남긴다.

#### D. instances/batch 역연산

- 원 호출이 반환한 “기존+신규” 중 실제 신규 생성 instance 집합을 증명하지 못함
- 취소 대상 중 하나라도 `AVAILABLE`이 아니거나 예약/출고/회수/재판매 이력이 있음
- 하나라도 다른 전표 마커를 가짐
- 취소 대상 수가 원 호출의 실제 생성 수와 다름
- `(inboundSlipNo, productId)`가 legacy 중복 또는 혼합 생성이라 정확한 생성 배치를 가를 수 없음
- 일부만 안전하고 일부는 후속 사용됨

전부 안전한 경우에만 원 생성 instance 집합 전체를 한 트랜잭션에서 soft-delete한다. 이 경로는
원 작업도 `stock_balance`, lot, movement를 바꾸지 않았으므로 역연산 역시 이를 바꾸지 않는다.

### 1.4 과거 60건에 대한 중요한 제한

신규 원 작업부터는 생성·차감 시 `sourceOperationId`와 정확한 affected lot/instance 집합을 저장할 수
있다. 그러나 기존 60개 후보는 그 마커가 없을 수 있다. 다음 중 하나로도 정확히 증명할 수 없는 건은
자동 적용 대상에서 제외한다.

- deduct: 원 `DEDUCT` movement의 전표·품목·창고·lot별 수량
- ship-batch: 전표·품목·출고마커가 일치하는 instance 전체 집합
- lot inbound: `inboundLineId`와 원 `INBOUND` movement가 일치하는 새 lot
- instance inbound: 해당 호출이 실제 새로 만든 instance 집합

특히 `lots/inbound`의 기존 lot 조기반환과 `instances/batch`의 기존+신규 혼합은 “상태상 그럴듯함”만으로
취소하지 않는다. 이 기준을 적용하면 60건 전부가 실행 가능하다고 보장할 수 없다.

---

## 2. 공통 계약과 서비스 경계

### 2.1 소관

네 API의 소관은 모두 `inventory-service`다. `slip-service`는 범위 B의 목표 단계와 순서를 결정하고,
전표별 durable 작업 journal을 가진 오케스트레이터 역할만 한다. 두 서비스의 DB는 하나의 원자적
트랜잭션이 아니므로, slip 상태를 먼저 확정한 뒤 재고를 뒤늦게 맞추는 방식은 금지한다.

권장 순서는 다음과 같다.

1. `slip-service`가 전표·라인·현재 상태와 물리 인도/회수 조건을 읽기 검증한다.
2. 전표별 되돌림 작업 ID와 단계별 기대 fingerprint를 만든다.
3. `inventory-service`가 요청별로 원 마커를 재검증하고 잠근 뒤 한 로컬 트랜잭션으로 역연산한다.
4. 응답 delta를 baseline과 비교한다.
5. 필요한 다음 역연산 또는 기존 예약 해제를 실행한다.
6. 모든 단계 검증 후에만 slip 목표 상태를 확정한다.
7. 원격 실패 시 durable step과 기존 compensation 실패 기제를 통해 같은 멱등 키로 재시도한다.

### 2.2 내부 HTTP 경로 후보

아래는 구현명이 아니라 계약을 명확히 하기 위한 시그니처 수준의 이름이다.

```text
POST /internal/inventory/deductions/reversals
POST /internal/inventory/instances/ship-batch/reversals
POST /internal/inventory/lots/inbound/reversals
POST /internal/inventory/instances/inbound-batch/reversals
```

기존 일반 `/inventory/**` gateway 경로에는 노출하지 않는다. `slip-service`의 내부 토큰 클라이언트가
별도 audience/scope로만 호출한다.

### 2.3 공통 요청·응답 봉투

모든 요청은 다음 공통 필드를 가진다.

```text
ReversalCommand(
  reversalOperationId: UUID,       // 전표 되돌림 작업+단계의 멱등 키, 내부 전용
  sourceOperationId: UUID?,        // 신규 원 작업 journal 식별자; 과거 건은 없을 수 있음
  sourceSlipId: UUID,              // 내부 참조, 사용자 화면 노출 금지
  sourceSlipNo: String,            // 업무 확인용
  expectedFingerprint: String,     // 정규화한 원 작업 대상/수량 snapshot hash
  reasonCode: String,
  reason: String                   // 필수, 길이 제한 및 민감정보 금지
)
```

행위자·호출 서비스·correlation ID는 body의 임의 값이 아니라 인증된 헤더/토큰에서 얻는다.

공통 응답은 다음 의미를 가진다.

```text
ReversalResult(
  result: APPLIED | ALREADY_REVERSED,
  reversalOperationId: UUID,
  sourceSlipNo: String,
  affectedCount: int,
  beforeFingerprint: String,
  afterFingerprint: String,
  delta: OperationSpecificDelta,
  auditReference: String           // 사용자에게 UUID 원문 노출 금지
)
```

거부 응답은 단일 기계 판독 코드, 전표번호·품목코드 같은 비즈니스 식별자, 재시도 가능 여부를
포함한다. 내부 UUID와 instance ID 집합은 일반 사용자 응답·알림에 노출하지 않는다.

### 2.4 공통 멱등성

- 유일 범위: `(reversalOperationId, operationType)`
- 같은 키·같은 source fingerprint: 두 번째 호출은 DB 변화 없이 최초 성공 결과를 재생해
  `ALREADY_REVERSED` 반환
- 같은 키·다른 source/fingerprint: `409 REVERSAL_KEY_REUSED`
- 첫 호출이 로컬 트랜잭션 중 실패: 재고와 성공 journal 모두 롤백되므로 같은 키로 안전하게 재시도
- 타임아웃으로 호출자가 결과를 모르는 경우: 같은 키 재호출로 성공 여부를 판정
- 멱등 판단을 “현재 상태가 이미 목표 상태인가”만으로 하지 않음. 다른 업무가 만든 동일 상태를
  성공으로 오인할 수 있으므로 반드시 역연산 성공 journal과 source 연결을 확인

### 2.5 공통 부분 실패와 동시성

각 요청은 `inventory-service` 한 트랜잭션에서 다음을 함께 커밋한다.

- 대상 lot/instance/balance 변화
- 원 movement를 참조하는 역이동(해당 경로만)
- 성공 operation journal과 before/after delta

하나라도 실패하면 셋 모두 롤백한다. 품목 그룹 일부 성공은 반환하지 않는다. 여러 전표 라인과 네
API를 아우르는 전역 트랜잭션은 없으므로 `slip-service`는 durable step별로 `PENDING`, `APPLIED`,
`VERIFIED`, `FAILED_RETRYABLE`, `BLOCKED`를 기록할 필요가 있다. 프로세스 메모리의
`List<Compensation>`만으로는 재시작 후 재개를 보장하지 못한다.

잠금 순서는 모든 정방향/역방향 구현에서 같아야 한다.

1. 전표+품목 operation advisory lock
2. reversal key/journal
3. `(productId, warehouseId)` balance
4. lot 또는 instance 행을 안정된 ID 순으로 `PESSIMISTIC_WRITE`
5. 잠금 후 원 상태·fingerprint 재검증

`StockBalance.@Version`은 마지막 안전망으로 유지한다. 잠금 대기 초과와 버전 충돌은 500이 아니라
재시도 가능한 409로 분류한다. 다른 요청을 기다리며 무한 재시도하지 않는다.

### 2.6 공통 감사

성공한 계획 역연산과 실패한 보상을 분리한다.

- **업무 성공 감사 — inventory 소관:** operation type, source/reversal operation ID, 전표번호,
  품목·창고 내부키, 원 movement/lot/instance 내부 집합, before/after 상태와 delta, 행위자, 사유,
  요청 서비스, correlation ID, 발생시각, 최초/재호출 결과를 보존
- **movement 감사:** deduct와 lot inbound는 원 movement를 삭제하지 않고 원 movement ID를
  참조하는 반대 부호의 새 movement를 기록
- **실패 보상 감사 — slip 소관:** 원격 호출 실패, 재시도 횟수, 다음 재시도 시각, 마지막 오류를
  기존 `CompensationAuditWriter` 계열에 기록
- **거부 감사:** 업무 규칙상 거부는 재고 트랜잭션 밖의 독립 감사에 reason code와 fingerprint만
  남기며, 사용자 알림에는 UUID·예외 전문을 싣지 않음

기존 `MovementType`에는 역연산 전용 값이 없다. 원 `DEDUCT`나 `INBOUND`를 같은 유형·반대 부호로
재사용하면 정상 작업과 취소 작업을 구별하기 어렵기 때문에, 구현 시 `DEDUCT_REVERSAL`과
`INBOUND_REVERSAL` 같은 전용 유형 후보를 검토해야 한다. 명칭과 저장 구조는 미확정이지만,
“전용 역연산 유형 + 원 movement ID 직접 참조 + 같은 원 movement에 성공 역이동 최대 1건”이라는
계약은 유지한다. `ADJUST`로 기록하는 선택지는 원 작업 계보를 잃으므로 제외한다.

---

## 3. 역연산 API 4개 상세 계약

### 3.1 deduct 역연산

**이름**

```text
POST /internal/inventory/deductions/reversals
```

**입력**

```text
ReverseDeductionCommand(
  <ReversalCommand>,
  productId: UUID,
  warehouseId: UUID,
  expectedQuantity: positive int,
  expectedFromReservation: boolean,
  sourceReferenceType: "SLIP",
  sourceReferenceId: UUID
)
```

caller가 `affectedLots`를 복원 명령으로 보내지 않는다. 서버가 원 `DEDUCT` movement에서 lot별
수량을 다시 계산하고 caller의 fingerprint와 비교한다. 이는 caller가 임의 lot에 수량을 넣는 오용을
막는다.

현재 movement 자체에는 `fromReservation`이 저장되지 않는다. 신규 정방향 작업은 source operation
journal에 이 값을 보존해야 한다. 과거 건은 `slip-service complete()`가 `referenceType=SLIP`과
`fromReservation=true`로 호출한 계약, 동일 전표의 선행 예약 movement, 당시 수량 delta가 함께
일치할 때만 예약차감으로 인정한다. 셋 중 하나라도 증명되지 않으면 `available`로 추정 복원하지 않고
`ORIGINAL_OPERATION_AMBIGUOUS`로 거부한다.

**출력**

```text
ReverseDeductionResult(
  <ReversalResult>,
  restoredQuantity: int,
  restoredLots: [{ auditRef, quantity }],
  balanceBefore: { available, reserved, total },
  balanceAfter:  { available, reserved, total },
  reversalMovementCount: int
)
```

**부수 효과**

- 원 lot별 차감량을 정확히 가산하고 `SOLD_OUT → AVAILABLE`이 필요한 lot만 복원
- `fromReservation=true`이면 `reserved += q`, `total += q`, `available` 불변
- false이면 `available += q`, `total += q`, `reserved` 불변
- 원 DEDUCT movement 각각에 1:1인 양수 역이동 기록
- 성공 operation journal 기록

**멱등성**: 같은 키의 두 번째 호출은 lot/balance/movement 변화 없이 최초 결과를 반환한다.

**부분 실패**: 모든 lot 복원, balance, 역이동, 성공 감사가 한 트랜잭션이다. 한 lot라도 거부되면
전부 원상태로 롤백한다.

**동시성**: product+warehouse advisory lock, balance, 원 movement가 가리키는 lot을 고정 순서로
잠근다. 잠금 후 합계·상태·fingerprint를 다시 확인한다.

**감사**: 원 movement ID ↔ reversal movement ID 1:1 관계, lot별 수량, balance 전후, 원
`fromReservation`, 전표번호, 행위자·사유를 남긴다.

### 3.2 instances/ship-batch 역연산

**이름**

```text
POST /internal/inventory/instances/ship-batch/reversals
```

**입력**

```text
ReverseShipBatchCommand(
  <ReversalCommand>,
  outboundSlipNo: String,
  productCode: String,
  expectedInstanceCount: positive int,
  targetStatus: "RESERVED"
)
```

`targetStatus`는 이번 범위에서 `RESERVED`만 허용한다. 임의 상태 전이 API로 넓히지 않는다.

**출력**

```text
ReverseShipBatchResult(
  <ReversalResult>,
  transitionedCount: int,
  beforeStatus: "SHIPPED",
  afterStatus: "RESERVED",
  outboundSlipMarkerRetained: true,
  shippingMarkersCleared: ["outboundPartnerCode", "outboundAt"]
)
```

**부수 효과**

- 정확한 대상 전체를 `SHIPPED → RESERVED`로 변경
- 예약 소유 증명인 `outboundSlipNo` 유지
- complete 시점 마커인 partner/outboundAt은 성공 감사에 snapshot 후 instance에서 제거
- balance·lot·StockMovement는 변경하지 않음
- 상태 전이 성공 operation journal 기록

**멱등성**: 같은 역연산 journal이 있는 재호출만 `ALREADY_REVERSED`다. 단순히 RESERVED라는 이유로
성공 처리하지 않는다.

**부분 실패**: N개 전부 전이와 감사가 한 트랜잭션이다. 한 개라도 후속 사건이 있으면 0개 처리한다.

**동시성**: outboundSlipNo+productCode advisory lock 후 대상 instance 전체를
`PESSIMISTIC_WRITE`로 잠근다. 회수·재판매·다른 출고와 경합하면 무음 no-op가 아니라 충돌이다.

**감사**: instance 내부 식별 집합, 상태 전후, 제거한 출고 마커 snapshot, 전표번호·품목코드,
행위자·사유를 기록한다. 사용자 응답에는 instance UUID를 노출하지 않는다.

### 3.3 lots/inbound 역연산

**이름**

```text
POST /internal/inventory/lots/inbound/reversals
```

**입력**

```text
ReverseLotInboundCommand(
  <ReversalCommand>,
  lotId: UUID,
  productId: UUID,
  warehouseId: UUID,
  inboundSlipNo: String,
  inboundLineId: UUID,
  expectedInitialQuantity: positive int
)
```

`inboundLineId=null`인 legacy 건은 별도의 원 작업 journal이나 유일한 원 INBOUND movement로
동일성을 증명하지 못하면 거부한다. `lotNo`만으로 실행하지 않는다.

**출력**

```text
ReverseLotInboundResult(
  <ReversalResult>,
  canceledQuantity: int,
  lotDisposition: "SOFT_DELETED",
  balanceBefore: { available, reserved, total },
  balanceAfter:  { available, reserved, total },
  reversalMovementCount: 1
)
```

**부수 효과**

- 미사용 원 lot soft-delete
- `available -= q`, `total -= q`, `reserved` 불변
- 원 INBOUND movement를 참조하는 `-q` 역이동 기록
- 성공 operation journal 기록

**멱등성**: soft-delete 여부만 보지 않고 같은 역연산 journal과 원 lot 계보를 확인한다.

**부분 실패**: lot, balance, 역이동, 성공 감사가 한 트랜잭션이다. hard delete는 하지 않는다.

**동시성**: product+warehouse+inboundLine advisory lock, balance, lot 순으로 잠근다. FIFO 차감과
경합하면 잠금 뒤 `quantity == initialQuantity` 및 후속 movement 부재를 다시 확인한다.

**감사**: 원 lot·원 INBOUND movement·역이동 연결, 수량, 원가/receivedAt snapshot,
soft-delete 행위자·사유를 기록한다.

### 3.4 instances/batch 역연산

**이름**

```text
POST /internal/inventory/instances/inbound-batch/reversals
```

**입력**

```text
ReverseInboundInstanceBatchCommand(
  <ReversalCommand>,
  inboundSlipNo: String,
  productId: UUID,
  productCode: String,
  warehouseId: UUID,
  expectedCreatedCount: positive int
)
```

신규 원 호출은 `sourceOperationId`가 정확한 created instance 집합을 가리켜야 한다. 과거 호출은
해당 호출 직전 수량과 실제 신규분을 증명하지 못하면 거부한다. 요청 body에 임의 instance 목록을
넣어 삭제 대상을 선택하게 하지 않는다.

**출력**

```text
ReverseInboundInstanceBatchResult(
  <ReversalResult>,
  canceledCount: int,
  priorStatus: "AVAILABLE",
  disposition: "SOFT_DELETED",
  balanceDelta: 0,
  lotDelta: 0,
  movementDelta: 0
)
```

**부수 효과**

- 원 호출이 실제 생성한 AVAILABLE instance 전체 soft-delete
- balance·lot·StockMovement는 변경하지 않음
- 성공 operation journal 기록

**멱등성**: 같은 source/reversal journal의 재호출은 추가 soft-delete 없이 최초 결과 반환.

**부분 실패**: 대상 N개와 감사가 한 트랜잭션이다. 일부만 삭제하지 않는다.

**동시성**: 기존 생성과 같은 inboundSlipNo+productId advisory lock을 먼저 사용하고, source가
가리키는 instance를 안정된 순서로 잠근다. 예약·출고가 먼저 일어났다면 충돌로 거부한다.

**감사**: 정확한 원 생성 집합, N, 상태 전후, 입고전표·품목·창고 snapshot, 행위자·사유를 남긴다.
UUID 집합은 내부 감사에만 보존한다.

---

## 4. 기존 compensation 기제 재사용 설계

### 4.1 그대로 재사용할 수 있는 구조

- 성공한 원격 작업의 반대 작업을 역순으로 실행하는 개념
- `CompensationAuditWriter`의 별도 빈 + `REQUIRES_NEW` 실패 기록
- 원 예외를 유지하고 보상 예외를 suppressed로 붙이는 방식
- WARN, metrics, best-effort alert 구조
- `CompensationRetryExecutor`의 감사 행 `PESSIMISTIC_WRITE`, 건별 `REQUIRES_NEW`, 지수 백오프
- `SlipServiceCompensationTest`의 “원 실패 유지 / 보상 실패 감사 / 보상 성공 시 실패 감사 없음” 검증 구조

### 4.2 확장 지점

`CompensationOperation` 후보:

```text
REVERSE_DEDUCTION
REVERSE_SHIP_BATCH
REVERSE_LOT_INBOUND
REVERSE_INBOUND_INSTANCE_BATCH
```

`CompensationPhase` 후보:

```text
REVERT_COMPLETE_INVENTORY
REVERT_ACCEPT_INVENTORY
REVERT_INBOUND_COMPLETE
```

명칭은 후보이며 구현 시 기존 enum 의미와 범위 B 상태 모델에 맞춰 확정한다.

실패 행 또는 별도 payload에는 최소 다음이 추가되어야 한다.

- payload schema version
- `reversalOperationId`, `sourceOperationId`, operation/phase
- source slipNo와 내부 slip ID
- productId/productCode, warehouseId, line marker
- 기대 수량·대상 수·expected fingerprint
- 내부 endpoint와 인증된 caller/correlation ID
- 마지막 HTTP status와 기계 판독 거부/실패 코드

현재 `productCode/slipNo`만으로는 deduct/lot/instance inbound를 안전하게 재시도할 수 없다.

### 4.3 새로 필요한 것

1. **계획된 되돌림 성공 journal**: 기존 failure audit와 목적이 다르다. inventory의 실제 delta와
   멱등 결과를 보존해야 한다.
2. **durable step journal**: 네 API 사이에서 프로세스가 죽어도 어느 단계까지 성공했는지 재개한다.
3. **source operation marker**: 향후 정방향 작업이 정확한 affected lot/created instance 집합을 남긴다.
4. **성공 결과 조회/재생**: 타임아웃 뒤 같은 키 재호출 시 최초 결과를 반환한다.
5. **재시도 분류**: lock timeout/5xx는 재시도 가능, 업무 거부 조건은 자동 재시도 금지.
6. **새 계약 테스트**: operation별 payload 직렬화, 같은 키 재시도, 다른 payload 키 충돌,
   재시작 후 재개, 실패 감사 저장 실패까지 검증한다.

기존 `SerialCompensationFailure` 테이블을 범용화할지 별도 revert failure journal을 둘지는 미확정이다.
어느 쪽이든 성공 업무 감사와 실패 재시도 큐의 의미를 한 상태값으로 섞지 않는다.

---

## 5. 되돌린 뒤 재고가 맞다는 증명

### 5.1 전역 합계가 아니라 전표별 사전·사후 delta

활성 `stock_balances.total_qty`와 활성 `stock_lots.quantity` 그룹합이 이미 200건 불일치하므로,
전역 `balance = lot 합`은 이번 성공 판정식이 될 수 없다. 기존 이상을 역연산 책임으로 오인하지
않도록 각 전표·라인·원 operation을 기준으로 **적용 전 snapshot + 기대 delta + 적용 후 snapshot**을
비교한다.

각 snapshot은 정렬 순서가 고정된 canonical JSON과 hash를 함께 보관한다. 사용자 산출물에는
전표번호·품목코드·창고코드를 표시하고 UUID 집합은 접근 제한된 내부 증거에만 둔다.

### 5.2 60건 적용 전 기준선

조사 시점 상태 기준 후보는 INBOUND 20 + OUTBOUND 40 = 60건이다. 이는 최대 후보이며 실제 네
mutation 성공 건수는 아직 모른다. 실제 적용 직전 반드시 같은 read-only 상태 집계를 다시 실행하고,
다음 단계로 기준선을 만든다.

1. 활성 상태 `INSPECTING`, `COMPLETED`, `SHIPPING`, `DELIVERED`, `CONFIRMED`를 유형·상태별 재집계
2. 60개 후보 각각의 전표번호, 유형, 상태, 라인, 품목코드, 수량, serialManaged, 창고를 추출
3. 원 API 경로를 라인별 분류: deduct / ship-batch / lot inbound / instance inbound / no-op
4. inventory에서 원 movement, lot, instance, balance와 후속 사건을 읽기 전용으로 연결
5. `ELIGIBLE`, `ALREADY_REVERSED`, `BLOCKED_<reason>`, `NO_ORIGINAL_MUTATION`, `UNKNOWN_LINEAGE`로 분류
6. API별 실제 영향 전표 수·라인 수·수량·lot 수·instance 수와 거부 사유별 건수를 집계
7. snapshot 시각과 query/version, 행 수, canonical hash를 기준선 artifact에 기록

실 데이터 검증 완료 기준에는 반드시 다음 숫자가 들어가야 한다.

- 적용 직전 총 후보 수와 조사 기준 60건 대비 증감
- API별 실제 mutation 대상 전표/라인/수량
- 자동 역연산 가능 건수
- 거부 조건별 건수
- 원 마커가 없어 판단 불가한 건수
- 사후 delta 불일치 건수(목표 0)

이 설계 라운드에서는 DB 조회를 새로 실행하거나 기준선을 쓰지 않았다. 기존 조사에서 확정한
60건과 200건 불일치만 근거로 사용한다.

### 5.3 API별 기대 delta와 사후 증명

| 역연산 | 원자적 기대 delta | 사후 증명 |
|---|---|---|
| deduct | 각 원 lot `+qᵢ`; balance `total +Q`; 예약차감이면 `reserved +Q`, 아니면 `available +Q`; reversal movement `+qᵢ` | 원 DEDUCT와 reversal이 lot별 1:1, `Σqᵢ=Q`, lot 상태/수량과 balance 전후가 기대값, 동일 reversal key 1건 |
| ship-batch | `SHIPPED -N`, `RESERVED +N`; outboundSlipNo 유지; partner/outboundAt 제거 | 원 대상 N개가 모두 RESERVED, SHIPPED/RECALLED 잔존 0, 마커 정책 일치, balance/lot/movement delta 0 |
| lot inbound | 원 lot active `-1`(soft-delete), balance `available -Q`, `total -Q`, reversal movement `-Q` | lot 미사용·soft-delete, 원 INBOUND↔reversal 연결, balance delta 정확, 다른 lot delta 0 |
| instance inbound | 원 생성 AVAILABLE active `-N`(soft-delete) | 정확한 source 생성 집합 N개만 soft-delete, 다른 상태/전표 대상 0, balance/lot/movement delta 0 |

각 API 실행 직후 같은 inventory 트랜잭션이 계산한 delta를 응답하고, `slip-service`는 baseline의
기대 delta와 비교한다. 이후 별도의 read-only 재조회로 committed 상태를 다시 검증한다. 응답과
재조회가 다르면 slip 상태를 확정하지 않고 `FAILED_RETRYABLE` 또는 `BLOCKED`로 둔다.

### 5.4 검증 시나리오

- 정상 1회 실행과 동일 키 2회 실행
- 같은 키·다른 payload 충돌
- 원 movement/instance 일부 누락
- 후속 출고·회수·재판매·이동·실사·조정 존재
- legacy `inboundLineId=null` 및 기존+신규 instance 혼합
- 동일 재고 정방향 요청과 역연산의 동시 실행
- lot N개 중 마지막 처리 실패 시 전체 롤백
- 응답 유실 후 재호출
- inventory 성공 뒤 slip 프로세스 종료 및 durable 재개
- 자동 재시도 가능 오류와 업무 거부 오류의 분리
- 사용자 응답·로그·알림의 UUID 비노출

재고 실사는 물리수량의 최종 보조 검증으로 쓸 수 있으나, 차이를 실제 `ADJUST`와 회계분개로
반영하므로 자동 역연산 검증 단계에서 실행하지 않는다.

---

## 6. 별도 선행 트랙과 #1142 통합 진행의 대가

아래는 개발책임자 판단 재료이며 이 문서에서 어느 쪽도 선택하지 않는다.

| 판단축 | 별도 트랙 | #1142와 함께 |
|---|---|---|
| 장점 | inventory 계약·잠금·멱등·감사를 독립 검토 가능; API별 원자성/경합 테스트 집중; inventory 선배포·dark launch 가능; blast radius가 상대적으로 작음 | slip 목표 단계와 inventory 목표 상태를 한 번에 맞춤; durable saga와 실제 사용자 흐름을 E2E로 검증; 임시 client 계약과 중복 오케스트레이션 감소 |
| 단점 | `SHIPPED→RESERVED` 같은 slip 의미를 너무 일찍 고정할 위험; 선행 배포·호환 client 관리 필요; 최종 E2E는 후속 작업으로 남음 | PR과 회귀 범위가 큼; slip 상태·4개 재고 경로·회계 삭제/재생성 경계·60건 데이터가 한 번에 얽힘; 실패 위치 조합과 리뷰 부담 증가 |
| 그동안 #1142 상태 | 선행 계약·감사·잠금·검증기가 완료되고 소비 가능한 버전이 배포될 때까지 **blocked**. 문서/조회성 baseline 준비만 가능하고 상태 되돌림 실행은 불가 | 별도 blocked 이슈는 없지만, 네 API와 오케스트레이터가 모두 검증되기 전까지 전체 PR을 부분 완료로 볼 수 없음 |
| PR 크기 | inventory-service 중심의 중간 크기 PR + 후속 #1142 통합 PR. 두 PR 사이 계약 호환성 테스트 필요 | 대형 통합 PR. inventory/slip/client/권한/감사/문서/60건 read-only 검증을 한 리뷰 단위로 포함 |
| 검증 범위 | 4 API의 멱등·거부·잠금·원자성 IT, contract test, dark-launch read-only 판정. 후속으로 slip saga E2E | 앞의 모든 API 검증 + 임의 이전 단계별 slip 상태 + 부분 실패 saga + 재시작 복구 + 60건 분류·전후 delta + 회계 경계 회귀 |
| 배포 대가 | inventory 선배포 후 미사용 API 오용 방지와 버전 호환 필요 | 동시 배포 또는 feature flag/호환 버전 전략 필요; 롤백 단위가 큼 |

---

## 7. 역연산 밖의 오용 위험과 권한 후보

### 7.1 필요한 오용 방지 장치

네 API는 만들어지는 순간 범위 B 밖에서도 재고를 되살리거나 없앨 수 있다. 따라서 일반 mutation
endpoint보다 강한 장치가 필요하다.

- gateway 공개 라우트 미등록, `/internal/**` 전용
- 일반 `inventory.stock-balance CREATE/UPDATE`와 분리된 전용 execute scope
- `slip-service` 등 허용된 service identity와 별도 token audience 확인
- `reversalOperationId`, source operation, 전표·품목 fingerprint, 필수 사유 없이는 실행 거부
- server-side 원 작업 조회; caller가 임의 수량/lot/instance를 지정해 조정하지 못하게 함
- 실행 전 read-only preflight와 실행 트랜잭션 안의 동일 조건 재검증
- 전체 기능 flag 및 operation별 kill switch 후보
- 전표/품목별 rate limit과 비정상 대량 호출 경보
- 성공·거부·실패 모두 구조적 감사와 metrics
- 알림/UI에서 UUID·instance 내부키 비노출
- 수동 SQL 또는 일반 adjust로 이 API의 성공 journal을 위조할 수 없게 분리

### 7.2 권한 모델 후보 — 소유자는 미결정

| 후보 | 방식 | 장점 | 대가/주의 |
|---|---|---|---|
| 서비스 전용 | 사람 권한 없이 범위 B 오케스트레이터 service identity만 execute | 호출면 최소화, 정책 일관 | 긴급 수동 복구에는 별도 승인 흐름 필요 |
| 전용 업무 권한 | 예: `inventory.reversal EXECUTE`를 가진 인증 사용자 요청 + 내부 서비스 실행 | 행위자 추적과 업무 승인 결합 | 누가 가질지와 위임/회수 정책 필요 |
| 이중 승인 | 요청 권한과 승인 권한을 분리하고 승인된 operation token만 실행 | 고위험 오용 억제 | 운영 지연·UI·만료/취소 상태 복잡성 |
| 상태·금액 기반 단계 승인 | 기본은 단일 승인, CONFIRMED/배송완료/대량 수량은 강화 | 위험도 비례 통제 | 임계값과 예외 규칙이 복잡해질 수 있음 |

이 문서는 특정 역할이나 개인에게 권한을 부여하지 않는다. 후보 중 어떤 모델을 쓸지, 누가 요청·승인
권한을 가질지는 개발책임자 결정 사항이다.

---

## 8. 확정하지 못한 것

1. **별도 트랙 vs #1142 통합 진행** — 양쪽 대가만 제시했으며 선택하지 않았다.
2. **권한 소유자와 승인 방식** — 서비스 전용/전용 업무 권한/이중 승인 후보만 제시했다.
3. **과거 60건의 API별 실제 mutation 수** — 상태 기준 최대 후보만 60건이며 라인별 원 마커
   read-only 계보 조사가 필요하다.
4. **60건 중 자동 역연산 가능 수** — 물리 인도/회수, 후속 출고·회수·실사·조정, legacy 마커를
   적용한 eligibility 집계 전에는 모른다.
5. **물리 custody의 authoritative source** — 배송완료 상태, 창고 확인, 회수 증빙 중 무엇을
   실행 조건으로 인정할지 확정되지 않았다.
6. **legacy lot/instance 생성분의 유일 식별** — `inboundLineId=null` 및 기존+신규 혼합을 안전하게
   재구성할 수 없는 건은 본 설계상 거부하지만, 별도 증빙을 인정할지는 미정이다.
7. **성공 journal과 failure journal의 저장 모델** — 분리 원칙은 정했으나 기존
   `SerialCompensationFailure` 범용화 여부와 물리 테이블은 미정이다.
8. **operation/phase/endpoint 최종 명칭** — 본문 명칭은 시그니처 수준 후보이며 구현 명명 결정이 아니다.
9. **자동 재시도 횟수·백오프·lock timeout** — retryable/blocked 분류 원칙만 제시했다.
10. **범위 B 단계별 최종 slip 상태표** — 임의 이전 단계라는 정책은 확정됐지만 각 출발 상태에서
    허용할 목표 상태와 단계 조합의 전체 표는 #1142 본 설계와 함께 확정해야 한다.
11. **지정 선행 경계 보고서 원문** — `docs/dev-reports/2026-08-08-1142-scope-b-boundary.md`는 현재
    작업 디렉터리에서 발견되지 않아 요청문에 인용된 확정 결론만 사용했다.
12. **balance와 lot 합 불일치 200건 원인** — 이번 역연산 설계에서 원인 규명이나 보정을 하지 않았다.
13. **역연산 movement의 최종 enum/참조 저장 방식** — 전용 유형과 원 movement 직접 참조 원칙만
    정했으며 이름·컬럼·별도 journal 사용 여부는 미정이다.

---

## 9. 이번 라운드에서 하지 않은 것

- 코드·테스트·마이그레이션 생성 또는 수정 없음
- DB 쓰기·전표 상태 전이·실 데이터 재조회 없음
- Docker 재기동·재배포 없음
- git 명령 없음
- 신규 이슈 제안 없음

## 10. 신규 파일

- `docs/dev-reports/2026-08-08-1142-inverse-ops-design.md`
