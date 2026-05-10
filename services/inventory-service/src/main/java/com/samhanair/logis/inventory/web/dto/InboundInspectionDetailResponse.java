package com.samhanair.logis.inventory.web.dto;

import com.samhanair.logis.inventory.domain.InboundInspection;
import com.samhanair.logis.inventory.domain.InspectionStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 입고 검수 상세 응답 — 슬립 헤더 정보 + 검수 라인 목록.
 *
 * <p>UUID 비공개 가드: {@link #slipId} / {@link #inspectionId} 는 내부 참조용,
 * 사용자 노출은 {@link #slipNo} / {@link #partnerName} / {@link #destinationWarehouseName} 사용.
 *
 * @param inspectionId             InboundInspection 내부 PK
 * @param slipId                   slip-service Slip UUID (internal)
 * @param slipNo                   슬립번호 (사용자 노출 식별자)
 * @param status                   검수 상태
 * @param inspectorId              검수 담당자 user-id (미지정 시 null, 화면 미노출)
 * @param inspectorName            검수 담당자 이름 snapshot (사용자 노출, 없으면 null)
 * @param partnerName              거래처명 snapshot (사용자 노출, 없으면 null)
 * @param destinationWarehouseName 입고 창고명 snapshot (사용자 노출, 없으면 null)
 * @param slipDate                 입고일 문자열 YYYY-MM-DD (사용자 노출, 없으면 null)
 * @param stockApplied             재고 반영 여부
 * @param completedAt              검수 완료 일시 (미완료 시 null)
 * @param lines                    검수 라인 목록
 */
public record InboundInspectionDetailResponse(
        UUID inspectionId,
        UUID slipId,
        String slipNo,
        InspectionStatus status,
        String inspectorId,
        String inspectorName,
        String partnerName,
        String destinationWarehouseName,
        String slipDate,
        boolean stockApplied,
        LocalDateTime completedAt,
        List<InboundInspectionLineResponse> lines
) {
    /**
     * InboundInspection 엔티티 + slip-service 에서 가져온 부가 정보로부터 상세 응답 DTO 를 생성한다.
     * 라인은 엔티티의 lines 컬렉션을 그대로 변환 (호출 전 초기화 필요).
     *
     * @param inspection               영속 상태의 InboundInspection (lines fetch 완료)
     * @param partnerName              거래처명 snapshot (slip-service 제공, 없으면 null)
     * @param destinationWarehouseName 입고 창고명 snapshot (slip-service 제공, 없으면 null)
     * @param slipDate                 입고일 문자열 YYYY-MM-DD (slip-service 제공, 없으면 null)
     * @param inspectorName            검수 담당자 이름 (user-service 조회 또는 snapshot, 없으면 null)
     * @return InboundInspectionDetailResponse
     */
    public static InboundInspectionDetailResponse from(
            InboundInspection inspection,
            String partnerName,
            String destinationWarehouseName,
            String slipDate,
            String inspectorName) {
        List<InboundInspectionLineResponse> lineResponses = inspection.getLines().stream()
                .map(InboundInspectionLineResponse::from)
                .toList();
        return new InboundInspectionDetailResponse(
                inspection.getId(),
                inspection.getSlipId(),
                inspection.getSlipNo(),
                inspection.getStatus(),
                inspection.getInspectorId(),
                inspectorName,
                partnerName,
                destinationWarehouseName,
                slipDate,
                inspection.isStockApplied(),
                inspection.getCompletedAt(),
                lineResponses
        );
    }

    /**
     * slip 부가 정보 없이 엔티티만으로 생성하는 팩토리 — slip-service 가 없는 경우 폴백.
     * partnerName / destinationWarehouseName / slipDate / inspectorName 은 null.
     *
     * @param inspection 영속 상태의 InboundInspection
     * @return InboundInspectionDetailResponse (부가 정보 null)
     */
    public static InboundInspectionDetailResponse from(InboundInspection inspection) {
        return from(inspection, null, null, null, null);
    }
}
