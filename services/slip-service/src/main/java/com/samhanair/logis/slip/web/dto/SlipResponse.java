package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 전표 요약 응답 — 라인 미포함, 페이지/리스트 용.
 *
 * <p>{@code deliveryTag} 는 영문 enum 코드 (API 식별자), {@code deliveryTagLabel} 은
 * {@link DeliveryTag#getKoreanLabel()} 로 변환된 한국어 표시 라벨.
 * FE 는 두 값 모두 수신하므로 별도 매핑 없이 바로 렌더링 가능.
 *
 * <p>V20 (feature/sales-purchase-query-redesign) 신규 필드:
 * <ul>
 *   <li>{@code businessNumber} — 사업자등록번호 snapshot</li>
 *   <li>{@code deliveryAddress} — 배송주소 (실제 인수 현장)</li>
 *   <li>{@code supervisionAddress} — 감리주소 (실제 설치 현장)</li>
 *   <li>{@code projectName} — 프로젝트명</li>
 *   <li>{@code recipientPhone} — 인수자 번호</li>
 *   <li>{@code paymentDueDate} — 입금예정일</li>
 *   <li>{@code printed} — 인쇄여부 (printedAt != null)</li>
 *   <li>{@code memo} — 적요/비고/특이사항 공용</li>
 *   <li>{@code totalAmount} — 라인 lineTotal 합산</li>
 *   <li>{@code totalQuantity} — 라인 수량 합</li>
 *   <li>{@code salesPersonName} — 담당자명 (requesterId 임시 — 후속 user-service resolve)</li>
 *   <li>{@code editHistoryCount} — 수정 이력 건수 (revisionCount 기반)</li>
 * </ul>
 *
 * <p>UUID 비공개 가드: {@code id} / {@code partnerId} / {@code sourceWarehouseId} /
 * {@code destinationWarehouseId} 는 내부 API 전용. 사용자 화면 식별자는
 * {@code slipNo} / {@code partnerName} / {@code businessNumber} / {@code partnerCode} 사용.
 */
public record SlipResponse(
        UUID id,
        SlipType slipType,
        String slipNo,
        LocalDate slipDate,
        int seqNo,
        SlipStatus status,
        UUID partnerId,
        String partnerName,
        String partnerCode,
        UUID sourceWarehouseId,
        UUID destinationWarehouseId,
        DeliveryTag deliveryTag,
        String deliveryTagLabel,
        String requesterId,
        String acceptedBy,
        LocalDateTime acceptedAt,
        LocalDateTime completedAt,
        LocalDateTime confirmedAt,
        Long version,
        // V20 신규 — 판매/구매조회 확장 필드
        /** 사업자등록번호 snapshot (판매/구매조회 화면 표시). */
        String businessNumber,
        /** 배송주소 — 실제 인수 현장. */
        String deliveryAddress,
        /** 감리주소 — 실제 설치/감리 현장. */
        String supervisionAddress,
        /** 프로젝트명. */
        String projectName,
        /** 인수자 번호. */
        String recipientPhone,
        /** 입금예정일. */
        LocalDate paymentDueDate,
        /** 인쇄여부 — {@code printedAt != null} 이면 true. */
        boolean printed,
        /** 적요/비고/특이사항 공용 메모. */
        String memo,
        /** 라인 lineTotal 합산 금액. */
        BigDecimal totalAmount,
        /** 라인 수량 합. */
        int totalQuantity,
        /**
         * 담당자명 — requesterId 임시값. 후속 슬라이스에서 user-service resolve 로 교체.
         * UUID 비공개 가드: requesterId(UUID) 대신 사용자 표시명으로 변환 예정.
         */
        String salesPersonName,
        /**
         * 전표 수정 이력 건수 — {@code revisionCount} 기반 임시값.
         * 후속 슬라이스에서 SlipEditRequest count 로 교체 예정.
         */
        int editHistoryCount) {

    /**
     * Slip 엔티티로부터 응답 record 를 빌드한다.
     *
     * <p>라인 합산 ({@code totalAmount} / {@code totalQuantity}) 은 {@code slip.getLines()} 를
     * 순회하여 계산한다. Lazy 컬렉션이므로 트랜잭션 내에서만 호출해야 한다.
     * (또는 fetch join 으로 초기화된 lines 를 가진 slip 전달 시 안전.)
     *
     * @param slip 전표 엔티티 (is_deleted=false 보장된 상태)
     * @return 요약 응답 record
     */
    public static SlipResponse from(Slip slip) {
        DeliveryTag tag = slip.getDeliveryTag();
        List<SlipLine> lines = slip.getLines();

        BigDecimal totalAmount = lines.stream()
                .map(SlipLine::getLineTotal)
                .filter(t -> t != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        int totalQuantity = lines.stream()
                .mapToInt(SlipLine::getQuantity)
                .sum();

        return new SlipResponse(
                slip.getId(),
                slip.getSlipType(),
                slip.getSlipNo(),
                slip.getSlipDate(),
                slip.getSeqNo(),
                slip.getStatus(),
                slip.getPartnerId(),
                slip.getPartnerName(),
                slip.getPartnerCode(),
                slip.getSourceWarehouseId(),
                slip.getDestinationWarehouseId(),
                tag,
                tag != null ? tag.getKoreanLabel() : null,
                slip.getRequesterId(),
                slip.getAcceptedBy(),
                slip.getAcceptedAt(),
                slip.getCompletedAt(),
                slip.getConfirmedAt(),
                slip.getVersion(),
                // V20 신규 필드
                slip.getBusinessNumber(),
                slip.getDeliveryAddress(),
                slip.getSupervisionAddress(),
                slip.getProjectName(),
                slip.getRecipientPhone(),
                slip.getPaymentDueDate(),
                slip.getPrintedAt() != null,
                slip.getMemo(),
                totalAmount,
                totalQuantity,
                // 담당자명: requesterId 임시 (후속 user-service resolve 예정)
                slip.getRequesterId(),
                // 수정 이력 건수: revisionCount 기반 임시 (후속 SlipEditRequest count 예정)
                slip.getRevisionCount() != null ? slip.getRevisionCount() : 0);
    }
}
