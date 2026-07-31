package com.samhanair.logis.partnerorder.revision.snapshot;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import com.samhanair.logis.partnerorder.domain.SlipPublishStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 거래처 주문 full-snapshot 직렬화 DTO (Phase 2.4 버전이력 + 복원).
 *
 * <p>{@link PartnerOrder} 헤더 전 필드 + 라인 배열({@link LineSnapshot})을
 * 한 시점의 불변 스냅샷으로 담는다. {@code partner_order_revisions.snapshot}
 * (JSONB) 컬럼에 Jackson ObjectMapper 로 직렬화/역직렬화된다.
 *
 * <p>JPA 프록시/lazy 연관 직렬화를 회피하기 위해 entity 가 아닌 전용 record 로 분리한다.
 * point-in-time 복원 시 이 스냅샷을 역직렬화해 헤더를 덮어쓰고 라인을 전량 교체한다.
 *
 * <p><b>UUID 비공개 가드</b> ({@code feedback_uuid_no_user_visibility}):
 * UUID 필드(sourceEstimateId 등)는 복원 시 entity 재구성용으로만 보존하며,
 * 사용자 화면에는 {@code orderNo} / {@code partnerCode} 등 비즈니스 식별자만 노출한다.
 *
 * <p>{@link com.samhanair.logis.slip.estimate.revision.domain.EstimateSnapshot} 미러.
 *
 * @param orderNo        주문번호 스냅샷 (YYYY/MM/DD-N 형식)
 * @param partnerId      거래처 정체성 UUID (복원용, 화면 미노출)
 * @param partnerCode    거래처 코드
 * @param bizCode        사업자번호
 * @param status         주문 상태 (DRAFT/CONFIRMING/CONFIRMED/CANCELED)
 * @param slipNo         출고전표 번호 (발행 전 null)
 * @param slipPublishStatus 전표 발행 상태
 * @param totalAmount    합계 (라인 priceVat 합산)
 * @param confirmedAt    confirm 시각 (CONFIRMING 진입 시점)
 * @param slipPublishedAt slip 발행 성공 시각
 * @param dueDate        납기일
 * @param memo           요청사항/메모
 * @param deliveryAddress 구조화 배송주소 snapshot
 * @param sourceEstimateId 견적→주문 변환 source estimate UUID (복원용)
 * @param revisionCount  audit 채번 카운터
 * @param lines          라인 스냅샷 배열 (is_deleted=false 라인만 포함)
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
    public record PartnerOrderSnapshot(
        String orderNo,
        UUID partnerId,
        String partnerCode,
        String bizCode,
        PartnerOrderStatus status,
        String slipNo,
        SlipPublishStatus slipPublishStatus,
        BigDecimal totalAmount,
        LocalDateTime confirmedAt,
        LocalDateTime slipPublishedAt,
        LocalDate dueDate,
        String memo,
        String deliveryAddress,
        UUID sourceEstimateId,
        int revisionCount,
        List<LineSnapshot> lines) {

    /** partnerId 도입 전 legacy snapshot의 14개 인자 생성자 호환을 보존한다. */
    public PartnerOrderSnapshot(String orderNo, String partnerCode, String bizCode,
                                PartnerOrderStatus status, String slipNo,
                                SlipPublishStatus slipPublishStatus, BigDecimal totalAmount,
                                LocalDateTime confirmedAt, LocalDateTime slipPublishedAt,
                                LocalDate dueDate, String memo, UUID sourceEstimateId,
                                int revisionCount, List<LineSnapshot> lines) {
        this(orderNo, null, partnerCode, bizCode, status, slipNo, slipPublishStatus, totalAmount,
                confirmedAt, slipPublishedAt, dueDate, memo, null, sourceEstimateId, revisionCount, lines);
    }

    /** partnerId 도입 전 legacy snapshot의 15개 인자 생성자 호환. */
    public PartnerOrderSnapshot(String orderNo, UUID partnerId, String partnerCode, String bizCode,
                                PartnerOrderStatus status, String slipNo,
                                SlipPublishStatus slipPublishStatus, BigDecimal totalAmount,
                                LocalDateTime confirmedAt, LocalDateTime slipPublishedAt,
                                LocalDate dueDate, String memo, UUID sourceEstimateId,
                                int revisionCount, List<LineSnapshot> lines) {
        this(orderNo, partnerId, partnerCode, bizCode, status, slipNo, slipPublishStatus, totalAmount,
                confirmedAt, slipPublishedAt, dueDate, memo, null, sourceEstimateId, revisionCount, lines);
    }

    /**
     * 거래처 주문 라인 1건의 스냅샷.
     *
     * <p>is_deleted=false 인 활성 라인만 스냅샷에 포함된다.
     * 복원 시 이 배열로 현재 라인을 전량 교체한다.
     *
     * @param productId   product-service logical UUID (복원용)
     * @param modelName   모델명 스냅샷 (사용자 노출 식별자)
     * @param productName 상품명 스냅샷
     * @param categoryKey 카테고리 키
     * @param quantity    수량
     * @param priceVat    server-side DC 적용 후 단가 (M3)
     * @param subtotal    VAT 포함 라인 합계 T (quantity × priceVat)
     * @param supplyAmount 공급가액 S (legacy snapshot은 null)
     * @param vatAmount   부가세 V (legacy snapshot은 null)
     * @param remark      비고
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LineSnapshot(
            UUID productId,
            String modelName,
            String productName,
            String categoryKey,
            int quantity,
            BigDecimal priceVat,
            BigDecimal subtotal,
            String remark,
            BigDecimal supplyAmount,
            BigDecimal vatAmount) {

        /** 신규 금액 컬럼이 없던 legacy snapshot의 8개 인자 계약을 보존한다. */
        public LineSnapshot(UUID productId, String modelName, String productName,
                            String categoryKey, int quantity, BigDecimal priceVat,
                            BigDecimal subtotal, String remark) {
            this(productId, modelName, productName, categoryKey, quantity, priceVat, subtotal,
                    remark, null, null);
        }

        /**
         * {@link PartnerOrderLine} 으로부터 라인 스냅샷을 조립한다.
         *
         * @param line 활성(is_deleted=false) 상태의 주문 라인
         * @return 불변 라인 스냅샷
         */
        public static LineSnapshot from(PartnerOrderLine line) {
            return new LineSnapshot(
                    line.getProductId(),
                    line.getModelName(),
                    line.getProductName(),
                    line.getCategoryKey(),
                    line.getQuantity(),
                    line.getPriceVat(),
                    line.getSubtotal(),
                    line.getRemark(),
                    line.getSupplyAmount(),
                    line.getVatAmount());
        }
    }

    /**
     * {@link PartnerOrder} 로부터 full-snapshot 을 조립한다.
     *
     * <p>is_deleted=false 인 활성 라인만 스냅샷에 포함된다.
     * ({@link PartnerOrder#getLines()} 는 {@code @SQLRestriction} + 런타임 필터로 활성 라인만 반환한다.)
     *
     * @param order 영속 상태의 거래처 주문
     * @return 불변 full-snapshot record
     */
    public static PartnerOrderSnapshot from(PartnerOrder order) {
        List<LineSnapshot> lineSnapshots = order.getLines().stream()
                .map(LineSnapshot::from)
                .toList();
        return new PartnerOrderSnapshot(
                order.getOrderNo(),
                order.getPartnerId(),
                order.getPartnerCode(),
                order.getBizCode(),
                order.getStatus(),
                order.getSlipNo(),
                order.getSlipPublishStatus(),
                order.getTotalAmount(),
                order.getConfirmedAt(),
                order.getSlipPublishedAt(),
                order.getDueDate(),
                order.getMemo(),
                order.getDeliveryAddress(),
                order.getSourceEstimateId(),
                order.getRevisionCount(),
                lineSnapshots);
    }
}
