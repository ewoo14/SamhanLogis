---
name: feedback_no_inline_tag_in_input_cell
description: "🚨 입력 필드 옆에 상태 태그를 덧붙이지 마라 — 행 높이가 어긋난다 (2026-08-17 개발책임자 재지적, 이전에도 경고했던 것)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3eff3ba8-a0c6-4617-8291-fbe5d48c20cc
  modified: 2026-08-17T11:43:07.215Z
---

# 🚨 입력 셀에 **인라인 태그를 덧붙이지 마라**

> 2026-08-17 개발책임자: *"입력필드 밑에 또 **수정불가라는 태그**가 들어가며 또 **필드 높이가 안맞아** 내가 경고해서 고치지 않았나?"*

🚩 **"또"** 다. 이전에 지적받고 고쳤는데 다시 들어왔다.

## 실측 (2026-08-17)

```jsx
// clients/desktop/src/renderer/routes/DailyClosingPage.tsx:615
{disabled ? <span title={amountEditDisabledReason(row)}
                  style={{ marginLeft: 4, fontSize: 11 }}>수정 불가</span> : null}
```

`#1250`(2026-08-17 머지)이 넣었다. 입력 필드 옆에 `<span>` 을 조건부로 덧붙이는 구조다.

```text
문제 ①  잠긴 셀에만 요소가 하나 더 생긴다 → 그 행만 높이가 달라진다
문제 ②  표에서 행 높이가 들쭉날쭉하면 읽기가 어렵다
         일마감은 17열짜리 표다
```

## 규칙

```text
🚫 입력 필드 옆·아래에 상태 텍스트를 조건부로 붙이지 마라
     붙는 행과 안 붙는 행의 높이가 달라진다

✅ 대신 쓸 수 있는 것
     입력 자체의 disabled 스타일 (배경·테두리·커서)
     title 속성으로 이유를 툴팁에
     행/셀 단위 아이콘을 고정 폭 칸에
     ⟹ 어느 쪽이든 **요소 개수가 행마다 달라지지 않는 방법**을 쓴다

🚨 표 안에서는 모든 행의 렌더 구조가 같아야 한다
```

## Why

표는 눈으로 세로로 훑는 UI 다. 행 높이가 조건에 따라 달라지면 정렬이 깨져 보이고, 특히 금액 열이 섞인 표에서는 읽기 오류를 부른다.

## How to apply

`disabled` · `readOnly` · 권한 없음 같은 상태를 표시할 때 **"요소를 추가"가 아니라 "기존 요소의 모양을 바꾼다"** 로 접근하라. 리뷰에서 조건부 `<span>`·`<div>` 가 셀 안에 들어가면 이 규칙을 먼저 확인하라.

🚩 이 건은 이전에도 지적받았으나 메모리에 남기지 않아 재발했다. **UI 지적은 반드시 기록한다.**

관련 [[feedback_auto_blank_row_for_all_line_entry]] · [[feedback_measure_display_vs_interaction]]
