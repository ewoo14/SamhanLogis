# D-G7 TOCTOU fix — SOL 5.6 재검토

> 검토일: 2026-08-11  
> 대상: PR #1169, 요청 기준 HEAD `f18bd82d8`  
> 구현 보고서: `docs/dev-reports/2026-08-11-dg7-toctou-fix.md`  
> 제약: git 조작 없음, 공유 DB 조회만, 구현 수정 없음

## 1. 판정 — 차단 결함 3건

**재검토 불합격이다. 구현자 수정 후 다시 SOL 검토가 필요하다.**

정상 경로 차단을 첫 각도로 확인한 결과, 삭제·만료 claim의 재사용이 실제 PostgreSQL 왕복에서 깨진다. claim을 도입한 목적이었던 교차 서비스 TOCTOU도 동일 pair의 token 공유와 결재 단위 광역 release 때문에 다시 열릴 수 있다. 또한 새 동기 HTTP 실패가 결재 생성 화면에서 부분 성공 상태를 남긴다.

1. **DG7-TF-1 — 해제·만료 뒤 첫 정상 재첨부가 비영속 새 token 때문에 실패한다.**
   - `renew()`가 새 token을 응답하지만 JPA `updatable=false` 때문에 DB token은 갱신되지 않는다.
   - 격리 PostgreSQL/Flyway V100 왕복 RED가 `결재 참조 claim을 찾을 수 없습니다`로 1/1 실패했다.
2. **DG7-TF-2 — 동일 pair가 같은 token을 공유하고 `releaseByApproval()`이 다른 정산의 in-flight claim까지 해제해 원래 TOCTOU를 다시 연다.**
   - 한 요청의 실패 보상이 다른 요청이 사용하는 claim을 `RELEASED`로 만들 수 있다.
   - groupware row가 commit 대기 중일 때 취소가 `groupware=false + accounting claim 없음`을 통과하면 `DRAFT + 활성 참조`가 다시 만들어진다.
3. **DG7-TF-3 — accounting 장애·timeout 때 결재 생성은 이미 성공하고 정산 첨부만 실패해 PENDING 결재가 참조 없이 남는다.**
   - 사용자는 오류만 보고 생성 화면에 남는다. 재시도하면 별도 PENDING 결재를 추가 생성할 수 있다.

기존 전체 suite는 새로 실행해 accounting **1,886 / 실패 0**, groupware **252 / 실패 0**이었다. 즉 분모 보존은 확인됐지만 위 상태 조합을 검증하지 않아 전부 green인 채 제품 결함을 놓친다.

구현 보고서 header의 기준 HEAD는 `fba6d246d`이고 이번 검토 요청 HEAD는 `f18bd82d8`이다. 본 검토는 git 명령 금지에 따라 요청자가 지정한 HEAD와 현재 워크트리 파일을 기준으로 했다.

## 2. 첫 각도 — 정상 경로가 막히는가

### 2.1 accounting 장애가 막는 범위

`ApprovalAttachmentService.addReference()`의 분기는 다음과 같다.

| 첨부 | 좌표 | accounting claim 호출 | 판정 |
|---|---|---:|---|
| 기존 `SLIP_REF` | `ApprovalAttachmentService.java:81-85,92-94` | 없음 | 기존 로컬 save 경로 유지 |
| 기존 `PARTNER_LEDGER_REF` | 같은 파일 `:86-88,92-94` | 없음 | 기존 로컬 save 경로 유지 |
| 기존 `FILE` | 같은 파일 `:135-152` | 없음 | 별도 upload 경로 유지 |
| 비정산 통합 문서 참조 | 같은 파일 `:113-133,92-94` | 없음 | 기존 로컬 save 경로 유지 |
| `SALES_COMMISSION_SETTLEMENT` | 같은 파일 `:92-110` | reserve + activate | accounting 장애 시 fail-closed |

따라서 정산과 무관한 첨부가 accounting 장애로 막히지는 않는다. 정산 참조만 안전을 위해 fail-closed된다.

다만 `@Transactional(timeout=120)`은 정산 분기 내부가 아니라 `addReference()` 메서드 전체에 붙어 있다(`ApprovalAttachmentService.java:75-77`). 이 때문에 `SLIP_REF`, `PARTNER_LEDGER_REF`, 비정산 통합 참조도 새 120초 제한을 받는다. 통상 단일 로컬 save가 120초를 넘지는 않지만 “정산 타입만의 timeout”은 아니다. `FILE`은 별도 `@Transactional`이라 이 제한을 받지 않는다.

