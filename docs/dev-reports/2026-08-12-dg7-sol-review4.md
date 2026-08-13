# D-G7 SOL 재검토4 — 머지 판단 라운드

- 검토일: 2026-08-12
- 대상: PR #1169, HEAD `761f9f251189cf453a29b95f780c5b2302494c64`
- 검토자: CODEX SOL 5.6
- 판정: **결함 0 — 머지 승인**

## 1. 결론

이번 수정은 지난 라운드의 차단 결함인 “결재가 종료되어도 accounting claim이
남는다”를 해소했다. production runtime에서 `REJECTED` 또는 `WITHDRAWN`으로 끝나는
세 경로를 직접 세었고, 세 경로 모두 상태 전이 직후 같은
`releaseSettlementClaimsAfterApprovalCompletion` 경계를 지난다. 상태를 직접 대입하거나
bulk update, 별도 `repository.save`로 종료 상태를 만드는 우회 runtime 경로는 찾지
못했다.

release는 로컬 transaction의 `afterCompletion(STATUS_COMMITTED)`에서 실행된다. 원격
release 실패는 삼켜지며 retry/outbox는 없다. 이 경우 유일한 회수 수단은 ACTIVE claim의
300초 lease와 다음 accounting guard의 만료 자가 치유다. 그동안 정상 취소가 일시적으로
409가 될 수는 있지만, 반대로 참조 중인 정산서 취소를 허용하는 false-negative는 만들지
않는다. D-G7의 fail-closed 정책과 일치하므로 머지 차단 결함으로 판정하지 않았다.

격리 PostgreSQL 두 개와 실 HTTP 왕복에서 `REJECTED`, 중복 참조 유지,
`IN_PROGRESS`/`APPROVED` 유지, lease 만료 후 재예약, 7건/8건 경계 및 accounting 중단
시 원자 rollback을 다시 밟았다. Desktop Playwright는 실제 파일을 선택한 뒤 네트워크를
계측해 결재 생성 POST 1회, multipart 파일 POST 0회, 응답 500, 결재 DB 0건을 확인했다.

## 2. 종료 경계 전수 확인

### 2.1 production 종료 호출부를 직접 센 결과

`ApprovalStatus.REJECTED`/`WITHDRAWN` 대입 지점과 groupware production service의
`reject`, `withdraw`, `repository.save`, bulk update/delete를 서로 대조했다.

1. USER 반려: `ApprovalLineService.java:351-358`
   - `line.reject(actorUserId, reason)` 후 `releaseSettlementClaimsAfterCompletion(line)`.
2. GROUP 반려: `ApprovalLineService.java:372-379`
   - group/page context를 받는 `line.reject(...)` 후 같은 helper.
3. 회수: `ApprovalLineService.java:385-392`
   - `line.withdraw(actorUserId)` 후 같은 helper.
4. 공통 helper: `ApprovalLineService.java:397-399`
   - ID가 있으면 `ApprovalAttachmentService.releaseSettlementClaimsAfterApprovalCompletion`
     한 곳으로 연결한다.

상태 대입 정본은 `shared/approval-core/.../ApprovalLineBase.java`의 PENDING 초기화
`75`, 승인 상태 전이 `116`, REJECTED `129`, WITHDRAWN `138`뿐이다. groupware runtime의
종료 호출은 위 세 개다. `shared/approval-core`의 범용 service는 groupware가 쓰는
service가 아니며, `GroupwareSeeder`의 직접 반려/save는 `dev` profile과
`app.groupware.seed-test-data=true` 조건부 fixture이고 정산 참조 첨부도 만들지 않는다.
따라서 production claim graph를 우회하는 네 번째 종료 경로로 세지 않았다.

### 2.2 삭제와 결재선 변경 주장

- 결재 삭제: groupware controller의 `@DeleteMapping`은 첨부
  (`GroupwareApprovalAttachmentController.java:106`), 일정, collab comment, 결재 양식,
  문서 양식에만 있다. `ApprovalLine` 삭제 endpoint/service는 없다.
  `ApprovalLine.java:36-40`의 `@SQLRestriction("is_deleted = false")`는 조회 필터일 뿐
  삭제 동작이 아니다.
- 결재선/본문 변경: `GroupwareApprovalDocumentCollaborationPort.java:89-99`와
  `198-204`는 각각 save 전에 `guardCollabModifiable()`를 호출한다. 실제 guard는
  `ApprovalLine.java:187-191`이며 APPROVED/REJECTED/WITHDRAWN을 409로 차단한다.
