# D-G7 TOCTOU fix2 — SOL 5.6 재검토2

> 검토일: 2026-08-11  
> 대상: PR #1169, HEAD `1761020079e686d29d64f4502d1e37bd31fdbf06`  
> 제약: git 조작 없음, 공유 DB 조회만, 격리 DB만 write  
> 브라우저: Codex 내장 런타임 미사용. `clients/desktop`의 Playwright와 `chromium-1217`을 직접 실행

## 1. 판정 — 차단 결함 1건

TF-1, TF-2, TF-3의 직접 표적은 이번 수정으로 GREEN이 됐다. 라이브 브라우저에서 해제 및 만료 뒤 첫 재첨부가 각각 한 번에 성공했고, accounting 중단 중 정산 참조를 포함한 결재 생성은 HTTP 500으로 실패하면서 결재와 파일 업로드가 전혀 남지 않았다. RED-B1/B2도 격리 PostgreSQL 16 + Flyway V1~V100 실제 왕복으로 다시 실행해 통과했다.

그러나 **DG7-TF-4 — 정책 A 생성 경로의 transaction 시간이 ACTIVE lease 300초보다 짧다는 보장이 없다.** 상세 첨부 경로에만 있는 120초 timeout이 원자 생성 경로에는 전파되지 않고, 생성 요청의 `references` 수도 무제한이다. 따라서 여러 정산 참조나 느린 accounting 응답이 누적되면 첫 claim이 만료된 뒤에도 groupware transaction이 계속 열려 있을 수 있다. 그 사이 취소가 `groupware=false + 만료 claim`으로 통과하고, 뒤늦은 groupware commit이 `DRAFT + 활성 정산 참조`를 다시 만들 수 있다.

따라서 이번 라운드는 **재검토 불합격, 구현자 수정 후 SOL 재검토 필요**로 판정한다.

## 2. 라이브 QA — 직접 Playwright

### 2.1 실행 환경

- 브라우저 executable: `C:/Users/user/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe`
- 실행 위치: `clients/desktop`
- Playwright: `clients/desktop/node_modules`, headless Chromium
- 실제 HEAD boot jar: accounting `:18087`, groupware `:18092`
- 격리 PostgreSQL 16:
  - accounting `dg7-sol2-accounting-db`, Flyway V1~V100
  - groupware `dg7-sol2-groupware-db`, Flyway V1~V19
- 정산은 production controller가 아직 없는 도메인 단계이므로, 라이브 jar를 만들 때만 임시 internal QA adapter를 붙여 실제 `SalesCommissionSettlementService.createDraft/confirm/cancelConfirmation`을 호출했다. jar 생성 직후 source를 제거했고 production 구현은 수정하지 않았다.
- 화면 우측 QA 카드에는 Playwright가 실제 HTTP 응답과 재조회 결과를 넣었다. 카드 자체는 제품 UI가 아니라 증거 overlay이고, 배경의 결재 작성/상세·첨부·오류 문구는 실제 데스크톱 화면이다.

### 2.2 필수 시나리오 결과

| 시나리오 | 실제 결과 | 판정 |
|---|---|---|
| 확정 정산 → 결재 생성과 정산 참조 → 취소 | accounting HTTP 409, 정산 `CONFIRMED`, 활성 참조 유지 | PASS |
| 첨부 해제 → 취소 | 삭제 후 accounting HTTP 200, `DRAFT`, 문서번호 `2026/08/11-1` 유지 | PASS |
| 해제 뒤 같은 pair 첫 재첨부 | 데스크톱 `추가` 1회, attachment HTTP 201, 활성 1건 | PASS |
| 만료 뒤 같은 pair 첫 재첨부 | ACTIVE claim의 `expires_at`을 격리 DB에서 과거로 변경한 뒤 `추가` 1회, HTTP 201, 활성 1건 | PASS |
| accounting 중단 중 결재 생성 + 정산 참조 | 생성 HTTP 500, 사용자 오류 문구 표시, 같은 title 결재 0건 | PASS |
| 위 요청에 파일도 함께 선택 | 결재 0건, `/attachments/file` POST 0회. 파일은 브라우저 선택 상태에만 남음 | PASS |

