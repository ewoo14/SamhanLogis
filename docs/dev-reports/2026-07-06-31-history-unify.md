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

## PR #747 재수렴 QA[HIGH]+Design[LOW] fix (2026-07-06, Opus)

> worktree `feat/31-history-unify`(fix 착수 HEAD `70d5863a2`)에서 Opus 가 직접 구현. git 동작
> (commit/push)은 PM 이 대행.

### 근본원인 (HIGH) — Slip 코멘트 anchor ↔ 버전이력 fieldPath 접두사 불일치

`SlipCollaborationPanel.tsx` 의 `OVERLAY_FIELD_OPTIONS`(11 overlay 필드)는 코멘트 anchor 를
접두사 없이 저장/전송한다(예: `"memo"`, `"shippingAddress"`). 반면 BE
`SlipRevisionService.HEADER_FIELDS` 는 헤더 필드 fieldPath 를 전부 `"header."` 접두사로 응답한다
(예: `"header.memo"`) — 이 11개 overlay 필드도 예외 없이 포함된다. `SlipVersionHistoryPanel.tsx`
의 `normalizeFieldPath()`(fieldPath 목록 생성·activeFieldPath 정규화 공용)와
`SlipCollaborationPanel.tsx` 의 `normalizeCollabAnchor()`(코멘트 anchor 정규화) 어느 쪽도 이
접두사 차이를 정합화하지 않아, `fieldPaths.includes(normalizedActiveFieldPath)` 비교가 11개
overlay 필드 전량에서 실패했다 — **코멘트→버전이력, 버전이력→코멘트 양방향 모두 완전
비동작**이었다(#31 라운드1/재수렴 dev-report 가 "이미 배선돼 있다"고 잘못 기술한 부분).

### fix — normalizeFieldPath 1곳에 접두사 strip 추가

`SlipVersionHistoryPanel.tsx` 의 `normalizeFieldPath()` 에 `.replace(/^header\./, '')` 를
추가했다:

```ts
function normalizeFieldPath(path: string | null | undefined): string {
  return (path ?? '').replace(/^\/+/, '').replace(/\//g, '.').replace(/^header\./, '')
}
```

이 함수 하나가 (1) 버전이력 필드변경 목록(`fieldPaths`) 생성, (2) `activeFieldPath` prop
정규화(코멘트 anchor 유래 값 포함), (3) 개별 필드변경 클릭 시 `onRevisionSelect` 콜백에 넘기는
`normalized` 값 계산 — 3곳 전부에 공용으로 쓰이므로, 한 번의 수정으로 정방향(코멘트 클릭→버전이력
하이라이트)·역방향(버전이력 클릭→코멘트 하이라이트) 이 모두 정합됐다.

**정방향/역방향 중 "fieldPath 쪽 strip" 을 택한 근거** (anchor 쪽에 `"header."` 를 붙이는 대신):
BE 코멘트 anchor 필드는 자유 문자열 계약(`@Size(max=...)`)이라 실제 저장/전송되는 anchor 값을 바꾸지
않는 편이 기존에 이미 등록된 코멘트 anchor 값 및 향후 다른 anchor 소비처(예: 알림, 검색)에 영향이
없다. 라인 fieldPath(`lines[0].quantity`, `lines.removed[0].productName` 등)는 애초 `"header."`
접두사가 없어 이 strip 이 영향을 주지 않는다. 타 4도메인(Estimate/PartnerOrder=row-level 근사
하이라이트, Journal/GroupwareApproval=코멘트 anchor 와 changeSet 키가 완전히 동일한 문자열을 쓰는
client-side 자기정합 계약)은 `SlipVersionHistoryPanel.normalizeFieldPath` 를 참조하지 않아
무영향을 코드 read 로 확인했다.

### LOW — 연결 필드 Select `aria-label` 통일

`SlipCollaborationPanel`·`JournalCollaborationPanel`·`PartnerOrderCollaborationPanel` 의 "연결
필드" `<Select>` 에 `aria-label="코멘트 연결 필드"` 를 추가했다(`data-testid` 바로 다음, 기존
Estimate/GroupwareApproval 과 동일한 속성 순서) — `EstimateCollaborationPanel`·
`GroupwareApprovalCollaborationPanel` 은 이미 보유하고 있어 이번으로 5패널 전부 일관됐다.

### 테스트 강화 (재발방지 — "이번 버그가 getByTestId 만 봐서 누락"에 대한 대응)

