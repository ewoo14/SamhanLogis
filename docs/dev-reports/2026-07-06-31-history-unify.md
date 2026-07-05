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