스크린샷:

1. [취소 409](../qa/2026-08-11-dg7-sol2/01-cancel-blocked-409.png)
2. [해제 후 취소 성공](../qa/2026-08-11-dg7-sol2/02-detach-cancel-success.png)
3. [해제 뒤 첫 재첨부](../qa/2026-08-11-dg7-sol2/03-release-reattach-first-try.png)
4. [만료 뒤 첫 재첨부](../qa/2026-08-11-dg7-sol2/04-expired-reattach-first-try.png)
5. [accounting 중단 원자 rollback](../qa/2026-08-11-dg7-sol2/05-accounting-down-no-approval.png)
6. [accounting 중단 중 비정산 첨부 정상](../qa/2026-08-11-dg7-sol2/06-normal-paths-accounting-down.png)
7. [파일 + 정산 실패 시 파일 미전송](../qa/2026-08-11-dg7-sol2/07-file-not-uploaded-before-atomic-create.png)

격리 환경에는 auth-service의 앱 버전 endpoint를 띄우지 않아 화면 상단에 “업데이트 실패” 보조 배너가 보인다. 결재·첨부 요청과 무관한 fail-soft 표면이며 본 QA 판정에는 사용하지 않았다.

### 2.3 브라우저 하네스 초기 실패 원문

첫 실행은 제품 실패가 아니라 무기한 SSE를 `networkidle`로 기다린 하네스 오류였다. 이후 `/collab/stream`만 빈 SSE로 종료시키고 동일 제품 요청을 재실행했다.

```text
route.fetch: Request context disposed.
GET http://127.0.0.1:18092/admin/groupware/approvals/.../collab/stream
accept: text/event-stream
```

또한 처음 파일 probe에 `text/plain`을 넣었을 때 production 허용 형식 가드가 예상대로 HTTP 400을 반환했다. 허용 형식인 PNG로 다시 실행해 HTTP 201을 확인했다.

```text
400 INVALID_INPUT
허용되지 않은 파일 형식입니다. 허용: [application/pdf, image/jpeg, image/jpg, image/png]
```

### 2.4 정리

이번 QA가 시작한 accounting/groupware/Vite 프로세스와 `dg7-sol2-*` PostgreSQL 컨테이너는 모두 종료·삭제했다. `18087`, `18092`, `5317`, `55441`, `55442` listener와 `dg7-sol2-*` 컨테이너가 남지 않은 것을 확인했다.

## 3. 정책 A가 막고 보존한 경로

### 3.1 정산 참조 없는 결재와 기존 첨부

accounting을 실제로 중단한 상태에서 다음을 production endpoint로 만들고 데스크톱 상세에서 활성 4건을 확인했다.

```text
일반 결재 + OUTBOUND_SLIP + JOURNAL 생성  HTTP 201
PARTNER_LEDGER_REF 추가                    HTTP 201
FILE(PNG) 업로드                          HTTP 201
```

비정산 참조는 `ApprovalAttachmentService.java:108-110`에서 로컬 save로 반환하므로 accounting client를 호출하지 않는다. 일반 결재·기존 `SLIP_REF`·`PARTNER_LEDGER_REF`·`FILE` 경로가 정책 A 때문에 막히지 않았다.

### 3.2 여러 정산 참조 — 하나 실패 시 전체 rollback

실제 서비스와 격리 DB에서 다음 요청을 실행했다.

```text
결재 title = DG7-SOL2-MULTI-ROLLBACK
references[0] = 존재하는 CONFIRMED 정산 2026/08/11-5
references[1] = 없는 정산 2099/12/31-999
```

결과:

