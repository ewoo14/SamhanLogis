# item 3-C — EstimateSeeder product UUID 3-DB 정합 (dev-report)

- **작성일**: 2026-06-01 / 브랜치 `fix/estimate-seeder-product-alignment`

## 배경
PR #327([[project_seed_product_uuid_catalog]])이 product/inventory/slip(SlipSeeder)/partner-order seeder 를 실 HvacProductSeeder modelName + `samhan-seed:product:<modelName>` 결정적 UUID 로 3-DB 정합했으나 **EstimateSeeder 만 누락** — `TEST-MODEL-%04d` + 자체 UUID 파생 → 견적→주문→재고조회(2.6d) 컨텍스트가 가짜 product 참조/cross-DB join 실패.

## 수정
- `HvacSeedProductCatalog`(slip-service) 신규: HvacProductSeeder 와 **동일 format 패턴 5종**(`AR%02dTXEAAWKNEU-%02d`/`AF…`/`AM…`/`AC…`/`AX…`)으로 실 modelName 100개 + `deterministicProductId(modelName)=nameUUIDFromBytes("samhan-seed:product:"+modelName)`.
- `EstimateSeeder`: TEST-MODEL/자체 UUID 제거 → 카탈로그 실 modelName/productName + 결정적 productId 사용. 수량/단가/견적번호/EXISTS 멱등 보존.
- `EstimateSeederTest`: `AR05TXEAAWKNEU-01`→`01949ab7-e922-35c6-b289-5337d867a0ee`(메모리 문서값 일치) + 멱등 skip 검증.

## 검증
- format 패턴 HvacProductSeeder 와 1:1 일치 확인(실 product 보장) + UUID 단위테스트 PASS + compile PASS. CI green.
- **실 reseed QA**(3-DB TRUNCATE→재기동 후 견적 라인 productId=products.id psql 일치)는 [[project_seed_product_uuid_catalog]] 재시드 절차로 차기 QA 세션에서 보강.

## 후속(minor)
- slip-service 내 카탈로그 2벌(SlipSeeder `PRODUCT_MODEL_NAMES` + HvacSeedProductCatalog) → 단일 공유 카탈로그로 통합(메모리가 명시한 다중-seeder 동기화 부담 경감). 데이터 동일성 검증 후.
