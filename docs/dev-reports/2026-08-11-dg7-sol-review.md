# D-G7 SOL 5.6 고유분 코드 검토

> 검토일: 2026-08-11  
> 대상: PR #1169, HEAD `1b740a8b6c1101e40fb730acf6b069f8de22eca3`  
> 비교 기준: merge-base `e983f90d7474d85203e9e4ef3aecd6ea4634a572`  
> 판정 범위: 확정 취소, DRAFT 기준일 수정, 기존 번호 재확정, accounting V99 snapshot 이력

## 1. 판정

**고유분 차단 결함 1건이다.**

따라서 현재 상태는 “#1168 머지 후 rebase + 중복 제거만 하면 됨”이 아니다. 중복인 groupware V19와 결재 역조회 구현을 제거한 뒤에도 아래 결함을 닫아야 한다.

- **DG7-SOL-1 — 취소 확인과 결재 참조 추가 사이 TOCTOU 때문에, 취소된 DRAFT에 새 PENDING/IN_PROGRESS 결재가 붙을 수 있다.**

별도 수치 정정도 있다.

- 구현 보고의 accounting 전체 `1,875 tests`는 재현되지 않았다.
- `--rerun-tasks` 강제 실행 및 새 XML 224개 전수 합산 결과는 **1,879 tests / failures 0 / errors 0 / skipped 10**이다.
- 이는 기능 실패는 아니지만 구현 보고 수치는 1,879로 고쳐야 한다.

## 2. 검토 제외 경계

요청대로 다음은 품질 판정하지 않았다.

- groupware V19 CHECK/index 내용
- #1169의 결재 역조회 endpoint/repository 자체
- S4 화면 및 40% 규칙

단, DG7-SOL-1은 고유분인 “결재가 올라가 있으면 취소 불가” 불변식을 판단하기 위해 **취소 호출부와 기존 결재 참조 추가 경계 사이의 선후 관계만** 추적했다. 중복 구현의 SQL·응답 설계·화면은 검토하지 않았다.

## 3. 차단 결함 지시서

### DG7-SOL-1 — 취소 직후에도 같은 번호로 활성 결재 참조를 새로 만들 수 있다

#### 깨지는 불변식

다음 두 조건이 동시에 보장되어야 한다.

1. `PENDING`, `IN_PROGRESS`, `APPROVED` 결재가 정산 번호를 참조하면 그 정산의 확정 취소는 실패한다.
2. 정산이 `DRAFT`이면 같은 번호를 참조하는 새 활성 결재를 만들거나 활성 상태로 전이할 수 없다.

현재 구현은 1번을 한 시점의 읽기로만 검사하고 2번을 전혀 보장하지 않는다. 번호를 보존하므로 이 빈틈이 생기면 `ApprovalAttachment.ref_doc_no`는 존재하지만 그 대상은 이미 DRAFT인 상태가 된다. 정책 ①·②의 결합이 무너진다.

#### 좌표 전수

| 경계 | 좌표 | 현재 동작 |
|---|---|---|
| 취소 전 상태 확인 | `SalesCommissionSettlementService.cancelConfirmation()` 85~95행 | CONFIRMED 확인 후 groupware의 boolean을 한 번 읽는다. |
| snapshot 이력·취소 | 같은 파일 96~101행 | boolean이 false면 history 저장 후 accounting DB에서 DRAFT로 바꾼다. |
| 번호 보존 | `SalesCommissionSettlement.cancelConfirmation()` 174~182행 | snapshot을 비우고 `recalculationRequired=true`, status=DRAFT로 바꾸지만 `documentNo`는 유지한다. |
| 결재 참조 추가 | `ApprovalAttachmentService.addReference()` 51~68행 | 결재가 수정 가능한지만 검사하고 참조를 저장한다. |
| 정산 참조 생성 | 같은 파일 71~90행, `ApprovalAttachment.documentRef()` 139~163행 | `refDocNo` 문자열의 존재만 검사한다. 대상 정산이 현재 CONFIRMED인지 확인하지 않는다. |
| 결재 상태 gate | `ApprovalLine.guardCollabModifiable()` 186~191행 | 종료 상태만 차단한다. PENDING/IN_PROGRESS에는 첨부 추가가 허용된다. |
| 종료 상태 집합 | `ApprovalLine` 43~44행 | APPROVED/REJECTED/WITHDRAWN만 수정 잠금이다. |
| 사용자 API | `GroupwareApprovalAttachmentController.addReference()` 56~65행 | UPDATE 권한과 request validation 뒤 service를 그대로 호출한다. |