- 첨부 add/upload/delete도 `ApprovalAttachmentService.java:97,108,175,265`에서 같은
  guard를 먼저 지난다. 종료 후 참조 graph를 다시 바꾸어 해제된 claim을 부활시키는
  runtime 경로는 없다.

### 2.3 commit 후 release 메커니즘과 실패 의미

- 종료 helper는 활성 첨부에서 `SALES_COMMISSION_SETTLEMENT`만 모으고
  `LinkedHashSet`으로 문서번호를 dedupe한다
  (`ApprovalAttachmentService.java:236-248`).
- `registerReleaseAfterCommit`은 transaction synchronization이 없으면 즉시 release하고,
  있으면 `TransactionSynchronization.afterCompletion`에서 상태가
  `STATUS_COMMITTED`일 때만 release한다
  (`ApprovalAttachmentService.java:351-363`). rollback이면 호출하지 않는다.
- 원격 호출은 `releaseReferenceQuietly`에서 수행하며 `RuntimeException`을 삼킨다
  (`ApprovalAttachmentService.java:366-371`). 즉 after-commit 실패에 대한 application
  retry/outbox는 없고, lease가 유일한 회수 장치다.
- ACTIVE TTL은
  `SalesCommissionSettlementApprovalClaim.java:37`의 `ACTIVE_TTL_SECONDS = 300`이다.
  accounting 취소 guard는 만료 claim을 먼저 `EXPIRED`로 자가 치유한 뒤 살아 있는
  claim만 409로 막는다
  (`SalesCommissionSettlementApprovalClaimService.java:99-110`). 최악의 영향은 남은
  lease 동안의 보수적 409이며 unsafe 200은 아니다.

## 3. 15행 참조 수명 전수표 독립 판정

| # | 경로 | 판정 | 직접 확인 근거 |
|---:|---|:---:|---|
| 1 | PENDING | X | active 역조회 집합에 포함. 아직 결재가 정산서를 참조한다. |
| 2 | IN_PROGRESS | X | active 역조회 포함, 격리 HTTP 승인 후 claim ACTIVE·취소 409. |
| 3 | APPROVED | X | active 역조회 포함, 격리 HTTP 최종 승인 후 claim ACTIVE·취소 409. |
| 4 | REJECTED — USER | O | `351-358` → 공통 helper; 격리 두 서비스 HTTP에서 RELEASED 후 취소 200. |
| 5 | REJECTED — GROUP | O | `372-379` → 공통 helper; `Dg7ToctouFix4IT` GROUP 전이 통과. |
| 6 | WITHDRAWN | O | `385-392` → 공통 helper; `Dg7ToctouFix4IT` 회수 전이 통과. |
| 7 | 그 밖의 ApprovalStatus | N/A | enum은 위 다섯 상태뿐이다. |
| 8 | 마지막 정산 참조 첨부 삭제 | O | soft-delete 뒤 중복 없음 확인 후 after-commit release (`263-272`). |
| 9 | 같은 정산서의 다른 활성 중복 첨부가 남음 | X | 격리 DB에 legacy 중복을 만든 뒤 하나 삭제: 남은 첨부 1, claim ACTIVE, 취소 409. |
| 10 | 결재 삭제/soft-delete | N/A | ApprovalLine 삭제 controller/service 없음. |
| 11 | 참조만 제거 | O/X | 현재는 첨부 soft-delete 하나뿐. 마지막이면 O, 중복이 남으면 X. |
| 12 | 종료 결재의 결재선/본문 변경 | N/A | 두 collaboration save와 첨부 mutation 모두 guard에서 차단. |
| 13 | 결재 생성 실패/rollback | O | reserve 뒤 실패 보상 release (`132-143`, `336-344`), 기존 회귀 통과. |
| 14 | 원자 생성 timeout rollback | O | 동일 보상과 deadline guard; 로컬 결재를 남기지 않는다. |
| 15 | 8건 상한/accounting 중단 중 생성 | N/A | 8건은 claim 전 400. accounting 중단은 reserve 단계 500·결재/파일 POST 0. |

`APPROVED`가 영구히 남으면 해당 정산서는 영구히 취소할 수 있다가 아니라
**취소할 수 없다**. 이는 우연한 잔류가 아니라 D-G7 확정 정책이다.
`docs/dev-reports/2026-08-11-dg7-implementation.md:155-165`는
PENDING/IN_PROGRESS/APPROVED를 활성 참조로 정의하고, 같은 문서의 조합표
`194-206`도 APPROVED + cancel을 CONFLICT로 명시한다. 승인된 결재가 참조하는 금액을
사후 변경하지 못하게 하는 정책이므로 X 판정이 맞다.

