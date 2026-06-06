---
name: defect-family-sweep-fix
description: 결함 fix 는 인스턴스가 아니라 계열 단위 — 리뷰 지적 1건 = 동일 패턴 전수 grep 의무 + page-code 전환 4종 원자 체크리스트
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 08b51654-0341-4846-bc10-03bf78ad8103
---

2026-06-07 PR #417 (권한그룹 C5 후속) 사이클 1~3 회고. 사이클 2까지 결함이 잔존한 근본 원인 = **리뷰어가 발견한 인스턴스만 부분 fix** → 다음 사이클 리뷰어가 같은 계열의 다른 인스턴스를 재발견하는 구조 반복 (role 헬퍼 27개 중 매 사이클 일부만 처리). 사이클 3 에서 PM 전수 sweep(grep 실측 27개 처분표)으로 일괄 종결. 그럼에도 mock 동기화 누락이 2회 더 재발 (accounting.supplier-profiles → 사이클3 구현, slip.print.export → 사이클 3b 적발).

**Why:** 같은 계열 결함은 같은 원인으로 양산되므로 1건 지적 = 잔여 인스턴스 존재 강한 신호. 부분 fix 는 사이클 수만 늘림.

**How to apply:**
1. 리뷰 지적 1건 접수 시 fix 전에 동일 패턴 전수 grep 실행 → 발견 전량을 처분표(이관/제거/유지+사유)로 박제 후 일괄 fix.
2. **page-code 전환 4종 원자 체크리스트** (하나라도 빠지면 미완): ① BE @RequirePermission 실코드 대조 → ② FE canAccess 전환 → ③ **mock 카탈로그(SP_D1_PAGES + role grant) 동기화** → ④ Playwright 계약 단언 현행화/박제. 특히 ③ 은 누락 시 mock suite 가 못 잡는 silent regression (계약 단언 부재 시 426 green 으로 위장) — 신규 page-code 사용 즉시 mock grep 확인.
3. 사이클 종료 단언은 "발견 인스턴스 검증" 이 아니라 "전수 grep 잔존 0 직접 단언" 으로.

[[fe-canaccess-pagecode-be-match]] [[inprocess-mock-principles]] [[no-backlog-strict]] 연계.
