# #725 후속 raw enum sweep — slip·partner-order 예외 메시지 displayName + Tier0 500 승격 (#786)

- **일자**: 2026-07-11 (집PC)
- **PR**: #786 `fix/725-followup-raw-enum-sweep`
- **연관**: #725(PR #763) 후속 잔여 · #721/#724 선례 패턴
- **워크플로우**: 표준 Opus(PM)+Codex 듀얼리뷰 — 정찰 → Codex 구현 → Opus 5-agent+fix+라이브probe → Codex 5-agent+재수렴(R1~R3) → 0수렴 → CI → 머지

## 배경
#725(CLOSED)가 slip **배차(dispatch)** 도메인의 `IllegalStateException` 상태전이 메시지를 `BusinessException(409)+displayName SSOT`로 승격하고, dev-report에서 **잔여**로 위임: PartnerOrder·Slip/Estimate raw enum·EstimateService 500마스킹. 본 PR이 그 잔여를 처리하고, 정찰·듀얼리뷰 중 **#725가 인지 못한 genuine 500 마스킹 + 다수 raw enum**을 추가 포착.

## 스코프 (2서비스)
slip-service + partner-order-service의 **사용자 노출 예외 메시지 raw enum → displayName SSOT** + **Tier0 genuine 500 마스킹 승격**. 신규 발견 타 서비스(inventory/partner/notification)·Tier2(non-enum 500)·인쇄라벨(PartnerOrderPrintService)·docs/qa 과거증적은 **후속 분리**.

## 변경 (사용자노출 예외메시지 raw enum 전수 → displayName/getKoreanLabel)
- **Tier0 500 승격**: `Slip.validateTagDirection`(IllegalArgument+DeliveryTag/SlipType→500→**400** BusinessException(INVALID_INPUT))·`Slip.assignPublishSource`(IllegalState+SlipSourceType→500→**409**).
- **PartnerOrderStatus displayName SSOT 신설**(진행중/보류/확인중/완료/취소/전환완료·FE `PARTNER_ORDER_STATUS_LABEL` 1:1 parity).
- **raw enum→displayName**: PartnerOrder(4)·PartnerOrderUpdateService·Estimate(3)·Slip(7)·SlipEditRequest(2)·DeliveryAttachmentController + **재수렴 추가분**: Slip dispatch 메시지(3)·DispatchVehicleTypeMatrix(6·bodyType/tonnage)·"현 단계 (enum)"(SlipService 4·SlipEditRequestService 3·PartnerOrderEditRequestService 3)·SlipOutboundCutoff(deliveryTag).
- **문법/parity fix**: 메시지 재구성(전표중복·조사·은/는)·Javadoc @throws 5곳·mock.ts + step4 spec parity.

## 리뷰 — Opus 5-agent + Codex 5-agent (0수렴까지 재수렴)
- **Opus 5-agent**: BE(Tier0 승격 genuine·no-blocking)·**Design(2 BLOCKING: 전표중복·조사공백)**·FE(순수개선·라벨 parity)·DevOps(CI 26 green)·QA(라이브 probe). → PM 직접 fix.
- **Codex 5-agent (R1→R3)**: 적대 재검증이 **recon 대폭 누락분**(dispatch 하위패키지·`+ s` 로컬·editrequest 서비스)을 3패스 추가 포착 → 전부 fix → **R3 clean·genuine 0수렴**. `feedback_review_5agent_no_shortcut_strict`(순차·독단머지 금지·재수렴) 실증.
- **판단 dispositions**(독단 아님·Codex 타당 확인): #1(service "정합되지 않습니다" vs domain "사용할 수 없습니다"=다른 연산 유지)·#3(PartnerOrderPrintService 인쇄라벨=design intent 후속)·#5(docs/qa 과거증적 분리).

## 검증
- **slip-service 1217 + partner-order 360 tests 0-fail**(genuine·`--rerun-tasks --no-build-cache`·Testcontainers IT 실실행)·CI **31 checks green**(mock hard gate 포함).
- **라이브 HTTP probe**(실서버 :8080·실 SALES JWT): `POST /api/slips` slipType=OUTBOUND+deliveryTag=RETURN(불일치) → 변경전 **500**(마스킹) → 변경후 **400 INVALID_INPUT "'반품' 배송 태그는 출고전표에 사용할 수 없습니다"**(raw enum 부재·자연 한국어) 실증.
- Codex R3 전수 grep: 2서비스 사용자노출 예외메시지 raw enum **clean**.

## 후속 분리(별도 이슈)
1. ✅ **완료(#788)** 타 서비스 raw enum(inventory `StockTransfer/StockInstance/InventoryAudit/InboundInspection`·partner `PartnerCreditService`·partner-auth·notification) — 신규 SSOT 4개 동반.
2. ✅ **완료(#789)** Tier2 non-enum 500마스킹(inventory `InventoryAuditService`·product `ProductCatalogController`·auth `ApprovalLineConfig`) + ApiResponse 래퍼.
3. ✅ **인쇄라벨 완료(#790)** PartnerOrderPrintService 인쇄라벨 SSOT 통합(design intent 확인 → 개발책임자 SSOT 유지 판정). · ✅ **EditLockGuard 완료(#791)** shared DefaultEditLockGuard 잠금메시지 raw enum → displayName SSOT(+EditRequestRecord·11정책 배선·DispatchDerivedStatus 배송 전/중/완료). · ⏳ 잔여: approval-core/collab-core 상태메시지 sweep(#792 예정) · UUID interpolation sweep · docs/qa 증적 재생성.

## 교훈
- **초기 recon이 특정 스코프(#725 지정)만 나열하고 defect-family 전수 grep(하위패키지·다양한 변수명)을 놓침** → Codex 적대 재검증이 genuine 0수렴 견인. [[feedback_defect_family_sweep_fix]]는 "지적 1건=동일패턴 전수"이며, 정찰 단계에서 `+ <enum-var>`(필드명 아닌 로컬 포함)·하위패키지까지 전수해야 함.
