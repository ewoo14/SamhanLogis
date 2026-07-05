# 2026-07-05 — #30 협업 패널 정리 전메뉴 (PR #738)

> 개발책임자 결정: 협업메모는 코멘트가 논의 역할이라 중복 → 삭제. 코멘트(실시간) 전폭·수정내역 하단. FE 전용·5패널.

## 배경 (협업 모델 명확화)
협업 = ①문서 필드 라이브 편집(취소선+수정내용·[[project_...]]) ②코멘트(실시간 논의·CollabComment). "협업 메모"(CollaborativeTextField 별도 note)는 코멘트와 중복 → 제거.

## 구현 (5패널: Estimate/GroupwareApproval/Journal/PartnerOrder/Slip)
- **협업메모(CollaborativeTextField '협업 메모') 삭제** + import/basePath 정리.
- **코멘트 섹션 width:100% 전폭**·textarea maxWidth min(720px,100%)(전폭서 과도 납작 방지).
- **수정내역(취소선 diff) 코멘트 아래** 단일컬럼(순서: 코멘트→수정내역).
- CollaborativeTextField 컴포넌트는 DispatchTaskDetailModal 사용 중이라 **유지**.
- SlipDetailPage basePath prop 제거.

## 리뷰 (실행=게시 1:1·**모든 라운드 표+라이브 스샷 2곳**·Codex 라운드도 Codex 라이브 QA)
Opus 5-agent R1(BE0·DevOps **[심각] Playwright hard gate FAIL**[협업메모 스펙 잔존]·FE [중] 동건·Design 1MED[textarea 폭])+fix(coedit.shots.spec 삭제·slip-collab-panel 협업메모 test 제거·textarea 폭캡) ↔ Codex 순차 라운드(**Codex 직접 라이브 QA**·분개/견적/전표 상세 3화면 스샷) → 0수렴.

## 검증
- typecheck0·collab vitest 32·slip-collab playwright **6**·CI green(fix 후 Desktop Playwright hard gate 통과).
- **라이브 QA**: 5패널 협업메모 없음·코멘트 전폭·수정내역 하단·폭캡 실화면(Codex 라운드 3장·SHA-pinned+SendUserFile).

## 후속 (협업그룹 순차)
- **#15 구글독스 제안모드**: RedlineCell 실제내용 base+current 교체(2차+ 누적금지·수정내역 리스트는 스택 유지 별개)·per-user색[有]·상세+미리보기 전메뉴 롤아웃.
- Slip 패널만 PresenceIndicator 헤더 미적용(#701 확산 미완·별건).

## 교훈
- **컴포넌트/기능 제거 시 E2E 스펙 동반 정리**([[feedback_fix_in_current_pr_no_split]]) — Desktop Playwright hard gate가 협업메모 스펙 잔존 적발(DevOps R1). 제거=프로덕션+테스트+E2E 전수.
