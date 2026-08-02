---
name: feedback-dev-seed-is-not-real-data
description: "로컬 DB 는 dev 시드다 — \"실 데이터\" 로 보고하기 전에 출처를 확인할 것 · 품목코드 = 모델명 (2026-08-02)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 784d015b-a375-44cf-bf9a-36470a6fe392
  modified: 2026-08-02T14:13:54.329Z
---

개발책임자 지적 (2026-08-02):

> *"내가 준 기초품목 리스트와 실제 구글 스프레드 시트(견적/주문서 표시 품목) 데이터를 보면 너가 말하는 모델명은 없는데…"*

## ① 품목코드 = 모델명 (같은 값, 화면마다 다른 이름)

> *"품목코드가 모델명이야. **기초품목 및 프로그램 내부에서는 품목코드**를 사용하고,
> **견적서나 주문서 웹앱에서는 모델명**을 사용하도록 되어있어."*

DB 매핑 (실측):
```text
products.product_code  = 옛 순번코드   (이카운트 export 의 "품목코드" · 0000098 형태)
products.model_name    = 모델명 = 새 품목코드  (AC032CN1PBH1 형태)
```
이카운트 export(`품목-Excel다운로드-*.xlsx`) 헤더에는 **모델명 열이 없다** — 그 export 가 옛 체계이기
때문이지 모델명이 없어서가 아니다. → [[feedback_estimate_order_item_requires_base_product]]

## ② 🚨 로컬 DB 는 **dev 시드**다

세션 내내 *"실 데이터 1,220건 · 이카운트 계보 100건 · SENT 출고 19전표"* 로 보고했으나
개발책임자 목록과 대조하니 **인용한 모델명이 0건**이었다. 시드가 붙인 값이다:

```text
이카운트 계보 100건   AR05TXEAAWKNEU-01 · AR09TXEAAWKNEU-04   ← "-NN" 접미는 시드가 붙임
시트 계보 1,120건     AC032CN1PBH1 · AP083CXPFBH1PP           ← 접미 없는 진짜 형태
```

**라이브QA 캡처 헤더에 `[DEV-SEED] 개발마스터` 가 찍혀 있었는데 PM 이 읽지 않았다.**

**How to apply:**
- 🔑 수치를 *"실 데이터"* 라고 쓰기 전에 **출처를 확인**한다 — 화면 헤더의 `[DEV-SEED]`,
  `product_code` 형태, 값이 개발책임자 제공 목록에 있는지.
- 🔑 리뷰어가 *"실 DB"* 라고 쓴 것은 **로컬 시드 DB** 를 뜻할 수 있다. PM 이 그대로 옮기지 말 것.
- 🔑 **코드 계약(동작)** 판정과 **건수 주장**을 나눠라. fix 의 동작(조회축·오선택 0·CONFLICT 0)은
  데이터 값과 무관해 시드로도 유효하지만, *"N건이 이렇게 보인다"* 는 실 데이터로 다시 세야 한다.
- 🔑 실 데이터 원본은 `docs/migration/ecount-data/raw/` (gitignore 되어 워크트리엔 없을 수 있음
  → [[feedback_worktree_missing_gitignored_inputs]]).

**Why:** 게이트 ①(실 사용자 경로로 재현 가능한 결함 0)의 "실" 이 시드를 뜻하게 되면
게이트가 이름만 남는다. 시드에 없는 분포(널·중복·형식 이상)가 실 데이터엔 있을 수 있다.