## 4. 격리 PostgreSQL + 두 서비스 HTTP 실증

공유 DB는 조회도 수행하지 않았고 write는 아래 격리 datasource에만 했다.

- accounting: `jdbc:postgresql://127.0.0.1:25441/accounting_db`, user `dg7qa`
- groupware: `jdbc:postgresql://127.0.0.1:25442/groupware_db`, user `dg7qa`
- Eureka `127.0.0.1:28761`, accounting `127.0.0.1:28887`, groupware
  `127.0.0.1:28892`
- internal token: `dg7-solr4-token`

일회성 QA HTTP adapter는 production service를 그대로 호출하고 계측값만 노출하도록
bootJar 빌드 전에 넣었으며, 검증 뒤 소스와 빌드 stale class를 제거했다. 다음 결과는
모두 실제 PostgreSQL transaction과 groupware↔accounting HTTP를 통과했다.

### 4.1 REJECTED 두 서비스 전이

1. accounting에 CONFIRMED 정산서 `2099/08/13-1`을 만들었다.
2. groupware HTTP 결재 생성은 201이었다.
3. PENDING 중 accounting 취소는 409였다.
4. groupware HTTP USER 반려는 200/REJECTED였다.
5. accounting claim은 RELEASED가 됐다.
6. accounting HTTP 취소는 200이었다. 결과는 DRAFT, 문서번호
   `2099/08/13-1` 유지, `recalculationRequired=true`, history 1이었다.

public `GroupwareAdminController`의 반려 endpoint는 GROUP-aware overload 하나로 직접
위임한다(`GroupwareAdminController.java:158-168`). 그 overload는 독립 PostgreSQL IT로
별도 확인했고, 이번 두 서비스 동적 왕복은 USER overload를 노출한 일회성 QA HTTP
adapter로 확인했다.

### 4.2 활성 상태·중복·lease·상한

- IN_PROGRESS: 실제 approve 후 IN_PROGRESS, claim ACTIVE, cancel 409.
- APPROVED: 최종 approve 후 APPROVED, claim ACTIVE, cancel 409.
- 활성 중복: 정상 API는 동일 pair 재예약을 차단하므로 legacy 데이터 상황을 재현하기
  위해 격리 groupware DB에 같은 문서 첨부를 한 건 더 넣었다. production 첨부 삭제
  service로 하나만 지운 결과 남은 활성 첨부 1건, claim ACTIVE, cancel 409였다.
- lease: production의 300초 상수는 바꾸지 않았다. 격리 accounting DB의 시험 대상
  claim 한 행만 `expires_at = (current_timestamp at time zone 'UTC') + interval '2 seconds'`
  로 줄이고 3초 기다렸다. 같은 approval/document pair의 실제 reserve가 첫 시도에
  201, activate 200이어서 만료 후 첫 재첨부 가능성을 계측했다. 최초 KST session 값을
  그대로 넣은 측정은 timestamp-without-time-zone에 +9시간이 들어가 폐기했고, 위 UTC
  식으로 바로잡은 결과만 증거로 채택했다.
- 7/8: 정산 참조 7건 원자 생성 201. 다음 8건은 400. DB에는 7건 요청 결재 1개만 있고
  8건 요청 결재는 0개였다.

## 5. accounting 중단 + 실제 multipart POST 계측

`clients/desktop`에서 Playwright를 직접 실행했다. Codex 내장 브라우저는 사용하지
않았다.

- 브라우저: headless Chromium, Playwright `chromium-1217`
  (`chrome.exe` file version `147.0.7727.15`)
- 스펙 디렉터리:
  `playwright/2026-08-12-dg7-sol-review4-real-qa/`
- 스펙 파일: `dg7-sol-review4-real-qa.spec.ts`
- QA 증거: 스펙에서 `resolveQaShotsDir()`로 계산한 외부 임시 디렉터리
- 탐색 대기: `domcontentloaded`; `/collab/stream` SSE 때문에 `networkidle` 미사용
- 파일 probe: 실제 PNG 선택. 캡처 PNG signature `89504E470D0A1A0A`, 1440x900,
  66,446 bytes

accounting 포트 소유 PID가 이 라운드에서 띄운 프로세스인지 확인한 뒤 그 PID만
중단했다. UI에서 파일을 선택하고 결재 생성을 눌렀으며 최종 계측은 다음과 같다.

```text
DG7_HTTP_METRICS createPost=1 multipartPost=0 createStatus=500
1 passed (2.3s)
```

