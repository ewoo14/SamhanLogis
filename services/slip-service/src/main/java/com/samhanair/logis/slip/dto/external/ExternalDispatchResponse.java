package com.samhanair.logis.slip.dto.external;

import com.samhanair.logis.slip.domain.external.ExternalDispatch;
import com.samhanair.logis.slip.domain.external.ExternalDispatchChannel;
import com.samhanair.logis.slip.domain.external.ExternalDispatchStatus;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 타배송사 발송 응답.
 *
 * @param id 발송 이력 내부 UUID. 화면 식별자는 carrierName/slipNos 를 우선 사용한다.
 * @param carrierName 사용자 노출 배송사명
 * @param channel 발송 채널
 * @param dispatchDate 발송 기준일
 * @param sentAt 성공 발송 시각
 * @param status 발송 결과
 * @param slipCount 발송 대상 전표 수
 * @param slipNos 사용자 노출 전표번호 목록
 */
public record ExternalDispatchResponse(
        UUID id,
        String carrierName,
        ExternalDispatchChannel channel,
        LocalDate dispatchDate,
        LocalDateTime sentAt,
        ExternalDispatchStatus status,
        int slipCount,
        List<String> slipNos
) {

    /** Entity 와 사용자 노출 식별자를 응답 DTO 로 변환한다. */
    public static ExternalDispatchResponse from(
            ExternalDispatch dispatch,
            String carrierName,
            List<String> slipNos
    ) {
        return new ExternalDispatchResponse(
                dispatch.getId(),
                carrierName,
                dispatch.getChannel(),
                dispatch.getDispatchDate(),
                dispatch.getSentAt(),
                dispatch.getStatus(),
                slipNos.size(),
                slipNos);
    }
}
