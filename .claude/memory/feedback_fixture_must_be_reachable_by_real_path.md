---
name: feedback-fixture-must-be-reachable-by-real-path
description: 테스트 fixture 가 실 API·실 경로로 만들 수 없는 상태를 쓰면 근본 결함이 숨는다 — 2026-07-28 #958 실측 (548 테스트가 3라운드 동안 못 잡음)
metadata:
  type: feedback
---

# 🚨 fixture 는 **실 경로가 만들 수 있는 상태**만 써라

**2026-07-28 #896 슬2(PR #958) 실측.** 수량 동기화 규칙의 카테고리 불변식이 `products.estimate_category` 를 읽는데, **그 컬럼은 V18 에서 폐기**됐다(`V18__add_product_estimate_exposure.sql:2-3` — *"products.estimate_category 단일 컬럼에서 product_estimate_exposure M:N 단일 원천으로 이관한다"*). 아무 코드도 더 이상 그 컬럼에 쓰지 않는다(`Product` 대입 **0건**, `changeUsage(UsageScope, EstimateCategory)` 는 `@Deprecated` 이며 **두 번째 인자를 버린다**).

⟹ **실 API 로 만든 품목은 그 컬럼이 NULL 이라 규칙에 붙지 못한다.** 실 DB 실측 `estimate_category` NULL **101 / 105 = 96%**.

```text
POST /products {…, "estimateCategories":["HOME_MULTI"]}     → 201
psql> SELECT estimate_category FROM products                 → NULL
psql> SELECT estimate_category FROM product_estimate_exposure → HOME_MULTI  ← 여기 있다
POST /api/v1/quantity-sync-rules {sources:[…], targets:[…]}
  {"code":"INVALID_INPUT","message":"category 안에서만 source/target을 연결할 수 있습니다."}  400
```

## 왜 548개 테스트가 3라운드 동안 못 잡았나

**quantitysync IT 6개가 전부 품목을 raw SQL 로 넣으며 그 죽은 컬럼을 직접 채웠다.**

```text
QuantitySyncRuleProductDeletionCascadeHttpIT.java:210
QuantitySyncRuleProductDiscontinueIT.java:211
QuantitySyncRuleCrudIT.java:126
QuantitySyncRuleDbProbeIT.java:280
QuantitySyncRuleOptionInParityIT.java:125
```

**실 API 가 만들 수 없는 상태를 fixture 로 썼다.** 그 결과 테스트는 전부 green 이면서 **기능이 실 카탈로그 96% 에 대해 작동하지 않는 것**을 R1·R2·R3 내내 가렸다. 적대검증이 **실 HTTP 로 품목을 만들어 본 순간** 즉시 드러났다.

## 적용

- **fixture 를 만들 때 "이 상태를 실 경로가 만들 수 있나?" 를 묻는다.** raw SQL 로 행을 넣는다면 **실 API 가 만드는 것과 같은 행 상태**여야 한다. 편의를 위해 컬럼을 하나 더 채우는 순간 그 테스트는 실재하지 않는 세계를 검증하기 시작한다.
- **폐기된 컬럼·필드가 있으면 fixture 가 그것을 되살리고 있지 않은지 본다.** `@Deprecated`·마이그레이션 주석·"대입 0건" grep 이 신호다.
- **적대검증 브리핑에 "실 API 로 만들어서 재현하라" 를 명시**한다. raw SQL 로 재현하면 이 계열은 영원히 안 잡힌다.
- 반대로 **fixture 가 실 경로를 못 쓰는 이유가 있다면 그 이유 자체가 결함 신호**다 — 실 경로로 만들 수 없는 상태를 코드가 요구하고 있다는 뜻이니까.

**Why:** 테스트는 "코드가 스스로 만든 세계" 를 검증할 수 있고, 그 세계가 실제와 다르면 green 이 아무것도 보장하지 않는다. 이건 [[feedback_pm_verify_what_measurement_proves]] 의 *"green 은 항상 뭔가를 증명하지만 주장과 다른 것일 수 있다"* 가 fixture 축에서 나타난 형태다.

**How to apply:** 새 IT 의 setup 이 raw SQL 이면 **그 SQL 이 채우는 컬럼 목록을 실 API 응답/DB 상태와 대조**한다. 관련 — [[feedback_unverified_scope_is_not_zero_defects]](범위 밖을 0으로 세지 마라) · [[feedback_reconvergence_before_merge]](재수렴을 좁게 하면 놓친다) · [[feedback_restclient_contract_test_false_green]](같은 계열의 mock false-green).
