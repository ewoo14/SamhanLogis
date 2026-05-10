package com.samhanair.logis.inventory.web.dto;

import com.samhanair.logis.inventory.domain.InboundInspection;
import com.samhanair.logis.inventory.domain.InspectionStatus;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 입고 검수 목록 응답 — history 페이지용 요약 정보 (라인 미포함).
 *
 * @param inspectionId InboundInspection 내부 PK
 * @param slipId       slip-service Slip UUID (internal)
 * @param slipNo       슬립번호 (사용자 노출 식별자)
 * @param status       검수 상태
 * @param inspectorId  검수 담당자 user-id
 * @param stockApplied 재고 반영 여부
 * @param completedAt  검수 완료 일시 (미완료 시 null)
 * @param createdAt    생성 일시
 */
public record InboundInspectionSummaryResponse(
        UUID inspectionId,
        UUID slipId,
        String slipNo,
        InspectionStatus status,
        String inspectorId,
        boolean stockApplied,
        LocalDateTime completedAt,
        LocalDateTime createdAt
) {
    /**
     * InboundInspection 엔티티로부터 요약 응답 DTO 를 생성한다.
     *
     * @param inspection 영속 상태의 InboundInspection
     * @return InboundInspectionSummaryResponse
     */
    public static InboundInspectionSummaryResponse from(InboundInspection inspection) {
        return new InboundInspectionSummaryResponse(
                inspection.getId(),
                inspection.getSlipId(),
                inspection.getSlipNo(),
                inspection.getStatus(),
                inspection.getInspectorId(),
                inspection.isStockApplied(),
                inspection.getCompletedAt(),
                inspection.getCreatedAt()
        );
    }
}
