# §7 전역 협업 슬라이스 6 — 그룹웨어 결재(Approval) collab — **정찰 + 스코핑 (구현 대기)**

> 에픽 [[project_global_collab_epic]] · collab-core 6번째 문서. 개발책임자 2026-06-14 확정 다음 슬라이스 + 규칙: **최종 결재 완료 문서(전표)는 수정 불가**.
> ⚠️ **본 문서는 정찰·분석 단계. 구현은 아래 개발책임자 결정 2건 확정 후 진입** (새벽 자율 빌드는 스코프 확정까지 보류 — 가정 기반 대형 FE 신규 구축 회피).

## 정찰 결과 (groupware-service)
- 엔티티: `ApprovalLine`(id UUID·requesterId·**title·content**·status·steps 1:N) + `ApprovalStep`(approverId·sequence·status·decidedAt·reason). @Version 없음.
- 상태 `ApprovalStatus`: PENDING / IN_PROGRESS / **APPROVED(=최종 결재 완료)** / REJECTED / WITHDRAWN.
- **결재 = 독립 문서** — document_id/document_type 없음. 전표(slip)/주문/견적과 미연결. title/content 가 결재 주제.
- 다단계 결재(line:steps). 최종완료 = status==APPROVED && 전 step APPROVED.
- 컨트롤러: `GroupwareAdminController`(/admin/groupware/approvals, page-code `messenger.admin` + `@RequireDepartment(EXECUTIVE_OFFICE)`). 비즈니스 식별자 없음(UUID).
- **FE: 미구현** — desktop/web 에 그룹웨어 결재 화면 없음.
- collab 미배선. CollabDocumentType 에 그룹웨어 값 없음.

## 🚧 이전 5 슬라이스와 다른 점 (스코프 결정 필요)
1. **FE 결재 화면 부재**: slip/회계/주문/견적/배차는 모두 **기존 상세 페이지/모달에 collab 패널 추가**(additive). 그룹웨어는 **붙일 FE 화면 자체가 없음** → collab 롤아웃이 아니라 **결재 UI(목록/상세) 신규 구축 + collab** = 대폭 큰 작업. 실서버 UI QA 도 화면 없으면 불가.
2. **"전표" 해석**: 개발책임자 규칙 "최종 결재 완료 문서(전표)는 수정 불가" — 현 ApprovalLine 은 **독립 문서(전표 미연결)**. 해석 ① 결재 문서 자체(title/content)에 collab + APPROVED 잠금 / ② 전표(slip 등)에 대한 결재 워크플로우(현 모델 아님 — 결재↔전표 연결 신규 설계 필요).

## 🟢 명확한 부분 (결정 무관 — 어느 해석이든)
- 편집 soft 필드 = `title` + `content`(결재 주제/본문). 불변(400) = status·steps·requesterId·decidedAt·reason.
- **COLLAB_LOCKED(409) = APPROVED**(최종 결재 완료). REJECTED/WITHDRAWN 잠금 여부는 결정(권고: 종결로 보고 잠금). PENDING/IN_PROGRESS = 편집 허용(재결재 전 정정).
- 알림 = 기여자(requesterId + 결재 step approverId들 + 코멘트 작성자), editor 제외, username→UUID.
- CollabDocumentType +`APPROVAL_LINE`(6→7) + **모든 collab 테이블 document_type CHECK 마이그(slip/회계/주문/견적 + 신규 approval) 동반**([[enum-expansion-check-constraint]]).
- 템플릿 = slip collab(가장 완성). page-code 신규 `groupware.approvals` 권고. 라우팅 UUID.

## 🔑 개발책임자 결정 필요 (구현 진입 전)
- **D1 — FE 스코프**: (a) 그룹웨어 결재 화면(목록+상세) 신규 구축 + collab 패널까지 본 슬라이스에 포함(대형), (b) BE collab 기반(Port/엔티티/컨트롤러/마이그/CollabDocumentType)만 먼저 + FE 결재 화면은 별도 선행 슬라이스, (c) 그룹웨어 결재 기능 자체를 먼저 본격 구축(결재선 UI/inbox)하고 collab 은 그 위에 후속.
- **D2 — "전표" 해석**: 결재 문서(ApprovalLine) 자체 대상(권고)인지, 전표↔결재 연결 모델 신규 설계인지.

## 작업 계획 (D1=b 가정 시 — BE 기반 먼저, 잠정)
BE: ApprovalLine @Version + overlayTitle/overlayContent + guardCollabModifiable(APPROVED 등 409) + ApprovalCollabComment/Suggestion + GroupwareApprovalDocumentCollaborationPort + EditService + Controller(/admin/groupware/approvals/{id}/collab/{comments,edits,stream}) + CollabDocumentType APPROVAL_LINE + V_ collab 테이블 + **전 collab 테이블 CHECK 마이그**. FE = D1 결정 후.
