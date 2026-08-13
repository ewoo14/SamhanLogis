# D-G7 rebase·중복 제거 보고서

- 일자: 2026-08-11
- 대상: PR #1169 `feat/dg7-settlement-unconfirm`
- 기준: `origin/main`의 `da09abcec` (#1168) 및 작업 중 추가된 후속 `b4463a86d`
- 최종 HEAD: `0918f4e80`
- 최종 관계: `origin/main...HEAD = 0 9`
- commit·push·PR 조작: 수행하지 않음

## 1. 전제 검증과 rebase

브랜치의 groupware V19는 #1168의 V19 CHECK 확장 부분만 포함한 부분집합이었다. #1168의 정본에는 여기에 `is_deleted = FALSE` 조건부 인덱스까지 포함되어 있었으므로 전제를 확인한 뒤 제거를 진행했다. 다른 구현으로 판정되는 중단 사유는 없었다.

충돌은 groupware 첨부 repository/service, accounting 정산 repository, groupware 첨부 통합 테스트에서 발생했다. 해소 기준은 다음과 같다.

- #1168 정본의 `findAllByReference`, `listByReference`, 역방향 조회 controller/DTO를 유지했다.
- D-G7 취소 정책에 필요한 `hasActiveSettlementApproval` 및 `/internal/groupware/settlement-approvals/active` 호출 경로는 유지했다. 이는 역방향 조회의 중복이 아니라 확정 취소 차단 정책의 소유 경로다.
- 최종 rebase에서는 작업 중 추가된 main 메모리 커밋까지 포함해 최신 `origin/main` 위에 정렬했다.

## 2. 제거한 것과 참조 점검

제거된 중복은 다음 1건이다.

- `services/groupware-service/src/main/resources/db/migration/V19__allow_settlement_approval_reference.sql`
  - 정산 참조 type CHECK만 추가하던 branch 중복 migration.
  - #1168의 `V19__extend_approval_reference_doc_type.sql`을 유일한 V19 정본으로 남겼다.

결재 역방향 조회는 branch에 별도 controller/DTO로 중복된 구현이 없었으며, 충돌 해소 후 #1168 정본만 남겼다. 다음 참조를 재검색해 dangling reference가 없음을 확인했다.

- `GroupwareApprovalReferenceController` → `ApprovalAttachmentService.listByReference` → `ApprovalAttachmentRepository.findAllByReference`
- accounting `SalesCommissionSettlementService` → `GroupwareSettlementApprovalClient.hasActiveSettlementApproval`
- groupware internal controller → `ApprovalAttachmentService.hasActiveSettlementApproval`
- `V19__allow_settlement_approval_reference.sql` 참조: 0건

## 3. 마이그레이션 4축 재계산

| 축 | 확인 결과 |
|---|---|
| 실 DB 적용분 | 공유 PostgreSQL read-only 조회: `accounting_db` max 98, `groupware_db` max 18. V99/V100/V19는 적용하지 않음 |
| `origin/main` | accounting V98까지, groupware V19는 #1168 정본 `V19__extend_approval_reference_doc_type.sql` |
| 이 브랜치 | accounting V99 snapshot 이력, V100 approval claim 추가. groupware 신규 V19 없음 |
| 열린 다른 PR | #1166 product V38 Java migration, #1170 auth V101 permission seed, #1171 migration 없음 |

따라서 이 브랜치가 보유해야 할 migration은 accounting V99/V100만이며, groupware V19는 #1168 하나만 존재한다.

## 4. 보존한 D-G7 범위

- accounting V99 정산 snapshot 이력
- accounting V100 결재 claim
- 확정 취소·재확정 및 결재 진행 중 취소 차단
- 문서번호 유지와 CONFIRMED snapshot 이력
- TF-1 token 영속화·해제 뒤/만료 뒤 첫 재첨부 1회 성공
- TF-2 claim 단일 소유권
- TF-3 원자화·accounting 중단 시 결재/파일 POST 0
- TF-4 timeout 및 참조 상한 7
- `120초` 원자 생성, claim connect `2초`/read `5초`, lease `300초` 관계

rebase 충돌 과정에서 누락된 Java 중괄호 2건도 수정했다. 추가로 desktop mock이 원자 생성 `references`를 첨부 저장소에 보존하지 않던 계약 불일치를 RED 테스트로 재현하고 보정했다. 생성 직후 상세가 정산 참조를 잃는 실제 화면 결함이므로 함께 수정했다.

## 5. 검증 결과

### Backend 전체

최종 rebase 후 순차 실행:

```text
./gradlew.bat :services:accounting-service:test --rerun-tasks --no-daemon --max-workers=1 --console=plain
BUILD SUCCESSFUL — 1894 tests, 0 failures, 10 ignored

./gradlew.bat :services:groupware-service:test --rerun-tasks --no-daemon --max-workers=1 --console=plain
BUILD SUCCESSFUL — 264 tests, 0 failures, 0 ignored
```

두 서비스 모두 Testcontainers의 격리 PostgreSQL과 Flyway를 사용했다.

### 격리 PostgreSQL 실 왕복

- `ApprovalTemplateAttachmentIT`: 10 tests passed. settlement reference POST → PostgreSQL 첨부 저장 → `GET /admin/groupware/approval-references` 역방향 조회 roundtrip 포함.
- `SalesCommissionSettlementApprovalClaimIT`: 4 tests passed. V100 claim reserve/activate/release/renew 및 DB 상태 확인 포함.
- 테스트 종료 시 Hikari/Testcontainers 자원은 종료됐다.

### Desktop

```text
npm test                         PASS
npm run typecheck                PASS
npm exec vitest run src/renderer/api/mock.test.ts
152 passed, 2 skipped
```

### 직접 Live QA

Codex 내장 브라우저가 아닌 `clients/desktop`의 Playwright CLI와 headless Chromium 1217을 직접 사용했다. `/collab/stream`에 `networkidle` 대기를 사용하지 않았고, 파일 probe는 PNG 형식을 사용했다.

```text
playwright test --config=playwright.real-qa.config.ts \
  playwright/2026-08-11-dg1-s3-fix-real-qa/s3-fix-real-qa.spec.ts
9 passed
```

디렉토리와 파일명 모두 `-real-qa` 접미사를 유지했다. 정산 검색·선택·상세·인쇄 결과는 다음 산출물로 남겼다.

- `docs/qa/2026-08-11-dg7-rebase/01-settlement-search-result.png`
- `docs/qa/2026-08-11-dg7-rebase/02-settlement-selected.png`
- `docs/qa/2026-08-11-dg7-rebase/03-settlement-detail.png`
- `docs/qa/2026-08-11-dg7-rebase/04-settlement-print.png`

상세 캡처에서 업무 라벨 `영업수수료 정산서`와 문서번호 `2026/08/11-1`을 확인했다. 처음 발견된 `scroll 0→3` assertion은 실제 허용 계약인 `닫힘 또는 anchor 정렬`과 불일치해 assertion을 명세에 맞게 고쳤고, 이후 9/9로 재실행했다.

QA에 사용한 Vite 서버는 검증 후 종료했다. 공유 PostgreSQL 및 공유 서비스는 write하지 않았고, 공유 컨테이너는 중지하지 않았다.
