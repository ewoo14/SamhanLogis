---
name: ecount-product-identity-rule
description: 이카운트 품목 데이터 신원 규칙 — 품목코드 ≠ 품목명 이지만 동일 품목명을 갖는 다른 품목이 있으면 같은 품목 (품목관계 매핑). MIG-2 진행 시 의무 적용.
metadata:
  type: project
---

# 이카운트 품목 데이터 신원 규칙 (MIG-2 핵심 규칙)

> 사용자 명시 (2026-05-19): "품목 데이터의 경우 품목코드와 품목명이 일치하지 않은데 품목명이 일치한 또 다른 품목이 존재하는 경우 같은 품목. 원래는 일치하지 않는 품목만 존재했으나 추후에 일치하는 품목명을 추가하고 품목관계를 설정하면서 생긴 문제."

## 규칙

이카운트 운영 데이터에서 품목 신원 (identity) 판정:

1. **품목코드 (item_code)** 만으로 판정하면 동일 품목이 여러 row 로 분리됨 (잘못된 분리)
2. **품목명 (item_name)** 일치 + **품목관계 (item_relation)** 매핑 여부로 같은 품목 판정
3. 운영 초기에는 품목코드별 1:1 row 였으나, 사용자가 동일 품목에 다른 코드로 추가 등록 후 **품목관계 테이블** 에서 매핑 설정함 → 결과적으로 동일 품목명을 가진 row 가 여러 개 + 품목관계로 link

## 적용

| 작업 | 적용 |
|---|---|
| **MIG-2 (품목 마스터)** | 의무. 단순 `item_code` PK 적재 금지 — `item_name + item_relation` join 으로 deduplicate. 동일 품목 group 의 대표 row 선정 (예: 가장 오래된 createdAt, 또는 사용자 선정 main code) + 나머지는 alias |
| **MIG-3 회계 / MIG-4 매출매입 / MIG-6 재고** | 트랜잭션 전표가 alias item_code 로 참조될 수 있음. transform 단계에서 alias → main code 정규화 |

## 입력 파일

- `docs/migration/ecount-data/raw/품목-Excel다운로드.csv` — 품목 마스터
- `docs/migration/ecount-data/raw/품목관계-Excel다운로드.csv` — 동일 품목 매핑 테이블
- `docs/migration/ecount-data/raw/품목계층그룹-Excel다운로드.csv` — 카테고리 그룹 (별도)

## MIG-2 처리 흐름 (예정)

```
1. staging.ecount_item_raw — 품목-Excel 17~ 컬럼 raw 적재
2. staging.ecount_item_relation_raw — 품목관계-Excel 적재 (예상 컬럼: main_code, alias_code)
3. transform:
   a. main_code 기준 deduplicate
   b. alias_code 들은 별도 staging.ecount_item_alias 또는 products.alias_codes JSON 컬럼
   c. 단위 검증 SQL: 동일 item_name group 의 main code 1개 보장
4. 도메인 products INSERT — UUID 1개 / 비즈니스 식별자 = main_code
5. 트랜잭션 전표 적재 시 alias_code lookup → main_code 정규화
```

## 관련 메모리

- [[ecount-data-mig-readme]] — 마이그레이션 가이드 (docs/migration/ecount-data/README.md)
- [[build-conventions]] — Soft Delete + BaseEntity 7 audit
- [[uuid-no-user-visibility]] — UUID 비공개 가드 (item_code = 사용자 노출 식별자)

## MIG-1 PoC (거래처) 와의 차이

거래처는 단순 `partner_code` PK 적재 OK (alias 없음). 품목은 **alias 매핑 의무**.
