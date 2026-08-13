# D-G7 SOL 5.6 재검토3 — rebase 후 재수렴

- 대상: PR #1169 `feat/dg7-settlement-unconfirm`
- 검토 HEAD: `f96da95379952aee6c1bceab4e9cde88d765eac3`
- 검토 시 `origin/main`: `4d6caad3f50a1da9bfba7ff98a0175b2e85b9251`
- 기준 머지: `da09abcec` — PR #1168
- 판정: **불합격 — 머지 차단 결함 1건**
- git 조작: 수행하지 않음

## 1. 차단 결함

### B-1. `REJECTED/WITHDRAWN` 전환 뒤 ACTIVE claim을 해제하지 않아 확정 취소가 최대 300초간 409

정책 정본은 정산 참조 결재가 `PENDING/IN_PROGRESS/APPROVED`일 때만 확정 취소를 막고, 종료 상태인 `REJECTED/WITHDRAWN`에서는 즉시 허용한다.

- 정책: `docs/dev-reports/2026-08-11-dg7-implementation.md:161,201,230`
- groupware 역조회: `ApprovalAttachmentService.java:217-224`에서 정확히 `PENDING/IN_PROGRESS/APPROVED`만 활성으로 센다.
- accounting 취소: `SalesCommissionSettlementService.java:110-115`에서 역조회 다음에 ACTIVE claim도 별도로 검사한다.
- claim lease: `SalesCommissionSettlementApprovalClaim.java:37-38,91-103`의 ACTIVE TTL은 300초다.
- 첨부 삭제: `ApprovalAttachmentService.java:330-347`에서 commit 뒤 `releaseByApprovalReference`를 호출한다.
- 반려·회수: `ApprovalLineService.java:351-390`의 두 `reject`와 `withdraw`는 상태만 바꾸고 정산 참조 claim을 전혀 해제하지 않는다.

claim 도메인의 `release()` Javadoc도 “첨부 저장 실패·삭제·반려·회수 시” 해제를 명시하지만 반려·회수 호출 경로가 빠져 있다.

### 격리 PostgreSQL + 실제 두 서비스 HTTP 재현

검토 전용 PostgreSQL 16 두 개에 groupware V1~V19, accounting V1~V100을 처음부터 적용하고, 검토 프로필에서만 노출되는 얇은 QA adapter를 임시 bootJar에 넣어 실제 groupware↔accounting HTTP를 왕복했다. adapter 소스는 jar 생성 직후 제거했으며 제품 소스에는 남기지 않았다.

1. CONFIRMED 정산 `2099/08/11-1` 생성
2. 해당 문서를 참조하는 PENDING 결재 원자 생성 → `201`
3. 확정 취소 → `409`, DB는 `CONFIRMED|2099/08/11-1`
4. 같은 결재 회수 → `200`, groupware DB 상태 `WITHDRAWN`
5. 즉시 확정 취소 → **`409`**
6. accounting DB 확인 → claim `ACTIVE`, `expires_at > now()` = true

즉, #1168 역조회는 종료 상태를 올바르게 제외하지만 D-G7 claim이 남아 동일 요청을 다시 막는다. TTL 300초가 지나면 우연히 풀리므로 테스트 타이밍에 따라 누락될 수 있는 정책 회귀다.

### 수정 지시

1. `ApprovalLineService`의 두 `reject` 경로와 `withdraw` 경로에서 해당 결재의 활성 `SALES_COMMISSION_SETTLEMENT` 참조를 수집한다.
2. groupware 상태 transaction이 **commit된 뒤에만** 각 고유 `(approvalId, documentNo)`에 `releaseByApprovalReference`를 호출한다. 첨부 삭제의 after-commit 패턴을 재사용한다.
3. accounting의 `assertNoActiveClaimsForLockedSettlement`를 약화하거나 제거하지 않는다. 이것은 생성/취소 TOCTOU fencing이므로 groupware 역조회 결과만 믿게 바꾸면 이전 결함이 재발한다.
4. release 네트워크 실패는 취소를 잘못 허용하지 않는 fail-closed 성질을 유지하되, 정상 반려·회수에서는 즉시 해제되도록 한다.
5. 격리 PostgreSQL 교차 서비스 테스트를 추가한다.
   - `PENDING/IN_PROGRESS/APPROVED` → 즉시 취소 409
   - `REJECTED` → 즉시 취소 200, DRAFT, 문서번호 동일
   - `WITHDRAWN` → 즉시 취소 200, DRAFT, 문서번호 동일
   - 여러 정산 참조가 있을 때 해당 결재의 정확한 참조만 해제
   - 상태 transaction rollback 시 claim 미해제

## 2. rebase가 없앤 V19 검증

삭제 전 blob은 `1b740a8b6:services/groupware-service/src/main/resources/db/migration/V19__allow_settlement_approval_reference.sql`에서 회수해 #1168 정본과 문장 단위로 대조했다.

