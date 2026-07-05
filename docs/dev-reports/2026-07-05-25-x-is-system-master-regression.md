# 2026-07-05 — #25 X-Is-System-Master 회귀 fix (PR #734·P0)

> #720 월마감 fix의 BE 동종 sweep가 적발한 **P0 회귀**. C5-4(#415) 이래 재고예약/해제·주문확정 서비스간 호출이 403(재고부족/재시도로 은폐). 라이브 실증 완료.

## 근본원인
- **C5-4(#415·2b62a6f07)**: `PermissionAspect.isMasterBypass`를 `X-Is-System-Master=="true"` **단독 판정**으로 전환(role==MASTER 폴백 제거).
- **같은 커밋**이 3 client에서 `X-User-Role:MASTER` 제거하며 **`X-Is-System-Master:true` 미추가**(partner-order InventoryClient 주석/코드 불일치): slip InventoryClient(reserve/release/deduct/inbound/serial batch)·partner-order InventoryClient(reserve/release)·partner-order SlipServiceClient(from-partner-order/merge).
- 수신 endpoint(@RequirePermission·/internal 아님)→account 모드→sentinel X-User-Id→grant 없음→**403**. @MockBean DynamicPermissionClient(lenient true)로 IT 전수 은폐.
- **은폐 이중화**: slip InventoryClient가 4xx→CONFLICT("재고 부족")·partner-order가 4xx→INVALID_INPUT("재시도")로 재코딩 → 403이 재고부족/재시도 오류로 위장돼 **원인 미노출**(진단 지연).

## fix
- 3 client에 `X-Is-System-Master:true` 헤더 추가(inventory SlipClient 선례 미러)·role bypass 복원·주석 정정. 실-HTTP 계약 테스트(MockRestServiceServer·헤더 단언).

## 리뷰 (실행=게시 1:1·표·Codex 라운드도 라이브 QA)
Opus 5-agent R1(BE/FE/DevOps/Design 0·**QA 라이브 P0 확정**)+Codex 순차 라운드(**Codex 직접 라이브 QA 독립 재확인**) → 0수렴.

## 검증
- BE: slip 1174·partner-order 326·inventory 520 **0 fail**. 계약 RED→GREEN(3 client main 복원 시 **26/37 fail**·X-Is-System-Master 헤더 단언). sweep 독립 재확인(6파일 중 3fix+1선례[inventory SlipClient]+2비대상[EcountRemoteImport 실 userId·arologis /auth/internal]).
- **라이브 QA(Opus QA·Docker 재빌드·실 UI)**: fix 前 전표 accept→409(403 래핑)·주문확정 실패 → fix 後 accept **200**(stock_instances AVAILABLE→RESERVED DB 실변동·slipNo 정확)·reject release 복원·주문확정 **200**(stock_balances available 85→84/reserved 0→1·전표 자동발행). 스샷 8장(SHA-pinned+SendUserFile).
- **Codex 라운드 독립 라이브 QA**: `POST /inventory/reserve` +X-Is-System-Master → 200·DB 498→497,1·헤더 제거 음성대조 403·release 복원. 코드 변경 0(사후 git diff 검증).

## 교훈
- **서비스간 caller가 X-Is-System-Master 미전송 = master bypass 실패 → account 모드 403 계열**([[feedback_it_mockbean_external_clients]]·[[feedback_enforcement_real_http_test]]). @MockBean이 IT서 은폐 + 에러 재코딩(CONFLICT/INVALID_INPUT)이 원인 위장. C5-4류 헤더 계약 변경은 실-HTTP 계약 테스트 + 라이브 QA 필수.
- **#720 sweep → #25 P0 적발**: 결함 fix 시 동종 sweep([[feedback_defect_family_sweep_fix]])가 진짜 critical 회귀를 잡음.
