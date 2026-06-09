# 세트 구성품 정합 점검 (Bundle Integrity Check) — PR-4

> 세트→전표 전개 에픽 후속 #1. **운영 전/시트 sync 후 재실행 가능한** BUNDLE 구성품 정합 점검.
> `bundle_component.componentProductCode` 가 활성 `products.modelCode` 로 해소되지 않으면(미등록/단종)
> 세트 전개(견적/전표)가 "세트 구성품 일부를 찾을 수 없습니다(미등록/단종)" 로 거부된다 → 사전 적발.

## 구현
- product-service `GET /products/internal/bundle-integrity` (X-Internal-Token).
  - `BundleComponentRepository.findUnresolvedComponents()` — `BundleExpander.expand` 의 해소 경로
    (`findByModelCodeAndIsDeletedFalse`) 와 **동일 기준** NOT EXISTS 쿼리.
  - `ProductService.checkBundleIntegrity()` — 부모 BUNDLE 단위 그룹핑 → `BundleIntegrityResponse`
    `{healthy, totalBundles, issueBundleCount, unresolvedComponentCount, issues[]}`.
- IT: `ProductInternalControllerIT` 2건(해소→미플래그 / 미해소→플래그+healthy=false).

## 실서버 QA (standalone :8099, 실 `product_db` 시트 적재본)

> [[feedback_real_server_check_screenshot]] — 실서버 점검은 실제 캡처 첨부. 브라우저가 라이브 엔드포인트에 직접 GET.
> Testcontainers IT 는 Windows 로컬 skip → standalone 부팅 실서버 QA 로 로직 실증([[standalone-boot-real-qa]]).

| 상태 | 결과 | 증빙 |
|---|---|---|
| **A. 정상(운영 데이터)** | `healthy=true, totalBundles=343, issueBundleCount=0, unresolvedComponentCount=0` | `healthy-response.png` |
| **B. 강제 미해소 주입** | `healthy=false, issueBundleCount=1, unresolved=1` → `AC052CS1PBH1SY`(무풍 1way 냉난방) 가 `QA-UNRESOLVED-TEMP-001(REMOTE)` 미해소로 플래그 | `unhealthy-response.png` |
| C. 정리 후 | 주입 row DELETE → `healthy=true, unresolved=0` 복귀 (product_db 청결) | (텍스트 확인) |

- **결론**: 현재 운영 데이터(343 BUNDLE / 1584 구성품)는 **정합 깨끗(미해소 0)** — 세트 견적/전표 전개가 NOT_FOUND 없이 동작. 강제 주입 케이스로 점검기가 실제로 미해소를 적발함을 실증.
- ⚠️ 강제 주입은 임시 row(`QA-UNRESOLVED-TEMP-001`) 1건 INSERT 후 즉시 DELETE — 운영 데이터 변경 없음.

## 운영 가이드
- **시트 sync 직후** 본 엔드포인트를 호출해 `healthy=true` 확인 후 세트 영업 투입 권장.
- `issues` 가 있으면: 미등록 구성품을 시트/품목에 등록하거나, 해당 세트를 비활성/수정.

## 스크린샷
- `healthy-response.png` — 정상(343 세트, 미해소 0)
- `unhealthy-response.png` — 강제 미해소 1건 적발(세트 modelCode + 구성품 코드 + kind 노출)
