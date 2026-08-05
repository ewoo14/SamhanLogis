package com.samhanair.logis.slip.estimate.service;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.service.AuthoritativeAmountValidator;
import com.samhanair.logis.slip.domain.SlipSourceType;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.SlipNumberService;
import com.samhanair.logis.slip.service.BundleModePolicy;
import com.samhanair.logis.slip.service.cutoff.OutboundCutoffGuard;
import java.time.Clock;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 견적서 → 슬립 자동 변환 — P2-1 (Stage 4) EstimateService.convert 가 호출.
 *
 * <p>변환 정책:
 * <ul>
 *   <li>EstimateStatus.ACCEPTED → 본 converter 호출 → Slip(OUTBOUND DRAFT) 자동 발행</li>
 *   <li>견적의 partnerId / partnerName / memo 를 Slip 으로 그대로 snapshot</li>
 *   <li>이미 구성품으로 전개된 견적의 estimate_lines (lineNo 순) → slip_lines 1:1 매핑</li>
 *   <li>Slip.assignPublishSource(ESTIMATE, estimateNo) — 발행 출처 추적 (Phase 6 M5 패턴 일관)</li>
 *   <li>Slip 채번 = SlipNumberService (slip 채번 시퀀스 사용)</li>
 *   <li>sourceWarehouseId 는 placeholder 창고 UUID 로 생성 — 영업이 SlipForm 수정 시 정확한 창고로 교체</li>
 * </ul>
 *
 * <p>본 service 는 단순 mapping 만 담당 — Estimate.markConverted(slipId) 호출은 EstimateService.
 */
@Service
@RequiredArgsConstructor
public class EstimateToSlipConverter {

    private final SlipRepository slipRepository;
    private final SlipNumberService slipNumberService;
    /** 출고전표 마감 게이트 — 견적 변환 생성 경로(게이트②). */
    private final OutboundCutoffGuard cutoffGuard;
    /** KST 기준 오늘 — 컷오프 게이트와 동일 Clock. */
    private final Clock clock;
    /** 레거시/비공식 견적이 BUNDLE 부모를 전표로 우회시키지 않도록 변환 경계에서 재검증한다. */
    private final ProductClient productClient;

