# A2 그룹웨어 결재 — 자체 결재선 ↔ 중앙 config 일원화 (설계 · DRAFT)

> task#24 · 결재 enforcement 에픽(project_approval_enforcement_epic) 잔여. 2026-06-28 브레인스토밍.
> **상태: 브레인스토밍 진행 중(기반 확정, 상세 설계 잔여).** 표준 워크플로우 전 설계 승인 게이트.

## 목표 (개발책임자 확정)
그룹웨어 자체 결재선(per-문서 순차 chain)과 중앙 `approval_line_config`(슬립 B-게이트용 per-documentType 결재선)를 **일원화** — 결재자/결재선 정의를 한 곳에서 관리.

## 현황 (탐색 완료)
- **그룹웨어 결재 문서 기능 = 완성·머지**(§7 협업 에픽 PR #480 `014d63cf5`): 결재유형 템플릿 빌더(동적필드)·collab(수정완료/diff/알림)·통합 문서 참조 첨부·전표번호 검색·결재자 사원검색 칩·결재선 실명.
- **그룹웨어 결재 모델**: `ApprovalLine`(per-문서) → 순차 `ApprovalStep`(approverUserId·sequence, 로직=shared `ApprovalStepBase`). 결재자=수동 사원검색 칩.
- **중앙 모델**: `auth ApprovalLineConfig`(per-documentType 순차 역할: sequence·label·stepType[CREATOR/GROUP/USER]·actionKey·required) + `ApprovalLineApprover`(결재자 그룹∪개인). '결재라인 설정' 메뉴(인사 그룹 중앙통제). 슬립 A2-1~A2-5 enforcement 소비.

## 선택 접근 = A (개발책임자 확정)
**중앙 config = 결재선 정의원, 그룹웨어가 per-문서 인스턴스화.**
- 중앙 `approval_line_config`에 그룹웨어 결재유형별 결재선(역할·순서·결재자) 정의.
- 그룹웨어 결재 문서 생성 시 해당 유형의 중앙 결재선을 `ApprovalStep`으로 인스턴스화(+필요시 per-문서 override).
- 결재자 관리 = 중앙 '결재라인 설정' 한 곳. 기존 그룹웨어 결재 기능 보존.
- (B=그룹웨어 chain 폐기·중앙 직접 소비 / C=결재자만 중앙화 → 미채택.)

## 잔여 설계 질문 (다음 브레인스토밍)
1. **결재유형↔documentType 매핑**: 각 그룹웨어 결재유형 = 중앙 config documentType 1:1? (결재라인 설정 메뉴가 그룹웨어 유형별 결재선 관리)
2. **per-문서 override**: 인스턴스화된 결재선을 문서별 조정 허용(기존 칩 UI 유지) vs config 고정 vs 하이브리드.
3. **stepType 해석**: 중앙 config의 CREATOR/GROUP/USER → 그룹웨어 chain의 concrete approverUserId 해석 방식.
4. **기존 데이터 마이그레이션**: PR #480 이후 기존 그룹웨어 결재 문서/수동 결재선 → config 기반 전환 범위.
5. **슬라이스 분할**: 단일 슬라이스 vs 다슬라이스(중앙 config 확장 → 그룹웨어 인스턴스화 → FE → 마이그).

## 다음 단계
잔여 설계 질문 확정 → 설계 섹션 제시·승인 → 본 spec 완성 → writing-plans → 표준 워크플로우(Opus 기획+PR → Codex 개발 → 순차 듀얼리뷰 0수렴 → 머지).
