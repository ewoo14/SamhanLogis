package com.samhanair.logis.slip.dto.external;

import com.samhanair.logis.slip.domain.external.ExternalCarrier;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 외부기사/배송사 응답 DTO.
 *
 * @param id 내부 라우팅용 UUID. 화면 식별자로 노출하지 않는다.
 * @param name 사용자 노출 이름 또는 배송사명
 * @param phone 사용자 노출 SMS 수신 전화번호
 */
public record ExternalCarrierResponse(
        UUID id,
        String name,
        String phone,
        String email,
        String defaultVehicleType,
        String memo,
        boolean active,
        LocalDateTime createdAt,
        LocalDateTime modifiedAt
) {

    /** Entity 를 API 응답으로 변환한다. */
    public static ExternalCarrierResponse from(ExternalCarrier carrier) {
        return new ExternalCarrierResponse(
                carrier.getId(),
                carrier.getName(),
                carrier.getPhone(),
                carrier.getEmail(),
                carrier.getDefaultVehicleType(),
                carrier.getMemo(),
                carrier.isActive(),
                carrier.getCreatedAt(),
                carrier.getModifiedAt());
    }
}