```text
결재 생성 HTTP 500
같은 title 결재 0건
첫 정산 claim RELEASED 1건
첫 정산 cancel HTTP 200
```

하나가 실패하면 결재와 나머지 참조도 rollback하는 것이 정책 A와 일치한다. `registerRollbackCompensation()`은 rollback 완료 후 첫 claim을 release했다(`ApprovalAttachmentService.java:276-287`).

### 3.3 파일 + 정산 참조

데스크톱 순서는 다음과 같다.

1. 결재와 모든 문서 참조를 한 create 요청으로 보낸다(`GroupwareApprovalCreatePage.tsx:387-395`).
2. create가 성공한 뒤에만 파일을 순차 업로드한다(`:397-403`).

따라서 정산 reserve/activate가 실패하면 파일은 서버로 전송되지 않는다. 라이브 QA에서 파일을 선택한 채 accounting을 중단했을 때 create HTTP 500, 결재 0건, multipart POST 0회였다.

반대로 결재+정산 참조가 성공한 다음 파일 업로드가 실패하면 결재와 정산 참조는 유지된다. UI는 이를 부분 성공으로 명시하고 생성된 상세에서 재시도하게 한다(`:409-410`). 여러 파일 중 뒤 파일이 실패하면 앞서 성공한 파일도 유지된다. 이것은 정책 A의 원자 범위가 “결재 + 문서 참조”이고 binary upload는 범위 밖이라는 현재 계약이다.

### 3.4 공유 DB 7건 — 조회만

`BEGIN READ ONLY ... ROLLBACK`으로 실측했다.

```text
SLIP_REF / OUTBOUND_SLIP  5행 / 5결재
SLIP_REF / JOURNAL        2행 / 2결재
그 외 활성 참조           0행
```

공유 groupware DB는 Flyway V18, accounting DB는 V98까지 적용된 상태였다. 따라서 기존 활성 7건은 V19/V99/V100 및 새 정산 원자 경로를 지나지 않았고, 현재 코드에서도 비정산 로컬 save 분기에 남는다. 공유 DB write는 하지 않았다.

## 4. TF-1 / TF-2 / TF-3 직접 재검증

### 4.1 TF-1 — renew token 영속화

- 해제 뒤 같은 pair 첫 재첨부: HTTP 201.
- ACTIVE lease 만료 뒤 같은 pair 첫 재첨부: HTTP 201.
- 새 token으로 ACTIVE 전환되고 활성 첨부 1건을 확인했다.
- `claimToken`은 더 이상 `updatable=false`가 아니며 `renew()`가 새 UUID를 저장한다(`SalesCommissionSettlementApprovalClaim.java:54,114-128`).

### 4.2 TF-2 — 단일 owner와 정확 release

동일 pair의 두 번째 유효 요청은 대기하거나 token을 공유하지 않고 즉시 409다.

- 판정 좌표: `SalesCommissionSettlementApprovalClaimService.java:123-134`
- 사용자 사유: `이미 다른 첨부 요청이 진행 중인 정산 참조입니다` (`:128-129`)
- release 단위: `(approvalId, documentNo)` (`:83-95`)

소유자 사망 뒤 회수 수단은 **lease 만료 후 다음 reserve/cancel touch의 자가 치유가 유일**하다. 별도 scheduler/cleanup job은 없다.

- RESERVED 30초: `SalesCommissionSettlementApprovalClaim.java:37,80,128`
- ACTIVE 300초: 같은 파일 `:38,101`
- cancel touch 만료 처리: `SalesCommissionSettlementApprovalClaimService.java:98-111`
- reserve touch 만료·renew: 같은 파일 `:123-134`

삭제 commit 뒤 exact release 네트워크가 실패하면 삭제는 유지되고 claim은 TTL까지 남는다(`ApprovalAttachmentService.java:290-318`). 이는 위험한 조기 취소보다 일시적 취소 차단을 택한 fail-closed 정책이다.