1. **`SlipVersionHistoryPanel.test.tsx` 신규 2건** — 실제(un-mocked) 컴포넌트에 BE 응답 shape 그대로
   (`fieldPath: "header.memo"`) 주입: (a) 접두사 없는 `activeFieldPath="memo"`(코멘트 anchor 유래
   값 재현) 가 `header.memo` 필드변경 + 해당 revision 행을 `data-active="true"` 로 하이라이트하고,
   매칭 안 되는 다른 필드(`lines[0].quantity`)는 하이라이트하지 않음(정방향). (b) 필드변경 클릭 시
   `onRevisionSelect` 콜백에 접두사 제거된 `["memo"]` 가 전달됨(역방향). **fix 를 임시로 되돌려
   재실행 — 신규 4건(본 파일 2 + history-bridge 2, 아래) 전부 RED 확인 후 fix 복원 → 8/8 GREEN
   재확인**해 진짜 회귀가드임을 검증했다.
2. **`SlipCollaborationPanel.history-bridge.test.tsx`(신규 파일)** — 기존
   `SlipCollaborationPanel.coedit.test.tsx` 는 `SlipVersionHistoryPanel` 전체를 stub 처리해
   `activeFieldPath` prop 을 그대로 echo 하므로 `normalizeFieldPath` 자체가 검증 대상에서 빠진다
   (이번 버그를 놓친 근본 원인 — "getByTestId 존재만 확인"). 본 파일은 `SlipVersionHistoryPanel`
   을 stub 하지 않고 두 실컴포넌트를 그대로 조립해, 코멘트 등록(anchor=memo)→클릭→
   `slip-version-history-change-header-memo` `data-active='true'`(정방향), 그 반대 클릭→코멘트
   `data-active='true'`+`aria-current='true'`(역방향)를 검증한다. anchor 없는 코멘트는 두 방향
   모두 하이라이트되지 않음도 함께 확인.
3. **`playwright/slip-collab/slip-collab-panel.spec.ts` 신규 e2e 1건** — 라이브(mock) 브라우저
   (Chromium, `VITE_MOCK_MODE=1`)에서 실제 화면으로 동일 시나리오 재현: "연결 필드" Select 에서
   메모 선택→코멘트 등록→클릭→`header.memo` 버전이력 항목 `data-active='true'`(+같은 revision 행도
   하이라이트), 그 항목 클릭→코멘트 `data-active='true'`+`aria-current='true'`(역방향). CI mock
   하드게이트 스위트에 영구 편입되어 563번째 spec 이 됐다.
4. **5도메인 필드매칭 계약 재확인** — Journal/GroupwareApproval 은 changeSet 키가 코멘트 anchor 와
   동일 문자열을 쓰는 client-side 자기정합 계약이라(BE prefix 미개입) 기존
   `*.coedit.test.tsx` 의 실컴포넌트 기반 양방향 `data-active` 단언이 이미 유효함을 코드 read 로
   재확인했다(변경 불필요). Estimate/PartnerOrder 는 revision API 에 field-level payload 자체가
   없어 row-level 근사 하이라이트가 설계된 계약이고(JSDoc 명시), 기존 stub 기반 테스트가 그 계약을
   그대로 검증 중이라 역시 변경하지 않았다.

### 검증

- `cd clients/desktop && npm run typecheck` — PASS.
- `cd clients/desktop && npm run lint` — 0 errors / 32 warnings(기존 31 + 신규 1건은 fixture
  `as any` — 같은 파일의 기존 관례와 동일 패턴이라 별도 타입 도입 대신 유지).
- `cd clients/desktop && npm run build` — PASS(electron-vite build + build:legacy).
- `cd clients/desktop && npx vitest run src/renderer/components/collab/ src/renderer/components/audit/`
  — **PASS, 12 files / 51 tests**.
- `cd clients/desktop && npx vitest run`(전체) — **PASS, 91 files / 627 tests**.
- CI 동일조건(`CI=1`→workers=2·retries=1, config 기본 webServer 자동기동·표준 포트 5173,
  `npx playwright test` 옵션 없음) — **563 passed, 0 failed, 0 skipped, 0 flaky (5.5분)**.
  `node scripts/assert-playwright-ran.mjs` → `expected=563 unexpected=0 skipped=0 flaky=0` exit 0.
  (563 = 직전 세션 확인된 562 + 이번 신규 e2e 1건.)
