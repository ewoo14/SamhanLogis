---
name: feedback_dc_terminology
description: 할인 용어 — 고정DC(품목별)/전역DC(거래처별 dc_configs)/기본 할인율(partners). "약정DC" 는 이 저장소 용어가 아니며 약정=agreeTerm(전표 자유 입력)
metadata:
  type: feedback
---

# 할인 용어 — "약정DC" 는 없는 말이다 (2026-07-29 개발책임자 지적)

PM 이 #874 이슈 제목과 기획 문서의 표현을 그대로 받아 **"약정DC"** 라고 여러 곳에 게시했다. 개발책임자가 *"약정DC가 뭐지? 전역DC를 말하는건가?"* 로 지적했고, 확인 결과 **틀린 용어**였다.

## 정본 3종

| 이름 | 저장 위치 | 무엇 |
|---|---|---|
| **고정DC** | `products.fixed_discount_rate` (품목별) | 품목에 박힌 할인율. `null` 이면 전역DC 영향 품목 |
| **전역DC** | `dc_configs` (거래처별 활성 1행, `ux_dc_configs_partner_active`) | `home_discount_rate` / `commercial_discount_rate` + 옵션 정액 6종(`discount_360_amount` 등) + `unit_round_to`/`unit_round_mode` |
| **기본 할인율** | `partners` (`V6__add_partner_4tab.sql:27`) | 거래처 마스터의 단일 할인율. 위 둘과 별개 |

**약정** = `agreeTerm`(거래 약정 조건 — 전표의 자유 입력 텍스트, `V16__add_slip_ecount_schema.sql:23`, `Slip.java:502`). **할인과 무관하다.**

## 코드가 부르는 이름 (정본 근거)

```text
clients/web/order-app/index.html:1534        // 전역 DC 적용
clients/web/estimate-app/views/index.ejs:2412  // 전역 DC 적용
clients/web/estimate-app/views/index.ejs:15681 /* 전역할인 (HOME, COMM, OLD) */
ProductService.java:655   품목별 고정DC율 수동 override — null 은 전역DC율 영향 품목으로 저장한다
```

레거시 GAS 정본(`종합견적서`, `거래처 발송 주문서`)도 같은 주석을 쓴다.

## 우선순위 (2026-07-29 개발책임자 결정)

> **품목 고정DC 가 당연히 우선이다.**

```js
clients/web/order-app/index.html:2728   const useRate = (fixedDc ?? rate);
clients/web/order-app/index.html:2851   const useRate = (fixedDc ?? globalRate);
```

⚠️ ~~`dc-config-service` 에는 `고정DC`/`fixedDiscount` 개념이 아예 없다(grep 0매치)~~ → **2026-08-02 정정: 사실이 아니다.** DB 컬럼을 직접 읽지 않을 뿐 **요청으로 받은 고정DC 를 전역DC 보다 우선 적용**한다. `fixedDc ?? globalRate` 는 **현행 6곳 + 레거시 3곳 = 9곳**에 이미 구현돼 있다(#874 정찰 실측). 🔑 **grep 0 을 '개념 부재' 로 읽은 오류** — [[feedback_recon_grep_false_negative]] 가 정확히 이 형태다. PM 이 세션 내내 이 문장을 브리핑에 복사해 잘못된 전제를 퍼뜨렸다.

**Why:** 용어가 틀리면 결함 보고서·PR·이슈가 전부 어긋난 축으로 기록되고, 나중에 읽는 사람이 존재하지 않는 개념을 찾게 된다. 이번엔 4개 게시물과 실행 중이던 codex 브리핑까지 오염됐다.

**How to apply:** 할인을 말할 때 **고정DC / 전역DC / 기본 할인율** 중 하나를 고르고, 어느 테이블의 어느 컬럼인지 함께 적는다. **이슈 제목이나 기획 문서에 있는 말이라고 그대로 쓰지 말 것** — 이 건의 출처가 바로 그것이었다. 오염된 잔재: `DiscountRevalidator.java:52,123` 주석 2곳, #874 이슈 제목. 관련 [[feedback_jeonpyo_not_slip]] · [[feedback_comment_not_collab_comment]] · [[feedback_role_naming_full]]