### 4.3 RED-B1/B2 — 실제 PostgreSQL/Flyway

보고서를 신뢰하지 않고 이번 세션에서 임시 probe IT를 만들어 실행 후 제거했다.

환경:

```text
PostgreSQL 16 Testcontainers
accounting Flyway 74 migrations, version v100
실제 repository/JPA/service 왕복
2 tests, failures 0
```

RED-B1:

- 동일 pair 동시 reserve를 barrier로 겹침.
- 결과는 owner token 1개 + `BusinessException(CONFLICT)` 1개.
- 승자 activate 뒤 groupware 역조회가 false여도 cancel은 ACTIVE claim 때문에 409.
- 정산은 CONFIRMED, claim은 ACTIVE 유지.

RED-B2:

- 같은 approval의 S1/S2 claim을 ACTIVE로 준비.
- `(approvalId, S1.documentNo)` exact release 실행.
- S2 cancel은 409, S2는 CONFIRMED, S2 claim은 ACTIVE 유지.

TF-1 정식 IT의 release/expire renew도 별도 fresh 실행에서 모두 통과했다.

### 4.4 TF-3 — 원자 생성과 fail-closed

- accounting 중단 + 정산 참조 create: HTTP 500, 결재 0건, 첨부 0건.
- 파일 동시 선택: 파일 POST 0회.
- 사용자 문구: `정산 참조 확인에 실패했습니다. 회계 서비스가 정상화된 뒤 다시 시도해 주세요`.
- accounting 장애가 비정산 결재와 기존 첨부는 막지 않았다.
- 취소 역조회 장애는 여전히 `GroupwareSettlementApprovalClient` 예외를 전파해 fail-closed이며, `SalesCommissionSettlementService.java:99-122`에 fail-open 분기가 없다.

## 5. 차단 결함 DG7-TF-4 — 생성 transaction과 300초 lease의 상한 불일치

### 5.1 불변식

1. 첫 정산 claim을 ACTIVE로 만든 시점부터 groupware 결재+첨부 commit까지 해당 claim은 절대 만료되면 안 된다.
2. 그 시간을 보장할 수 없으면 groupware transaction은 commit하면 안 된다.
3. `DRAFT + PENDING/IN_PROGRESS/APPROVED 활성 정산 참조` 조합은 참조 수, 지연, timeout과 무관하게 불가능해야 한다.
4. 원자 생성 요청의 허용 크기와 최악 지연 상한은 ACTIVE TTL보다 충분히 작아야 하며 코드와 테스트로 고정되어야 한다.

### 5.2 좌표 전수

| 좌표 | 현재 동작 |
|---|---|
| `ApprovalLineCreateRequest.java:29` | `references`에 `@Size(max=...)` 없음 |
| `ApprovalLineService.java:97,113` | outer create transaction은 timeout 없는 `@Transactional` |
| 같은 파일 `:170` | 위 transaction 안에서 `addReferencesAtomically()` 호출 |
| `ApprovalAttachmentService.java:37,76` | 120초 timeout은 상세 단건 `addReference()`에만 있음 |
| 같은 파일 `:82-90` | 생성 batch 메서드는 annotation 없이 caller transaction 참여, 요청 수만큼 순차 반복 |
| 같은 파일 `:116-121` | 각 정산마다 reserve → local save → activate 순차 실행 |
| `AccountingSettlementApprovalClaimClient.java:23-24,53-54` | 원격 호출당 connect 2초/read 5초 |
| `SalesCommissionSettlementApprovalClaim.java:38,101` | ACTIVE TTL 300초 |

임시 metadata probe를 이번 세션에서 직접 실행했다.

```text
ApprovalLineService.createWithActor timeout = TIMEOUT_DEFAULT (-1)
ApprovalAttachmentService.addReferencesAtomically transaction attribute = null
ApprovalAttachmentService.addReference timeout = 120
ApprovalLineCreateRequest.references @Size = null
1 test, failures 0
```

