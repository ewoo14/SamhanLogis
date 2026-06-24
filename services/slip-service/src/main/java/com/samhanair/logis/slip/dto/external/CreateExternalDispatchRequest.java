package com.samhanair.logis.slip.dto.external;

import com.samhanair.logis.slip.domain.external.ExternalDispatchChannel;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/**
 * 타배송사 발송 요청.
 *
 * @param carrierId 외부기사/배송사 내부 UUID. 화면 식별자로 노출하지 않는다.
 * @param slipIds 발송 대상 전표 내부 UUID 목록. 화면에는 slipNo 만 노출한다.
 * @param channel 발송 채널. 슬3 경로는 SMS 만 허용한다.
 */
public record CreateExternalDispatchRequest(
        @NotNull UUID carrierId,
        @NotEmpty List<UUID> slipIds,
        ExternalDispatchChannel channel
) {

    public CreateExternalDispatchRequest {
        if (channel == null) {
            channel = ExternalDispatchChannel.SMS;
        }
    }
}
