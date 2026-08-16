---
name: feedback-live-qa-must-expand-detail-rows
description: "라이브QA 에서 목록만 보고 상세를 안 펼치면 \"항상 0\" 인 칸을 통째로 놓친다 — #1219 가 그렇게 나갔다"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c912e540-6b1a-48d7-a602-a64c7fa3e6ca
  modified: 2026-08-15T22:13:52.784Z
---

2026-08-16 실측. **#1219(일마감)를 머지할 때 라이브QA 를 돌렸는데 상세를 펼쳐 보지 않았다.**

```text
회계 → 일마감 → 선발행 → 행의 '상세 펼치기'
  모델 0 · 카테고리 0 · 기준 납품가 0 · 기대율 0% · DC액 0 · 확인 사유 0
```

**여섯 칸이 전부 0 인 채로 나갔다.** 원인은 FE↔BE 계약 불일치이고 `#1219` 에서 처음 생겼다
(삭제 회귀가 아니다). 목록 단위 캡처는 멀쩡했다.

## 왜 놓치나

목록 화면은 정상으로 보인다. 접혀 있는 상세·모달·탭 안쪽은 **캡처에 아예 안 나온다.**
그래서 "화면 캡처를 남겼다" 가 "그 화면을 다 봤다" 를 뜻하지 않는다.

🚩 값이 없을 때 `0` 으로 fallback 하면 더 위험하다 — **금액 화면에서 0 은 "무료" 로 읽힌다.**
"없음" 과 "0" 은 다르다.

## How to apply

- 라이브QA 브리핑에 **"접혀 있는 것을 전부 펼쳐라"** 를 넣는다
  상세 펼치기 · 모달 · 아코디언 · 탭 · 툴팁 · hover 표시
- 새 화면·새 응답 DTO 가 있으면 **화면이 그리는 필드와 응답 키를 1:1 로 대조**한다
  ⟹ 응답에 없는 키를 화면이 기본값으로 그리고 있는지 세라
- 값이 안 나오면 **"응답에 없나" 와 "데이터가 없나" 를 가려라**
  응답만 고쳐도 데이터가 없으면 화면은 그대로다 (#1219 는 6칸 중 5칸이 그랬다)
- 같은 성격을 전수로 세라 — "응답에 없는 필드를 0/빈값으로 그리는 곳"

관련: [[feedback_measure_display_vs_interaction]] · [[feedback_qa_pass_is_not_defect_zero]] ·
[[feedback_live_qa_every_round_screenshots]] · [[feedback_join_key_column_empty_uuid_populated]]
