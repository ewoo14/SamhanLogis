# 2026-07-06 — #31 이력 일원화 (코멘트+버전이력·양방향 하이라이트) (PR 예정)

> 개발책임자 결정(2026-07-05): 협업 패널 = **코멘트 + 버전이력만**. "협업" 헤더·수정내역 섹션 제거. 버전이력↔변경 양방향 하이라이트.

## 스코프 (5 협업 패널·#30 후속)
EstimateCollaborationPanel·JournalCollaborationPanel·PartnerOrderCollaborationPanel·SlipCollaborationPanel·GroupwareApprovalCollaborationPanel:
1. **"협업"(h4) 섹션 헤더 제거** — 래퍼 라벨 없이 코멘트+버전이력만.
2. **수정내역(changeSet diff) 섹션 제거** — 버전이력으로 일원화(중복).
3. **버전이력 통합**: slip=SlipVersionHistoryPanel(SlipRevision·복원) 재사용. 타 도메인(견적/분개/주문/그룹웨어)=revision 데이터(EstimateRevision 등) 유무 정찰 → 있으면 동등 버전이력 패널·없으면 코멘트만+버전이력 후속 명기(도메인별 격차 정직 보고).
4. **양방향 하이라이트**: 버전이력 항목 클릭→해당 변경/코멘트 하이라이트, 반대(변경/코멘트 클릭→버전이력 하이라이트)도. 공유 highlight 상태.

## 계획
- 정찰: 도메인별 버전이력(revision) 패널/API 현황.
- 5패널 리팩터: 헤더/수정내역 제거·코멘트 유지·버전이력 통합·양방향 highlight prop.
- 검증: typecheck·vitest collab·playwright coedit 회귀 0.

## 리뷰
Opus 5-agent(Design 중점)↔Codex 5-agent(라이브)·0수렴·9-게이트.