### 2.2 느림·사망·read timeout 때 사용자에게 보이는 것

- connect/read 제한은 `AccountingSettlementApprovalClaimClient.java:23-24,51-55`의 2초/5초다.
- accounting이 409를 응답하면 groupware가 `CONFLICT`로 바꾸지만 원격 사유는 버리고 `accounting-service 결재 claim 호출 실패: 409 CONFLICT`만 만든다(`:124-126`).
- accounting이 404/5xx를 응답하면 `INTERNAL_ERROR`로 바뀌고 기술적인 service/status 문자열이 사용자 응답에 도달한다.
- 연결 거부·read timeout은 `ResourceAccessException` 계열이라 client에서 변환되지 않는다. `GroupwareExceptionHandler.java:121-125`의 catch-all을 거쳐 HTTP 500 + `서버 내부 오류가 발생했습니다.`가 된다.
- 데스크톱 상세 화면은 서버 message를 그대로 alert로 표시한다(`GroupwareApprovalDetailPage.tsx:77-82,285-297`). 요청 동안 추가 버튼은 pending으로 비활성화되고, 실패 후 재시도 안내나 downstream 장애 구분은 없다.

정산 첨부를 fail-open으로 바꾸면 D-G7 불변식을 깨므로 “장애 때 차단” 자체는 맞다. 결함은 TF-3의 부분 성공과, TF-1의 정상 재첨부 404/500이다.

### 2.3 공유 DB 실측 — 조회만

각 쿼리는 `BEGIN READ ONLY ... ROLLBACK`으로 실행했다.

```text
groupware_db 활성 approval_attachments
  SLIP_REF / OUTBOUND_SLIP = 5행 / 5결재
  SLIP_REF / JOURNAL       = 2행 / 2결재
  SALES_COMMISSION_SETTLEMENT = 0행 / 0결재
  PARTNER_LEDGER_REF = 0행
  FILE = 0행

accounting_db 활성 sales_commission_settlements = 0행
```

현재 공유 DB에서 새 claim 경로를 실제로 지나는 첨부는 **0건**이다. 기존 활성 참조 7건은 모두 새 accounting 호출을 지나지 않는다. 따라서 공유 DB 표본만으로 정산 첨부 정상성은 입증할 수 없고, 기존 7건의 경로 비영향만 확인된다.

## 3. 두 번째 각도 — lease 숫자와 시계

### 3.1 숫자는 코드에 있는가

| 계약 | 실제 좌표 | 값 | 판정 |
|---|---|---:|---|
| RESERVED lease | `SalesCommissionSettlementApprovalClaim.java:37,79-80,124-125` | 30초 | 실제 설정 |
| ACTIVE lease | 같은 파일 `:38,100-101` | 300초 | 실제 설정 |
| groupware transaction | `ApprovalAttachmentService.java:36-37,75-77` | 120초 | 실제 설정, 단 모든 reference에 적용 |
| claim connect timeout | `AccountingSettlementApprovalClaimClient.java:23,51-54` | 2초 | 실제 request factory 설정 |
| claim read timeout | 같은 파일 `:24,51-55` | 5초 | 실제 request factory 설정 |

기존 `AccountingSettlementApprovalClaimClientTest`는 production constructor의 `timeoutRequestFactory()`를 사용하지 않고 직접 만든 `RestClient`를 package-private constructor에 넣는다(`AccountingSettlementApprovalClaimClientTest.java:25-32`). 따라서 보고서의 focused test 통과는 2/5초 설정을 검증하지 않는다. 이번 검토는 production 코드 좌표로 설정 존재를 확인했으며, timeout 값의 실제 socket 동작 테스트는 없다.

### 3.2 시계가 다르면

lease 생성·활성화·만료 판정은 전부 accounting의 `Clock.systemUTC()`와 `LocalDateTime.now(clock)`을 사용한다(`SalesCommissionSettlementApprovalClaimService.java:36-49,59-60,71,95-100,160-162`). groupware 시계는 lease 판정에 쓰이지 않는다. 따라서 **groupware ↔ accounting 시계차는 직접 영향이 없다.**

