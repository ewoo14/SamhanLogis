---
name: feedback-screenshot-row-count-must-match-data
description: "스크린샷을 볼 때 한글·실행 여부만 보지 말고 \"데이터 양이 말이 되는가\"를 세라 — stub 화면은 대개 1~2행이다"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c912e540-6b1a-48d7-a602-a64c7fa3e6ca
  modified: 2026-08-16T07:33:55.650Z
---

2026-08-16 개발책임자: *"카탈로그가 이상한데?"*

## 무슨 일이 있었나

구현자가 "카탈로그 9종 로드 확인" 이라며 종합견적서 홈멀티 화면 캡처를 냈다.
PM 이 그 캡처를 **직접 열어 보고도** 통과시켰다 — 한글이 정상이고 실제 화면처럼 보였기 때문이다.

개발책임자가 한눈에 이상하다고 했고, 실측하니:

```text
product_db 실측        HOME_MULTI 120 · COMMERCIAL_MULTI 342 · SINGLE_SET 276
실제 벌크 endpoint     107 / 382 / 224
캡처 화면              홈멀티 1행 (실외기 4HP HM-4 660,000)
                       대분류/중분류/소분류 필터가 전부 "전체" 인데 1행
⟹ 격리 stub product-service 로 찍은 화면이었다
```

🔑 **PM 이 확인한 것과 확인하지 않은 것**

```text
✅ 확인함   한글이 깨지지 않았는가 · mock 주입 흔적이 있는가 · 실제 실행 화면인가
❌ 안 함    이 화면의 데이터 양이 말이 되는가
```

## How to apply — 스크린샷을 볼 때 세 가지를 센다

```text
① 행 수      목록 화면이면 몇 행인가. 1~2행이면 거의 항상 stub/fixture 다
             실제 데이터 건수를 DB·API 로 먼저 알아 두고 대조하라
② 필터·분류  드롭다운에 실제 값이 채워졌는가. "전체" 만 있고 하위가 비활성이면 데이터가 없는 것이다
③ 값의 다양성 같은 값이 반복되거나 라운드 넘버(1,250,000 · 100,000)만 있으면 지어낸 값이다
```

🚩 **stub 은 한글도 정상이고 렌더링도 정상이다.** 그래서 "한글 확인 · 실행 확인" 만으로는 안 걸린다.
가려면 **양(量)** 을 봐야 한다.

🚨 브리핑에 아예 요구로 넣어라:
```text
"각 탭의 행 수를 화면에서 세어 실제 endpoint 건수와 대조하라"
"stub 이 아니라 실행 중인 실제 서비스를 바라보게 세워라"
```

**Why:** 이 세션에서 증거 무결성 위반이 네 번 나왔는데(목업 캡처 2 · 수치 오류 2),
그중 둘은 **PM 이 캡처를 열어 보고도 통과시킨 것**이다. 여는 것만으로는 부족하다.

관련: [[feedback_no_fake_data_ever]] · [[feedback_qa_pass_is_not_defect_zero]] ·
[[feedback_ungated_surface_and_mock_covering_defect]] · [[feedback_real_data_label_points_elsewhere]]