probe source는 확인 후 제거했다.

### 5.3 구체 재현 데이터

실제 300초를 기다리지 않고 accounting의 controllable Clock과 HTTP barrier를 사용해 RED를 만든다.

```text
S01..S32 = CONFIRMED, 서로 다른 documentNo
A = 아직 commit되지 않은 새 PENDING approval
references = [S01..S32]

각 reserve/activate 응답은 read timeout 5초 직전(예: 4.9초)에 성공
S01 activate 후 나머지 31쌍 호출 누적 > 300초
groupware transaction은 timeout=-1이라 계속 진행

S01 ACTIVE expires_at 경과 뒤, groupware commit barrier는 유지
TCANCEL(S01): groupware 역조회 false(아직 uncommitted)
              accounting은 S01 claim을 EXPIRED 처리하고 cancel 허용
groupware barrier 해제 후 commit

금지 최종 상태: S01=DRAFT + A의 활성 S01 참조
```

32라는 수 자체가 계약은 아니다. 핵심은 요청 수 상한이 없고 외부 지연을 outer transaction 상한이 막지 않는다는 점이다. DB/네트워크 stall 하나만으로도 같은 창을 만들 수 있다.

### 5.4 RED-A / RED-B 표적

#### RED-A3 — 시간 예산 계약

- outer create transaction에 유한 상한이 실제 transaction metadata로 적용돼야 한다.
- `references`에는 제품 정책상 상한이 있어야 한다.
- `최대 참조 수 × 최악 원격 호출 시간 + DB/commit 여유 < ACTIVE TTL`을 코드 상수/검증으로 고정한다.
- 상세 add 경로의 120초와 생성 경로의 상한이 서로 다른 실수로 다시 분리되지 않게 한다.

단순히 `@Transactional(timeout=120)` annotation 존재만 검사하면 부족하다. 실제 JPA transaction이 원격 대기 뒤 commit하지 못하는지 검증해야 한다.

#### RED-B3 — lease 만료와 commit barrier

- 격리 PostgreSQL + Flyway groupware V1~V19, accounting V1~V100을 모두 띄운다.
- 첫 claim ACTIVE 뒤 groupware commit을 barrier로 정지한다.
- accounting Clock을 ACTIVE TTL 이후로 이동한다.
- 같은 정산 cancel을 실제 service로 실행한다.
- barrier를 해제한다.

허용 결과:

- groupware transaction rollback + cancel 성공 + attachment 0건, 또는
- claim이 안전하게 갱신되어 cancel 409 + groupware commit.

금지 결과:

- 정산 DRAFT + 활성 attachment.
- groupware commit 시점에 보호하는 유효 claim 없음.
- timeout 뒤 결재만 남거나 일부 참조만 남음.

기존 RED-B1/B2도 함께 유지한다.

### 5.5 구현자 중단 조건

**제 전제가 틀렸다면 고치지 말고 중단·보고하십시오.** 특히 아래 중 하나라면 임의로 TTL만 늘리거나 timeout만 붙이지 말고 PM에게 production 좌표와 결정 근거를 먼저 보고해야 한다.

- outer create transaction에 annotation 밖의 전역 300초 미만 상한이 이미 실제로 적용된다.
- API gateway/body validation이 `references` 수를 본 service 도달 전에 제한한다.
- ACTIVE claim 만료 뒤 groupware commit을 거부하는 별도 fencing 검사가 존재한다.
- `DRAFT + 활성 정산 참조`를 허용하는 별도 정책 결정이 있다.

## 6. 이 fix가 새로 가능하게 만든 상태

정책 A가 여러 정산 claim을 하나의 장시간 transaction 안에서 순차 활성화하면서 다음 상태가 새로 가능해졌다.