격리 groupware DB의 해당 제목 결재는 0건이었다. 즉 accounting reserve 실패가
multipart 업로드보다 먼저 발생하여 실제 생성 POST는 500, 파일 POST는 0회, 결재도
0건인 원자성을 보존했다. UI 표시용 template ID가 격리 DB에 없어서 network proxy는
이를 `null`로 정규화했고, accounting까지 도달할 정산 참조를 같은 격리 데이터에서
주입했다. 이 변경은 시험 harness에만 있었고 production 소스에는 남지 않았다.

## 6. RED-B 회귀 결과

| 항목 | 결과 |
|---|---|
| 확정 → 참조 첨부 → 취소 | 409, CONFIRMED 유지 |
| 정상 해제 후 취소 | 200, DRAFT, 문서번호 유지, history 1 |
| 해제·만료 후 첫 재첨부 | 첫 reserve 201, activate 200 |
| 참조 7건 / 8건 | 201 / 400 |
| accounting 중단 중 생성 | 500, 결재 0건, 실제 multipart POST 0회 |
| 제거한 V19 | 제거 파일 없음(`Test-Path=False`), #1168 정본 `V19__extend_approval_reference_doc_type.sql`만 존재; HEAD 변경에도 migration 없음 |

검증 명령과 결과:

```text
.\gradlew.bat :services:accounting-service:test :services:groupware-service:test --rerun-tasks --no-daemon
BUILD SUCCESSFUL in 9m 44s
accounting: 1,894 tests, failures 0, errors 0, skipped 10
groupware: 268 tests, failures 0, errors 0, skipped 0

cd clients/desktop
npm test
exit 0
npm run typecheck
exit 0 (typecheck:real-qa 2/2 + 51/51 포함)

Playwright direct
1 passed (2.3s)
```

Gradle 첫 전체 명령이 FROM-CACHE였으므로 증거에서 제외하고 `--rerun-tasks`로 전부
다시 실행했다. XML은 일부 `<system-out>`가 XML parser에 부적합한 기존 출력이 있어
각 파일의 `<testsuite>` 첫 태그 속성을 직접 집계했다.

## 7. 이번 라운드에서 직접 보지 않은 표면

PM이 판단할 때 검증 범위를 과대평가하지 않도록 남은 표면을 명시한다.

- production accounting에는 정산 취소 public controller가 없다. 취소 HTTP는 일회성
  QA adapter가 production `cancelConfirmation` service를 호출하는 방식으로 실증했다.
- public groupware 반려 controller의 인증 wrapper 자체는 이번 격리 동적 왕복에서
  다시 밟지 않았다. controller가 GROUP-aware service overload로 바로 위임하는 코드는
  직접 확인했고 그 overload의 PostgreSQL IT는 통과했다. USER overload는 두 서비스
  HTTP 왕복으로 밟았다.
- WITHDRAWN public HTTP endpoint는 현재 존재하지 않는다. service 전이와 real
  PostgreSQL IT는 밟았지만 존재하지 않는 HTTP surface는 밟을 수 없다.
- 실제 300초를 기다리지는 않았다. production TTL 상수는 유지하고 격리 DB의 시험 행
  하나만 UTC 기준 2초로 줄여 3초 후 재예약을 측정했다.
- terminal commit 직후 accounting release HTTP만 고의로 끊는 fault injection은 하지
  않았다. 이때 exception을 삼키고 lease만 남는 동작은 production 소스로 확인했다.
- CI, shared DB write, 배포, PR comment, git add/commit/push는 이 라운드 범위에 포함하지
  않았다.

위 미검증 표면은 현재 production 경로가 없거나 controller wrapper/장애 주입/시간축의
잔여 범위이며, 종료 경계의 누락이나 RED-B 회귀를 가리키는 증거는 아니다.

## 8. 런타임 정리와 PM 판단

제가 띄운 Vite, Eureka, groupware, accounting 프로세스만 PID와 포트 소유권을 확인해
종료했다. `dg7-solr4-accounting-db`, `dg7-solr4-groupware-db` 컨테이너와
`dg7-solr4-net`만 삭제했다. 포트 `25176`, `28761`, `28887`, `28892`, `25441`,
`25442`에는 listener가 남지 않았고 타 워크트리 프로세스는 건드리지 않았다.
일회성 QA adapter와 Playwright 설정/스펙도 제거했다.

**최종 PM 보고: 차단 결함 0. PR #1169는 현재 HEAD에서 머지 가능하다.**
