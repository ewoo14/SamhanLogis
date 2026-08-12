# 방치 브랜치 감식 — 4개 전부 삭제 권고 (2026-08-12)

> 조사: CODEX SOL · 판정: 파일 단위 대조 (squash 머지라 커밋 조상 관계로는 판정 불가)
> 계기: 같은 날 `feat/1094-docno-hyperlink-and-back` 에 **S3~S8 완성 작업이 PR 없이 방치**돼 있던 것을 발견 (→ PR #1179)
> ⟹ 나머지 방치 브랜치도 **지우기 전에 안을 봤다.**

## 최종 판단표

| 브랜치 | 목적 | main 에 있나 | 상태 | 권고 | 근거 |
|---|---|---|---|---|---|
| `qa/combo-1077-1078` | #1069 세트 전개 + #1065 출고 검수 결재 게이트 QA 결합 | **있음** | 구성요소별 재수렴·QA 완료 후 각각 머지 | **삭제** | #1069 핵심 파일이 PR #1077 squash 와 diff 0 · #1065 는 PR #1066 최종본 머지 |
| `wip/937-fix7-history-total-domain` | 버전이력 단가·합계를 VAT 포함 도메인으로 통일 | **정확히 있음** | WIP 시점 미검증 · 이후 PR #937 에서 검증·라이브QA 완료 | **삭제** | WIP 5개 핵심 파일과 `37bd02ff4` 사이 **diff 0** |
| `wip/896-s2-r4-fix-incomplete` | 수량 동기화 R4 — 불투명 409 · JSON 숫자 동등성 · 시트 rollback | **대체 구현으로 있음** | 명백한 미완·무테스트 · 후속 PR #958 에서 재설계 완료 | **삭제** | 숫자 동등성은 생존 · 임시 translator 는 제거된 설계 |
| `chore/qa-harness-hash-router-nav` | HashRouter QA 경로 수정 · K5 실서버 증명 | **정확히 있음** | 지정 3스펙 완성 · 광역 발견사항은 이월 | **삭제** | PR #930 은 **오래된 base** 때문에 닫고 PR #932 로 재작성 머지 · 해당 파일 **diff 0** |

## 대조 원문 (발췌)

```text
$ git diff --stat 168464939 424bf88ef -- <#1069 핵심 23파일>
[출력 없음 — exit 0]        ← qa/combo 의 #1069 분과 PR #1077 squash 가 동일

$ git diff --stat be8a9a589 37bd02ff4 -- <wip/937 5파일>
[출력 없음 — exit 0]        ← wip/937 과 PR #937 squash 가 동일

$ git diff --stat c1e48f336 8e989642f -- <920 스펙 3개 + K5 캡처>
[출력 없음 — exit 0]        ← 닫힌 PR #930 과 머지된 PR #932 가 동일
```

## 🔑 배운 것

**`qa/combo-1077-1078` 은 이름이 내용과 달랐다.** PR #1078 의 실제 기능(#1075 견적 품목 후보 모달)은 **이 브랜치 역사에 없다.** 이름으로 판단했으면 틀렸을 것이다.

**`chore/qa-harness-hash-router-nav`(PR #930)이 닫힌 이유는 내용 폐기가 아니었다.**
```
브랜치가 #926 머지 전 시점에서 갈라져 있어 main 대비
136 files changed, 434 insertions(+), 6879 deletions(-) 가 나왔고
#926 이 추가한 파일이 삭제 쪽에 잡혔다.
squash 머지라 merge-base 도 옛 main 이어서 GitHub 이 mergeStateStatus=UNKNOWN 을 냈다.
⟹ 현재 main 위에서 다시 만들어 #932 로 머지 (8 files, +14 −4)
```
**닫힌 PR = 버려진 작업이 아니다.** 왜 닫혔는지 읽어야 한다.

**`wip/896` 은 "미완" 이 곧 "무가치" 가 아니었다.** 중단 시점 커밋이 *"테스트 한 번도 안 돌렸다"* 고 스스로 적었고, 그 문제의식이 PR #958 의 **결과상태 통합 판정**으로 회수됐다. 다만 중간 구현(임시 translator)을 되살리면 최종 설계와 충돌한다.

관련: `.claude/memory/feedback_cleanup_merged_worktrees_immediately.md` · `feedback_incomplete_work_wip_branch_cross_pc.md`