- 실행 부작용 PNG 128건은 `git checkout --` 로 원복, 신규 캡처 1건(`T09-dispatch-inventory-
  warehouse-allow.png`)은 삭제 — 최종 diff 를 spec 1(수정)+src 5(수정)+test 2(1신규 1수정)+
  dev-report 로 한정했다.

## PR #747 Codex 라운드 [HIGH] fix (2026-07-06, Codex)

> worktree `feat/31-history-unify`(fix 착수 HEAD `645c310c7`)에서 Codex가 직접 구현. 개발책임자 지시대로 git 동작(commit/push/status 포함)은 수행하지 않았다.

### 근본원인 — Estimate/PartnerOrder 최신 버전행 → 코멘트 역방향 하이라이트 누락

`EstimateVersionHistoryPanel`과 `PartnerOrderVersionHistoryPanel`은 revision DTO에 field-level diff가 없어 행 클릭 시 `onRevisionSelect(revNo, [])`만 전달했다. 상위 `EstimateCollaborationPanel`/`PartnerOrderCollaborationPanel`은 `fieldPaths?.[0] ?? null`을 `activeFieldPath`로 저장하므로, 버전 최신 행을 클릭해도 코멘트 렌더 조건(`comment.anchor` 정규화값 === `activeFieldPath`)이 항상 false가 됐다.

Slip은 `fieldChanges`가 있어 field 단위 정밀 매핑이 가능하지만, Estimate/PartnerOrder는 현재 BE/DTO 한계상 field 단위 역방향 매핑을 만들 수 없다. 따라서 개발책임자 결정대로 **행-단위 대칭 근사**만 적용했다.

### fix — 최신 row 선택 메타 + anchored comment 전체 하이라이트

- `EstimateVersionHistoryPanel`/`PartnerOrderVersionHistoryPanel`의 `onRevisionSelect`에 선택 row가 최신인지 나타내는 `meta.isLatest`를 추가 전달했다.
- `EstimateCollaborationPanel`/`PartnerOrderCollaborationPanel`에 `activeRevisionIsLatest` 상태를 추가했다.
- 코멘트 하이라이트 조건을 `activeFieldPath` 일치 OR `activeRevisionNo != null && activeRevisionIsLatest && comment.anchor 정규화값 존재`로 확장했다.
- 최신 revision row 클릭: anchored 코멘트 전부 `data-active="true"`.
- 구 revision row 클릭: field 매핑이 없으므로 코멘트 하이라이트 없음.
- 코멘트 클릭 정방향은 기존처럼 `activeFieldPath`를 설정하므로 최신 revision row 하이라이트를 유지한다.
- Slip(field 정밀), Journal/GroupwareApproval(changeSet diff 정밀)는 무변경.

### 테스트 강화 — stub 맹점 보완

신규 테스트 2개를 추가했다.

- `clients/desktop/src/renderer/components/collab/EstimateCollaborationPanel.history-bridge.test.tsx`
- `clients/desktop/src/renderer/components/collab/PartnerOrderCollaborationPanel.history-bridge.test.tsx`

두 테스트 모두 실제 `*VersionHistoryPanel`을 조립하고 API만 mock한다. 최신 row 클릭 시 anchored 코멘트 2건이 모두 `data-active="true"`가 되는지, anchor 없는 코멘트는 제외되는지, 구 row 클릭 시 anchored 코멘트 하이라이트가 해제되는지를 검증한다.

RED/GREEN 확인:

- production fix 전 신규 테스트 단독 실행: 2 files / 2 tests 모두 RED. 실패 원인은 `expected null to be 'true'`로, 최신 row는 active가 됐지만 코멘트 `data-active`가 null인 원래 결함과 일치했다.
- production fix 후 동일 테스트 단독 실행: 2 files / 2 tests PASS.

### 검증

- `cd clients/desktop && npm run typecheck` — PASS.
- `cd clients/desktop && npx vitest run src/renderer/components/collab/ src/renderer/components/audit/` — PASS, 14 files / 53 tests.
- CI 동일조건 Playwright mock gate — PASS, 563 passed / 0 failed / 0 skipped / 0 flaky.
  - 실행 방식: Vite를 `127.0.0.1:5173 --strictPort`로 별도 기동, `CI=1`, `PLAYWRIGHT_SKIP_WEB_SERVER=1`, `AUDIT_BASE_URL=http://127.0.0.1:5173`, `npx playwright test`.
  - `node scripts/assert-playwright-ran.mjs` — `expected=563 unexpected=0 skipped=0 flaky=0`, exit 0.
  - 주의: 전체 Playwright 내 기존 screenshot spec 실행으로 `docs/qa` PNG 130개의 filesystem `LastWriteTime`이 갱신됐다. 개발책임자 지시의 git 금지 조건 때문에 git diff/status 및 PNG 원복은 수행하지 않았다.