| 항목 | 삭제 V19 | #1168 정본 V19 |
|---|---:|---:|
| 기존 CHECK drop | 있음 | 있음 |
| 기존 6값 보존 | 있음 | 있음 |
| 7번째 `SALES_COMMISSION_SETTLEMENT` | 있음 | 있음 |
| active 역조회 partial index | 없음 | 있음 |

삭제 V19의 실행 SQL은 정본의 CHECK 확장 부분과 동일하며, 정본은 여기에 `ix_approval_attachments_ref_doc_active(ref_doc_type, ref_doc_no) WHERE is_deleted = FALSE`를 더 가진다. 따라서 삭제본은 **진부분집합**이고 실행 의미 유실은 없다.

제거된 basename을 전수 검색하면 실행 코드·Gradle·Flyway 설정의 참조는 0건이다. 다음 두 문서에만 역사 기록으로 문자열이 남는다.

- `docs/dev-reports/2026-08-11-dg7-rebase-dedup.md`
- `docs/dev-reports/2026-08-11-dg7-implementation.md`

후자는 rebase 전 “신규 파일 목록”이므로 현재 트리 목록으로 읽으면 낡았지만 런타임 dangling reference는 아니다. 실제 호출 연결은 모두 살아 있다.

- accounting 취소 → `GroupwareSettlementApprovalClient.hasActiveSettlementApproval`
- groupware internal endpoint → `ApprovalAttachmentService.hasActiveSettlementApproval`
- #1168 역조회 → `listByReference` → `findAllByReference`

## 3. 마이그레이션 네 축

| 축 | 재계산 결과 |
|---|---|
| ① 공유 실 DB, 조회 전용 | accounting max V98, groupware max V18, product max V37, auth max V98 |
| ② `origin/main` `4d6caad3f` | accounting V98, groupware V19 정본, product V37, auth V100 |
| ③ PR #1169 | accounting V99 snapshot history + V100 claim, groupware 신규 migration 없음 |
| ④ 다른 열린 PR | #1166 product V38 Java migration, #1170 auth V101 permission seed, #1171 migration 없음 |

서비스별 번호 충돌은 없다. 검토 중 격리 DB의 Flyway 최종 상태도 accounting `V100 add sales commission settlement approval claim`, groupware `V19 extend approval reference doc type`이었다. groupware CHECK에는 7개 enum 값이 모두 들어갔고 partial index도 생성됐다.

현재 `origin/main`은 HEAD의 조상이 아니지만, merge-base `b4463a86d`가 이미 #1168 `da09abcec` 뒤다. 이후 main-only 변경은 메모리 문서 2개뿐이며 제품·migration 교차면은 없다.

## 4. TF-1/2/3/4와 RED-B 재검증

### 격리 PostgreSQL 실제 왕복

| 시나리오 | 결과 |
|---|---|
| CONFIRMED → 참조 원자 생성 | 201 |
| 활성 참조 중 확정 취소 | 409, CONFIRMED 및 문서번호 유지 |
| 첨부 해제 → 확정 취소 | delete 200 → cancel 200, DRAFT, 문서번호 동일, snapshot history 1건 |
| 해제 뒤 첫 재첨부 | 첫 요청 201 |
| 만료 뒤 첫 재첨부 | 격리 DB에서 기존 첨부 soft-delete·claim 만료를 만든 뒤 첫 요청 201 |
| 참조 7건 원자 생성 | 201 |
| 참조 8건 원자 생성 | 400, 동일 제목 approval row 0 |
| accounting 중단 중 정산 참조 결재 생성 | 500, approval row 0 |
| 회수 직후 확정 취소 | **409 — B-1 재현** |

accounting 중단은 검토 프로세스 PID와 포트 소유권을 확인한 뒤 그 프로세스만 종료해 재현했다. Desktop 구현은 `createGroupwareApproval(...)`가 성공한 뒤에만 파일 upload loop로 진입하므로 생성 500에서 파일 POST 경로로 진행하지 않는다. 다만 이번 라운드에서는 실제 multipart POST 카운터를 별도로 계측하지 않았다.

### 시간 예산

- 원자 생성 transaction timeout: 120초
- claim connect timeout: 참조당 2초
- claim read timeout: 참조당 5초
- 원자 참조 상한: 7
- ACTIVE lease: 300초
- 최악의 순차 원격 예산: `7 × (2 + 5) = 49초`; reserve/activate 양쪽을 보수적으로 합산해도 98초
- 120초 transaction 및 300초 lease 안에 들어가며 TF-4 계약 테스트도 통과했다.

### 전체 회귀

