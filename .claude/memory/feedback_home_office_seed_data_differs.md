---
name: feedback_home_office_seed_data_differs
description: 🚨 집PC 와 회사PC 는 시드·실데이터가 다르다 — 문서에 적힌 수치를 그대로 인용하지 말고 그 PC 에서 다시 세라. 발화 조건이 아예 없는 경우도 있다 (2026-08-05 개발책임자 지시)
metadata:
  type: feedback
---

# 🚨 집PC 와 회사PC 는 **데이터가 다르다**

**2026-08-05 개발책임자 지시.**

> *"집PC와 회사PC의 시드데이터가 서로 다른 것도 메모리 및 워크플로우에 박아주고."*

핸드오프·dev-report·PR 코멘트의 수치는 **그것을 쓴 PC 의 실측**이다. 다른 PC 에서 그대로 인용하면 틀린다.

## 실측된 차이 (2026-08-05 집PC ↔ 회사PC)

| 항목 | 회사PC | 집PC |
|---|---|---|
| `accounting_db` 이카운트 계정과목(`1089`·`4019`·`2519`) | 존재 | **0건** |
| `9049` 임대료 · `9199` 잡이익 · `9549` 잡손실 | 존재 | **0건** |
| 다중 거래처 journal | 4건 | **0건** |
| 활성 journals | (더 많음) | **125건** |
| 창고 코드 | 이카운트 실코드 `2`(상일) `00003`(초월) | **없음** — `HQ-001·CS-001·VH-001·VR-001·QA-1039-*` |
| `V107` 승계 대상 OUTBOUND | 119건 | **2,309건** |
| 활성 비공백 배송주소 | (더 많음) | **2건** |

## 🔑 "수치가 다르다" 보다 나쁜 것 — **발화 조건이 아예 없다**

- `#1045` 8모드는 창고 코드 `2`·`00003` 을 **하드코딩**(`JpaPreClassifySlipQuery:23-24`)한다. 집PC 엔 그 코드가 없어 **어떤 모드도 발화하지 않았다.** 실 관리자 API 로 창고를 먼저 만들고서야 밟을 수 있었다.
- `#1061` 계정과목 이원화 fix 는 집PC 에 표본이 0건이라 **라이브 재현이 불가능**했다. 계약 테스트로 고정하고 그 사실을 보고서에 적었다.

## How to apply

1. **세션 시작 시 그 PC 에서 다시 센다.** 핸드오프의 `착수 전 반드시 다시 셀 것` SQL 을 돌리고 결과를 그 세션 기록에 남긴다.
2. **QA 브리핑에 발화 조건 카운트를 먼저 넣는다.** 0 이면 *"만들 수 있나"* 부터 → [[feedback_fix_round_self_closure_3cap]]
3. **문서 수치를 인용할 땐 어느 PC 실측인지 명시**한다. PR 코멘트에도 적는다.
4. **표본이 0이면 "결함 0" 이 아니라 "판정 불가"** 다. 그대로 적고 다른 PC 로 넘긴다 → [[feedback_unverified_scope_is_not_zero_defects]]
5. 하드코딩된 업무 코드(창고·계정과목 등)를 만나면 **그 PC 에 그 코드가 실재하는지부터** 확인한다.
6. 실 경로로 표본을 만들 수 있으면 만든다(관리자 화면·API). **DB 직접 INSERT 는 금지** — 실 경로로 못 만들면 그 자체가 결함 신호다 → [[feedback_fixture_must_be_reachable_by_real_path]]

## 관련
[[feedback_real_data_label_points_elsewhere]] · [[feedback_fresh_data_qa_misses_legacy_rows]] · [[feedback_join_key_column_empty_uuid_populated]] · [[feedback_qa_environment_verification_first]]