## PR #747 최종 Opus 재수렴 fix — 문서번호 계약 위반[Critical]+Slip 다중필드 역방향 누락[Medium]+any 캐스트[Low] (2026-07-06, Opus)

> worktree `feat/31-history-unify`(fix 착수 HEAD `7d8e33b62`)에서 Opus가 직접 구현. 개발책임자 지시대로 git 동작(commit/push/status 포함)은 수행하지 않았다.

### [Critical] Frontend Desktop CI RED — 문서번호 계약 위반(family sweep)

Codex 라운드가 신설한 `PartnerOrderCollaborationPanel.history-bridge.test.tsx` fixture의
`orderNo: 'PO-2026-0004'`가 `mock.test.ts`의 문서번호 계약(`DOCUMENT_NO_FMT=/^\d{4}\/\d{2}\/\d{2}-[1-9]\d*$/`,
슬래시 `YYYY/MM/DD-N`)을 위반해 `renderer document-number field literals use standard format or
explicit markers` 테스트가 RED — `Frontend Desktop (typecheck+lint+build)` CI 단계(`npm test`)가
빨간불이었다.

- `PartnerOrderCollaborationPanel.history-bridge.test.tsx`(2곳): `orderNo: 'PO-2026-0004'` →
  `'2026/07/06-4'`.
- **family sweep**: `mock.test.ts`의 `DOCUMENT_NO_KEY_SET`이 검사하는 15개 키(`slipNo`/`journalNo`/
  `orderNo`/`taxInvoiceNo`/... )전부를 대상으로 `clients/desktop/src/renderer` 전체를 grep해
  동일 오기 존재 여부를 전수 확인했다. `EstimateCollaborationPanel.history-bridge.test.tsx`의
  `estimateNo: 'Q-2026-0003'`(2곳)도 동일한 비표준 리터럴이었으나 `estimateNo`가 당시
  `DOCUMENT_NO_KEY_SET`에 미등재라 우연히 테스트를 통과하고 있었다 — `'2026/07/05-3'`로 함께
  교체했다. `SlipCollaborationPanel.history-bridge.test.tsx`을 포함한 신규 3개 test 파일 전체를
  grep했으나 그 외 위반은 없었다(Slip 쪽 `slipNo: '2026/06/30-1'`은 이미 표준형).
- **가드 사각 보강**: `estimateNo`를 실제 BE 응답 필드(견적 revision `estimateNo`)이자 화면 미노출
  UUID의 대체 식별자이므로 `DOCUMENT_NO_KEY_SET`에 신규 등재했다. 등재 전 `estimateNo` 리터럴
  전수(`documentNumberPath.test.ts`·`EstimateFormPage.coedit.test.tsx`·위 2개 fixture)를 grep해
  위 fixture 교체 이후에는 전부 표준형임을 먼저 확인한 뒤 등재해, 등재 자체가 새 위반을 만들지
  않도록 순서를 지켰다.

### [MEDIUM] Slip 다중필드 변경 리비전 역방향 하이라이트 누락

`SlipCollaborationPanel.tsx`가 `SlipVersionHistoryPanel`의 `onRevisionSelect(revisionNo,
fieldPaths)` 콜백에서 `fieldPaths?.[0] ?? null`만 채택해 단일 `activeFieldPath: string | null`에
저장하고 있었다 — 리비전 1건이 헤더 필드 2개 이상을 동시에 바꾼 경우(예: 메모+배송지 동시 수정),
버전이력 행을 클릭해도 **fieldChanges 배열의 첫 원소에 anchor된 코멘트만** 하이라이트되고 2번째
이후 필드에 anchor된 코멘트는 역방향 하이라이트가 조용히 누락됐다(11필드 폼 1회 제출로 실사용
가능한 시나리오).

