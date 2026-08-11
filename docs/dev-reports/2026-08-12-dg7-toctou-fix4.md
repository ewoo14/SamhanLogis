# D-G7 fix4 — 종료 상태가 claim을 풀지 않는다

작성일: 2026-08-12  
대상: PR #1169 최신 HEAD  
검증자: CODEX LUNA 5.6 구현자

## 결론

전제가 맞았다. 결재선의 상태 수명과 accounting claim 수명이 분리되어
`REJECTED`·`WITHDRAWN` 직후에도 ACTIVE claim이 최대 300초 남는 결함이었다.

이번 fix는 상태별 release를 흩어 놓지 않고, **결재선이 종료된 뒤 결재 ID의
정산 참조를 재수집하여 commit 후 release하는 공통 경계**를 추가했다.

- `ApprovalLineService`의 USER 반려, GROUP 반려, 회수 세 경로가 같은 종료 경계를 호출한다.
- 같은 정산서가 중복 첨부되어도 `(approvalId, documentNo)` release는 1회만 예약한다.
- DB transaction rollback이면 after-commit callback이 실행되지 않아 claim이 결재보다 먼저 풀리지 않는다.
- accounting의 fail-closed ACTIVE claim 검사와 300초 lease는 그대로 최후 안전망으로 남겼다.
- `APPROVED`는 여전히 참조 중이므로 release하지 않는다.

## 변경 파일

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ApprovalAttachmentService.java:236-248`
  - `releaseSettlementClaimsAfterApprovalCompletion(UUID)` 추가.
  - 현재 결재 ID의 활성 첨부 중 `SALES_COMMISSION_SETTLEMENT`만 골라 문서번호를 dedupe하고 기존 `registerReleaseAfterCommit`으로 연결.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ApprovalLineService.java:351-399`
  - USER 반려, GROUP 반려, 회수 성공 직후 공통 helper 호출.
- `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/Dg7ToctouFix4IT.java`
  - 격리 PostgreSQL/Flyway 기반 RED-A 회귀 테스트 4개 추가.

accounting production 코드와 migration은 변경하지 않았다. 제거된 V19를 되살리지 않았으며,
이번 변경은 #1168 정본에서 제거된 V19의 진부분집합을 유지한다.

## 참조를 놓는 경로 전수표

표에서 `O`는 claim을 release하는 경로, `X`는 release하지 않지만 claim이 살아 있어야
안전한 경로, `N/A`는 현재 runtime 경로가 없다는 뜻이다.

| 경로 | claim | release 위치 | 안전성/비고 |
|---|---:|---|---|
| PENDING | X | 없음; `ApprovalAttachmentService.java:218-226`의 active 역조회 | 결재가 아직 정산서를 참조하므로 accounting claim 유지가 정본이다. |
| IN_PROGRESS | X | 동일 | 후속 결재자가 참조 중이므로 유지한다. |
| APPROVED | X | 동일 | 확정 승인 결재가 참조 중이다. `CONFIRMED → cancel`은 계속 409여야 한다. |
| REJECTED, USER 전이 | O | `ApprovalLineService.java:351-358` → 공통 helper `397-399` → `ApprovalAttachmentService.java:236-248, 351-368` | 상태 변경 transaction commit 후 즉시 release한다. |
| REJECTED, GROUP 전이 | O | `ApprovalLineService.java:372-379` → 동일 공통 helper | USER 경로와 동일한 수명 경계다. |
| WITHDRAWN | O | `ApprovalLineService.java:385-392` → 동일 공통 helper | 회수 직후 claim이 남지 않는다. |
| 그 외 ApprovalStatus | N/A | 현재 enum은 PENDING/IN_PROGRESS/APPROVED/REJECTED/WITHDRAWN만 존재 | 새 종료 상태를 추가할 때 개별 문서번호 release를 만들지 말고 동일한 종료 경계에 연결해야 한다. |
| 첨부 삭제 — 마지막 정산 참조 | O | 기존 `ApprovalAttachmentService.java:257-272, 351-368` | soft-delete commit 후 해당 approval/document pair를 release한다. |
| 첨부 삭제 — 동일 정산서의 다른 활성 중복 참조가 남음 | X | 기존 `existsOtherActiveReference` 검사 `ApprovalAttachmentService.java:270` | 결재가 여전히 같은 정산서를 참조하므로 release하지 않는 것이 안전하다. |
| 결재 삭제/soft delete | N/A | 현재 `ApprovalLine` 삭제 endpoint/service 경로 없음. `@SQLRestriction`은 조회 필터일 뿐 삭제 API가 아니다. | 새 삭제 경계를 만들면 이 공통 종료 경계를 호출해야 한다. |
| 참조만 제거 | O 또는 X | 현재 참조 제거는 첨부 soft-delete 하나이며 위 첨부 삭제 행과 동일 | 마지막 참조 제거일 때만 O다. |
| 결재선 변경 | N/A | 종료 결재의 변경은 `guardCollabModifiable`로 차단되며 참조를 바꾸는 runtime 경로가 없다. | 새 변경 경로는 참조 수명 경계를 함께 갱신해야 한다. |
| 결재 생성 실패/rollback | O | reserve 후 compensation `ApprovalAttachmentService.java:132-143, 336-344` | 로컬 저장/activate 실패 시 claim token을 release한다. |
| 원자 생성 timeout rollback | O | 동일 compensation + `SettlementApprovalReferencePolicy.java:31-67` deadline guard | timeout은 transaction rollback 및 보상 release다. lease만 기다리지 않는다. |
| 상한 거절(8건) | N/A | `SettlementApprovalReferencePolicy.java:38-45, 96`에서 원격 claim 전에 400 | claim/file POST가 0회라 release할 claim도 없다. |
| accounting 중단 중 생성 | N/A | reserve 실패가 transaction 진입 초기에 발생하고 로컬 결재가 rollback | 500, 결재 0건, 파일 POST 0회를 유지한다. |