| 검증 | 결과 |
|---|---|
| accounting 전체 | 1,894, failures 0, errors 0, skipped 10 |
| groupware 전체 | 264, failures 0, errors 0, skipped 0 |
| Desktop Vitest | 성공 |
| Desktop typecheck | 성공 |
| `SalesCommissionSettlementApprovalClaimIT` | 4/4 성공 |
| `ApprovalTemplateAttachmentIT` | 10/10 성공 |
| `Dg7ToctouFix3IT` | 2/2 성공 |

RED-B의 문서번호 유지와 CONFIRMED snapshot 이력은 정상 경로에서 보존됐다. 결재 진행 중 취소 불가도 보존됐다. 종료 상태 즉시 취소 정책만 B-1 때문에 깨졌다.

## 5. #1168 상호작용

### V19 위 정산 참조·claim

격리 DB에서 #1168 V19를 적용한 뒤 D-G7 정산 참조 원자 생성이 201, accounting claim이 ACTIVE로 전이됐다. 첨부 해제 후 exact release와 재첨부도 정상 동작했다.

### 문서 검색·표시 계약

다음 두 파일은 `origin/main`과 byte diff가 0이다.

- `clients/desktop/src/renderer/api/documentReferenceSearch.ts`
- `clients/desktop/src/renderer/api/approvalAttachmentPresentation.ts`

검색 유형은 7종이고 실제 검색 URL 계열은 6개다. 기존 6종의 상세 라벨, 인쇄 라벨, href도 그대로다. 정산서는 S4 route 전이므로 href `null` 계약을 유지한다.

### 기존 OUTBOUND_SLIP·JOURNAL

공유 DB를 read-only로 조회해 활성 `OUTBOUND_SLIP` 5건, `JOURNAL` 2건을 확인했다. groupware 저장 코드는 `SALES_COMMISSION_SETTLEMENT`만 reserve/activate claim client로 분기하고 나머지는 로컬 DB 저장 경로를 탄다. 공유 accounting DB는 아직 V98이라 claim table 자체가 없는데 기존 7건이 정상 존재하므로, 기존 유형이 새 claim 경로를 통과하지 않는다는 정적·DB 교차 증거가 일치한다.

## 6. Desktop 라이브 QA

Codex 내장 브라우저를 사용하지 않고 `clients/desktop`에서 Playwright CLI를 직접 실행했다.

- 실행 엔진: `C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe`
- 스펙 디렉터리: `playwright/2026-08-11-dg1-s3-fix-real-qa/`
- 스펙 파일: `s3-fix-real-qa.spec.ts`
- 결과: **9/9 passed, 19.4초**
- 경로 계약: 디렉터리와 파일명 모두 `-real-qa`, 증거 경로는 `resolveQaShotsDir()` 경유
- 대기: `networkidle` 미사용

첫 실행은 Vite에 `VITE_MOCK_MODE=1`이 빠져 로그인 화면에 머물러 9건 모두 실패했다. 화면·로그로 하네스 원인을 분리한 뒤 동일 포트를 소유한 검토 프로세스만 재기동해 9/9를 얻었다. PNG 증거는 repo 밖 임시 디렉터리에 생성 후 제거했다.

## 7. 이번 라운드가 직접 보지 않은 표면

- `REJECTED` 전이를 두 서비스 HTTP로 직접 만들지는 않았다. 다만 두 `reject` overload와 `withdraw`가 동일하게 release를 누락한 것을 코드로 확인했고, `WITHDRAWN`은 실제 두 서비스 HTTP에서 재현했다.
- accounting 중단 시 실제 Desktop multipart 파일 POST 횟수는 네트워크 카운터로 계측하지 않았다. backend 500·approval row 0과 파일 loop 진입 순서는 확인했다.
- ACTIVE 300초를 실제 시간으로 모두 기다리지는 않았다. 만료 재첨부는 격리 DB의 `expires_at`을 과거로 이동해 첫 요청을 검증했다.
- 공유 DB에는 어떤 write도 하지 않았다. 모든 write 시나리오는 검토 전용 격리 PostgreSQL에서만 수행했다.
- 외부 CI 재실행, PR comment, commit, push, rebase, merge는 수행하지 않았다.

## 8. 자원 정리

검토용 포트 `28087`, `28092`는 모두 해제했다. 검토용 컨테이너 `dg7-solr3-accounting-db`, `dg7-solr3-groupware-db`는 stop 후 제거했고, 검토용 runtime/temp 디렉터리도 제거했다. 기존 `samhan-*` 컨테이너와 다른 워크트리 프로세스는 종료하지 않았다.

## 9. PM 판정

**머지 금지.** B-1을 수정하고 `REJECTED/WITHDRAWN` 즉시 취소의 격리 PostgreSQL 교차 서비스 회귀를 추가한 뒤 재검토가 필요하다. 나머지 rebase 중복 제거, migration 네 축, TF-1/2/3/4, #1168 검색·표시 상호작용, RED-B 회귀는 이번 라운드에서 통과했다.