그러나 accounting이 다중 인스턴스이면 reserve, activate, cancel이 서로 다른 JVM으로 라우팅될 수 있고 각 인스턴스의 `Clock.systemUTC()`를 쓴다. DB `CURRENT_TIMESTAMP`나 단일 DB clock을 쓰지 않으므로 accounting 노드 간 시계차·급격한 clock jump는 30/300초 안전성의 외부 전제다. 테스트는 fixed Clock 단일 인스턴스뿐이다.

## 4. 세 번째 각도 — claim이 남기는 상태

### 4.1 EXPIRED / RELEASED 누적

- retry마다 새 행을 만드는 구조는 아니다. `reserve()`는 `(settlementId, approvalId)` 기존 행을 찾아 `renew()`한다(`SalesCommissionSettlementApprovalClaimService.java:61-64,118-128`). 앱 경로에서는 정산 row lock 때문에 동일 pair 요청이 직렬화된다.
- 하지만 EXPIRED/RELEASED cleanup·soft-delete scheduler가 없고 행은 영구 보존된다.
- V100에는 pair unique가 없고 claim token unique만 있다(`V100...sql:19-23`).
- 활성 조회 index는 `(settlement_id,status,expires_at)`, owner index는 `(approval_id,status)`뿐이다(`:25-31`). 정확 pair lookup용 `(settlement_id,approval_id)` unique/index는 없다.
- 결과적으로 정상 앱 경로에서는 distinct pair 수만큼 누적되고, 한 정산에 역사적 결재 pair가 많을수록 exact pair 재예약 조회가 넓어진다. DB 밖의 우회·버그로 pair 중복이 생기면 repository의 `Optional` 단건 조회가 non-unique로 실패한다.

### 4.2 같은 pair 두 번 예약

유효 RESERVED/ACTIVE가 있으면 `reuseOrReject()`는 reject나 새 owner token 발급을 하지 않고 **같은 entity/token을 반환**한다(`SalesCommissionSettlementApprovalClaimService.java:118-124`). 두 groupware transaction이 하나의 token을 공유한다.

한 transaction이 먼저 ACTIVE로 올리면 다른 transaction의 activate는 conflict다(`SalesCommissionSettlementApprovalClaim.java:90-101`). 그런데 groupware catch는 자신의 요청이 claim을 독점한다고 가정해 그 공유 token을 release한다(`ApprovalAttachmentService.java:102-109,278-283`). 먼저 활성화한 transaction의 보호 claim까지 RELEASED가 된다. 이것이 TF-2 첫 경로다.

### 4.3 첨부 삭제

마지막 동일 문서 참조를 삭제하면 `releaseByApproval(approvalId)`를 호출한다(`ApprovalAttachmentService.java:185-200`). 이 API는 그 문서 claim만이 아니라 같은 approval이 가진 **모든 정산 claim**을 해제한다(`SalesCommissionSettlementApprovalClaimService.java:83-90`).

따라서 결재 A가 정산 S1·S2를 모두 참조할 때 S1 첨부 삭제가 S2의 ACTIVE claim도 release한다. 특히 S2 첨부 transaction이 activate 후 local commit 대기 중이면 TF-2 두 번째 경로가 열린다.

### 4.4 정산 soft-delete

현재 `SalesCommissionSettlement`에는 soft-delete service/controller가 없으므로 사용자 도달 가능한 삭제 경로는 없다. 하지만 future soft-delete 시 V100 FK에는 cascade가 없고 claim 자동 release/soft-delete도 없다. 논리 삭제된 정산의 claim은 남아 누적되며, `@SQLRestriction` 때문에 이후 lock lookup은 정산을 찾지 못해 release/activate가 NOT_FOUND가 된다. 현 scope에서는 잠재 상태로 기록하고 새 soft-delete endpoint 도입 시 반드시 조합을 열어야 한다.

## 5. 차단 결함 지시서

### 5.1 불변식

1. accounting이 정상이고 정산이 CONFIRMED이면, 이전 첨부 삭제·claim 만료 뒤 같은 결재에 다시 붙이는 정상 요청은 한 번에 성공해야 한다.
2. claim token은 한 groupware transaction만 소유해야 한다. 다른 요청의 실패·삭제·terminal 전이가 그 in-flight claim을 해제하면 안 된다.
3. groupware attachment가 아직 commit되지 않았다면 accounting에는 그 transaction을 보호하는 유효 claim이 반드시 있어야 한다.
4. `DRAFT + PENDING/IN_PROGRESS/APPROVED 활성 정산 참조`는 어떤 timeout·중복 요청·삭제 경합에서도 commit되면 안 된다.
5. 결재 생성 화면에서 필수로 선택한 정산 참조가 실패했는데 PENDING 결재만 남는 부분 성공을 허용하면 안 된다. 허용 정책이라면 사용자가 그 문서를 이어서 복구할 명시적 UX·멱등성이 있어야 한다.

