# 품목코드(productCode) 그룹 모델 + seed product UUID 정합 — 설계 비교 (2026-05-31)

> 개발책임자 도메인 모델 확정 입력:
> - **UUID = 품목의 시리얼 키(PK)** — 개별 instance 식별자.
> - **품목코드(productCode) = 같은 품목의 분류 그룹**.
> - **품목코드(1) → UUID(N)**. 같은 품목코드 안에 여러 시리얼 UUID.
> - ⚠️ 같은 품목코드라도 **옵션 등으로 model_name·가격이 다를 수 있음**. 품목코드는 *분류*용이지 동일 속성 보장 아님.

## 0. 현행 스키마 실측 (불일치 존재)
| 테이블(서비스) | product 식별 컬럼 |
|---|---|
| `products` (product) | `id`(UUID PK), `model_name`, `product_name`, `category_key`, `capacity_kw`, `price_consumer`, `price_supply`, `status`, `spec_json` — **product_code 없음** |
| `partner_order_lines` (partner-order) | `product_id`(UUID) + 스냅샷 `model_name`/`product_name`/`category_key` — **product_code 없음** |
| `slip_lines` (slip) | `product_id`(UUID) + `model_name`/`product_name`/`category_key` + **`product_code` 있음** |
| `stock_balances` (inventory) | `product_id`(UUID) |

→ **product_code 개념은 이미 slip_lines 에 스냅샷으로 존재**하나 product 마스터엔 없음. 도메인 불일치.
→ model_name 은 품목코드가 될 수 없음(개발책임자: 코드 안에서 model_name 변동).

## 1. 두 가지 문제를 분리
- **문제 A (2.6c 머지 선결)**: 로컬 seeder 의 product UUID 가 product/partner-order/inventory 3-way 교집합 0 → gateway 양성 전환 QA 불가. **UUID 일치만 필요.**
- **문제 B (도메인 모델)**: 품목코드(그룹) → UUID(N) 구조를 products 마스터에 정식 도입. **product_code 컬럼/구조 필요.**

문제 A 는 B 없이도 해결 가능(고정 UUID 카탈로그). 단 개발책임자가 B 모델을 확정했으므로 카탈로그를 B 구조로 만들면 2.6d(재고조회 모달 그룹표시)까지 일관.

## 2. 설계 옵션 비교

### 옵션 1 — products 에 product_code 컬럼 신설 (권장 검토)
- **스키마**: product-service Flyway 신규 `ALTER TABLE products ADD COLUMN product_code VARCHAR`. 기존 slip_lines.product_code 와 의미 정렬.
- **구조**: 1 product row = 1 UUID(시리얼). `product_code` 로 그룹. 같은 product_code 에 여러 row(UUID), model_name/price 각자.
- **seed 카탈로그**: 고정 UUID N개를 `(UUID, product_code, model_name, product_name, category_key, 가격…)` 로 정의. 같은 product_code 에 2~3 UUID 배치(시리얼 다수 시연). product/inventory/partner-order seeder 가 **동일 UUID** 참조.
- **cross-service**: 참조는 여전히 **UUID(product_id)** 1차. product_code 는 분류/표시용 스냅샷(partner_order_lines 에도 product_code 스냅샷 추가 검토).
- **영향**: product Flyway 1 + 4 seeder + (선택)partner_order_lines product_code 스냅샷 컬럼 + FE 그룹표시(2.6d). 중간 범위.
- **장점**: 도메인 정식화, slip_lines 와 정렬, 2.6d 그룹표시·재고집계 수혜, UUID 가 1차 key 원칙 충족.
- **단점**: product-service 마이그레이션 + 스냅샷 동기화 지점 증가.

### 옵션 2 — product_groups 테이블 정규화 (product_code 독립 엔티티)
- `product_groups(id, code, name, category_key)` + `products.group_id` FK.
- **장점**: 가장 정규화. 그룹 속성(그룹명 등) 독립 관리.
- **단점**: 범위 큼(신규 테이블+FK+조회 API+seeder+UI). 2.6c 선결로는 과함. 현 단계 YAGNI 위반 소지.

### 옵션 3 — 2.6c 는 평면 UUID 카탈로그만, product_code 는 별도 슬라이스
- seed 카탈로그를 평면(UUID 100개, 각자 model_name/category) 로만 정합 → 2.6c QA 즉시 해결.
- 품목코드 그룹 모델(옵션 1/2)은 **별도 슬라이스**로 spec→구현.
- **장점**: 2.6c 빠른 잠금(머지 선결만 해결). 도메인 변경 분리.
- **단점**: 카탈로그를 나중에 product_code 구조로 재작업(2회 손).

## 3. 권장
- **2.6c 머지 관점**: 옵션 1 또는 3 둘 다 즉시 QA 가능(UUID 일치 확보).
- **장기 일관 관점**: **옵션 1**(product_code 컬럼 신설) — slip_lines 와 정렬 + 2.6d 수혜 + 재작업 없음. 옵션 2 는 현 시점 과설계.
- 핵심 불변: **cross-service 참조는 UUID(product_id) 1차**, product_code 는 그룹 분류(스냅샷). nameUUIDFromBytes 유도 폐기, UUID 는 카탈로그 고정 리터럴.

## 4. 미결정 (개발책임자 선택 대기)
1. 옵션 1 vs 3 (도메인 정식화 동반 vs 2.6c 평면 분리).
2. (옵션 1 시) partner_order_lines 에 product_code 스냅샷 컬럼 추가 여부.
3. seed 카탈로그 product 개수(현행 100 유지) + 품목코드당 시리얼 UUID 분포(예: 일부 코드에 2~3 UUID).
