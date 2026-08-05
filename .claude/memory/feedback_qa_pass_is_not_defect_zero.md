---
name: feedback_qa_pass_is_not_defect_zero
description: 라이브QA 가 전부 PASS 라고 해도 게이트 ① 이 아니다 — 같은 HEAD 에서 적대검증이 도달 결함을 계속 찾아냈다
metadata:
  type: feedback
---

# 🚨 QA "전부 PASS" 는 결함 0 이 아니다 — 반드시 SOL 을 붙여라 (2026-08-04 · 세 트랙 8건 실측)

## 무슨 일이 있었나

라이브QA 가 **"전부 PASS · 머지 가능"** 판정을 낸 **직후** 같은 HEAD 에서 적대검증(CODEX SOL)이 도달 가능한 결함을 찾았다. 한 번이 아니라 세 트랙에서 반복됐다.

```text
#1061 R8  QA "결함 1~4 전부 PASS"   → R19 SOL 2건
          무필터 정상 거래처 13곳 차단 87,562,200원
          SALE_SUMMARY.documentNo 에 UUID 노출 22거래처 351,000,000원

#1061 R11 QA "전부 PASS · 머지 가능" → R25 SOL 1건
          snapshot 저장이 전면 도달 불가 (데스크톱 호출자 0곳)

#1057 라이브QA 10차 후               → R23 SOL 2건
          INSPECTING 반려 버튼 소실 · 모바일 라벨이 재고 이동을 알리지 않음
```

**SOL 이 세 트랙에서 8건을 잡았고 전부 QA 가 PASS 를 낸 뒤였다.**

## 🔑 왜 갈리는가 — 둘은 서로 다른 것을 본다

```text
라이브QA    "내가 시킨 시나리오가 화면에서 되는가"
적대검증    "실 사용자가 도달할 수 있는데 안 되는 것이 있는가"
```

QA 는 **주어진 경로**를 밟는다. 그 경로 밖에서 사라진 기능(반려 버튼·저장 버튼)이나 응답 본문에 새는 값(UUID)은 시나리오에 없으면 안 보인다.

반대로 QA 만 잡는 것도 있다 — `#1061` 은 QA 가 fix 회귀를 세 번 잡았고 SOL 은 그때 코드만 보고 있었다. **둘 다 필요하다.**

## 규칙

- **fix 후 라이브QA 가 PASS 여도 그것으로 게이트 ① 을 채우지 않는다.** 그 fix 표면에 SOL 재수렴을 붙인다.
- 좁혀도 된다 — *"R20 이 건드린 것만"* 처럼 범위를 명시하면 한 라운드가 짧다.
- SOL 이 결함 0 을 내면 **"이 라운드가 보지 않은 것"** 을 반드시 받아 적는다. 그것이 다음 라운드의 범위다.

## 관련

- [[feedback_live_qa_first_not_last]] — 순서는 QA 가 먼저. 이 규칙은 그 뒤에 SOL 을 **더한다**는 뜻이지 QA 를 뒤로 미루라는 뜻이 아니다
- [[feedback_unverified_scope_is_not_zero_defects]]
- [[feedback_bidirectional_red_for_fix]]
