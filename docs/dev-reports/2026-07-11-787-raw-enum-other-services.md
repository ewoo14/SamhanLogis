# #787 raw enum sweep 확장 — inventory/partner/partner-auth/notification displayName SSOT (#788)

- **일자**: 2026-07-11 (집PC)
- **PR**: #788 `fix/787-raw-enum-other-services`
- **연관**: #787(#786 후속) · #721/#724/#725/#786 선례
- **워크플로우**: 표준 Opus(PM)+Codex 듀얼리뷰

## 배경
#786(slip/partner-order raw enum sweep)의 **타 서비스 확장**. #786서 초기 recon이 하위패키지·`+ s` 로컬변수를 놓쳐 재수렴 3패스 소요한 교훈([[feedback_defect_family_sweep_fix]] §4) 적용 → 이번엔 정찰을 **bare var + `getStatus()`(enum반환) + 하위패키지 전수**로 착수.

## 스코프
inventory/partner/partner-auth/notification 4서비스 **사용자노출 예외메시지 raw enum → displayName SSOT**. Tier2 non-enum 500·인쇄라벨·UUID는 #787 잔여 후속.

## 변경 (production 15 + test 8·라벨 fix 포함)
### 신규 displayName SSOT 4개 (FE parity)
- `StockInstanceStatus`(inventory): 가용/예약/출고완료/**회수완료**(리뷰 반영: 회수됨→회수완료 대구)
- `PartnerStatus`(partner): 거래중/거래중지/거래종료 — FE `PARTNER_STATUS_LABEL` 1:1 일치
- `PartnerStatus`(partner-auth·별개, 10값): …/**장기미발주**/**접근제한**(리뷰 반영: FE 로그인게이트 용어·의미상 무발주 정합)
- `NotificationStatus`(notification): 발송대기/성공/실패/재시도중

### raw enum → displayName 치환 (18곳)
- inventory: StockTransfer(5)·StockInstance(2)·InventoryAudit(2)·InboundInspection·InventoryEditRequestService(`+ s`)·InboundInspectionService(slip status 로컬 라벨 helper·slip-service SSOT 동기화 주석 추가)
- partner: PartnerCreditService·PartnerExcelExportService(로컬 statusLabel switch 제거→SSOT·**Excel "상태" 셀값 "거래정지"→"거래중지"**로 기존 FE 불일치 정정)
- partner-auth: PartnerAuth · notification: NotificationRequest·DispatchBatchSendService(응답 DTO `reason` 필드)

## 리뷰 — Opus 5-agent 전원 PASS(blocking 0·dev-report 보완 후)
- **BE**: SSOT 정합·치환 정확·raw enum 잔존 0·**Tier0 masking 재확인**(partner-auth/notification IllegalState는 각 ExceptionHandler 409/400·masking 아님·승격 불요). dev-report 누락 BLOCKING→본 문서로 해소.
- **Design**: 4 SSOT 라벨 FE parity(1:1 또는 미소비)·cross-service drift 0(InboundInspection SLIP 라벨 slip-service 100% 일치). 라벨 3건 비차단 권고→반영.
- **FE**: 계약 파괴 0(상태코드/DTO/필드명 불변)·mock에 해당경로 시뮬 없음(raw enum mock 위반 0)·Excel 정정 확인.
- **DevOps**: CI 4서비스 JUnit 잡 pass·마이그 0(@Enumerated(STRING)+displayName만·DB값 불변).
- **QA**: 테스트 genuine(RED→GREEN)·잔존 raw enum 판정 — MEDIUM `InboundInspectionController:189`은 **API 쿼리파라미터 검증**(wire값 PENDING/COMPLETED/CANCELED 안내가 정당)이라 미수정, HIGH `DefaultEditLockGuard`(shared 14-service)는 별도 이슈.

## 검증
- **inventory 521 + partner 314 + partner-auth 58 + notification 219 = 1112 tests 0-fail**(genuine·`--rerun-tasks --no-build-cache`·Testcontainers)·라벨 fix 후 재실행. RED 확인·raw enum 잔존 0 자가검증.
- 상태코드 불변(Tier0 없음)이라 라이브 probe crux 아님(실HTTP IT 기존 커버).

## 후속 분리
- **HIGH: `shared/realtime-abstraction/DefaultEditLockGuard`**(제네릭 `T status` raw·14-service 공유·`LockedException` Javadoc이 raw enum을 설계로 명시) — 별도 이슈(shared 모듈 범위·라이브 probe 확정 권고).
- #787 기존 잔여(Tier2 non-enum 500·PartnerOrderPrintService 인쇄라벨·UUID)·LOW(DpsSaveMode/DispatchSmsSaveMode/NotificationChannel = displayName 미보유 API 계약값)·선존재 FE 라벨불일치(SlipDetailPage 등).
