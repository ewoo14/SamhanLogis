package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.InspectionReadyStatus;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipSourceType;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.domain.schedule.DeliverySchedule;
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
 *
 * <p>SP-08-5-5 신규 필드:
 * <ul>
 *   <li>{@code ownerFullName} — 담당자 성명. user-service {@code GET /internal/users/{createdBy}} 로
 *       단건 조회 resolve. null 이면 FE 는 {@code '-'} 표시. 인쇄 양식 담당자 영역 자동 표시 목적.
 *       단건 GET 전용 — mutation 응답은 null 반환 (graceful fallback).</li>
 *   <li>{@code dispatcherFullName}/{@code inspectorFullName}/{@code acceptedByFullName} —
 *       결재란 표시용 서명자 성명. 전표 상세 단건 GET 에서만 user-service 단건 조회로 resolve 하며,
 *       mutation 응답 및 조회 실패 시 null 을 반환한다.</li>
 * </ul>
 *
 * <p>SP-08-FU2 P2-2 신규 필드:
 * <ul>
 *   <li>{@code destinationWarehouseName} — 도착지 창고명 snapshot (inventory-service lookup).
 *       null 이면 FE 는 {@code '—'} 대체 표시 (UUID 비공개 가드 의무 충족).</li>
 * </ul>
 */
