package com.samhanair.logis.slip.dto.dispatch;

import com.samhanair.logis.slip.domain.dispatch.DispatchTonnage;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleBodyType;
import jakarta.validation.constraints.NotNull;

/**
 * 차량 그룹 추가 요청.
 *
 * <p>신규 FE 계약은 차종/톤수 2축을 직접 전달한다. legacy {@code vehicleType} 단일 필드는
 * arologis outbound wire 에만 남긴다.
 */
public record AddVehicleGroupRequest(
        @NotNull DispatchVehicleBodyType vehicleBodyType,
        DispatchTonnage tonnage
) {}