- **`activeFieldPath: string | null` → `activeFieldPaths: string[]`** 확장(Slip 전용 —
  Estimate/PartnerOrder/Journal/GroupwareApproval은 각자 독립된 동일이름 지역 상태라 무영향을
  grep으로 확인).
  - `SlipCollaborationPanel.tsx`: state를 배열로 변경. 정방향(코멘트 클릭)은 `setActiveFieldPaths([fieldPath])`
    단일원소 배열로, 역방향(버전이력 행 클릭)은 `setActiveFieldPaths(fieldPaths ?? [])`로 콜백이
    돌려주는 리비전의 fieldPaths 전체를 그대로 저장한다. 코멘트 하이라이트 조건은
    `activeFieldPaths.includes(fieldPath)`.
  - `SlipVersionHistoryPanel.tsx`: prop을 `activeFieldPaths?: string[] | null`로 변경하고, 매 렌더
    `normalizeFieldPath` 정규화 + 빈 문자열 제거를 거친 `Set`(`normalizedActiveFieldPaths`)을 1회
    계산해 (a) 리비전 행 하이라이트 = `fieldPaths.some((p) => normalizedActiveFieldPaths.has(p))`
    (배열 중 하나라도 겹치면 행 전체 하이라이트), (b) 개별 필드변경 하이라이트 =
    `normalizedActiveFieldPaths.has(normalized)`(필드 단위 정밀 유지, 다른 필드까지 과매칭되지
    않음)로 교체했다.
  - 종속 stub(`SlipCollaborationPanel.coedit.test.tsx`)과 단위 테스트
    (`SlipVersionHistoryPanel.test.tsx`)의 prop명·값도 배열로 동기화했다.
- **다중필드 회귀 가드 신규 4건**:
  - `SlipVersionHistoryPanel.test.tsx` +2 — `MULTI_FIELD_REVISION`(memo+shippingAddress 동시 변경
    리비전 1건) fixture로 (a) `activeFieldPaths=['shippingAddress']`만 줬을 때 해당 필드변경+행만
    하이라이트되고 memo 필드변경은 과매칭되지 않음, (b) `activeFieldPaths=['memo',
    'shippingAddress']` 둘 다 줬을 때 두 필드변경 모두 하이라이트됨을 검증.
  - `SlipCollaborationPanel.history-bridge.test.tsx` +1 — 실컴포넌트 조립 기준 end-to-end: 2필드
    동시 변경 리비전 행 클릭 → 두 필드에 각각 anchor된 코멘트 2건이 모두 `data-active='true'`.
    **fix를 `fieldPaths?.[0] ?? null`로 되돌려 재실행 → RED 확인(2번째 필드 코멘트만 미매칭) →
    fix 복원 → GREEN 재확인**해 실질 회귀가드임을 검증했다.

### [LOW] any 캐스트 제거

`SlipVersionHistoryPanel.test.tsx`의 `as any` 캐스트 2건을 모두 제거했다: (1) 이름 있는 fixture
`HEADER_PREFIXED_REVISION`을 `SlipRevision[]`로 명시 타입(`as any` 제거), (2) 첫 테스트의 인라인
`mockResolvedValue([...] as any)`도 `SlipRevision` 인터페이스와 정확히 일치해 캐스트 없이 그대로
타입체크를 통과함을 확인 후 제거.

### 검증

- `cd clients/desktop && npm run typecheck` — PASS (exit 0, tsconfig.node + tsconfig.web 모두).
- `cd clients/desktop && npm run lint` — 0 errors / 30 warnings(전부 기존·본 라운드 변경 8개 파일과
  무관 — 경고 개수가 직전 라운드(32) 대비 감소한 것도 본 fix의 `as any` 2건 제거와 일치).
- `cd clients/desktop && npm run build` — PASS(`build:legacy` fallback 포함 electron-vite build).
- `cd clients/desktop && npm run build:web` — PASS.
- `cd clients/desktop && npm run build:capacitor` — PASS.
- `cd clients/desktop && npx vitest run`(전체) — **PASS, 93 files / 632 tests**(직전 627 + Codex
  라운드 신규 2 files/2 tests + 본 라운드 신규 3 tests(Slip 다중필드 unit 2 + history-bridge 1) =
  632, `mock.test.ts` 44 tests 전부 GREEN으로 문서번호 계약 위반 해소 확인).