    /**
     * 견적 → Slip(OUTBOUND DRAFT) 변환.
     *
     * <p>변환된 슬립은 {@link SlipSourceType#ESTIMATE} 발행 출처로 기록되며 sourceId 에
     * 견적번호({@link Estimate#getEstimateNo}) 가 들어간다.
     *
     * @param estimate 변환 대상 (status == ACCEPTED 가드는 호출자 EstimateService 책임)
     * @return 영속화된 Slip(OUTBOUND DRAFT)
     */
    public Slip convert(Estimate estimate) {
        rejectBundleParents(estimate);
        LocalDate slipDate = LocalDate.now(clock);
        String slipNo = slipNumberService.next(slipDate, com.samhanair.logis.slip.domain.SlipType.OUTBOUND);
        int seqNo = slipNumberService.extractSeqNo(slipNo);

        // sourceWarehouseId 는 nullable 허용 안 함 (Slip.createOutbound 가드) — 임시 placeholder UUID
        // 사용. 영업이 SlipForm 으로 정확한 창고 지정 후 SAVED 단계 진행. 현재 슬라이스 정책.
        // 운영 cutover 시점 default warehouse 정책 도입 가능 (별도 설정).
        java.util.UUID defaultWarehouseId = java.util.UUID.fromString(
                "00000000-0000-0000-0000-000000000001");

        Slip slip = Slip.createOutbound(slipNo, slipDate, seqNo,
                defaultWarehouseId,
                null,
                estimate.getPartnerId(),
                estimate.getPartnerName(),
                null,
                buildSlipMemo(estimate),
                estimate.getRequesterId());
        slip.withProjectInfo(estimate.getPartnerBusinessNo(), null, null, null, null, null);

        // [게이트②] 견적→출고전표 변환 마감 게이트 — createOutbound 직후.
        // deliveryTag null(견적 변환 시 항상 null) 이므로 assertWithinCutoff 내부에서 즉시 통과.
        // 태그 확정(editHeader)은 SlipForm 저장 시 게이트⑦이 잡는다.
        cutoffGuard.assertWithinCutoff(slip.getDeliveryTag(), slip.getSlipDate());

        // estimate_lines → slip_lines 1:1 copy (lineNo 순). 옵션 A: 세트는 이미 견적에서 구성품으로
        // 전개돼 있으므로 1:1 복사면 전표에 구성품으로 올라간다. 세트 구성품 메타(setHead/부모세트)도 복사.
        for (EstimateLine line : estimate.getLines()) {
            // 단가 부가세포함 견적 라인(unitPriceWithVat != null)은 VAT 포함 단가로 전표 라인 재생성하여
            // 공급가액/부가세 라인 단위 분해를 보존. legacy(null)는 기존 공급단가 1:1 복사.
            // unitPriceWithVat 는 이번 슬라이스의 권위 라인과 기존 VAT 포함 라인을 식별한다.
            // 구 견적(unitPriceWithVat == null)은 supply/vat/lineTotal 이 채워져 있어도
            // 종전 공급단가 경로를 유지해야 소수 단가 legacy 행의 변환 회귀가 없다.
            boolean authoritative = line.getUnitPriceWithVat() != null
                    && AuthoritativeAmountValidator.isComplete(
                            line.getSupplyAmount(), line.getVatAmount(), line.getLineTotal());
            SlipLine slipLine = authoritative
                    ? SlipLine.createFromAuthoritativeAmounts(slip,
                            line.getProductId(), line.getProductName(), line.getModelName(),
                            line.getSpecification(), line.getQuantity(), line.getUnitPriceWithVat(),
                            line.getSupplyAmount(),
                            line.getVatAmount(), line.getLineTotal(), line.getNote(), null)
                    : line.getUnitPriceWithVat() != null
                    ? SlipLine.createFromVatInclusive(slip,
                            line.getProductId(), line.getProductName(), line.getModelName(),
                            line.getSpecification(), line.getQuantity(), line.getUnitPriceWithVat(),
                            line.getNote(), null)
                    : SlipLine.create(slip,
                            line.getProductId(), line.getProductName(), line.getModelName(),
                            line.getSpecification(), line.getQuantity(), line.getUnitPrice(),
                            line.getNote());
            if (line.getParentSetModel() != null && !line.getParentSetModel().isBlank()) {
                slipLine.assignBundleComponent(line.getParentSetModel(), line.isSetHead());
            }
            slip.addLine(slipLine);
        }

        // 발행 출처 — Phase 6 M5 패턴 일관 (sourceType=ESTIMATE, sourceId=견적번호)
        slip.assignPublishSource(SlipSourceType.ESTIMATE, estimate.getEstimateNo(), null);

        // [게이트②-배송일정] 견적→출고전표 변환 시 deliveryTag null → unloadDate null(계산 불가).
        // 태그 확정(editHeader)은 SlipForm 저장 시 게이트⑦ 에서 applyDeliverySchedule 가 수행.
        slip.applyDeliverySchedule(slip.getDeliveryTag(), null);

        return slipRepository.save(slip);
    }

    private void rejectBundleParents(Estimate estimate) {
        List<UUID> productIds = estimate.getLines().stream()
                .map(EstimateLine::getProductId)
                .distinct()
                .toList();
        Map<UUID, com.samhanair.logis.slip.client.ProductSummary> summaries = new HashMap<>();
        for (var summary : productClient.lookup(productIds)) {
            summaries.put(summary.id(), summary);
        }
        boolean bundleParent = estimate.getLines().stream()
                .anyMatch(line -> {
                    var summary = summaries.get(line.getProductId());
                    return BundleModePolicy.shouldExpand(summary);
                });
        if (bundleParent) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "세트 품목은 구성품으로 전개된 견적만 전표로 변환할 수 있습니다");
        }
    }

    private String buildSlipMemo(Estimate estimate) {
        StringBuilder sb = new StringBuilder();
        sb.append("[견적변환: ").append(estimate.getEstimateNo()).append("]");
        if (estimate.getMemo() != null && !estimate.getMemo().isBlank()) {
            sb.append(" ").append(estimate.getMemo());
        }
        return sb.toString();
    }
}
