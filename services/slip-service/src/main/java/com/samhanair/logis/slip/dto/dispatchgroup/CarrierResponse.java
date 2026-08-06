package com.samhanair.logis.slip.dto.dispatchgroup;

import com.samhanair.logis.slip.domain.dispatchgroup.Carrier;

public record CarrierResponse(String code, String name, boolean isArologis, boolean isActive) {
    public static CarrierResponse from(Carrier carrier) {
        return new CarrierResponse(carrier.getCode(), carrier.getName(), carrier.isArologis(), carrier.isActive());
    }
}
