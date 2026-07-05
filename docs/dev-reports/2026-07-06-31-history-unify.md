# 2026-07-06 — #31 이력 일원화 (코멘트+버전이력·양방향 하이라이트) (PR 예정)

> 개발책임자 결정(2026-07-05): 협업 패널 = **코멘트 + 버전이력만**. "협업" 헤더·수정내역 섹션 제거. 버전이력↔변경 양방향 하이라이트.

## 스코프 (5 협업 패널·#30 후속)
EstimateCollaborationPanel·JournalCollaborationPanel·PartnerOrderCollaborationPanel·SlipCollaborationPanel·GroupwareApprovalCollaborationPanel:
1. **"협업"(h4) 섹션 헤더 제거** — 래퍼 라벨 없이 코멘트+버전이력만.
2. **수정내역(changeSet diff) 섹션 제거** — 버전이력으로 일원화(중복).
3. **버전이력 통합**: slip=SlipVersionHistoryPanel(SlipRevision·복원) 재사용. 타 도메인(견적/분개/주문/그룹웨어)=revision 데이터(EstimateRevision 등) 유무 정찰 → 있으면 동등 버전이력 패널·없으면 코멘트만+버전이력 후속 명기(도메인별 격차 정직 보고).
4. **양방향 하이라이트**: 버전이력 항목 클릭→해당 변경/코멘트 하이라이트, 반대(변경/코멘트 클릭→버전이력 하이라이트)도. 공유 highlight 상태.

## 구현

### 공통 UI 정리
- 5개 협업 패널에서 래퍼 제목 `협업`(h4)을 제거했다. 화면은 코멘트 섹션과 버전이력 섹션만 남긴다.
- 5개 협업 패널에서 `changeSet` 기반 `수정 이력`/diff 목록을 제거했다. 즉시 수정 폼은 유지하되, 저장 후 이력 표시는 도메인별 버전이력으로 일원화한다.
- 코멘트는 기존 등록/해결/삭제 동작을 유지한다. anchor가 있는 코멘트는 클릭/Enter/Space로 공유 highlight 상태를 갱신한다.

### 도메인별 버전이력 통합
| 도메인 | 적용 결과 | 정찰 결론 |
|---|---|---|
| Slip | `SlipVersionHistoryPanel`을 협업 패널 내부로 통합. `SlipRevision.fieldChanges` 기반 field-level highlight와 복원 버튼 유지. | full-snapshot revision/restore API와 fieldChanges가 존재해 가장 완전한 통합 가능. |
| Estimate | `EstimateVersionHistoryPanel`을 협업 패널 내부로 통합. 기존 상세 페이지의 별도 버전이력 중복 렌더 제거. | full-snapshot revision/restore API는 존재. 현재 FE revision 타입에는 fieldChanges가 없어 row-level highlight만 제공. |
| PartnerOrder | `PartnerOrderVersionHistoryPanel`을 협업 패널 내부로 통합. 기존 상세 페이지의 별도 버전이력 중복 렌더 제거. | full-snapshot revision/restore API는 존재. 현재 FE revision 타입에는 fieldChanges가 없어 row-level highlight만 제공. |
| Journal | 코멘트만 제공하고 `journal-version-history-gap` 후속 안내를 표시. | 확인 가능한 것은 `/accounting/journals/{id}/audit-logs` 감사 로그 계열이며, full-snapshot revision/restore API·패널은 없음. |
| GroupwareApproval | 코멘트만 제공하고 `groupware-approval-version-history-gap` 후속 안내를 표시. | `groupware_audit_logs` 계열은 있으나 결재 full-snapshot revision/restore API·패널은 없음. |

### 양방향 하이라이트
- `SlipVersionHistoryPanel`은 `activeRevisionNo`·`activeFieldPath`·`onRevisionSelect`를 받아 revision row와 field change row를 하이라이트한다.
- `EstimateVersionHistoryPanel`·`PartnerOrderVersionHistoryPanel`은 동일한 공유 상태 계약을 받되, fieldChanges 부재로 revision row 단위 하이라이트만 수행한다.
- 코멘트 anchor 클릭은 해당 fieldPath를 활성화한다. Slip은 fieldChanges와 fieldPath가 일치하면 버전이력 변경 항목도 같이 강조된다.
- 버전이력 row 클릭은 revision 번호를 활성화하고, 가능한 경우 연결 fieldPath 목록을 전달한다.