핵심 원인은 서로 다른 DB의 두 동작 사이에 공통 lock/CAS/참조 claim이 없다는 것이다. 취소 쪽의 “활성 결재 없음” 조회 결과는 그 직후 결재 첨부가 추가되지 않는다는 보장이 아니다.

#### 재현 데이터와 순서

```text
정산 S
  id              = 임의 UUID
  documentNo      = 2026/08/11-3
  settlementDate  = 2026-08-11
  status          = CONFIRMED

결재 A
  status          = PENDING
  요청자는 CONFIRMED 시점에 picker에서 2026/08/11-3을 선택해 로컬 draft에 보관
```

정상 사용자 두 명만으로 다음 순서가 가능하다.

1. 사용자 A가 정산 S를 결재 참조로 선택하지만 아직 첨부 POST를 보내지 않는다.
2. 사용자 B가 S의 확정 취소를 실행한다.
3. 취소 시점에는 저장된 활성 첨부가 없으므로 역조회는 false다.
4. S는 history를 남기고 `DRAFT`, `documentNo=2026/08/11-3`이 된다.
5. 사용자 A가 이미 선택한 값으로 결재 A에 참조 첨부 POST를 보낸다.
6. `addReference()`는 source 정산 상태를 확인하지 않으므로 201로 저장한다.

최종 상태는 `S=DRAFT`이면서 `A=PENDING`이고 A가 S의 유지된 번호를 참조한다. “결재가 올라가 있으면 취소 불가” 정책을 결과 상태 기준으로 위반한다.

동시 실행이 없어도, 취소 후 사용자가 보관한 번호로 API를 직접 재전송하면 같은 결과가 난다. 검색 목록에서 DRAFT를 숨기는 것만으로는 닫히지 않는다.

#### RED-A — 취소 후 stale 선택 제출

통합 테스트 표적은 아래와 같아야 한다.

1. 계산·확정된 정산 `2026/08/11-3`을 만든다.
2. PENDING 결재와 아직 저장하지 않은 정산 참조 request를 만든다.
3. 정산 취소를 성공시켜 DRAFT임을 확인한다.
4. 같은 request로 `POST /admin/groupware/approvals/{approvalId}/attachments`를 호출한다.
5. 기대: `409 CONFLICT`, attachment 0행, 정산은 DRAFT, 취소 history 1행.
6. 현행 예상: `201 Created`, attachment 1행 — RED.

#### RED-B — 두 쓰기 경합의 원자적 승자

barrier/latch를 둔 통합 테스트로 아래 두 작업을 겹친다.

```text
T1: cancelConfirmation(S)
T2: addReference(PENDING approval, SALES_COMMISSION_SETTLEMENT, "2026/08/11-3")
```

완료 뒤 허용되는 결과는 정확히 둘 중 하나뿐이어야 한다.

- 참조 추가가 이김: 활성 attachment 존재, 정산은 CONFIRMED, 취소 history 0행
- 취소가 이김: 정산은 DRAFT, history 1행, 활성 attachment 0행

`DRAFT + 활성 attachment`와 `CONFIRMED + 취소 history` 조합은 모두 실패시켜야 한다. groupware 조회를 한 번 더 하는 방식은 조회 직후 다시 경합할 수 있으므로 RED-B의 원자성 표적을 만족하지 않는다.

#### 수정 방향

정산 취소와 정산 참조 claim이 **하나의 직렬화 지점**을 공유해야 한다. 예를 들면 accounting source 쪽 row lock/CAS 아래에서 활성 참조 claim을 등록·해제하고, groupware 첨부 추가가 저장 전에 그 claim을 획득하는 계약이다. REJECTED/WITHDRAWN/참조 삭제 시 claim 해제도 같은 계약으로 닫아야 한다.

단순 UI 재검색, 취소 직전/첨부 직전의 추가 GET, 또는 실패 후 best-effort 보상만으로는 두 DB 사이 경합이 남으므로 충분하지 않다.

**제 전제가 틀렸다면 고치지 말고 중단·보고하십시오.** 구체적으로 “취소된 DRAFT에도 PENDING/IN_PROGRESS 결재 참조가 붙을 수 있다”가 의도된 정책이거나, #1168 이후 별도 구성요소가 위 두 쓰기를 이미 원자적으로 직렬화한다면 그 근거 좌표와 테스트를 먼저 보고해야 한다. 확인 없이 endpoint를 하나 더 호출하는 식으로 고치지 않는다.