public record SlipDetailResponse(
        UUID id,
        SlipType slipType,
        String slipNo,
        LocalDate slipDate,
        int seqNo,
        SlipStatus status,
        /** 회계 마감 잠금 여부 — 상태 lifecycle과 독립된 축. */
        boolean lockFlag,
        /** 발행 출처 — FE가 subtype별 lifecycle 액션을 정확히 계산할 때 사용한다. */
        SlipSourceType sourceType,
        UUID partnerId,
        String partnerName,
        String partnerCode,
        UUID sourceWarehouseId,
        UUID destinationWarehouseId,
        DeliveryTag deliveryTag,
        String memo,
        String requesterId,
        String acceptedBy,
        LocalDateTime acceptedAt,
        LocalDateTime completedAt,
        LocalDateTime confirmedAt,
        LocalDateTime updatedAt,
        // V16 audit overlay 필드 — 협업 수정완료 편집폼/diff 의 현재값 source-of-truth.
        String shippingAddress,
        String inspectionAddress,
        String receiverPhone,
        String customerTel,
        String customerAddress,
        String customerRepresentative,
        String paymentDueLabel,
        String discountInfo,
        String collectTerm,
        String agreeTerm,
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
        /**
         * 입고 검수 CTA 기준 상태.
         * INBOUND 전표의 SAVED/CONFIRMED 는 구매관리 화면에서 검수 Dialog 진입 가능 상태다.
         */
        InspectionReadyStatus inspectionStatus,
        /** 현재 요청 사용자가 OUTBOUND INSPECT 결재선 개인인지 서버가 계산한 capability. */
        boolean canInspect,
        /**
         * 담당자 성명 — user-service internal lookup 결과 (SP-08-5-5 신규).
         * 단건 GET 전용. mutation 응답 / user-service 호출 실패 시 null.
         * FE 는 null 이면 {@code '-'} 대체 표시.
         */
        String ownerFullName,
        /**
         * 출고자 성명 — 결재라인 OUTBOUND_DISPATCH 표시용 user-service lookup 결과.
         * 단건 GET 전용. mutation 응답 / user-service 호출 실패 시 null.
         */
        String dispatcherFullName,
        /**
         * 검수자 성명 — 결재라인 OUTBOUND_INSPECT/INBOUND_INSPECT 표시용 user-service lookup 결과.
         * 단건 GET 전용. mutation 응답 / user-service 호출 실패 시 null.
         */
        String inspectorFullName,
        /**
         * 입고자 성명 — 결재라인 INBOUND_RECEIVE 표시용 user-service lookup 결과.
         * 단건 GET 전용. mutation 응답 / user-service 호출 실패 시 null.
         */
        String acceptedByFullName,
        /**
         * 도착지 창고명 snapshot — SP-08-FU2 P2-2 (V26). inventory-service lookup 결과.
         * FE {@code InboundInspectionDialog} 가 {@code detail.destinationWarehouseName ?? '—'} 사용.
         * null 허용 — lookup 실패 또는 legacy row.
         */
        String destinationWarehouseName,
        /**
         * 하차일 N — V52 신규. 배송일정 적용 전표(지방/야적)만 값 보유. 비적용 또는 legacy 전표는 null.
         * 당착(지방 당일 하차) = slipDate 와 동일 값.
         */
        LocalDate unloadDate,
        /**
         * 특이사항 파생 배송일정 라벨 — V52 신규.
         * {@link DeliverySchedule#scheduleLabel} 에서 파생 ({@code "25상26하"} / {@code "당착"} / null).
         * memo 에 저장하지 않고 (slipDate, unloadDate, deliveryTag) 에서 매번 재계산.
         */
        String deliveryScheduleLabel,
        List<SlipLineResponse> lines) {

    /**
     * 담당자 성명 없이 변환 — 하위 호환용. mutation 응답에서 사용.
     *
     * @param slip 전표 도메인 객체
     * @return 담당자 성명 null 인 SlipDetailResponse
     */
    public static SlipDetailResponse from(Slip slip) {
        return from(slip, null, null, null, null);
    }

    /**
     * 담당자 성명 포함 변환 — 단건 GET 에서 user-service lookup 결과를 전달할 때 사용.
     *
     * @param slip 전표 도메인 객체
     * @param ownerFullName user-service 로 조회한 담당자 성명. null 허용.
     * @return ownerFullName 이 채워진 SlipDetailResponse
     */
    public static SlipDetailResponse from(Slip slip, String ownerFullName) {
        return from(slip, ownerFullName, null, null, null);
    }

    /**
     * 결재 서명자 성명 포함 변환 — 단건 GET 에서 user-service lookup 결과를 전달할 때 사용.
     *
     * @param slip 전표 도메인 객체
     * @param ownerFullName user-service 로 조회한 담당자 성명. null 허용.
     * @param dispatcherFullName user-service 로 조회한 출고자 성명. null 허용.
     * @param inspectorFullName user-service 로 조회한 검수자 성명. null 허용.
     * @param acceptedByFullName user-service 로 조회한 입고자 성명. null 허용.
     * @return 결재 서명자 성명이 채워진 SlipDetailResponse
     */
    public static SlipDetailResponse from(
            Slip slip,
            String ownerFullName,
            String dispatcherFullName,
            String inspectorFullName,
            String acceptedByFullName) {
        return from(slip, ownerFullName, dispatcherFullName, inspectorFullName,
                acceptedByFullName, false);
    }

    /** 단건 조회 요청자에게만 서버가 계산한 inspect capability를 포함한다. */
    public static SlipDetailResponse from(
            Slip slip,
            String ownerFullName,
            String dispatcherFullName,
            String inspectorFullName,
            String acceptedByFullName,
            boolean canInspect) {
        return new SlipDetailResponse(
                slip.getId(),
                slip.getSlipType(),
                slip.getSlipNo(),
                slip.getSlipDate(),
                slip.getSeqNo(),
                slip.getStatus(),
                Boolean.TRUE.equals(slip.getLockFlag()),
                slip.getSourceType(),
                slip.getPartnerId(),
                slip.getPartnerName(),
                slip.getPartnerCode(),
                slip.getSourceWarehouseId(),
                slip.getDestinationWarehouseId(),
                slip.getDeliveryTag(),
                slip.getMemo(),
                slip.getRequesterId(),
                slip.getAcceptedBy(),
                slip.getAcceptedAt(),
                slip.getCompletedAt(),
                slip.getConfirmedAt(),
                updatedAtOf(slip),
                slip.getShippingAddress(),
                slip.getInspectionAddress(),
                slip.getReceiverPhone(),
                slip.getCustomerTel(),
                slip.getCustomerAddress(),
                slip.getCustomerRepresentative(),
                slip.getPaymentDueLabel(),
                slip.getDiscountInfo(),
                slip.getCollectTerm(),
                slip.getAgreeTerm(),
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
                inspectionStatusOf(slip),
                canInspect,
                ownerFullName,
                dispatcherFullName,
                inspectorFullName,
                acceptedByFullName,
                // SP-08-FU2 P2-2 — 도착지 창고명 snapshot
                slip.getDestinationWarehouseName(),
                // V52 — 하차일 + 배송일정 파생 라벨
                slip.getUnloadDate(),
                DeliverySchedule.scheduleLabel(slip.getSlipDate(), slip.getUnloadDate(), slip.getDeliveryTag()),
                slip.getLines().stream().map(SlipLineResponse::from).toList());
    }

    private static InspectionReadyStatus inspectionStatusOf(Slip slip) {
        if (slip.getSlipType() != SlipType.INBOUND) {
            return null;
        }
        return switch (slip.getStatus()) {
            case SAVED, CONFIRMED -> InspectionReadyStatus.READY;
            default -> InspectionReadyStatus.NOT_READY;
        };
    }

    private static LocalDateTime updatedAtOf(Slip slip) {
        return slip.getModifiedAt() == null ? slip.getCreatedAt() : slip.getModifiedAt();
    }
}