1. 한 groupware transaction 안에 생성 시각이 서로 다른 ACTIVE claim 여러 개가 공존.
2. 앞 claim은 ACTIVE TTL을 지났지만 뒤 claim은 아직 RESERVED/ACTIVE인 상태.
3. 결재·첨부 row는 groupware에 존재하지만 외부에서는 uncommitted라 역조회가 false인 상태.
4. 앞 claim이 cancel touch에서 EXPIRED로 바뀌고 정산이 DRAFT가 된 상태.
5. 그 뒤 원래 groupware transaction이 commit해 `DRAFT + 활성 정산 참조`가 된 상태.
6. timeout이 없어서 클라이언트 연결 종료 뒤에도 서버 transaction이 계속 원격 호출을 수행하는 상태.

TF-1/2/3이 고친 이전의 비영속 token, 공유 token, 광역 release, 장애 시 반쪽 결재 상태는 이번 재검증에서 재현되지 않았다.

## 7. RED-B 보존 결과

| 표적 | 결과 |
|---|---|
| 기존 `SLIP_REF`, `PARTNER_LEDGER_REF`, `FILE` | accounting down 라이브 HTTP 201 |
| 기존 활성 참조 7건 | 공유 DB read-only, OUTBOUND 5 + JOURNAL 2, 새 경로 비통과 |
| 결재 진행 중 취소 불가 | 라이브 409 |
| 취소 후 문서번호 유지 | 라이브 `2026/08/11-1` 유지 |
| CONFIRMED snapshot 이력 | accounting 전체 suite 포함, V99 보존 |
| groupware V19 / 기존 역조회 | 변경 없음, 격리 Flyway V19 및 전체 suite 통과 |
| accounting V99/V100 | 격리 Flyway V100 및 전체 suite 통과 |
| S1/S2 채번·versioned 계약 | accounting 전체 suite 통과 |
| 장애 때 차단 | accounting down 생성 500 + 결재 0건; 취소 client도 fail-closed |

## 8. fresh 검증 수치

모든 전체 suite는 `--rerun-tasks`로 새로 실행했다. XML을 `-Raw UTF-8`로 다시 합산했다.

| 검증 | tests | failures | errors | skipped | 결과 |
|---|---:|---:|---:|---:|---|
| accounting-service 전체 | 1,891 | 0 | 0 | 10 | PASS |
| groupware-service 전체 | 254 | 0 | 0 | 0 | PASS |
| Desktop 단위 | 9 | 0 | 0 | 0 | PASS |
| Desktop 통합 | 5 | 0 | 0 | 0 | PASS |
| Desktop typecheck | - | - | - | - | PASS |

추가 집중 검증:

- accounting claim 정식 service/IT: 실제 PostgreSQL/Flyway V100, PASS.
- RED-B1/B2 임시 실왕복 probe: 2/2 PASS, source 제거.
- 정책 A 비정산/다중 rollback 임시 groupware IT: 실제 PostgreSQL/Flyway V19, 2/2 PASS, source 제거.
- transaction metadata 임시 probe: 1/1 PASS, source 제거. 이 PASS는 “결함 전제가 사실”이라는 뜻이다.

## 9. 이 라운드가 보지 않은 표면

결함 0 판정은 아니지만 검토 경계를 명시한다.

- 실제 다중 accounting 인스턴스 간 clock skew와 네트워크 partition.
- 300초를 실제 wall-clock으로 기다린 end-to-end 재현. 이번에는 코드/metadata와 controllable-clock RED 설계로 판정했다.
- MinIO enabled 환경에서 여러 파일 중 뒤 파일 실패 후 앞 파일의 보존·정리 UX.
- 실제 gateway JWT/CORS/auth-service를 포함한 배포형 브라우저 경로. 라이브 QA는 내부 token과 Playwright header route로 격리 서비스에 인증했다.
- 공유 DB V19/V99/V100 migration 적용. 공유 DB는 의도적으로 read-only였고 현재 V18/V98이었다.