### 5.2 DG7-TF-1 — renew token이 DB에 저장되지 않음

#### 좌표 전수

| 좌표 | 현재 동작 |
|---|---|
| `SalesCommissionSettlementApprovalClaim.java:53-54` | `claimToken`이 `updatable=false` |
| 같은 파일 `:113-125` | RELEASED/EXPIRED에서 `claimToken=UUID.randomUUID()`로 교체 |
| `SalesCommissionSettlementApprovalClaimService.java:118-128` | renew entity를 save하고 새 token을 응답 |
| 같은 파일 `:143-149` | activate는 응답 token으로 DB 재조회 |
| client `:101-112` | 응답 새 token을 groupware가 그대로 사용 |

#### 재현 데이터와 실제 RED

격리 Testcontainers PostgreSQL 16 + Flyway V1~V100 + 실제 JPA/service로 다음을 실행했다.

```text
S = CONFIRMED, documentNo = 2099/12/27-1
A = 임의 approval

1 reserve(S,A) -> token T1
2 release(T1)  -> DB status RELEASED, DB token T1
3 reserve(S,A) -> entity renew, 응답 token T2
                  DB status RESERVED, DB token은 updatable=false로 T1 유지
4 activate(T2) -> NOT_FOUND
```

실패 원문:

```text
SalesCommissionSettlementApprovalClaimRenewProbeIT
  releasedClaim_canBeReservedAgainAndActivatedWithReturnedToken() FAILED
  BusinessException: 결재 참조 claim을 찾을 수 없습니다: <renewed-claim-token>
  at SalesCommissionSettlementApprovalClaimService.loadClaim(...:148)
```

임시 probe source와 결과 XML은 확인 후 제거했고 production 코드는 바꾸지 않았다.

#### RED-A1

실제 PostgreSQL/Flyway/JPA IT를 정식 추가한다.

```text
reserve -> activate -> release -> persistence context clear
-> 같은 pair reserve -> 반환 token으로 activate
```

기대: 두 번째 activate 200/ACTIVE, DB token=응답 token, 첫 요청 한 번에 성공. EXPIRED 뒤 renew도 같은 표적으로 추가한다.

### 5.3 DG7-TF-2 — 공유 token/광역 release로 TOCTOU 재개방

#### 재현 A — 동일 pair 중복

```text
S = CONFIRMED, A = PENDING
T1 addReference(S,A): reserve -> token T
T2 addReference(S,A): reserve -> 같은 token T
T2: local row 준비 -> activate(T) 성공, groupware commit은 DB barrier에서 대기
T1: local row 준비 -> activate(T) conflict -> catch release(T)
TCANCEL: groupware 역조회 false, accounting live claim 없음 -> S를 DRAFT로 저장
T2: barrier 해제 -> groupware 활성 row commit

최종: S=DRAFT + A의 활성 정산 참조
```

#### 재현 B — 다른 정산 첨부 삭제

```text
A = PENDING, S1/S2 = CONFIRMED
A에는 S1 활성 첨부가 이미 있음

T2 addReference(S2,A): reserve/activate 완료, local commit barrier 대기
TDEL delete(S1 attachment): 마지막 S1 참조이므로 releaseByApproval(A)
                            -> S1과 S2 claim 모두 RELEASED
TCANCEL cancel(S2): groupware false + claim 없음 -> DRAFT
T2 commit: S2 활성 첨부 저장
```

#### RED-B1 — 동일 pair owner 격리

두 `addReference(S,A)`를 barrier로 겹치고 한 transaction의 local flush를 지연한다. 어떤 요청의 실패 보상도 다른 요청이 소유한 claim을 release하지 못해야 한다. 중복을 허용하지 않으면 한 요청은 claim 획득 단계에서 409이고, 승자 claim은 계속 ACTIVE여야 한다. 중복을 허용하면 각 transaction이 독립 token을 가져야 한다.

barrier 중 `cancelConfirmation(S)`를 실행하고 최종 조합을 검사한다.

