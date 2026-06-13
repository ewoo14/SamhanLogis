# §7 전역 협업 슬라이스 6 — 그룹웨어 결재(Approval) 구현 + collab

> 에픽 [[project_global_collab_epic]] · collab-core 6번째 문서. 워크플로우: Opus 4.8 ↔ Codex(Fable5 영구 제외). 기획→Codex 개발→Opus/Codex 라운드(실서버 QA)→PM 머지.

## ✅ 개발책임자 결정 (2026-06-14 확정)
- **D2**: 결재 문서(`ApprovalLine`)는 **독립 문서이며, 개발책임자가 이를 "전표"로 표현**한 것. 별도 전표 연결 모델 불필요 — ApprovalLine 자체에 collab. **+ 결재문서번호를 전표번호 표준 `YYYY/MM/DD-N`(슬래시)로 추가**([[feedback_slip_order_number_format]] — 화면/저장/본문 전부 슬래시, 하이픈은 URL path 세그먼트만).
- **D1**: 그룹웨어 결재 **FE 미구현 → 구현**. 결재 기능 FE(목록/inbox + 상세) 신규 구축 + collab 패널까지 본 슬라이스에 포함. (BE는 ApprovalLine + admin/internal 엔드포인트 기존재.)

## 정찰 (groupware-service)
- `ApprovalLine`(id UUID·requesterId·title·content·status·steps 1:N) + `ApprovalStep`(approverId·sequence·status·decidedAt·reason). @Version 없음, **번호 없음**.
- `ApprovalStatus`: PENDING / IN_PROGRESS / **APPROVED(최종 결재 완료)** / REJECTED / WITHDRAWN.
- 컨트롤러 `GroupwareAdminController`(/admin/groupware/approvals, page-code `messenger.admin` + `@RequireDepartment(EXECUTIVE_OFFICE)`), `GroupwareInternalController`(/internal). FE 미구현.

## 도메인 결정
| 항목 | 결정 |
|---|---|
| 결재문서번호 | 신규 `approvalNo` (슬래시 `YYYY/MM/DD-N`, KST 일자 기준). `ApprovalNumberSequence`(EstimateNumberSequence 클론) + 채번. open() 시 부여. 화면/저장 슬래시, URL path 는 공용 `toOrderPathId`(하이픈) 재사용 |
| collab 편집(soft) | `title`(제목) + `content`(본문) |
| 핵심 불변(400) | approvalNo·status·steps(결재선)·requesterId·decidedAt·reason |
| COLLAB_LOCKED(409) | **APPROVED(최종 결재 완료)** + REJECTED + WITHDRAWN(종결). 편집 허용 = PENDING/IN_PROGRESS |
| @Version | ApprovalLine 에 추가(부모 단일 — title/content 편집, 배차 패턴) |
| 알림 | 기여자: requesterId + 결재 step approverId(미결 우선) + 코멘트 작성자, editor 제외, username→UUID |
| 라우팅 | UUID(`/admin/groupware/approvals/{id}/collab/...`) — 게이트웨이 라우트 확인/추가 |
| page-code | 신규 `groupware.approvals` (collab 분리; 기존 결재 CRUD 는 messenger.admin 유지 가능) |
| CollabDocumentType | +`APPROVAL_LINE`(6→7) + **전 collab 테이블 document_type CHECK 마이그**(slip/회계/주문/견적 + 신규 approval) [[enum-expansion-check-constraint]] |

## 작업 범위
### BE (groupware-service)
- **결재문서번호**: ApprovalLine `approvalNo` 필드 + `ApprovalNumberSequence` 엔티티/repo + 채번 서비스(KST 일자, 동시성 row-lock/advisory) + open() 배선 + 마이그(컬럼+시퀀스 테이블).
- **collab**: ApprovalLine `@Version` + overlayTitle/overlayContent(길이검증 400) + guardCollabModifiable({APPROVED,REJECTED,WITHDRAWN} 409) + ApprovalCollabComment/Suggestion + Repository + Config + `GroupwareApprovalDocumentCollaborationPort`(title/content overlay 화이트리스트) + `GroupwareApprovalCollabEditService`(1-인, 알림 in-transaction best-effort) + Controller(/admin/groupware/approvals/{id}/collab/{comments,edits,stream}, @RequirePermission groupware.approvals) + DTO + IT(실 Postgres — 수정완료·409·400·deny·알림·CHECK 분리·fresh-session).
- **CollabDocumentType +APPROVAL_LINE** + 전 collab 테이블 CHECK 마이그(각 서비스 forward 마이그).
- 게이트웨이: /admin/groupware/** 라우트에 collab 경로 포함 확인.

### FE (desktop)
- 그룹웨어 결재 **목록/inbox 페이지** + **상세 페이지**(approvalNo 슬래시 표시·status·결재선 steps·title/content) + 좌측 메뉴(그룹웨어) 진입.
- collab 패널(수정완료=제목/내용 편집 + diff + 코멘트, COLLAB_LOCKED 안내, canAccess groupware.approvals).
- api 클라이언트(groupwareApproval.ts + groupwareApprovalCollab.ts). 라우팅 UUID. 번호 표시 슬래시.

## 검증
- BE: groupware 전체 모듈 테스트(@Version·번호 채번 회귀) + ApprovalCollabIT(실 Testcontainers). 마이그 fresh-postgres probe(CHECK 6→7 전 테이블).
- 실서버 라이브 QA: 결재 생성(approvalNo 슬래시)→상세→수정완료(제목/내용)→diff→코멘트, APPROVED 잠금 409. dev_master 실 로그인, 합성 0.

## 워크플로우
Codex 개발(BE 번호+collab → FE UI) → Opus 5-agent → Codex 5-agent → 수렴 → 머지. 라운드별 실서버 QA 스크린샷.
