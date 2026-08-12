package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.common.security.ActorDisplayName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.domain.schedule.DeliverySchedule;
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
 *   <li>{@code salesPersonName} — 조회 시 user-service에서 resolve한 담당자 성명</li>
 *   <li>{@code editHistoryCount} — 상태의존 수정 이력 건수 (임계 전이 이후 편집만)</li>
 * </ul>
 *
 * <p>UUID 비공개 가드: {@code id} / {@code partnerId} / {@code sourceWarehouseId} /
 * {@code destinationWarehouseId} 는 내부 API 전용. 사용자 화면 식별자는
 * {@code slipNo} / {@code partnerName} / {@code businessNumber} / {@code partnerCode} 사용.
 */
public record SlipResponse(
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID id,
        SlipType slipType,
        String slipNo,
        LocalDate slipDate,
        int seqNo,
        SlipStatus status,
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID partnerId,
        String partnerName,
        String partnerCode,
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID sourceWarehouseId,
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID destinationWarehouseId,
        DeliveryTag deliveryTag,
        String deliveryTagLabel,
        @JsonSerialize(using = OpaqueUuidStringSerializer.class) String requesterId,
        @JsonSerialize(using = OpaqueUuidStringSerializer.class) String acceptedBy,
        LocalDateTime acceptedAt,
        LocalDateTime completedAt,
        LocalDateTime confirmedAt,
        LocalDateTime updatedAt,
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
        /** 사용자 화면에 표시할 부가세 포함 전표 금액. */
        BigDecimal displayTotalAmount,
        /** 라인 수량 합. */
        int totalQuantity,
        /** 담당자명 — 사용자 화면에 표시하는 직원 성명. UUID/requesterId 원문은 넣지 않는다. */
        String salesPersonName,
        /**
         * 전표 수정 이력 건수 — S2c 상태의존 표시 카운트.
         * {@code revisionCount} 는 감사 revisionNo 로 유지하고, 사용자 노출 값만 임계 전이 기준선을 차감한다.
         */
        int editHistoryCount,
        /**
         * 하차일 N — V52 신규. 배송일정 적용 전표(지방/야적)만 값 보유. 비적용 또는 legacy 전표는 null.
         */
        LocalDate unloadDate,
        /**
         * 특이사항 파생 배송일정 라벨 — V52 신규.
         * {@link DeliverySchedule#scheduleLabel} 에서 파생 ({@code "25상26하"} / {@code "당착"} / null).
         */
        String deliveryScheduleLabel,
        /**
         * soft-delete 상태. E2 목록은 삭제행도 취소선으로 렌더링하므로 삭제 메타를 포함한다.
         */
        boolean isDeleted,
        /** 삭제 시각. 활성행이면 null. */
        LocalDateTime deletedAt,
        /** 삭제자 표시명. UUID/userId 는 노출하지 않는다. */
        String deletedByName) {

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
        return from(slip, slip.getRequesterId());
    }

    /**
     * 직원 성명 resolve 결과를 주입해 요약 응답을 빌드한다.
     *
     * @param slip 전표 엔티티
     * @param salesPersonName 화면 표시용 담당자명. 원문 user ID를 넣지 않는다.
     * @return 요약 응답 record
     */
    public static SlipResponse from(Slip slip, String salesPersonName) {
        DeliveryTag tag = slip.getDeliveryTag();
        List<SlipLine> lines = slip.getLines();

        BigDecimal totalAmount = lines.stream()
                .map(SlipLine::getLineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal displayTotalAmount = SlipDisplayAmount.vatInclusiveTotal(lines);

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
                updatedAtOf(slip),
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
                displayTotalAmount,
                totalQuantity,
                // 담당자명: 조회 서비스가 user-service에서 resolve한 표시명
                salesPersonName,
                // 수정 이력 건수: S2c 상태의존 표시 카운트(임계 전이 전 편집 제외)
                slip.editHistoryCount(),
                // V52 — 하차일 + 배송일정 파생 라벨
                slip.getUnloadDate(),
                DeliverySchedule.scheduleLabel(slip.getSlipDate(), slip.getUnloadDate(), slip.getDeliveryTag()),
                Boolean.TRUE.equals(slip.getIsDeleted()),
                slip.getDeletedAt(),
                ActorDisplayName.resolveNullable(null, slip.getDeletedByName()));
    }

    private static LocalDateTime updatedAtOf(Slip slip) {
        return slip.getModifiedAt() == null ? slip.getCreatedAt() : slip.getModifiedAt();
    }
}
