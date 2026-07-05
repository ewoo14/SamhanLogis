# 2026-07-05 — #720 월마감 실행 실패 fix (PR #732)

> 월마감(month-end close) 실행 100% 실패(#719 QA 라이브 적발 사전결함) 근본 해소. 서비스간 auth 파손(#665 internal-auth 계열).

## 근본원인 (2건)
1. **auth**: accounting `MonthEndCloseService`→`SlipServiceClient`→slip `POST /slips/lock-by-period`. 이 엔드포인트가 public `/slips/**`(InternalTokenFilter **no-op**)+`@RequirePermission(slip.period-lock UPDATE)`인데, 서비스간 호출은 X-Internal-Token만·user context 없음(게이트웨이 미경유) → 403 → client onStatus(4xx) → 409.
2. **body 필드 불일치**: client가 `from/to` 전송·서버 DTO `LockByPeriodRequest(startDate/endDate)` → auth 통과해도 @NotNull 400.

## fix (#665 internal-auth 패턴)
- slip `POST /internal/slips/lock-by-period` 신설(SlipInternalController·`/internal/` prefix→InternalTokenFilter가 X-Internal-Token→`system-internal` principal·`@PreAuthorize hasRole('MASTER')` 이중게이트·`@RequirePermission` 제거). public 제거. `slipService.lockByPeriod` 무변경.
- accounting `SlipServiceClient` 경로 `/internal/`·body `startDate/endDate` 정정.

## 리뷰 (실행=게시 1:1·표 게시)
Opus 5-agent R1(핵심 fix 0 blocking·QA 라이브 월마감 성공 실증)+fix(401 IT 케이스·Design MED 마감 3화면 apiError.ts 스윕) → Codex 순차 0수렴.

## 검증
- BE: accounting 1124·slip 1173 **0 fail**(--rerun-tasks --no-build-cache). `SlipServiceClientTest`(MockRestServiceServer 실-HTTP 계약·@MockBean 우회 금지·RED→GREEN 실증)·`SlipLockByPeriodInternalIT`(X-Internal-Token 실 HTTP·有200/無403/오류401).
- **라이브 QA**(Docker 재빌드·게이트웨이 :8080·dev_master·mock OFF): 월마감 실행 **성공**(2026-02 HTTP 201 lockedSlipCount 4·2026-04 1·DB lock_flag/accounting_periods 정확 persist)·기존 100% 실패 해소 실증. 스샷 6장(SHA-pinned PR 인라인+SendUserFile).

## 후속/별건 (#720 동종 sweep 적발)
- **🔴 #25 X-Is-System-Master 누락(P0급)**: C5-4(#415) 회귀 — slip/partner-order 3 client가 X-Is-System-Master 미전송 → 재고예약/해제·주문확정 이론상 403(@MockBean 은폐). 라이브 실증+fix 시급.
- **#26 ChatRoomMappingClient 404**: URL 불일치 → 단톡방 이름 상시 '-'. URL 정정.
- slip.period-lock dead permission(FE matrix orphan·V36 불변) — FE 정리 후속 task.
- [P3] 마감 이력 실행자 UUID 노출(pre-existing·#720 무관).

## 교훈
- **서비스간 caller가 public @RequirePermission 엔드포인트 호출 = 403 파손 계열**([[feedback_it_mockbean_external_clients]]·[[feedback_restclient_contract_test_false_green]]) — @MockBean이 IT서 은폐. 실-HTTP 계약 테스트 필수. #720 sweep가 동일 계열 2건(#25/#26) 추가 적발.
