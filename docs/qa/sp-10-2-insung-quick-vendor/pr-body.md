# SP-10-2 인성데이타 퀵프로그램 vendor 통합 (W10-2)

> 연관 Plan: [`docs/planning/2026-05-19_sp-10-2-insung-quick-program.md`](../../planning/2026-05-19_sp-10-2-insung-quick-program.md)
> Phase 10 W10-1 후속 (mock vendor → 실 vendor 통합 layer)
> 베이스: `main` (`b76d3cc6` SP-D4 머지 직후)

## 슬라이스 목표

W10-1 머지 산출 (`InsungQuickDriverMatcher` placeholder, MatcherConfig, ack-only Internal) 위에 **실 vendor 통합 layer** 추가. 실 API 정보 미확정 상태에서도 SP-09 vendor 시리즈 패턴 일관 적용 (sandbox/placeholder guard/MockBean IT). 통합 PR 1건 머지. `arologis-desktop` 만 영향, `arologis-mobile` 영향 0, 사이드바 영향 0.

## 변경 요약

### BE (14 신규 + 10 수정, BUILD SUCCESSFUL)
- `InsungQuickClient` interface + Impl (4 method, 6 키워드 placeholder guard, 502 `INSUNG_QUICK_NOT_CONFIGURED`)
- `InsungQuickDriverMatcher` 실 구현 (fail-soft, `MatchSource.EXTERNAL_INSUNG_QUICK`)
- `ArologisInternalController` 3 webhook endpoint (`match-result/status-update/delivered`) + HMAC SHA-256 이중 검증 (sandbox 우회)
- `ArologisMatcherProperties` `InsungQuick/Notify/Gps` 중첩 클래스
- V13 Flyway `vehicle.vendor_order_id + vendor_status` + partial unique index
- `InsungQuickIntegrationIT` 5 case (TC-1~5)
- `Phase10VendorPlaceholderGuardConsistencyTest` (SP-09 패턴 일관)
- `@EnableRetry` + spring-retry/aspects 의존성
- `SignatureSource.EXTERNAL_INSUNG_LBS` enum 확장

### FE (typecheck/lint/build PASS, cycle 1+2)
- `tokens.css` `--color-insung-*` 6종 light + dark (WCAG AAA 10.2:1)
- `VehicleMatchStatusBadge` (4 상태 + INSUNG 뱃지 + aria-live + Spinner 재사용)
- `InsungLbsPanel` (4 GPS source + stale 60s + 실시간 경과 + `data-active`)
- `DispatchDetailPage` NotifyResultSection + sandbox 배너 + vendorOrderId tooltip
- `maskPhone` util
- `routes/index.tsx` `/dispatches/detail/:dispatchCode` 라우터 mount
- testid 11종 부여 (cycle 2 FE↔QA 정합)

### Designer (5 markdown)
- 4단계 vendor 매칭 시각화 wireframe + tokens.md + notification-row + GPS priority + print impact 0

### QA (Playwright 14 test, TypeScript 컴파일 PASS)
- `sp-10-2-insung-quick-vendor.spec.ts` 6 case 14 test
- 시나리오 + IT cross-check + domain integrity + 사이드바 영향 0 docs
- `mockDispatchDetail` 단일 endpoint mock (cycle 2 정합)
- 진입 URL `/#/dispatches/detail/D-001`

### DevOps (shellcheck PASS)
- env-template 9 환경변수 (4 키 빈 값 의무, SP-08-8 일관)
- `sp-10-2-insung-key-rotation.md` 운영 가이드
- `check-credential-plaintext.sh` PATTERN_INSUNG 추가
- `docker-compose.arologis.yml` 환경변수 11개 전달
- `arologis-ci.yml` credential-guard job 추가

## TM cross-check 결과 (8/8 PASS)

| Check | 결과 |
|---|---|
| UUID 정합성 | ✅ vendor_order_id VARCHAR(64) vendor 문자열, driverCode `INSUNG-<vendorId>` |
| API contract | ✅ webhook + HMAC + ApiResponse + FE↔QA testid (cycle 2 정합) |
| 디자인 일관성 | ✅ tokens.css insung 6종 + WCAG AAA + Spinner 재사용 (신규 컴포넌트 0건) |
| 도메인 정합 | ✅ DriverMatcher → Driver upsert → MatchSource 정렬 |
| Flyway V13 | ✅ V1 base + NULLable + ddl-auto=validate + partial unique index |
| SP-09 vendor 패턴 | ✅ placeholder/sandbox/MockBean/CI grep 모두 일관 |
| SP-D 시리즈 회귀 | ✅ webhook = X-Internal-Token + HMAC (동적 RBAC 분리), 사이드바 영향 0 |
| 컴파일 검증 | ✅ BE assemble/testClasses, FE typecheck, CI grep 가드 |

## W10-3 이연

- 모바일 어플 GPS 보강 정밀화
- 어플 설치 invite (Aligo deeplink)
- Counter.builder 실 구현 (SP-D5)
- 인성 vendor 알림톡 템플릿 등록 (비즈니스 협약 후 운영 task)

## QA 스크린샷

- Playwright 14 test (BE+FE 통합 후 CI 캡처)
- 사이드바 영향 0 확인 spec (QA-6)

## 메모리 가드 일관성

- ✅ `feedback_multi_agent_team_pattern.md` (Designer 선행 + 4-team 병렬)
- ✅ `feedback_integrated_pr_pattern.md` (단편 PR 금지)
- ✅ `feedback_it_mockbean_external_clients.md` (@MockBean + lenient stub)
- ✅ `feedback_korean_commits.md`
- ✅ `feedback_dual_5agent_review.md` (양쪽 5-agent 리뷰 예정)
- ✅ SP-08-8 자격 평문 비공개 가드

🤖 Generated with [Claude Code](https://claude.com/claude-code)