#### fix 후 새로 열어야 할 조합

1. attachment claim 선점 → 취소 시도
2. 취소 row lock 선점 → attachment 추가 시도
3. PENDING 첨부 생성 직후 IN_PROGRESS 전이와 취소 경합
4. APPROVED 전이와 취소 경합
5. REJECTED 전이 후 claim 해제 → 취소 허용
6. WITHDRAWN 전이 후 claim 해제 → 취소 허용
7. 활성 결재 2건 중 1건만 REJECTED/WITHDRAWN → 나머지 때문에 취소 차단
8. 참조 soft-delete와 취소 경합
9. groupware/accounting timeout·재시도·중복 요청에서 claim 멱등성
10. 취소 → 기준일 변경 → 재계산 → 재확정 뒤 동일 번호의 새 결재 참조
11. 재확정 전 유지 번호를 가진 DRAFT에 stale request 제출
12. 실패한 취소 transaction이 history 또는 claim만 남기지 않는지

## 4. 상태별 전수 판정

현재 boolean 계약의 상태 집합은 `PENDING`, `IN_PROGRESS`, `APPROVED` 정확히 세 개다. unique 취소 호출부의 현재 순차 동작은 아래와 같다.

| 결재 상태 | 현재 조회 결과 | 순차 취소 | 판정 |
|---|---:|---|---|
| 없음 | false | 허용 | 순차 경로 정상 |
| PENDING | true | CONFLICT | 정상 |
| IN_PROGRESS | true | CONFLICT | 정상 |
| APPROVED | true | CONFLICT | 정상 |
| REJECTED | false | 허용 | 정상 |
| WITHDRAWN | false | 허용 | 정상 |

따라서 상태 분류 자체의 반대편이 뒤집힌 결함은 찾지 못했다. DG7-SOL-1은 이 표의 **조회 시점 이후** 새 활성 결재가 생기는 경우다.

fail-close도 유지된다. groupware client/token/응답이 실패하면 `INTERNAL_ERROR`가 전파되고 취소는 진행되지 않는다.

## 5. S2 snapshot 불변 검토

| 항목 | 좌표 | 결과 |
|---|---|---|
| CONFIRMED 재계산 거부 | `SalesCommissionSettlementService.calculate()` 120~135행, domain `recordCalculation()` 203~236행 | DRAFT guard가 유지되어 거부된다. |
| 명시적 취소 전 이력 capture | service 100행, history `capture()` 91~122행 | 문서번호·확정 기준일·요율 계약·입력/결과 금액을 mutation 전에 복사한다. |
| 현재 snapshot 비우기 | domain 174~181행, 239~259행 | 취소에서만 계산 필드를 비운다. |
| 재확정 전 새 계산 강제 | domain 156~158행, service 74~76행 | `recalculationRequired=true`이면 confirm을 거부한다. |
| 새 계산 성공 후 해제 | domain 204~236행 | 새 rate contract와 계산값을 기록한 뒤 flag를 false로 바꾼다. |
| 과거 확정본 조회 | service `listSnapshotHistory()` 109~116행, history repository 12~14행 | settlement별 생성 시각순 이력 조회 경로가 있다. |

취소가 CONFIRMED snapshot을 조용히 덮어쓰는 경로는 찾지 못했다. 취소 이력 저장과 현재 정산 mutation은 같은 accounting transaction이므로 뒤쪽 저장 실패 시 함께 rollback된다.

## 6. 번호 유지·기준일 분리 검토

- 최초 DRAFT는 계속 무번호다.
- 취소 DRAFT만 기존 번호를 보존한다.
- service `confirm()` 78~81행은 번호가 null일 때만 `numberService.next(settlementDate)`를 호출한다.
- 취소 후에는 기존 번호를 넘기며 domain 163~167행이 다른 번호 교체를 거부한다.
- 기준일 수정은 DRAFT에서만 허용되고 번호 문자열을 바꾸지 않는다.
- 문서번호 unique partial index는 V97에서 활성 `document_no` 전체에 걸려 있다. 기존 번호를 같은 정산 행이 유지하므로 새 충돌을 만들지 않는다.
- 날짜 변경 후 재확정은 새 날짜의 sequence를 소비하지 않는다. 그 날짜에 다른 정산서가 이미 채번됐어도 기존 전역 유일 번호를 재사용하므로 sequence 충돌은 없다.
- 번호 조회는 `findByDocumentNoAndIsDeletedFalse()`이며 status/date 조건을 추가하지 않아 CONFIRMED 조회를 막지 않는다.
- 현재 브랜치에는 settlement 전용 목록·집계 소비자가 없다. #1168 rebase 뒤 검색 경로는 번호 문자열을 날짜로 다시 해석하지 말고 `settlementDate`를 정렬·표시 기준으로 계속 사용해야 한다.

