---
name: feedback_seed_and_qa_residue_pollute_aggregates
description: 공유 실 DB 에 남은 시드·QA 잔재가 집계 화면에 매출로 잡힌다 — 라이브QA 수치를 업무 금액으로 읽지 말 것
metadata:
  type: feedback
---

# 🚨 화면에 뜬 금액이 **시드와 QA 잔재**다 (2026-08-03 #1061)

## 무슨 일이 있었나

`#1061` 거래처별 원장을 세다가 *"slip 없는 회계분개 30건 · 401 순매출 412,300,000원"* 이 보고됐고, 회계 원장에 닿는 금액이라 별건 확인 대상으로 올라갔다. 실제로 파 보니 **업무 데이터가 아니었다.**

```text
accounting_db  source_type='SLIP' 분개 29건 (POSTED 24 · REVERSED 3 · DRAFT 2)
  created_by      전건 'system' · created_at 전건 2026-06-19 하루
  posted_by       5명에게 6건씩 균등 배분
  journal_date    01/01, 01/04, 01/07 … 정확히 3일 간격
  description     "전표 2026/04/03-2 자동 분개 (출하 매출)"   ← 1월 분개가 4월 전표를 참조
  source_ref_id   전부 version-3(이름 기반 결정론) UUID       ← 실 생성이면 v4
  참조 전표        UUID·전표번호 둘 다 slip_db 에 없음 (삭제분 포함 0건)
```

같은 DB 의 `slip_db` 에는 **QA 하네스 잔재**도 있었다.

```text
2026/06/24-901  partner_code=QA-GATE-A  partner_id=NULL  COMPLETED  created_by=dev_master
2026/06/24-902  partner_code=QA-GATE-B  partner_id=NULL  COMPLETED  created_by=dev_master
```

`#1061` R11 fix 가 원장 후보 집합을 넓히자 **이 두 QA 행이 원장 화면에 매출로 나타났다.** 구조 결함(journal 후보가 없는 거래처의 전표가 빠짐)은 진짜였지만, **이 DB 에서 관측되는 유일한 인스턴스가 QA 잔재**였다.

## 🔑 판별법 — 시드는 티가 난다

- **참조 무결성 결손** — 참조하는 대상이 상대 DB 에 아예 없다(삭제분 포함해 0건)
- **날짜가 규칙적** — 정확히 N일 간격, 담당자 균등 배분
- **생성일이 하루에 몰림** + `created_by` 가 `system`/`SYSTEM_SEED`/`dev_master`
- **UUID version** — `xxxxxxxx-xxxx-`**`3`**`xxx-…` 는 `UUID.nameUUIDFromBytes` 산물. 실 생성 경로면 v4
- **자기 참조 모순** — 분개일과 참조 전표일이 다른 달

## 어떻게 할 것인가

- 🚨 **라이브QA 스크린샷의 금액을 업무 수치로 인용하지 말 것.** 화면이 옳게 동작해도 담긴 값은 시드일 수 있다. QA 는 *"경로가 도는가"* 를 증명하지 *"금액이 맞는가"* 를 증명하지 않는다.
- 결함 영향액을 보고할 때 **그 행이 실 업무 행인지 먼저 확인**하고, 아니면 *"구조 결함의 재현 증거이며 업무 영향액이 아니다"* 라고 명시할 것. 그러지 않으면 다음 세션이 그 금액을 실제 손실로 이월한다.
- 보고된 금액이 **어느 정의로도 재현되지 않으면** 그 수치를 폐기할 것 — 이번 `412,300,000원` 은 401 기준 POSTED 24건 363,000,000원 / 전 상태 29건 457,000,000원 어느 쪽과도 맞지 않았다.
- QA 하네스가 **공유 실 DB 에 write 를 남긴 것 자체가 규율 위반**이다 → [[feedback_qa_live_shared_data_readonly]]. 잔재는 별도 chore 로 소진.

## 관련

- [[feedback_qa_live_shared_data_readonly]] — 라이브QA 는 읽기 전용 또는 전용 throwaway
- [[feedback_real_data_label_points_elsewhere]] — 같은 세션. 보고서의 실데이터 표기가 다른 DB 를 가리킨 건
- [[feedback_no_fake_data_ever]] — 가짜 데이터로 QA 하지 말 것. 이 문서는 그 반대편 — **실 DB 에 이미 가짜가 섞여 있다**
- [[feedback_fresh_data_qa_misses_legacy_rows]]