## 격차와 후속
- Journal/GroupwareApproval은 full-snapshot revision/restore 계약이 없어 이번 PR에서는 코멘트만 남긴다. 동등 버전이력은 백엔드 revision 테이블/API/복원 정책 결정 후 별도 슬라이스가 필요하다.
- Estimate/PartnerOrder는 버전이력 API가 있으나 field-level change payload가 없어 Slip 수준의 field 단위 양방향 매칭은 불가하다. 필요 시 revision DTO에 `fieldChanges` 또는 표준 diff payload를 추가해야 한다.
- 기존 collab edit API는 즉시 수정 저장 경로로 유지했다. 화면 이력 표시는 `changeSet diff`가 아니라 revision 패널로만 한다.

## 검증
- `cd clients/web/design-system && npm ci && npm run build`
  - desktop typecheck 전 `@samhan/design-system` file dependency의 `dist`가 없어 타입 해석이 실패해, 로컬 산출물을 먼저 생성했다.
- `cd clients/desktop && npm run typecheck` — PASS
- `cd clients/desktop && npx vitest run src/renderer/components/collab/` — PASS, 9 files / 35 tests
- `cd clients/desktop && VITE_MOCK_MODE=1 npx playwright test playwright/coedit-* playwright/slip-collab/`
  - PASS, 6 tests
  - 실행 방식: Vite dev server를 `127.0.0.1:53131`에 `--strictPort`로 별도 기동, `AUDIT_BASE_URL=http://127.0.0.1:53131`, `PLAYWRIGHT_SKIP_WEB_SERVER=1`, finally에서 서버 프로세스 정리.
  - `slip-collab-panel.spec.ts`의 기존 diff 목록 기대를 새 계약(버전이력 일원화)으로 갱신했다.

## Opus 5-agent 라운드1 fix (2026-07-06)

Opus 5-agent 라운드1(Design 중점·라이브 QA 16 스샷, `docs/qa/31-history-unify/`) 에서 BLOCKING
다수 확인 — FE 명확분(CI 자매spec·모바일라벨·PO중복·용어·토큰·Estimate/PO activeFieldPath)을
Opus 가 fix, 2건은 개발책임자 HOLD.

### fix 완료 (8건)