### 역조회 목록과 release 목록 대조

역조회는 `SALES_COMMISSION_SETTLEMENT` + `PENDING, IN_PROGRESS, APPROVED`만
활성 결재로 판정한다(`ApprovalAttachmentRepository.java:35-38`, 호출
`ApprovalAttachmentService.java:218-226`). release는 그 반대인 “결재가 종료된 뒤
현재 approval에 매달린 정산 참조”를 수집한다(`ApprovalAttachmentService.java:236-248`).

따라서 정상 상태의 집합은 다음처럼 일치한다.

```text
역조회가 막음:       PENDING ∪ IN_PROGRESS ∪ APPROVED
종료 release 대상:   REJECTED ∪ WITHDRAWN (현재 종료 상태 전부)
```

이번 결함의 원인이었던 `REJECTED/WITHDRAWN`의 역조회 제외와 claim release 누락을
공통 종료 경계로 해소했다. 종료 상태는 `ApprovalLineBase`에서 추가 승인/반려/회수를
거부하므로 release 후 결재가 되살아나는 경로도 없다.

## RED-A 원문과 GREEN

### RED-A — production fix 전

명령:

```text
.\gradlew.bat :services:groupware-service:test --tests "com.samhanair.logis.groupware.it.Dg7ToctouFix4IT" --no-daemon
```

격리 PostgreSQL + Flyway에서 4개 테스트 중 3개가 실패했다.

```text
rejectedApproval_releasesEveryDistinctSettlementReferenceAfterCommit() FAILED
WantedButNotInvoked: releaseByApprovalReference(...)
groupRejectedApproval_releasesSettlementReferenceAfterCommit() FAILED
WantedButNotInvoked: releaseByApprovalReference(...)
withdrawnApproval_releasesSettlementReferenceAfterCommit() FAILED
WantedButNotInvoked: releaseByApprovalReference(...)
rejectedApproval_rollbackDoesNotReleaseClaimOrLeaveTerminalApproval() PASSED
```

즉 rollback compensation은 이미 안전했지만 정상적인 종료 전이 세 경로에서
release callback이 전혀 등록되지 않는 원문 결함이 재현됐다.

### GREEN — fix 후

같은 명령을 재실행해 `BUILD SUCCESSFUL`, 4/4 통과했다. 중복 동일 문서와 서로 다른
문서 참조를 함께 넣은 테스트에서 서로 다른 문서번호마다 정확히 1회 release를
검증했다.

## 격리 실서비스 왕복

공유 서비스/DB와 분리해 아래 이름의 전용 컨테이너와 datasource를 사용했다.

- groupware PostgreSQL: `dg7-fix4-groupware-db:5432/groupware_db`, user `dg7qa`
- accounting PostgreSQL: `dg7-fix4-accounting-db:5432/accounting_db`, user `dg7qa`
- accounting HTTP: host `127.0.0.1:28087`
- groupware HTTP: host `127.0.0.1:28092`
- Eureka: `dg7-fix4-eureka:8761`
- internal token: `dg7-fix4-token`

검증 순서와 결과:

1. accounting 격리 DB에 `CONFIRMED`, 문서번호 `2099/08/12-401` 정산서 1건을 seed했다.
2. 실제 groupware HTTP `POST /admin/groupware/approvals`로 정산 참조 결재 생성: `201`.
3. 실제 groupware HTTP `PUT /admin/groupware/approvals/{id}/reject` 호출: `200`, 상태 `REJECTED`.
4. 실제 groupware HTTP `GET /internal/groupware/settlement-approvals/active?...` 결과: `200`, `data=false`.
5. accounting 격리 DB claim 조회 결과:

```text
approval_id                          status    is_deleted
779f74e4-55c2-42b5-98b3-b14218aa4946 RELEASED  false
```

이는 groupware↔accounting 실제 HTTP 왕복 후 release callback이 accounting DB에
반영된 증거다. 현재 accounting 소스에는 외부 cancel HTTP controller가 없으므로
취소 동작 자체는 기존 accounting service 테스트와 claim guard 테스트로 검증했고,
실 왕복에서는 그 취소 guard의 두 입력(역조회 false + claim RELEASED)을 확인했다.

## RED-B 보존 확인

- `PENDING/IN_PROGRESS/APPROVED`는 release하지 않으며 accounting ACTIVE claim guard를 유지한다. 확정+참조 첨부 취소 409 보호를 훼손하지 않았다.
- 정상 release 후 취소의 `DRAFT`, 문서번호 보존, history 1 동작은 기존 `SalesCommissionSettlementServiceTest`와 `SalesCommissionSettlementTest` 회귀 범위에 남아 있다.
- release/만료 후 첫 재첨부 1회 201, 7건 201/8건 400, accounting 중단 시 500·결재 0건·파일 POST 0회는 기존 groupware/accounting 전체 테스트와 `SettlementApprovalReferencePolicy` 회귀 범위에 남아 있다.
- 제거된 V19는 되살리지 않았다.
- Desktop Vitest와 typecheck는 모두 통과했다.

## 새로 가능한 상태와 동시성 판단

### 종료 직후 in-flight 요청

결재 transaction이 아직 commit되지 않았거나 after-commit HTTP release가 진행 중이면
claim은 ACTIVE다. 그 사이 accounting 취소가 들어오면 기존 fail-closed guard가
409로 보수적으로 거부한다. release가 성공한 뒤 재시도하면 허용된다.

반대로 release가 먼저 성공한 뒤 오래된 요청이 같은 claim token으로 작업하는 경로는
현재 claim API의 소유자/상태 검증에서 허용되지 않는다. release는 해당
`(approvalId, documentNo)` claim을 terminal 상태로 만들며 새 작업은 새 approval의
새 claim을 예약해야 한다.

### 종료 결재의 부활

부활 경로는 없다. `APPROVED/REJECTED/WITHDRAWN`은 변경 잠금 상태이며,
`ApprovalLineBase`의 approve/reject/withdraw가 terminal 상태에서 거부된다. 삭제,
참조 교체, 결재선 재개방 endpoint도 현재 없다. 새 기능이 이를 추가하면 claim 수명을
독립적으로 만들지 말고 참조 graph와 동일 transaction/경계에 묶어야 한다.

## 검증 명령

```text
.\gradlew.bat :services:groupware-service:test --no-daemon
.\gradlew.bat :services:accounting-service:test --no-daemon
cd clients/desktop
npm test
npm run typecheck
```

모두 `BUILD SUCCESSFUL` 또는 exit code 0으로 완료했다. `npm test`의 최초 120초
실행은 timeout으로 결과를 받지 못했으나, 프로세스 종료 확인 후 300초 제한으로
재실행해 통과를 확인했다.

Desktop live Playwright는 `clients/desktop`에서 headless Chromium으로 직접 실행했다.
공유 DB를 변경하지 않는 groupware BE 실응답 스펙
`playwright/groupware-approval-line-config-s4a/be-live-real-qa.spec.ts`를 일회성
`-real-qa` 설정으로 실행해 **1 passed (3.0s)**를 확인했고, 캡처는 스펙의
`resolveQaShotsDir()` 경로로 생성됐다. 결재 생성/수정 UI 스펙은 공유 DB write가
발생하므로 실행하지 않았다. 격리 실증의 핵심은 별도 전용 DB에 연결된 실
groupware↔accounting HTTP 왕복으로 수행했다.

## 런타임 정리

제가 기동한 `dg7-fix4-*` 컨테이너 5개와 `dg7-fix4-net`만 종료/삭제했다.
공유 서비스, 공유 DB, 타 워크트리 포트는 건드리지 않았다.