## 7. 정산 상태 쓰기·읽기 좌표 전수표

| 분류 | 생산 코드 좌표 | 상태 영향 |
|---|---|---|
| 생성 | service `createDraft()` 64~67행 → domain `createDraft()` | 기존 DRAFT·무번호 유지 |
| 확정/재확정 | service `confirm()` 69~81행, domain `confirm()` 151~170행 | 최초만 채번, 재확정은 번호 유지 |
| 확정 취소 | service 84~101행, domain 173~182행 | CONFIRMED만 DRAFT로 전이 |
| 기준일 수정 | service 104~106행, domain 185~196행 | DRAFT만 허용 |
| 계산·계약 조회 | service 119~135행, domain 203~236행 | DRAFT만 계산; 새 versioned 계약 조회 |
| snapshot 이력 | service 109~116행, history entity/repository | 과거 확정본 별도 보존·조회 |
| 문서번호 채번 | `SalesCommissionSettlementNumberService.next()` 22~35행 | documentNo가 null인 최초 확정만 소비 |
| 문서번호 조회 | service 144~153행, settlement repository 13~15행 | status와 무관하게 유지 번호 조회 가능 |
| 목록 | 현재 전용 생산 소비자 없음 | 새 차단 분기 없음 |
| 집계 | 현재 전용 생산 소비자 없음 | 새 차단 분기 없음 |
| 권한 | 현재 settlement controller/page 없음 | 이번 고유분이 권한 분기를 바꾸지 않음 |
| 결재 참조 추가 | groupware attachment controller/service | DG7-SOL-1의 누락 경계 |

## 8. accounting V99

- `origin/main` `98b8356d2`의 accounting migration 최대값을 `git ls-tree`로 전수 산출한 결과 V98이다.
- 이 브랜치의 `V99__add_sales_commission_settlement_snapshot_history.sql`은 정확히 `max + 1`이다.
- V99는 history PK, settlement/rate contract FK, 활성 history 조회 index, BaseEntity 7 audit column, `recalculation_required NOT NULL DEFAULT FALSE`를 포함한다.
- entity의 nullable/precision/length와 V99 column 정의 사이 불일치는 찾지 못했다.
- 공유 DB에는 접근하거나 쓰지 않았다. 마이그레이션을 공유 DB에 적용하지 않았다.

## 9. 강제 테스트 실측

실행 명령:

```powershell
.\gradlew.bat :services:accounting-service:test --rerun-tasks --no-daemon --console=plain
```

결과:

```text
BUILD SUCCESSFUL in 8m 22s
21 actionable tasks: 21 executed
```

이번 실행이 만든 `services/accounting-service/build/test-results/test/TEST-*.xml` 224개를 UTF-8로 전수 합산했다.

```text
tests     1,879
failures      0
errors        0
skipped      10
```

Gradle HTML report도 `tests=1879`, `failures=0`, `ignored=10`, `successful=100%`로 일치한다. XML 수정 시각은 모두 이번 실행 종료 시각인 18:49:29~30 범위다.

표적 suite도 이번 전체 실행 안에서 다음과 같이 통과했다.

```text
SalesCommissionSettlementTest                    7 / 0 failed
SalesCommissionSettlementCalculationSnapshotTest 2 / 0 failed
SalesCommissionSettlementServiceTest             14 / 0 failed
GroupwareSettlementApprovalClientTest             1 / 0 failed
```

구현 보고의 “1,875”는 이 강제 실측과 맞지 않으므로 1,879로 정정해야 한다.

## 10. 최종 결론

순차 상태 정책, CONFIRMED snapshot 불변, 취소 history, 재계산 강제, 기존 번호 재확정, 기준일/번호 분리, V99 순번과 스키마는 고유분 범위에서 추가 결함을 찾지 못했다.

그러나 DG7-SOL-1 때문에 정책 세 결정의 결합 불변식은 아직 닫히지 않았다. **#1168 머지 후 rebase·중복 제거 → RED-A/RED-B → 단일 직렬화 지점 구현 → 새 조합 12개 검증 → accounting 전체 재실행** 순서가 필요하다.