1. **CI 자매 spec 갱신(심각)** — `journal-collab-panel.spec.ts`·`partner-order-collab-panel.spec.ts`
   가 삭제된 testid(`journal-collab-edit-item`/`partner-order-collab-edit-item`)·문구("아직 수정
   이력이 없습니다.") 를 여전히 단언해 desktop-playwright 하드게이트 CI RED 확정 상태였다.
   `slip-collab-panel.spec.ts` 와 동일하게 "협업" 헤딩 부재 + `수정 이력` aria-label 부재 +
   `*-collab-edit-item` count 0 + 버전이력(PartnerOrder) / 격차 안내 카드(Journal) 로 갱신했다.
   부수적으로 동일 testid 를 참조하던 `-real-qa` 스펙 5개도 갱신했다
   (`journal-edit-collab-real-qa`·`partner-order-collab-real-qa`·`estimate-collab-real-qa`·
   `estimate-collab-codex-round`·`groupware-approval-collab-real-qa` — `dispatch-collab-*` 는
   #31 스코프 밖의 별개 기능(DispatchTaskDetailModal)이라 미해당·미변경).
2. **용어 통일** — `EstimateVersionHistoryPanel`·`PartnerOrderVersionHistoryPanel` 의 토스트·배지·
   복원 모달 문구 "rev N" → "버전 N" 으로 `SlipVersionHistoryPanel` 과 통일했다(7곳). 별도 도메인인
   `PartnerVersionHistoryPanel`(거래처 마스터, #31 스코프 밖) 은 미변경.
3. **모바일 "협업" 헤더 제거** — `SlipDetailPage`·`EstimateDetailPage`·`JournalDetailPage`·
   `SalesPartnerOrderDetailPage` 의 `MobileCollapsible title="협업 · 코멘트"` 를 `GroupwareApprovalCollaborationPanel`
   방식과 동일하게 `"코멘트"` 로 정정했다(4곳).
4. **모바일 "버전 이력" 라벨 소실 회귀** — `global.css` 의 `.mobile-section-body h4 { display: none }`
   블랭킷 규칙이 "코멘트" MobileCollapsible 안에 재중첩된 `*VersionHistoryPanel`/gap-notice 카드의
   내부 `<h4>버전 이력</h4>` 까지 지웠다. 다른 MobileCollapsible 내부 h4(예: GroupwareApproval "본문 ·
   세부 필드" 의 "내용"/"세부 필드") 는 계속 숨김 유지해야 하므로, 전체 선택자를 바꾸지 않고
   `[data-testid='...-version-history-panel'|'...-version-history-gap'] h4` 로 스코프를 한정해
   5개 testid(Slip/Estimate/PartnerOrder/Journal/GroupwareApproval) 만 되살렸다(CSS-only, TSX 무변경).
5. **PO 상세 "수정 이력" 카드 중복 제거** — `SalesPartnerOrderDetailPage` 의 데스크톱+모바일에 남아있던
   `auditQuery`(`partnerOrderAuditApi.listAuditLogs`) 기반 구식 "수정 이력" 카드 2곳을 제거하고
   `PartnerOrderCollaborationPanel`(내장 `PartnerOrderVersionHistoryPanel`) 로 완전히 일원화했다.
   더 이상 아무도 참조하지 않는 `auditQuery`/`partnerOrderAuditApi` import·
   `PARTNER_ORDER_EDIT_AUDIT_EMPTY_TEST_ID`/`_TIMELINE_TEST_ID` 상수·5곳의 orphan
   `invalidateQueries(['partner-order', id, 'audit-logs'])` 호출(update/hold/release/onCommitted×2)
   도 함께 정리했다. (동일 항목 처리 중 모바일 `MobileCollapsible` 타이틀도 "코멘트" 로 바뀌어 3번
   항목과 자연히 겹친다.)
   - **sweep 메모(범위 외 관찰, 미조치)**: `SlipDetailPage` 모바일에도 유사한 별도 "수정 이력"
     `MobileCollapsible`(`auditLogsQuery` 기반) 이 남아 있으나, 이는 헤더 "수정 N회" 배지 +
     데스크톱 "복원..." select(`slip-detail-revert-select`) 까지 공유하는 훨씬 광범위한 기존
     PR-H2 서브시스템의 일부라 격리 난이도가 PartnerOrder 사례와 다르다. 이번 "명확분" fix
     스코프(8건) 에 명시되지 않아 손대지 않았다 — 별도 확인 후 처리 권고.
6. **Estimate/PartnerOrder `activeFieldPath` dead prop → row highlight 연동** —
   `EstimateVersionHistoryPanel`·`PartnerOrderVersionHistoryPanel` 이 `activeFieldPath` prop 을
   받기만 하고 destructure 하지 않아(문서에도 "보존 전달용" 이라 명시) 코멘트→버전이력 하이라이트
   방향이 완전히 죽어 있었다. 두 컴포넌트 모두 revision 별 field-level 변경 목록이 API 에 없어(
   `EstimateRevision`/`PartnerOrderRevision` 에 `fieldChanges` 없음 — Slip 과 다름) field 단위
   정확 매칭은 불가하므로, `activeFieldPath` 가 설정되면 "현재" 값을 담은 최신(latest) revision
   행만 근사적으로 하이라이트하는 row-level 방식으로 실제 연동했다(dead prop 해소). 코드 주석으로
   한계와 후속(개발책임자 확인 시 `fieldChanges` 추가 후 Slip 과 동일 로직으로 교체) 을 명시했다.
7. **토큰 정정** — (a) `EstimateVersionHistoryPanel`·`SlipVersionHistoryPanel` 토스트 스타일의
   `--color-success-300`/`--color-success-800` 는 design-system 에 존재하지 않는 토큰(실제 스케일:
   `-50/-200/-500/-600/-700`) 이라 항상 폴백 hex 만 렌더되고 있었다 — 실재하는 `--color-success-200`/
   `--color-success-700` 로 교체(폴백 hex 도 실 토큰값 `#a7f3d0`/`#047857` 로 동기화). (b) 3개 파일의
   버전이력 row highlight `boxShadow` 가 참조하는 `--color-warning-500` 은 실재 토큰이지만 폴백 hex
   가 `#D97706`(구식/틀림) 이었다 — 실제 정의값 `#E9A53D` 로 정정. (c) `PartnerOrderRevision.actorColor`
   필드가 API 에 존재함에도 미사용이었다 — `presenceColorToHex` 로 Slip 과 동일하게 수정자 이름 색상에
   반영(actor 없으면 neutral-600 유지). `EstimateRevision` 은 애초 actorColor 필드 자체가 없어 해당 없음.
8. **ARIA** — 5개 협업 패널(Slip/Estimate/Journal/PartnerOrder/GroupwareApproval) 의 코멘트
   `<article>` 에 `role={fieldPath ? 'button' : undefined}` + `aria-current={highlighted ? 'true' :
   undefined}` 를 추가했다(anchor 있는 코멘트만 상호작용 가능하므로 role 도 그때만 부여).

### ⏸ 개발책임자 HOLD (fix 아님 — 확인 대기)

- **무결성(회계전표/결재) 도메인**: (a) Journal/GroupwareApproval 의 "버전 이력" 격차 안내 카드가
  "현재 확인 가능한 것은 감사 로그(audit-logs) 단위 이력" 이라고 적고 있으나, 실제로 이번 화면에서
  감사 로그를 조회할 수 있는 UI/연결은 없다(오기술). (b) 기존에 존재하던 `.../collab/edits` 기반
  "수정 이력"(changeSet diff) 뷰가 이번 PR 에서 대체 없이 삭제된 것은 3도메인(Slip/Estimate/
  PartnerOrder) 순증 대비 2도메인(Journal/GroupwareApproval) 순감의 회귀다. 권장안은 "보수적으로
  복구(수정이력 유지)" 이나, 완전제거 vs 유지 여부는 회계/결재 무결성 정책 확인이 선행돼야 하는
  사안([[integrity-domain-policy-preconfirm]]) 이라 **이번 라운드에서는 코드를 건드리지 않았다** —
  개발책임자 확인 후 별도 처리 필요.
- **코멘트→버전이력 anchor 생성 UX**: 현재 코멘트 작성 UI 에는 특정 필드에 anchor 를 부여하는 입력
  수단이 없다(anchor 는 seed/mock 데이터에만 존재). 따라서 "버전이력 클릭→코멘트 하이라이트" 방향은
  동작하지만, "코멘트 작성 시 필드 anchor 지정→코멘트 클릭→버전이력 하이라이트" 방향은 사용자가
  실제로 만들 수 있는 anchor 가 없어 5도메인 전부 실사용 불가 상태다. 설계 결정(anchor 선택 UI 형태)
  이 필요해 이번 라운드는 명기만 하고 구현하지 않았다.

### 검증 (Opus fix 라운드)

- `cd clients/web/design-system && npm run build` — PASS.
- `cd clients/desktop && npm run typecheck` — PASS (exit 0, tsconfig.node + tsconfig.web 모두).
- `cd clients/desktop && npm run lint` — 0 errors / 31 warnings(전부 기존, 본 라운드 변경 파일과 무관).
- `cd clients/desktop && npx vitest run src/renderer/components/collab/` — PASS, 9 files / 35 tests.
- `cd clients/desktop && VITE_MOCK_MODE=1 npx playwright test playwright/coedit-* playwright/slip-collab/
  playwright/journal-collab/ playwright/partner-order-collab/` — **PASS, 14/14**.
  - 실행 방식: 기존 5173 재사용 대신 신규 포트 5471 에 `--strictPort` 로 dev server 단독 기동
    (`PLAYWRIGHT_SKIP_WEB_SERVER=1` + `AUDIT_BASE_URL=http://127.0.0.1:5471`), 실행 후 프로세스 종료 확인.
  - `playwright/coedit-*` 글롭은 실제로 매치되는 최상위 디렉터리가 없다(코드젝트 관례상
    `coedit-s2a.shots.spec.ts` 는 `playwright/slip-collab/` 안에 존재) — no-op 이며
    `playwright/slip-collab/` 지정만으로 이미 포함되어 14/14 에 반영됨.

## Opus 재수렴 fix — CI 하드게이트 자매 spec 협소 sweep 완결 (2026-07-06)

### 근본원인

라운드1 fix(위 §1)의 "CI 자매 spec 갱신"이 `journal-collab-panel.spec.ts`·
`partner-order-collab-panel.spec.ts`(+ 동일 testid 참조 `-real-qa` 5개)만 갱신하는
**협소 sweep** 이었다. 용어 통일(rev N→버전 N)·PO 상세 "수정 이력"(`partner-order-edit-audit-timeline`)
제거가 실제로 깨뜨린 legacy 자매 spec — `estimate-version-history`·`phase-2-4-partner-order-restore`·
`sp-08-4-2-partner-order-edit-put` — 는 sweep 대상에서 빠져 desktop-playwright 하드게이트(mock 회귀)
CI 에서 6 테스트 RED 로 확정됐다(PR #747 CI 실행 `28752043088`/job `85252763985`).

### fix — 전수 grep 기반 재sweep (3 파일)

전 `playwright/` spec 대상 `'rev '`(공백 포함 — 실제 UI 텍스트 리터럴, `rev1`/`rev2`/`rev3` 같은
fixture 내부 shorthand 주석은 비대상) 및 삭제된 testid(`partner-order-edit-audit-timeline`·
`journal-collab-edit-item`·`partner-order-collab-edit-item`·"아직 수정 이력이 없습니다") 전수 grep 결과:

1. **`estimate-version-history/estimate-version-history.spec.ts`** — restore 성공 toast 단언
   `'rev 1'` → `'버전 1'` (1곳 + 주석 1곳). `EstimateVersionHistoryPanel` 은 라운드1 에서 이미
   "rev N"→"버전 N" 으로 갱신됐으나 이 spec 은 sweep 에서 누락돼 있었다.
2. **`phase-2-4-partner-order-restore/phase-2-4-partner-order-restore.spec.ts`** — RESTORE 배지
   source 표시·복원 confirm modal·복원 성공/경고 toast(시나리오 1/2/3/7, 4곳 assertion + 2곳
   주석) 전부 `'rev 1'` → `'버전 1'`. `PartnerOrderVersionHistoryPanel` 도 동일하게 라운드1 에서
   이미 갱신됐으나 이 spec 이 sweep 누락.
3. **`sp-08-4-2-partner-order-edit-put/sp-08-4-2-partner-order-edit-put.spec.ts`** — T4 를
   완전히 재작성. 구 계약(`SalesPartnerOrderDetailPage.tsx` 인라인 `auditQuery`/
   `partnerOrderAuditApi`/`partner-order-edit-audit-timeline`/`entry.actorName`/`entry.field`)
   은 라운드1 §5 에서 이미 코드상 삭제되어 있었으나 spec 은 구 계약을 계속 단언해 RED 였다.
   신 계약(상세 페이지→`PartnerOrderCollaborationPanel`→내장
   `PartnerOrderVersionHistoryPanel`→`partnerOrderRevision.ts`(`listPartnerOrderRevisions`,
   `/revisions`))을 검증하도록 파일 4종(page/collabPanel/versionHistoryPanel/revisionApi) 교차
   read 로 재작성 — actor(`rev.actorName`)·time(`formatLocalDateTime(rev.createdAt)`)·
   변경요약(`formatChangeSummary(rev)`) 렌더 확인 + 구 testid/식별자 부재(`not.toContain`) 가드.

**스코프 밖 미변경**: `PartnerVersionHistoryPanel`(거래처마스터, `partner-version-history.spec.ts`)
과 `dispatch-collab-*`(revision API 자체가 없어 `rev ` 패턴 무매치)는 이번 PR 이 건드리지 않은
별개 컴포넌트/도메인이라 grep 확인만 하고 미수정.

### 검증 — CI 동일 전수 실행 (재발 방지)

- `cd clients/desktop && npm run typecheck` — PASS (exit 0).
- `cd clients/desktop && npx vitest run` — **PASS, 90 files / 616 tests**.
- 신규 포트(5480→최종 5173 재확인, `--strictPort`)에 `VITE_MOCK_MODE=1` dev server 단독 기동
  (`PLAYWRIGHT_SKIP_WEB_SERVER=1`) 후 3단계 확인:
  1. 수정 3 spec 단독 실행(`estimate-version-history`·`phase-2-4-partner-order-restore`·
     `sp-08-4-2-partner-order-edit-put`) — **16/16 PASS**(RED 였던 6건 전부 GREEN 전환 확인).
  2. 인접 영향 디렉터리(`journal-collab`·`partner-order-collab`·`partner-version-history`·
     `slip-collab`·`slip-version-history`) — **17/17 PASS**(라운드1 fix 유지 + 스코프 밖 컴포넌트
     무회귀 확인).
  3. **CI 와 동일 전수 실행**(`testIgnore` 제외 전체 560개, `CI=1`로 workers=2·retries=1·
     reporter(line+json)까지 CI 설정 그대로 재현) — **560 passed, 0 failed, 0 skipped, 0 flaky**
     (`duration` 약 5.2분). `node scripts/assert-playwright-ran.mjs` false-green 2차 방어 가드도
     실제 산출된 `playwright-json/results.json` 로 재실행해 `expected=560 unexpected=0 skipped=0
     flaky=0` exit 0 확인 — CI 하드게이트가 실제로 요구하는 두 단계(테스트 실행 + 가드) 모두 로컬
     재현·GREEN.
  - 최초 8-worker 로컬 실행에서 `admin-hr-guard.spec.ts`/`sidebar-disabled.spec.ts` 가 5 실패/5
    스킵으로 나타났으나, 두 spec 이 `AUDIT_BASE_URL` 이 아닌 **자체 `HR_BASE_URL`**(기본값
    `localhost:5173`) 을 참조해 비표준 포트(5480)를 못 찾은 로컬 하네스 false-RED 로 확인 —
    dev server 를 표준 기본 포트(5173)로 재기동한 재실행에서 0 실패로 해소(코드 변경 아님,
    이번 PR 스코프와 무관한 관찰 사항으로 별도 조치 없음).
- 테스트 실행 중 `sp-d4-remaining-pages-permission-migration/screenshots/`·`docs/qa/**` 등 커밋된
  스크린샷 128개가 실행 부작용으로 로컬 재캡처돼 diff 로 나타났다 — 이번 PR 스코프 밖이므로 HEAD
  커밋 content 로 전부 원복하고 신규 생성분(`T09-*.png`) 1건은 삭제해 최종 diff 를 spec 3개로
  한정했다.

## 개발책임자 2결정 구현 (2026-07-06, Opus)

> 위 "⏸ 개발책임자 HOLD" 2건에 대한 확인 지시 반영. worktree `feat/31-history-unify`(HEAD
> `41d791d21`)에서 Opus 가 직접 구현. git 동작(commit/push)은 PM 이 대행.

### 결정1 — 회계전표/결재 수정이력 현행 유지(복구)

Journal/GroupwareApproval 은 여전히 full-snapshot revision/restore API 가 없어 Slip/Estimate/
PartnerOrder 수준의 버전이력 패널 도입은 불가능하다는 판단은 유지한다. 다만 #31 라운드1에서 버전이력
패널과 **함께 삭제됐던** `.../collab/edits` 기반 "수정 이력"(changeSet before/after diff, 1인
수정완료 모델) 뷰는 복구한다. 최종 형태 = **코멘트 + 수정이력**(버전이력이 아님을 명시).

- `JournalCollaborationPanel.tsx`/`GroupwareApprovalCollaborationPanel.tsx`: `getJournalCollabEdits`/
  `getGroupwareApprovalCollabEdits` 호출과 `editQueryKey` 기반 `useQuery` 를 재도입했다. 삭제됐던
  `normalizePath`/`labelForPath`/`summarizeChangeSet`/`parseChangeSetDiffs` 헬퍼를 복원하고, 새로
  `fieldPathTestId` 헬퍼(Slip 의 `fieldPathTestId` 패턴과 동일)를 추가했다. commit mutation 의
  `onSuccess`·realtime(SSE) invalidate 경로 모두에 `editQueryKey` 를 추가해 수정완료/타 세션 이벤트
  직후 수정 이력이 갱신되도록 했다.
- 하단 "버전 이력" 격차 안내 카드(`journal-version-history-gap`/`groupware-approval-version-history-gap`,
  "감사 로그 확인 가능" 오기술 포함)를 완전히 제거하고, `Card as="section" aria-label="수정 이력"`
  으로 렌더되는 `journal-collab-edit-history-panel`/`groupware-approval-collab-edit-history-panel`
  로 대체했다 — `journal-collab-edit-list`/`groupware-approval-collab-edit-list`(각 diff 항목은
  `*-collab-edit-item`) 테스트id 를 복구했다.
- 타 3도메인(Slip/Estimate/PartnerOrder)은 무변경 — 코멘트+버전이력 그대로.
- 부수 회귀 방지: `global.css` 의 모바일 `.mobile-section-body h4` 노출 예외 선택자가 옛 gap
  testid 를 참조하고 있어(#31 라운드1 fix#4), 새 edit-history-panel testid 로 갱신하지 않으면
  모바일에서 "수정 이력" 제목이 다시 사라지는 회귀가 재발했을 것이다 — 4개 도메인(Slip/Estimate/
  PartnerOrder/Journal)+Groupware(현재 무의미하지만 대칭성 유지)를 모두 갱신했다. (Groupware 결재
  협업 패널은 애초 `MobileCollapsible` 로 감싸이지 않아 이 선택자가 실질적으로 no-op 임을 라우트
  파일 대조로 확인했다.)

### 결정2 — 코멘트→버전이력 anchor 생성 UX(완전 양방향)

5개 협업 패널(Slip/Estimate/PartnerOrder/Journal/GroupwareApproval) 코멘트 입력 영역에 "연결 필드"
`<Select>`(`@samhan/design-system`, `selectSize="sm"`, 기존 편집 폼의 "라벨 위 컨트롤"
`display:grid` 관례를 재사용)를 신설했다. 첫 옵션은 "전체 코멘트"(anchor 미지정, `""` → 전송 시
`undefined`)이고, 이어서 도메인별 옵션이 붙는다:

| 도메인 | anchor 옵션 |
|---|---|
| Slip | 기존 export `OVERLAY_FIELD_OPTIONS`(11종) 그대로 재사용 |
| Journal | 적요(`description`) + N번 라인 메모(`line.N.memo`, `lines` 배열 기반 동적) |
| Estimate | 비고(`memo`)·유효기간(`validUntil`) + N번 라인 메모(`line.N.note`, 동적) |
| PartnerOrder | 요청사항(`memo`)·납기(`dueDate`) + N번 라인 비고(`line.N.remark`, 동적) |
| GroupwareApproval | 제목(`title`)·내용(`content`) + 템플릿 동적 필드(`field.{fieldKey}`, 템플릿 라벨) |

- `addXxxCollabComment` mutation 의 인자를 `body: string` 단일값에서 `{ body, anchor? }` 객체로
  바꿔 선택된 anchor 를 그대로 BE 로 전송한다. BE `AddXxxCollabCommentRequest.anchor` 는 5개
  서비스(accounting/groupware/partner-order/slip/estimate) 전부 이미 지원하고 있었고
  (`@Size(max = CollabCommentRecord.MAX_ANCHOR_LENGTH)`), FE API client(`AddXxxCollabCommentInput`)
  도 이미 `anchor?: string` 를 갖고 있었다 — 배선(패널 컴포넌트의 mutation 호출)만 누락된 상태였다.
  등록 성공 시 `commentAnchor` 상태도 `commentBody` 와 함께 초기화한다.
- 양방향 하이라이트: Slip/Estimate/PartnerOrder 는 #31 라운드1 산출물인 공유 `activeFieldPath`/
  `activeRevisionNo`/`onRevisionSelect` 상태를 그대로 재사용한다 — "코멘트 클릭→버전이력 하이라이트"
  방향은 이미 배선돼 있었고 결정2 는 "anchor 를 실제로 만들 수 있는 입력 수단"만 신설했으므로 추가
  배선이 필요 없다. Journal/GroupwareApproval 은 결정1 로 복구한 수정 이력의 각 diff 행에
  `role="button"`+`tabIndex={0}`+`onClick={() => setActiveFieldPath(diff.fieldName)}`
  (`data-testid="*-collab-edit-change-{fieldPathTestId}"`)를 부여해 동일한 `activeFieldPath`
  공유 상태를 소비하도록 배선했다 — 코멘트 anchor 클릭 ↔ 수정 이력 diff 클릭 양방향 하이라이트가
  완성됐다(5도메인 일관).
- 모바일: 새 `<Select>` 는 코멘트 textarea 위에 독립된 한 행으로 배치했다(그리드/코멘트 리스트 등
  기존 레이아웃에 침습 없음). 별도 플랫폼 분기(`VITE_PLATFORM`)는 두지 않았다 — 반응형 CSS 만으로
  충분하다고 판단.

### 검증

- `cd clients/web/design-system && npm run build` — PASS.
- `cd clients/desktop && npm run typecheck` — PASS (exit 0).
- `cd clients/desktop && npx eslint <5개 패널 + 5개 coedit test 파일>` — 0 errors.
- `cd clients/desktop && npx vitest run src/renderer/components/collab/` — **PASS, 9 files / 42
  tests**(#31 라운드1 대비 +7: Journal 결정1 복구+양방향+anchor 등록 3건 신규, Groupware 동형 3건
  신규, Slip/Estimate/PartnerOrder 각 anchor 등록 1건씩 신규 — 기존 35건은 무회귀).
- `cd clients/desktop && npx vitest run src/renderer/api/mock.test.ts` — PASS, 44 tests(anchor
  pass-through 는 이미 mock 이 지원하고 있어 무변경 확인).
- CI 동일조건(`CI=1`→workers=2·retries=1, 신규 포트+`--strictPort`+`PLAYWRIGHT_SKIP_WEB_SERVER=1`)
  playwright 4 단계:
  1. 갱신 spec 단독(`journal-collab-panel.spec.ts`, 결정2 anchor 테스트 2건 신규 포함) — **5/5 PASS**.
  2. 인접 영향 5 디렉터리(`partner-order-collab`·`slip-collab`·`estimate-version-history`·
     `phase-2-4-partner-order-restore`·`sp-08-4-2-partner-order-edit-put`) — **27/27 PASS**(무회귀).
  3. **전수 1차**(testIgnore 제외 562개, 신규 비표준 포트) — 552 passed + `admin-hr-guard`/
     `sidebar-disabled` 10건 실패·스킵. 두 spec 이 `AUDIT_BASE_URL` 이 아닌 **자체 `HR_BASE_URL`**
     (기본값 `localhost:5173`) 을 하드코딩 참조해 비표준 포트를 못 찾은 로컬 하네스 false-RED —
     #31 라운드1 dev-report 에 이미 문서화된 동일 현상(이번 PR 무관, 코드 변경 아님)임을
     `list` reporter 단독 재실행으로 재확인.
  4. **전수 2차 — 표준 포트(5173) 재기동 재확인**: (a) `--reporter=line` 단독 실행 — **562 passed,
     0 failed, 0 skipped (5.3분)**, 프로세스 exit 0. (b) CI 와 완전히 동일한 커맨드(`npx playwright
     test`, 옵션 없음 → config 기본 리포터 `line+json+html`) 재실행 — **561 passed + 1 flaky**
     (`sales-query-page.spec.ts` TC-S1, 원인 `net::ERR_NO_BUFFER_SPACE` — 동일 세션에서 대형
     playwright 스위트를 반복 실행하며 누적된 Windows 소켓 자원 고갈로 인한 일과성 네트워크
     인프라 문제이며 회계/그룹웨어/코멘트 anchor 와 무관, retry #1 에서 정상 통과), 프로세스
     exit 0. `node scripts/assert-playwright-ran.mjs` false-green 2차 방어 가드
     `expected=561 unexpected=0 skipped=0 flaky=1` exit 0 확인(가드는 flaky 를 실패로 보지 않음 —
     CI 도 동일). CI 하드게이트가 실제로 요구하는 두 단계(테스트 실행+가드) 모두 로컬 재현·GREEN.
- 실행 부작용 PNG(`docs/qa/**`·`sp-d4-.../screenshots/**` 등)와 신규 캡처 스크린샷 1건은
  `git checkout --`/삭제로 원복해 최종 diff 를 spec/src/dev-report 로 한정했다.
