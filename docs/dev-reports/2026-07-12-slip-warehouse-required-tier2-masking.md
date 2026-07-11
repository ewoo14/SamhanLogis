# 출고/입고전표 창고 필수화 + Tier2 500 마스킹 해소 (결정 A, #793)

- **일자**: 2026-07-12
- **PR**: #793 · **연관**: Slip null-warehouse 개발책임자 결정 A · #789 Tier2 마스킹 잔재 종결
- **워크플로우**: Codex 구현(TDD RED→GREEN) → Opus 5-agent(BE/FE/Design/DevOps/QA·실HTTP+라이브 Docker curl) → fix(CI allowlist) → Codex 5-agent 적대 → 0수렴 → CI → 머지.

## 배경 (계약 모순)
`MobilePartnerOrderRequest` 는 "현장주문 sourceWarehouseId 생략 가능·사후 editHeader 갱신"(@NotNull 없음)인데 `Slip.createOutbound` 는 창고 null 이면 `IllegalArgumentException` throw → GlobalExceptionHandler catch-all **500 마스킹**. #789서 이 fix가 모바일 계약 충돌로 revert됨. **개발책임자 결정 = A(출고전표는 항상 창고 지정).**

## 변경
- `Slip.createOutbound:638`/`createInbound:667`: 창고 null → `BusinessException(INVALID_INPUT, "출고/입고 창고가 필수입니다")` (500→400·UUID/필드명 미노출). sibling(입고) 동시 sweep.
- `MobilePartnerOrderRequest.sourceWarehouseId`: "생략 가능·사후 갱신" 계약 제거, 창고 필수는 **도메인 팩토리(`Slip.createOutbound`)에서 enforce**(CreateSlipRequest sibling 패턴 일관 — @NotNull 미부여). *(초기 @NotNull은 Codex 적대 라운드서 GEH validation 필드명 노출 지적 → 제거하고 도메인 체크로 위임. clean 메시지 보장.)*
- `MobileSalesController`/`SlipService`/`EstimateToSlipConverter`: Javadoc 정합(견적 전환은 origin/main부터 placeholder 창고 UUID 사용 — 결정 A 무영향).
- SlipDomainTest/MobilePartnerOrderRequestTest 회귀 신설.
- **CI allowlist(ci.yml) fix**: slip-units 그룹에 `com.samhanair.logis.slip.mobile.dto.*` 등재 — 신규 MobilePartnerOrderRequestTest CI 미실행(false-green) 해소.

## 리뷰 disposition
- **BE(PASS)**: INVALID_INPUT→400·GEH handleBusiness 커스텀메시지·@NotNull enforce·EstimateConverter placeholder 무영향(git show origin/main 대조)·고위험 sibling sweep 0.
- **FE(PASS·핵심)**: mobile-staff PartnerOrderCreateScreen은 **dormant(AppRootNavigator 미마운트, EstimateWebView 단일)**·실 현장주문=clients/mobile→order-app→**partner-order-service**(slip 아님, PublishFromPartnerOrderRequest.warehouseCode 이미 @NotBlank). desktop SlipForm 이미 창고 required 게이트 → **결정 A 순증 회귀 0**. "나중에" flow는 FE 애초 부재.
- **Design(PASS)**: 메시지 "출고/입고 창고가 필수입니다"가 desktop SlipForm 라벨("출고 창고"/"입고 창고")과 글자 단위 일치·전표 용어 준수·조건부 필수를 도메인 팩토리에서 처리 타당.
- **DevOps(HIGH→fix)**: 신규 MobilePartnerOrderRequestTest가 ci.yml allowlist 미등재로 CI 미실행 false-green 포착 → mobile.dto.* 등재로 해소.
- **QA(GREEN)**: 모듈전체 1218 tests 0-fail(`--rerun-tasks`)·EstimateControllerIT 13/13(placeholder 무영향)·실HTTP MockMvc 400 2종·**라이브 Docker curl 전체스택 재빌드**(창고null→400/지정→201 slipNo 2026/07/15-1/입고null→400) 3레이어 실증. 핵심결함=500 상태마스킹(구 메시지 필드명은 handleUnknown이 폐기해 실노출 안 됨).
- **Codex 적대(R1 MEDIUM→fix·R2 해소)**: @NotNull이 모바일 null 창고를 bean validation으로 돌려 GEH가 `sourceWarehouseId` 필드명 노출(QA 라이브 curl은 일반 slip 도메인경로만 봐서 놓침) → **@NotNull 제거·도메인 위임**(CreateSlipRequest 일관)·MobilePartnerOrderServiceTest 신설(필드명 미포함 실증). R2 LOW(MobileSalesController Javadoc stale) 정정. 0수렴.

## 후속 참고 (본 PR 범위 밖)
- `clients/mobile-staff` P1-4 영업 native 앱(PartnerOrderCreateScreen/sales.ts)은 dormant + URL/DTO drift(`/api/v1/slips/mobile-order` 미존재 경로·partnerId UUID·sourceWarehouseId 필드 부재) — 향후 활성화 시 재정렬 필요. 본 PR과 무관·pre-existing.
- MASTER 빌트인 그룹에 sales.slip.create 권한행 시드 부재(QA 관찰) — 별도 확인 권고.
