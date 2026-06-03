# 시리얼 보상 실패 복구 — 구현 계획 (ⓑ 후속)

> spec: `docs/superpowers/specs/2026-06-03-serial-compensation-recovery-design.md`. slip-service(BE) + desktop(FE).

**Goal:** `serial_compensation_failures` 복구 API(목록 + resolve) + 운영자 화면. D-SER-22 의 관측 → 정합 루프 완성.

**대원칙:** BaseEntity 7 audit / 도메인 메서드(setter 금지) / UUID 비공개(slipNo, slipId 미노출) / IT skipped=0 / design-system 재사용 / RequirePermission 가드.

---

## Task 1 (BE): 도메인 + 저장소
- `SerialCompensationFailure.resolve()` — `resolved=true` 전이(이미 true 면 무변경). setter 금지.
- `SerialCompensationFailureRepository.findByResolvedOrderByCreatedAtDesc(boolean, Pageable)`.
- 커밋 `feat(slip): 보상실패 resolve 도메인 + resolved 조회 (D-SER-23)`

## Task 2 (BE): 복구 컨트롤러 + 서비스 + DTO
- `CompensationFailureResponse`(record, slipId 제외 — UUID 비공개) + `from(entity)`.
- `CompensationRecoveryService`: `findFailures(resolved, pageable)` / `resolve(id)`(미발견 404, resolve() 위임).
- `CompensationRecoveryController`: GET `/api/v1/slips/compensation-failures`(@RequirePermission inventory.list VIEW) + PATCH `/{id}/resolve`(inventory.list UPDATE).
- 커밋 `feat(slip): 보상실패 복구 API (목록 + resolve)`

## Task 3 (FE): 화면 + api + mock + 사이드바
- `CompensationFailuresPage.tsx`: 목록 테이블 + resolved 필터 토글 + 행별 해소 버튼(확인 다이얼로그 → PATCH → invalidate). design-system Button/Modal/Badge 재사용. UUID 비노출.
- api client(목록/resolve) + mock.ts 핸들러(seed 보상실패 2~3행 + resolve 상태보존).
- route 등록 + 사이드바 진입점 + PermissionGuard(inventory.list).
- 커밋 `feat(desktop): 보상실패 복구 화면 + 사이드바 진입`

## Task 4: 테스트
- BE 단위(서비스 resolve 멱등/404) + IT(목록 resolved 필터·페이지, resolve 전이, 권한). skipped=0.
- FE Playwright(mock): 목록 렌더 + 해소 → resolved 배지 전환.
- 커밋 `test: 보상실패 복구 BE IT + FE Playwright`

## 배포 순서
slip(BE) → desktop(FE). FE 는 mock 으로 독립 개발 가능.

## retention
운영 가이드 문서(`docs/` 또는 dev-report) — 90일 경과 resolved 정리 절차. 스케줄러 descope. DECISIONS D-SER-23 명시.

## 자기검토
- resolve 멱등. UUID 비공개(응답 slipId 제외, 화면 slipNo). RequirePermission page/action 소스 정합. mock seed 가 BE 계약(shape) 일치.
