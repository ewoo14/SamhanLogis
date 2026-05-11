package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 전표 상세 응답 — 라인 포함. 단건 GET 및 mutation 응답에 사용.
 *
 * <p>Slice A (sales-polish-2): {@code dispatcherUserId/SignedAt} +
 * {@code inspectorUserId/SignedAt} 필드 신규 노출 (사용자 피드백 #9).
 * FE 가 진행 단계 progress bar + 작업지시서 결재란 출고인/검수인 셀 자동 표시에 사용.
 *
 * <p>Slice B (notification-slice-B): {@code driverName}, {@code driverPhone},
 * {@code deliveryBatchId} 3 필드 신규 노출. 링크발송 화면 / SlipForm / DispatchView 결재란
 * 용달기사 자동 표시에 사용.
 *
 * <p>V20 신규 7 필드 (판매/구매조회 화면 매칭):
 * <ul>
 *   <li>{@code businessNumber} — 사업자등록번호 snapshot (partner-service Feign 자동 resolve)</li>
 *   <li>{@code deliveryAddress} — 배송주소 (실제 인수 현장)</li>
 *   <li>{@code supervisionAddress} — 감리주소 (실제 설치 현장)</li>
 *   <li>{@code projectName} — 프로젝트명</li>
 *   <li>{@code recipientPhone} — 인수자 번호</li>
 *   <li>{@code paymentDueDate} — 입금예정일</li>
 *   <li>{@code printed} — 인쇄여부 (printedAt != null)</li>
 * </ul>
 */
public record SlipDetailResponse(
        UUID id,
        SlipType slipType,
        String slipNo,
        LocalDate slipDate,
        int seqNo,
        SlipStatus status,
        UUID partnerId,
        String partnerName,
        UUID sourceWarehouseId,
        UUID destinationWarehouseId,
        DeliveryTag deliveryTag,
        String memo,
        String requesterId,
        String acceptedBy,
        LocalDateTime acceptedAt,
        LocalDateTime completedAt,
        LocalDateTime confirmedAt,
        String dispatcherUserId,
        LocalDateTime dispatcherSignedAt,
        String inspectorUserId,
        LocalDateTime inspectorSignedAt,
        String driverName,
        String driverPhone,
        UUID deliveryBatchId,
        Long version,
        // V20 신규 7 필드 — 판매/구매조회 화면 매칭
        /** 사업자등록번호 snapshot (partner-service Feign 자동 resolve, 사용자 직접 입력 X). */
        String businessNumber,
        /** 배송주소 — 실제 인수 현장 주소. */
        String deliveryAddress,
        /** 감리주소 — 실제 설치 및 감리 현장 주소. */
        String supervisionAddress,
        /** 프로젝트명. */
        String projectName,
        /** 인수자 번호. */
        String recipientPhone,
        /** 입금예정일. */
        LocalDate paymentDueDate,
        /** 인쇄여부 — printedAt != null 이면 true. */
        boolean printed,
        List<SlipLineResponse> lines) {

    public static SlipDetailResponse from(Slip slip) {
        return new SlipDetailResponse(
                slip.getId(),
                slip.getSlipType(),
                slip.getSlipNo(),
                slip.getSlipDate(),
                slip.getSeqNo(),
                slip.getStatus(),
                slip.getPartnerId(),
                slip.getPartnerName(),
                slip.getSourceWarehouseId(),
                slip.getDestinationWarehouseId(),
                slip.getDeliveryTag(),
                slip.getMemo(),
                slip.getRequesterId(),
                slip.getAcceptedBy(),
                slip.getAcceptedAt(),
                slip.getCompletedAt(),
                slip.getConfirmedAt(),
                slip.getDispatcherUserId(),
                slip.getDispatcherSignedAt(),
                slip.getInspectorUserId(),
                slip.getInspectorSignedAt(),
                slip.getDriverName(),
                slip.getDriverPhone(),
                slip.getDeliveryBatchId(),
                slip.getVersion(),
                // V20 필드
                slip.getBusinessNumber(),
                slip.getDeliveryAddress(),
                slip.getSupervisionAddress(),
                slip.getProjectName(),
                slip.getRecipientPhone(),
                slip.getPaymentDueDate(),
                slip.getPrintedAt() != null,
                slip.getLines().stream().map(SlipLineResponse::from).toList());
    }
}