- CI 동일조건(`CI=1`→workers=2·retries=1, config 기본 리포터) Playwright 전수:
  - 1차(신규 포트 5199, 표준 5173 아님) — 553 passed + `admin-hr-guard.spec.ts` 5건 실패. 원인은
    해당 spec이 `AUDIT_BASE_URL`이 아닌 자체 `HR_BASE_URL`(기본값 `localhost:5173`)을 참조해
    비표준 포트를 못 찾은 로컬 하네스 false-RED(#31 앞선 라운드에 이미 문서화된 동일 현상, 코드
    변경 아님) — 재확인만 하고 조치하지 않았다.
  - 2차(표준 포트 5173 재기동, `--strictPort`로 신규 프로세스 보장) — **562 passed + 1 flaky**
    (`product-catalog.spec.ts` 시나리오 4b, `toBeGreaterThan` 타이밍 flake로 retry #1 통과 — 품목
    세트 구성품 검색 모달, 본 라운드 변경 파일과 무관함을 grep으로 확인), 0 failed, exit 0.
  - `node scripts/assert-playwright-ran.mjs` — `expected=562 unexpected=0 skipped=0 flaky=1` exit
    0(가드는 flaky를 실패로 보지 않음 — CI도 동일). CI 하드게이트가 요구하는 두 단계(테스트
    실행+가드) 모두 로컬 재현·GREEN.
  - `playwright/slip-collab/slip-collab-panel.spec.ts`(5건, PR #747 재수렴 HIGH fix 포함)는 1차·
    2차 모두 재시도 없이 첫 시도 통과.
- 부작용 PNG: 실행 중 `docs/qa/**`·`sp-d4-.../screenshots/**` 등 기존 diff(직전 라운드부터 git
  금지로 미원복 상태) 위에 `T09-dispatch-inventory-warehouse-allow.png` 1건이 신규 caught로
  추가 관측됐다(과거 라운드에도 동일 파일명으로 반복 관측된 known 부작용) — 지시대로 건드리지
  않았다(git 동작 미수행).
## Codex 재수렴 Design 중간 fix — anchor 필드명 배지 (2026-07-06)

### 문제

PR #747(#31) 중간 Design 리뷰에서 다중필드 역방향 하이라이트 시 코멘트 카드가 작성자/시간/상태/본문만 표시해, 동시에 하이라이트된 코멘트가 어느 변경 필드에 연결된 것인지 구분하기 어려웠다.

### 조치

- 5개 협업 패널(Slip/Estimate/PartnerOrder/Journal/GroupwareApproval) 코멘트 카드 메타 줄에 anchor가 있는 코멘트에만 `Badge variant="neutral"` 필드명 배지를 추가했다.
- anchor 없는 `전체 코멘트`는 배지를 렌더링하지 않는다.
- 라벨은 기존 매핑을 재사용했다.
  - Slip: `OVERLAY_FIELD_OPTIONS`
  - Estimate: 기존 필드 라벨 규칙(`비고`, `유효기간`, `N번 라인 메모`)
  - PartnerOrder: 기존 필드 라벨 규칙(`요청사항`, `납기`, `N번 라인 비고`)
  - Journal: `labelForPath`
  - GroupwareApproval: `labelForPath(path, fieldLabelMap)`
- 배지는 작성자/시간 옆 flex-wrap 메타 영역에 배치해 모바일 폭에서도 본문과 시각 위계가 섞이지 않도록 했다.

### 회귀 테스트

- 5개 패널 테스트에 anchor 배지 노출 및 null anchor 미노출 검증을 추가했다.
- RED: 구현 전 `*-collab-comment-anchor-badge` 미존재로 5개 신규 assertion 실패 확인.
- GREEN: 구현 후 대상 5개 테스트 파일 PASS.

### 로컬 검증

- `cd clients/desktop && npm run test -- src/renderer/components/collab/SlipCollaborationPanel.history-bridge.test.tsx src/renderer/components/collab/EstimateCollaborationPanel.history-bridge.test.tsx src/renderer/components/collab/PartnerOrderCollaborationPanel.history-bridge.test.tsx src/renderer/components/collab/JournalCollaborationPanel.coedit.test.tsx src/renderer/components/collab/GroupwareApprovalCollaborationPanel.coedit.test.tsx`
  - PASS, 5 files / 21 tests
- `cd clients/desktop && npm run typecheck`
  - PASS, `tsconfig.node.json` + `tsconfig.web.json`
- `cd clients/desktop && npx vitest run src/renderer/components/collab/ src/renderer/components/audit/`
  - PASS, 14 files / 61 tests
- `cd clients/desktop && CI=1 PLAYWRIGHT_SKIP_WEB_SERVER=1 AUDIT_BASE_URL=http://127.0.0.1:5631 HR_BASE_URL=http://127.0.0.1:5631 npx playwright test`
  - 신규 포트 `5631`, Vite dev server `--host 127.0.0.1 --port 5631 --strictPort`, `VITE_MOCK_MODE=1`
  - PASS, 563/563 tests
  - `node scripts/assert-playwright-ran.mjs`: `expected=563 unexpected=0 skipped=0 flaky=0`
