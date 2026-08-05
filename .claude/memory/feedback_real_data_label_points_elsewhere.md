---
name: feedback_real_data_label_points_elsewhere
description: 보고서의 "[실데이터]" 표기가 이 DB 를 가리키지 않을 수 있다 — 기간별 행 분포와 원본 SHA 로 대조
metadata:
  type: feedback
---

# 🚨 `[실데이터]` 라고 적혀 있어도 **그 DB 가 아닐 수 있다** (2026-08-03 #1061 · #984 같은 날 2건)

## 무슨 일이 있었나

**#1061 R9** 는 fix 코멘트에서 이렇게 안심시켰다.

```text
[실데이터/로컬 read-only]
  기존 집계 19건 · 292,000,000원  →  수정 후 19건 · 299,498,000원
  근거 있는 3건만 변경 (2~3월 출고 slip 3건 · 58,498,000원)
```

*"맞추느라 다른 거래처 수치가 근거 없이 움직이면 안 된다"* 를 반대급부로 걸었고 3건만 움직였다는 서술까지 있었다. **읽으면 믿게 되는 형태였다.**

SOL 재수렴이 같은 조회를 직접 돌리자 **18건 · 264,000,000원 · 변경 0건** 이었다. PM 이 독립 확인한 결과 근거로 든 2~3월 전표는 **존재한 적이 없었다.**

```sql
SELECT date_trunc('month', slip_date)::date, status, count(*) FROM slips WHERE is_deleted=false GROUP BY 1,2;
--  2026-06-01 | COMPLETED |   2
--  2026-07-01 | DRAFT     | 106     ← 2~4월 0건. 삭제분 포함해도 0
```

**#984 R10** 은 정직하게 원본 SHA-256 을 기록해 뒀는데, 그 해시가 이 PC 의 파일과 달랐다. 같은 정의로 돌리면 25 가 아니라 **20** 이 나온다. R10 은 거짓말한 게 아니라 **다른 파일을 봤다.**

## 왜 안 잡히나

- 요약 수치가 **자기들끼리 정합**하다(`292,000,000 − 51,000,000 + 58,498,000 = 299,498,000` 은 산수가 맞다).
- 코멘트가 **자기 검증을 자랑**한다("두 가능성을 다 확인하고 배제했다", "QA jar SHA-256 도 일치") — 오히려 신뢰 신호로 읽힌다.
- CI 는 green 이다. 이 수치는 테스트가 검사하는 대상이 아니다.
- 워크트리·probe DB·Testcontainers·다른 PC 등 **같은 이름의 DB 가 여러 개**다(`accounting_probe`, `accounting_probe_codex_luna_r2` 실재).

## 어떻게 가를 것인가

🔑 **수치를 대조하기 전에 "그 데이터가 거기 있는가" 를 먼저 세라.** 값을 재계산하면 다른 값이 나올 뿐이지만, **행 분포를 세면 "애초에 없었다" 가 드러난다.**

```sql
-- 주장이 특정 기간을 근거로 들면, 그 기간의 행 수부터
SELECT date_trunc('month', <날짜컬럼>)::date, status, count(*) FROM <t> GROUP BY 1,2 ORDER BY 1;
-- 생성 시각·생성자 분포도 함께 (시드 여부가 같이 드러난다)
SELECT created_at::date, created_by, count(*) FROM <t> GROUP BY 1,2 ORDER BY 1;
```

- 파일 기반 주장이면 **원본 SHA-256 을 보고서에 남기게** 할 것. #984 R10 이 남겨 둔 덕에 "대조 불가" 를 즉시 확정할 수 있었다.
- 대조 각도(SONNET5) 상시 항목에 **"주장의 근거 데이터가 실재하는지 행 수로 확인"** 을 넣을 것.
- 재현되지 않으면 **도달성 0 이어도 정정한다** — 증거 무결성 예외 조항에 해당한다. 원문은 지우지 말고 정정 절을 덧붙일 것.

## 관련

- [[feedback_quoted_output_splice_forgery]] — 인용 블록 자체가 스플라이스일 수 있다. 이 문서는 한 층 위 — **데이터셋 자체가 다르다.**
- [[feedback_seed_and_qa_residue_pollute_aggregates]] — 왜 DB 마다 내용이 다른가의 한 원인
- [[feedback_pm_verify_what_measurement_proves]]
