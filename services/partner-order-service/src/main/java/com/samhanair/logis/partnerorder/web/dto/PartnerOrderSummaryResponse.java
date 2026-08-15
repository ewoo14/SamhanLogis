package com.samhanair.logis.partnerorder.web.dto;

import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.regex.Pattern;

/**
 * 주문 목록 행 응답.
 *
 * <p>UUID 는 노출하지 않고 사용자 표시용 주문번호와 거래처 코드만 반환한다.
 */
public record PartnerOrderSummaryResponse(
        String orderNumber,
        String partnerCode,
        String partnerName,
        LocalDateTime submittedAt,
        LocalDateTime createdAt,
        String status,
        String slipPublishStatus,
        BigDecimal totalAmount,
        String linkedSlipNo,
        boolean isDeleted,
        LocalDateTime deletedAt,
        String deletedByName,
        boolean mergeEligible,
        String mergeIneligibilityReason
) {

    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    /** 기존 목록 DTO 생성 호출부와의 소스 호환을 유지하는 생성자. */
    public PartnerOrderSummaryResponse(
            String orderNumber,
            String partnerCode,
            String partnerName,
            LocalDateTime submittedAt,
            String status,
            String slipPublishStatus,
            BigDecimal totalAmount,
            String linkedSlipNo,
            boolean isDeleted,
            LocalDateTime deletedAt,
            String deletedByName) {
        this(orderNumber, partnerCode, partnerName, submittedAt, null, status, slipPublishStatus,
                totalAmount, linkedSlipNo, isDeleted, deletedAt, deletedByName, true, null);
    }

    /**
     * Entity 를 목록 행 DTO 로 변환한다.
     *
     * <p>{@code partnerName} 은 partner-service lookup 결과를 호출부가 주입한다.
     */
    public static PartnerOrderSummaryResponse from(PartnerOrder order) {
        return from(order, null);
    }

    /** partner-service lookup 결과를 주입해 목록의 거래처명 열을 채운다. */
    public static PartnerOrderSummaryResponse from(PartnerOrder order, String partnerName) {
        return new PartnerOrderSummaryResponse(
                order.getOrderNo(),
                order.getPartnerCode(),
                partnerName,
                order.getConfirmedAt(),
                order.getCreatedAt(),
                order.getStatus().name(),
                order.getSlipPublishStatus().name(),
                order.getTotalAmount(),
                order.getSlipNo(),
                Boolean.TRUE.equals(order.getIsDeleted()),
                order.getDeletedAt(),
                resolveActorName(order.getDeletedByName()),
                order.getPartnerId() != null,
                order.getPartnerId() == null
                        ? "기존 주문은 거래처 정체성을 확인할 수 없어 병합할 수 없습니다."
                                + " 단건 전표 발행은 계속할 수 있습니다."
                        : null);
    }

    private static String resolveActorName(String actorName) {
        if (actorName == null || actorName.isBlank()) {
            return null;
        }
        String trimmed = actorName.trim();
        if (UUID_PATTERN.matcher(trimmed).matches()) {
            return null;
        }
        return trimmed.length() > 100 ? trimmed.substring(0, 100) : trimmed;
    }
}
