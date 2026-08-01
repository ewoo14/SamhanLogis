---
name: feedback_fresh_data_qa_misses_legacy_rows
description: 🚨 새로 만든 데이터로 하는 QA 는 "과거 데이터와의 호환" 을 원리적으로 검사하지 못한다 — 라이브QA 통과와 적대검증 BLOCKING 이 동시에 참이었다 (2026-08-01 #991)
metadata:
  type: feedback
---

# 🚨 새 데이터로 도는 QA 는 **기존 행과의 호환**을 못 본다

**2026-08-01 #991 실측.** 저장 규약을 바꾸는 fix 를 넣고 라이브QA 를 돌렸다. 브리핑은 이랬다.

> *"부가세 포함 단가로 전표를 발행하고, 같은 멱등 키로 같은 내용을 다시 보내십시오."*

**전부 통과했다** — `201` → `200`, 내용 변경 시 `409`, DB 에 전표 1건. 그런데 같은 표면에서 CODEX SOL 이 **BLOCKING 을 재현**했다.

```text
변경 전 서버 (18086)   {"idempotentReplay":true}   HTTP 200
현재 수정 (19086)      {"code":"CONFLICT"}         HTTP 409
```

## 🔑 모순이 아니다 — 서로 다른 데이터를 봤다

| | 어떤 행을 봤나 | 결과 |
|---|---|---|
| 라이브QA | **자기가 방금 발행한** 라인 (새 규약) | 통과 |
| SOL | **이미 저장돼 있던** 라인 (구 규약) | 실패 재현 |

```text
구 규약 저장   unit_price = 110,000   unit_price_with_vat = 121,000
신 규약 저장   unit_price = 100,000   unit_price_with_vat = 110,000
```

실측: 멱등 `PARTNER_ORDER` 전표 라인 **23건 전부**가 구 규약이었다. *"발행하고 재시도하라"* 는 지시로는 그 23건을 **한 번도 만들 수 없다.**

**Why:** 라이브QA 는 보통 **자기 fixture 를 스스로 만든다.** 그러면 검증 대상이 언제나 *"이 코드가 만든 데이터를 이 코드가 읽는다"* 가 되어, **저장 규약이 바뀐 지점**을 구조적으로 통과시킨다. 통과는 진짜지만 **다른 것을 증명**한다([[feedback_pm_verify_what_measurement_proves]]).

## How to apply

- **저장 방식·컬럼 의미·직렬화 형식을 바꾸는 PR** 이면, 라이브QA 브리핑에 **"이미 DB 에 있는 행으로 실행하라"** 를 별도 항목으로 넣어라. 새로 만든 행으로 하는 검증과 **둘 다** 필요하다.
- 🔑 브리핑에 **대상 행을 지목**하라 — *"실 DB 의 전표 `2026/05/31-5` 로"* 처럼. *"기존 데이터로"* 라고만 쓰면 실행자가 또 만들어 쓴다.
- 기존 행의 분포를 **먼저 세라**. `SELECT count(*) … WHERE <구 규약 조건>` 이 0 이면 그 축은 실제로 없는 것이고, 0 이 아니면 **그 숫자가 영향 범위**다.
- 라이브QA 보고서에 **"이 QA 가 보지 않은 축"** 을 명시하라 — 통과 보고만 남으면 다음 사람이 전 범위 통과로 읽는다([[feedback_unverified_scope_is_not_zero_defects]]).

## 관련
[[feedback_fixture_must_be_reachable_by_real_path]](fixture 가 실 경로로 만들 수 없는 상태면 없는 세계를 검증한다 — **이 건은 반대 방향**: 실 경로로만 만들어서 과거 상태를 못 봤다) · [[feedback_merge_conflict_resolution_is_a_fix]] · [[feedback_qa_live_shared_data_readonly]]
