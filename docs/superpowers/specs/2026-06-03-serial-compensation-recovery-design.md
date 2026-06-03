# 시리얼 보상 실패 복구 — 설계 (ⓑ 분산보상 후속)

> #351(분산보상 견고화) 후속. `serial_compensation_failures` 감사 행을 운영자가 조회·수동 정합(resolve)하는 복구 API + 데스크탑 화면. slip-service(BE) + desktop(FE).

## 배경

#351 이 보상 실패를 `serial_compensation_failures`(append-only, `resolved` 플래그)로 영속·관측했으나, 운영자가 미해소 건을 **조회/수동 정합 완료 표시**할 수단이 없음(Designer/DevOps 후속 권고). 본 슬라이스가 그 복구 루프를 완성.

## API 계약 (slip-service)

- **GET `/api/v1/slips/compensation-failures`** — 보상 실패 목록.
  - query: `resolved`(boolean, default false — 미해소 우선), `page`(0-base), `size`(default 20).
  - 응답: `Page<CompensationFailureResponse>` (createdAt DESC).
  - `@RequirePermission(page="inventory.list", action=VIEW)` (운영/창고 권한 — 보상 실패는 재고 정합 관할).
- **PATCH `/api/v1/slips/compensation-failures/{id}/resolve`** — 수동 정합 완료 표시.
  - 동작: `resolved=false → true` (도메인 메서드 `SerialCompensationFailure.resolve()`, modifiedBy 자동). 이미 resolved 면 멱등(변경 없음 OK).
  - `@RequirePermission(page="inventory.list", action=UPDATE)`.
  - 응답: 갱신된 `CompensationFailureResponse`.

### `CompensationFailureResponse` (UUID 비공개)

`id`(UUID — 복구 PATCH 대상 식별용, 화면 미표시), `slipNo`, `slipType`, `phase`, `productCode`, `attemptedOperation`, `failureReason`, `originalFailureReason`, `resolved`, `occurredAt`, `createdAt`. **`slipId` 미노출**(UUID 비공개 — slipNo 만).

## 도메인/저장소

- `SerialCompensationFailure.resolve()` 도메인 메서드 추가(`resolved=true`, append-only 원칙이나 resolved 플래그는 운영 정합 상태 전이라 허용 — setter 금지·메서드 위임).
- Repo: `Page<SerialCompensationFailure> findByResolvedOrderByCreatedAtDesc(boolean resolved, Pageable)`.

## retention

- 스케줄러 자동 정리는 **descope**(운영 정책 미확정). 운영 가이드 문서화(90일 경과 `resolved=true` 행 수동/배치 정리 절차) + DECISIONS 후속 명시. (무한 누적은 복구 API 로 resolved 표시 → 추후 정리 대상 식별 가능.)

## FE (desktop)

- `CompensationFailuresPage` 신규 route: 목록 테이블(발생일시/slipNo/slipType/phase/productCode/attemptedOperation/failureReason/resolved) + `resolved=false` 기본 필터(전체 토글) + 행별 "해소 처리" 버튼(확인 다이얼로그 → PATCH resolve → 목록 갱신).
- design-system 재사용(Button/Modal/Badge/Table 등 — 자체 컴포넌트 금지). resolved 행 Badge(Warning→Neutral). UUID 비노출(slipNo).
- 사이드바 진입점(인사/관리 또는 재고 카테고리) + `@RequirePermission`/PermissionGuard(inventory.list).
- api client + mock.ts 핸들러(목록/resolve).

## 검증

- BE 단위 + IT(실 Testcontainers, skipped=0): 목록 resolved 필터/페이지, resolve 전이(false→true)·멱등, 권한 가드.
- FE: tsc 0 + Playwright(mock) 목록/해소 흐름.
- Docker 실 QA: 복구 API 실 호출(보상실패 행 1건 seed 또는 기존) + PATCH resolve → psql `resolved=true` 확인 + 화면 실 캡처.

## 자기검토

- resolve 멱등(이미 true 면 무변경). UUID 비공개(slipId 응답 제외). append-only ↔ resolved 전이 정합(감사행 자체는 불변, resolved 만 운영 상태). 권한 가드 page/action 소스 정합.