- 허용: attachment 승자 + S CONFIRMED
- 허용: cancel 승자 + attachment 0행
- 금지: S DRAFT + 활성 attachment
- 금지: 활성 attachment가 있는데 해당 in-flight 보호 claim이 다른 요청 보상으로 RELEASED

#### RED-B2 — 문서 단위 release

A에 S1 참조를 저장한 뒤 S2 addReference를 activate 후 commit 직전에 멈춘다. 그동안 S1 첨부 삭제와 S2 취소를 실행한다. S1 삭제는 S2 claim에 영향이 없어야 하며 S2 취소는 409여야 한다. release 계약은 적어도 `(approvalId, settlement/documentNo)` 또는 claim token 소유권 단위여야 한다. 구체 구현은 RED를 만족하는 범위에서 구현자가 정한다.

### 5.4 DG7-TF-3 — 생성 성공 후 첨부 실패 부분 상태

#### 좌표 전수

- `GroupwareApprovalCreatePage.tsx:375-397`: 먼저 `createGroupwareApproval()`을 commit하고 이후 각 reference/file endpoint를 순차 호출한다.
- 같은 파일 `:399-405,674-675`: 첨부 실패 시 error만 표시하고 생성된 approvalId로 이동하거나 복구하지 않는다.
- `ApprovalLine.java:90-92`: 생성 직후 status는 PENDING이다.
- accounting dead/timeout은 위 §2.2처럼 정산 첨부만 500으로 실패한다.

#### RED-A2 — 정상 생성 실패 표면

정산 참조 하나를 필수 선택한 생성 화면에서 accounting client를 connect refused/read timeout/500으로 각각 제어한다.

기대는 다음 중 하나로 정책을 명시해야 한다.

1. 전체 실패: PENDING approval 0행, attachment 0행, 사용자는 재시도 가능.
2. 복구 가능한 부분 성공: 같은 approvalId를 화면이 유지하고 attachment 재시도는 멱등이며, 중복 PENDING approval을 만들지 않는다. 사용자는 “결재는 생성됐고 정산 연결만 실패”를 정확히 본다.

현행은 PENDING approval 1행 + attachment 0행 + generic/기술적 500 alert이며, 재제출 시 새 approval을 만들 수 있다.

### 5.5 구현자 중단 조건

**제 전제가 틀렸다면 고치지 말고 중단·보고하십시오.** 특히 아래 중 하나가 의도된 정책이면 근거 결정과 production 좌표를 먼저 PM에게 보고해야 한다.

- 동일 `(settlement, approval)`의 동시 요청이 같은 claim token을 공동 소유해도 된다.
- S1 첨부 삭제가 같은 결재의 S2 in-flight claim까지 해제해도 된다.
- 정산 참조 없이 PENDING 결재만 남는 생성 부분 성공이 의도다.
- 삭제·만료 뒤 첫 재첨부가 실패하고 사용자가 두 번 눌러야 성공해도 된다.

확인 없이 timeout만 늘리거나 release 예외만 더 삼키는 방식으로 고치지 않는다.

## 6. 이 fix가 새로 가능하게 만든 상태 전수

1. DB token=T1, 응답 token=T2, status=RESERVED인 activate 불가능 claim.
2. 활성 groupware attachment는 있으나 accounting claim은 RELEASED인 상태.
3. groupware local row가 commit 대기 중인데 live claim은 다른 요청이 해제한 상태.
4. 위 3에서 cancel이 이겨 `DRAFT`, 이후 groupware가 commit해 `DRAFT + 활성 참조`가 된 상태.
5. 동일 pair의 두 transaction이 같은 token을 공동 소유한 상태.
6. S1 첨부 삭제로 무관한 S2 claim까지 RELEASED된 상태.
7. accounting 장애로 PENDING approval은 생성됐지만 사용자가 선택한 정산 attachment는 0행인 상태.
8. 사용자가 생성 화면을 재제출해 같은 업무의 PENDING approval이 복수로 남는 상태.
9. expires_at은 지났지만 다음 reserve/cancel touch 전까지 status가 RESERVED/ACTIVE로 남는 상태.
10. cleanup 없이 영구 누적되는 RELEASED/EXPIRED 역사 행.
11. pair unique 부재로 DB에 동일 pair 복수 행이 생기면 `Optional` 조회가 non-unique로 실패하는 상태.
12. 향후 정산 soft-delete 시 논리 삭제 정산 FK를 계속 보유하고 release/activate가 NOT_FOUND가 되는 claim.

