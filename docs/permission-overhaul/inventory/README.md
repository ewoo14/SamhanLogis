# 권한 체계 전면 재편 — Phase 0 인벤토리 (도메인별 audit)

> 2026-05-28 생성. [토대 설계](../../superpowers/specs/2026-05-27-permission-overhaul-foundation-design.md) §5 방법론 기반.
> 각 도메인 fan-out 에이전트가 본 디렉터리에 `<domain>.md` 섹션을 산출하고,
> PM 이 종합하여 상위 `docs/permission-overhaul/menu-inventory.md` 마스터 매트릭스를 작성한다.

## audit 컬럼 (PageCode 당 7 action)

| action | 판정 기준 (HTTP/의미 → action) |
|---|---|
| VIEW (보기/접속) | 조회 endpoint (GET) + FE route/메뉴 존재 |
| CREATE (입력) | 생성 endpoint (POST) |
| UPDATE (수정) | 수정 endpoint (PUT/PATCH) |
| DELETE (삭제) | soft-delete endpoint (DELETE) |
| RESTORE (복원) | 버전이력 조회 + 롤백 존재? (대부분 미구현 예상) |
| DOWNLOAD (다운로드) | Excel / PDF / PNG export 존재? 포맷별 표기 |
| PRINT (출력) | 인쇄 view/endpoint 존재? |

셀 표기: `✅` 구현 / `❌` 없음 / `⚠️` 부분. 근거(컨트롤러·메서드 또는 FE route)를 1줄 첨부.

## 도메인 그룹 (8 fan-out)

1. `accounting-core.md` — accounting-service 핵심 회계
2. `ecount-migration.md` — accounting-service 이카운트 마이그레이션 import
3. `inventory.md` — inventory-service 재고
4. `slip-estimates.md` — slip-service 전표/매출·매입 슬립/견적
5. `arologis.md` — arologis-service 배차
6. `partners.md` — partner-service / partner-auth-service 거래처
7. `sales-products.md` — partner-order-service / product-service / dc-config 거래처주문·상품·DC
8. `platform-admin-notify.md` — user/auth/dashboard/notification/groupware 관리·알림
