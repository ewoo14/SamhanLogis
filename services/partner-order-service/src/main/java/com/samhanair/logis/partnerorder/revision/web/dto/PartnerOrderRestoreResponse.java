package com.samhanair.logis.partnerorder.revision.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.partnerorder.revision.service.PartnerOrderRestoreResult;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;

/**
 * 거래처 주문 복원(restore) 응답 DTO (Phase 2.4 복원 가드 정책 변경).
 *
 * <p>기존 {@link PartnerOrderDetailResponse} 에 {@code slipResyncRequired} 플래그를 추가한 래퍼이다.
 *
 * <p>{@code slipResyncRequired}:
 * <ul>
 *   <li>{@code true}  — 복원 직전 주문 상태가 CONFIRMED(완료)였음. 연결 출고전표의
 *       재발행 여부를 담당자가 확인해야 한다.</li>
 *   <li>{@code false} — 복원 직전 상태가 DRAFT 등. slip 정합성 문제 없음.</li>
 * </ul>
 *
 * <p>JSON 직렬화 시 {@code null} 필드는 {@link JsonInclude#NON_NULL} 정책에 따라 제외된다.
 *
 * @param order              복원 완료 후 주문 상세 (헤더+라인)
 * @param slipResyncRequired 출고전표 재동기화 필요 여부
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PartnerOrderRestoreResponse(
        PartnerOrderDetailResponse order,
        boolean slipResyncRequired
) {

    /**
     * {@link PartnerOrderRestoreResult} 를 응답 DTO 로 변환한다.
     *
     * @param result 서비스 레이어 복원 결과
     * @return 컨트롤러 응답 DTO
     */
    public static PartnerOrderRestoreResponse from(PartnerOrderRestoreResult result) {
        return new PartnerOrderRestoreResponse(
                PartnerOrderDetailResponse.from(result.order()),
                result.slipResyncRequired());
    }
}