## 7. RED-B — 잃으면 안 되는 구체 표적

수정자는 위 RED 외에 다음을 그대로 보존해야 한다.

1. 기존 `SLIP_REF`, `PARTNER_LEDGER_REF`, `FILE` 추가·목록·삭제·다운로드 정상 동작. 비정산 참조는 accounting client interaction 0회.
2. PENDING/IN_PROGRESS/APPROVED 정산 참조가 있으면 취소 409.
3. 취소 성공 뒤 문서번호 유지.
4. 취소 직전 CONFIRMED snapshot history 1행 append, 현재 snapshot과 versioned 계약 이력 보존.
5. groupware V19 내용과 기존 `hasActiveSettlementApproval()` 상태 집합/역조회 endpoint는 #1168 정본 유지.
6. accounting V99 snapshot migration과 S1/S2 채번·versioned 계약 회귀 유지.
7. accounting 1,886와 groupware 252 전체 suite 유지.
8. claim connect/read 및 transaction 제한을 바꾸면 300초 lease와의 부등식뿐 아니라 기존 비정산 경로 적용 범위를 테스트로 고정.
9. accounting slow/dead/timeout에서 settlement 참조는 fail-closed하되 생성 부분 상태와 사용자 안내를 위 TF-3 정책대로 처리.

## 8. 라이브 QA

기존 `samhan-accounting-service`, `samhan-groupware-service` 컨테이너는 healthy였지만 공유 DB가 해당 PR schema 전이라 write 없이 시나리오를 실행할 수 없었다.

실패 원문:

```text
groupware_db
 version | success
---------+---------
 6       | t
(1 row)

-- WHERE version IN ('6','19') 결과에 19 없음

accounting_db
 version | success
---------+---------
(0 rows)

 claim_table
-------------

(1 row)

-- WHERE version IN ('99','100') 결과 0행
-- to_regclass('public.sales_commission_settlement_approval_claims') = NULL
```

즉 실제 `확정 → 결재 첨부 → 취소 409 → 첨부 해제 → 취소 성공`을 밟으려면 공유 DB에 V19/V99/V100 write가 필요해 요청의 read-only 제약과 충돌한다. 기존 app 서비스를 새로 띄우거나 재배포하지 않았다. 검증 중 시작된 격리 Testcontainers PostgreSQL/Ryuk 2개는 종료·제거했고 잔존 0개를 확인했다.

## 9. 테스트 실측

새 전체 실행:

```powershell
.\gradlew.bat :services:accounting-service:test --rerun-tasks --no-daemon --console=plain
.\gradlew.bat :services:groupware-service:test --rerun-tasks --no-daemon --console=plain
```

XML 전수 합산:

```text
accounting-service  files 227 / tests 1,886 / failures 0 / errors 0 / skipped 10
groupware-service   files  35 / tests   252 / failures 0 / errors 0 / skipped  0
```

추가 진단 RED:

```text
SalesCommissionSettlementApprovalClaimRenewProbeIT
tests 1 / failures 1 / errors 0 / skipped 0
원인: renew 응답 token으로 실제 PostgreSQL row를 다시 찾지 못함
```

probe 제거 후 전체 suite를 실행했으므로 위 1,886/252에는 임시 실패 테스트가 섞이지 않았다.

## 10. PM 보고

claim/CAS의 기본 직렬화 방향과 30/300초 lease 상수는 코드에 존재하고, 기존 첨부 3종은 accounting 장애 경로로 들어가지 않는다. 그러나 정상 재첨부가 실제 DB에서 실패하고, token 소유권·release 범위가 원래 TOCTOU를 다시 열며, downstream 장애가 PENDING 결재 부분 상태를 남긴다.

따라서 **TF-1 PostgreSQL RED → TF-2 두 barrier RED → TF-3 생성 부분 상태 RED를 먼저 고정하고 수정 → RED-B 보존표 + accounting 1,886/groupware 252 전체 재실행 → SOL 재검토** 순서가 필요하다.

이번 라운드가 실제로 보지 못한 표면은 공유 DB schema 미적용 때문에 실행하지 못한 두 서비스 live HTTP end-to-end, accounting 다중 인스턴스 간 clock skew, 실제 네트워크가 2/5초 timeout을 강제하는 socket 수준 관측이다.
