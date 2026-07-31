---
name: feedback_dirtiescontext_does_not_clean_shared_db
description: "@DirtiesContext 는 Spring ApplicationContext 만 폐기하고 공유 DB 행은 남긴다 — 새 IT 의 시드가 기존 IT 를 깨뜨린다 (2026-07-30 #984 CI red 실측)"
metadata:
  type: feedback
---

# `@DirtiesContext` 는 공유 DB 를 정리하지 않는다 (2026-07-30 #984)

## 무슨 일이 있었나

PR #984 에 새 IT(`EcountSheetOrderConvergenceIT`)를 추가했더니 CI 에서 **기존 테스트 3건이 깨졌습니다.**

```text
ProductCatalogControllerIT > GET_products_displayOrder_정렬_보장()   FAILED
    JSON path "$.content[0].modelCode" expected:<ORDER_FIRST> but was:<ORDER_CONVERGENCE_SYNC_IMPORT>
ProductCatalogControllerIT > PUT_display_orders_usageScope_NONE_…()  204 expected, got 400
ProductCatalogControllerIT > PUT_display_orders_정상경로_…()         204 expected, got 400

627 tests completed, 5 failed  ->  BUILD FAILED
```

`ORDER_CONVERGENCE_SYNC_IMPORT` 는 **새 IT 가 만든 모델코드**입니다. 그것이 기존 IT 의 목록 쿼리 첫 행으로 올라왔습니다.

## 원인

**`@DirtiesContext` 는 Spring `ApplicationContext` 를 폐기할 뿐 DB 행을 지우지 않습니다.** 같은 PostgreSQL 을 공유하는 IT 들 사이에서 시드 데이터가 그대로 남아 다음 테스트의 쿼리 결과를 바꿉니다.

컨텍스트를 새로 만들었으니 깨끗하다고 착각하기 쉽습니다 — **깨끗해진 것은 빈(bean) 그래프이고 데이터는 그대로**입니다.

## How to apply

- 공유 DB 를 쓰는 IT 는 **자기가 만든 행을 자기가 지운다.** FK 를 고려해 역순으로, 식별 가능한 prefix(모델코드·이름 접두사)로 좁혀 지우는 것이 안전합니다.
- **`@DirtiesContext` 를 데이터 정리 수단으로 쓰지 마십시오.** 그 목적의 애노테이션이 아닙니다.
- 🚨 **새 IT 를 추가한 뒤 그 모듈 전체를 돌려 보십시오.** 새 IT 만 통과하는 것으로는 이 결함이 안 잡힙니다 — 깨지는 것은 **다른 파일의 기존 테스트**입니다.
- 🚨 이 결함은 **로컬에서 Testcontainers 를 못 돌리면 안 보입니다.** Windows 에서 skip 되면 CI 에서 처음 드러납니다 → [[feedback_testcontainers_windows_docker]] · [[feedback_migration_fresh_postgres_probe]]

## 함께 나온 교훈 — 실패한 테스트를 기대값에 맞추지 마라

같은 라운드에서 **새 IT 자신도 2건 실패**했습니다. PM 이 브리핑에 *"기대값을 관측값으로 바꿔 통과시키지 말 것 · 새 IT 를 지워서 때우지 말 것"* 을 못 박았고, 파고든 결과 **테스트가 맞고 구현이 틀렸습니다** — `ECOUNT → SHEET` 승격 시 시트 정본명이 반영되지 않던 결함이었고 fix 는 `p.rename(name)` **한 줄**이었습니다.

⟹ 새 IT 가 실패할 때 **"테스트가 틀렸나 구현이 틀렸나" 를 먼저 가르는 절차**가 결함 1건을 살렸습니다. 테스트를 약화시키는 방향으로 시작하면 그대로 묻힙니다.

**Why:** 테스트 격리 실패는 **가해자가 아니라 피해자가 실패**하므로 원인을 오해하기 쉽습니다. 기존 테스트가 깨지면 "기존 테스트가 취약하다" 가 아니라 **"내가 남긴 데이터가 샜다"** 를 먼저 의심해야 합니다.

관련: [[feedback_parallel_agent_gradle_shared_tree_contention]] · [[feedback_gradle_test_cache_false_green]] · [[feedback_changed_module_full_test_before_push]] · [[feedback_fixture_must_be_reachable_by_real_path]]
