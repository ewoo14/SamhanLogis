package com.samhanair.logis.inventory.web.dto;

import com.samhanair.logis.inventory.domain.InboundInspection;
import com.samhanair.logis.inventory.domain.InspectionStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 입고 검수 상세 응답 — 슬립 헤더 정보 + 검수 라인 목록.
 *
 * <p>UUID 비공개 가드: {@link #slipId} 는 내부 참조용, 사용자 노출은 {@link #slipNo} 사용.
 *
 * @param inspectionId  InboundInspection 내부 PK
 * @param slipId        slip-service Slip UUID (internal)
 * @param slipNo        슬립번호 (사용자 노출 식별자)
 * @param status        검수 상태
 * @param inspectorId   검수 담당자 user-id (미지정 시 null)
 * @param stockApplied  재고 반영 여부
 * @param completedAt   검수 완료 일시 (미완료 시 null)
 * @param lines         검수 라인 목록
 */
public record InboundInspectionDetailResponse(
        UUID inspectionId,
        UUID slipId,
        String slipNo,
        InspectionStatus status,
        String inspectorId,
        boolean stockApplied,
        LocalDateTime completedAt,
        List<InboundInspectionLineResponse> lines
) {
    /**
     * InboundInspection 엔티티로부터 상세 응답 DTO 를 생성한다.
     * 라인은 엔티티의 lines 컬렉션을 그대로 변환 (호출 전 초기화 필요).
     *
     * @param inspection 영속 상태의 InboundInspection (lines fetch 완료)
     * @return InboundInspectionDetailResponse
     */
    public static InboundInspectionDetailResponse from(InboundInspection inspection) {
        List<InboundInspectionLineResponse> lineResponses = inspection.getLines().stream()
                .map(InboundInspectionLineResponse::from)
                .toList();
        return new InboundInspectionDetailResponse(
                inspection.getId(),
                inspection.getSlipId(),
                inspection.getSlipNo(),
                inspection.getStatus(),
                inspection.getInspectorId(),
                inspection.isStockApplied(),
                inspection.getCompletedAt(),
                lineResponses
        );
    }
}
