package com.samhanair.logis.slip.publish;

import java.util.LinkedHashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.actuate.endpoint.annotation.Endpoint;
import org.springframework.boot.actuate.endpoint.annotation.ReadOperation;
import org.springframework.stereotype.Component;

/** 운영자가 UUID 없이 eCount alias 검증 상태를 확인하는 read-only actuator endpoint. */
@Component
@Endpoint(id = "warehouse-mapping")
@RequiredArgsConstructor
public class WarehouseMappingEndpoint {

    private final WarehouseCodeMapper mapper;

    @ReadOperation
    public Map<String, Object> read() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("mode", mapper.getMappingMode());
        response.put("statuses", mapper.validationStatusSnapshot());
        return response;
    }
}
