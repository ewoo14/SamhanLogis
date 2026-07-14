# 2026-07-14 · #804 arologis 배차 상세 FE-BE 계약 정합 (Approach A)

**PR**: #814 · **정본 방향**: Approach A(계약정합 + GPS/알림 미구현 이연) · 개발책임자 승인 2026-07-14
**스펙**: `docs/specs/804-arologis-dispatch-detail-contract-spec.md` · **QA**: `docs/qa/804-arologis-dispatch-detail-contract/`

## 1. 문제
arologis-desktop `DispatchDetailPage`(SP-10-2 FE-1~4 완성)가 실 BE `DispatchDetailResponse`(얇은 초기 DTO)를 **무매핑 캐스팅**하여 필드명 불일치로 런타임 대부분 `undefined` → 배차 상세가 placeholder/공백으로만 렌더(#803로 크래시는 없으나 무의미·matchStatus 항상 "대기 중" 고정). 정찰 결과 **SP-10-2 FE는 완성됐으나 BE는 절반만 배선**.

## 2. 정본 방향 (Approach A)
- **지금 배선(BE 실재)**: matchStatus←status(VehicleStatus 6값 1:1)·tonnage/dispatchType→라벨·routeLabel/stopCount←stops 파생·driverCode·vendorOrderId(도메인 실재·DTO 미노출).
- **이연(BE 미구현)**: notifyResults(알림 이력·arologis 무연결·notification-service 별도·enum 불일치)·gpsSources(driver_locations write-only·Insung LBS 미구현)·sandboxMode(config-only·DTO 주입).

## 3. 변경
### BE (arologis-service·최소 additive)
- `DispatchDetailResponse`: `sandboxMode`(top)·`VehicleDetail.vendorOrderId` additive(externalRefId 유지). `from()` sandboxMode 파라미터. `ArologisAdminController.findById`가 `matcherProperties.getInsungQuick().isSandboxMode()` 전달. @Schema/한국어 Javadoc.
### FE (arologis-desktop·BE 미러링+어댑터)
- 신규 `api/arologisDispatchDetail.ts`: raw wire 타입(BE 1:1) + `mapDispatchDetail` 어댑터(enum→라벨·route/stopCount 파생·status→matchStatus·**matchSource 보존**·notify/gps undefined) + `getDispatchDetail`.
- 라우트 래퍼 무매핑 캐스팅 제거·경로 `/api/arologis`→`/admin/arologis`(sibling 정합 FIX). `VehicleDetail.id` 제거(UUID 비공개).
- `VehicleMatchStatusBadge`: **INSUNG pill·vendorOrderId 툴팁·인성 aria·MATCHING 서브텍스트**를 `matchSource==='EXTERNAL_INSUNG_QUICK'` 에만 gate(비-인성 배정 오표시 방지). GPS 패널은 gpsSources 데이터 있을 때만.
- QA 하네스 `vite.renderer.dev.config.ts`에 `/admin/arologis` proxy passthrough.

## 4. 리뷰 (표준 캐논·양측 0수렴·4라운드)
- **R1 Opus 5-agent**(FE/BE/Design/DevOps/QA): F1 routeLabel 고아 구분자/화살표·F3 deprecated 톤수·QA 하네스 프록시 갭·@Schema "슬립"→"전표"·IT sandboxMode 고정 → Opus fix + 라이브 QA.
- **R2 Codex 적대검증**: genuine **HIGH — matchSource 오표시**(비-인성 배정이 "INSUNG" pill) 발굴 → Codex fix + 라이브 before/after(pill 2→1).
- **R3 Opus 재수렴 5-agent**: **F-new-1 MEDIUM**(MATCHING 서브텍스트 인성문구 미gate·디펙트-패밀리 미완주)·**F1-QA MEDIUM**(matchSource 계약 auto-guard 부재·false-green)·F2(deprecated 톤수 BE "UI 노출 금지" 상충→'기타')·F-new-2(DELIVERED AA) → Opus fix + 라이브 QA(MATCHING 서브텍스트 gate).
- **R4 Codex 최종**: 0 new blocking → **양측 0수렴**.
- 각 라운드가 상대 놓친 genuine 결함 포착 = 단축금지 정당성 실증.

## 5. 검증
- FE: typecheck·**vitest 37/37**(어댑터·badge gating·routeLabel 엣지·matchSource 계약).
- BE: `--rerun-tasks --no-build-cache` BUILD SUCCESSFUL·DispatchDetailResponseTest 2·ArologisAdminControllerIT 13(matchSource jsonPath·미스킵)·0-fail.
- 라이브 QA: Docker 실서버 :8097(mock OFF·admin)·ASSIGNED "매칭 완료"·DELIVERED "배송 완료"·MATCHING 서브텍스트 gate·INSUNG pill matchSource 게이팅·GPS/알림 비표시. 투명 시드(vendorOrderId·MATCHING status)+즉시 롤백.
- CI: arologis-ci 전 잡 + qa-e2e Desktop Playwright hard gate.

## 6. 이연 (후속·제품/정책 확인)
- **FE-3 알림 백엔드**(dispatch 상관저장+notification-service 조회+enum 매핑)·**FE-2 GPS 백엔드**(driver_locations 조회+Insung LBS 수집기·게이트 원복)·정차 상세 행 렌더·routeLabel 지역 토큰화·긴 이름 truncation.
- **전자서명 수신** DELIVERED 표기 matchSource-독립(인성 전용 여부 제품 확인)·**sandbox 배너 "실 기사 배정 없음"** 문구 vs 실 기사코드 표시(정책 확인)·deprecated 레거시 톤수 표시 정책(정규화 vs '기타').
