---
name: feedback-data-migration-leaves-hardcoded-values
description: 값을 이관하면 행은 옮겨지지만 그 값이 박혀 있는 다른 위치가 남는다 — 2026-08-13 #1072 하루 네 번
metadata:
  type: feedback
---

2026-08-13 `#1072`(계정과목 3자리 → 이카운트 4자리 통일)에서 **같은 형태로 네 번** CI 가 터졌다. 이관 SQL 자체는 매번 정확했다.

| 회차 | 남아 있던 위치 | 증상 |
|---|---|---|
| 1 | **컬럼 DEFAULT** `cash_receipts.debit_account_code DEFAULT '102'` | 통일 후 **새로 만드는** 입금보고서가 폐기 코드로 생성 |
| 2 | **애플리케이션 상수** `CashReceipt.DEFAULT_DEBIT_ACCOUNT_CODE = "102"` | DB DEFAULT 만 고쳤더니 코드가 같은 값을 직접 주입 |
| 3 | **집계 MV** `partner_aging_snapshot` 이 `101/102/110/201` 하드코딩 | 이관 후 분개가 aging 에서 **통째로 제외** |
| 4 | **테스트 fixture** 통제 계정 `'100'` | soft-delete + `@SQLRestriction` 으로 400 이 404 가 됨 |

## Why

이관은 **행(row)** 을 옮긴다. 그런데 같은 값은 행 밖에도 산다 — 기본값·상수·뷰·제약·트리거·시드·fixture·문서. 이관 대상 테이블만 훑으면 이것들이 전부 남고, **하나 고칠 때마다 다음 것이 CI 에서 나온다.**

🔑 특히 위험한 조합 — **"이관은 성공했다" 는 사실이 안심을 준다.** 1회차에서 이관 검증(3자리 잔존 0건·차대 합계 일치)이 전부 통과했는데도 새 행은 죽은 코드로 생겼다. **기존 행 검증은 신규 행을 보증하지 않는다.**

## How to apply

fix 브리핑에 sweep 축을 **"그 값이 박혀 있는 위치"** 로 적고 아래를 전수로 뽑게 한다.

```
DB      column_default · CHECK 제약 · trigger · view/materialized view · function/procedure
        seed 마이그레이션 · 파티션·인덱스 조건
코드    상수 · enum · switch/case · 매핑 테이블 · 설정 파일 기본값
테스트  fixture · 기대값 · mock 응답
문서    README · 운영 가이드
```
`information_schema` 와 `pg_catalog` 로 **실제 DB 를 조회**해 목록을 보이게 할 것(정규식 grep 만으로는 뷰·트리거 본문을 못 본다).

그리고 마이그레이션 자체에 **가드를 넣는다** — 옛 값을 참조하는 DEFAULT·제약이 남아 있으면 `RAISE EXCEPTION`. 그래야 다음 사람이 같은 곳에서 안 넘어진다.

⚠️ 이관 후 검증에 **"신규 생성 경로가 새 값을 갖는가"** 를 반드시 포함할 것. 기존 행만 세면 1회차를 그대로 반복한다.

[[feedback_sweep_by_assertion_not_filename]] 의 "이름이 아니라 역할로" 와 같은 뿌리다.
