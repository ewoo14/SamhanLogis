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
