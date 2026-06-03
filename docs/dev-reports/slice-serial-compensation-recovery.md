# Slice: 시리얼 보상 실패 복구 API + 운영자 화면 (ⓑ 후속)

> branch `feat/serial-compensation-recovery` / 2026-06-03 / slip-service(BE) + desktop(FE).
> #351(분산보상 견고화, D-SER-22)의 관측 → **정합(복구) 루프 완성**. DECISIONS D-SER-23.

## 1. 목표

#351 이 보상 실패를 `serial_compensation_failures`(append-only, `resolved`)로 영속·관측했으나 운영자 조회·수동 정합 수단이 없었음(Designer/DevOps 후속 권고). 본 슬라이스가 복구 API + 데스크탑 화면으로 완성.

## 2. 구현 (D-SER-23)

### BE (slip-service)
- `SerialCompensationFailure.resolve()` 도메인 메서드(`resolved=true` 전이, 이미 true 면 no-op — setter 금지).
- `SerialCompensationFailureRepository.findByResolvedOrderByCreatedAtDesc(boolean, Pageable)`.
- `CompensationFailureResponse`(record, **slipId 제외 — UUID 비공개**) + `from(entity)`.
- `CompensationRecoveryService`: `findFailures(resolved, pageable)` / `resolve(id)`(미발견 404).
- `CompensationRecoveryController`: GET `/api/v1/slips/compensation-failures`(@RequirePermission inventory.list **VIEW**) + PATCH `/{id}/resolve`(inventory.list **UPDATE**).

### FE (desktop)
- `CompensationFailuresPage`: 8컬럼 목록(발생일시/slipNo/유형/단계/품목/시도동작/실패사유/해소) + `resolved=false` 기본 필터 토글 + 행별 해소 처리 Modal(확인 → PATCH → 갱신) + 배지(미해소 Warning/해소 Neutral) + 빈목록/로딩/에러 + 페이지네이션. **design-system 100% 재사용**(Button/Modal/Badge/Card/Spinner), **UUID 비노출(slipNo)**.
- `compensationFailureApi`(목록/resolve) + `mock.ts` 핸들러(seed 3건 + resolve 상태보존) + route(`/inventory/compensation-failures`, PermissionGuard inventory.list) + 사이드바("창고 운영 → 보상 실패 복구").

## 3. 검증

- BE: `:services:slip-service:test` **800 tests / 0 fail / 0 skip**. 신규 `CompensationRecoveryControllerIT` 6 + `CompensationRecoveryServiceTest` 3(resolve 멱등/404/권한 403 가드 reflection 검증).
- FE: `tsc --noEmit` 0 + Playwright(mock) `compensation-failures` **6/6 pass**.
- Docker 실 QA: `docs/qa/slice-serial-compensation-recovery/`.

## 4. retention (descope — 운영 가이드)

자동 정리 스케줄러는 본 슬라이스 **descope**(운영 정책 미확정). 운영 절차: `serial_compensation_failures` 무한 누적 방지를 위해 **90일 경과 + `resolved=true`** 행을 주기적(배치/수동) 정리 권장. 미해소(`resolved=false`) 행은 복구 API 목록(기본 필터)으로 상시 식별 → 운영자 정합 후 resolve 표시. 자동 retention 잡은 후속 슬라이스.

## 5. 후속

- notification-service 운영 알림 푸시(미해소 건수 경보).
- 자동 retention 스케줄러.
- 자동 재시도(outbox/Saga) — D-SER-05 근본 해소.
