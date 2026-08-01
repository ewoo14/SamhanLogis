package com.samhanair.logis.slip.publish;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.annotation.PostConstruct;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** legacy 창고코드와 설정된 내부 창고 UUID의 값 자체 검증 및 변환을 담당한다. */
@Slf4j
@Component
@ConfigurationProperties(prefix = "app.publish")
@Getter
@Setter
public class WarehouseCodeMapper {

    /** Spring이 주입하는 legacy 창고코드와 내부 UUID 매핑. */
    private Map<String, String> warehouseCodeMap = new HashMap<>();

    /** 외부 창고 서비스 조회 없이 설정된 매핑의 형식만 기동 시 검증한다. */
    @PostConstruct
    void logEffectiveMap() {
        if (warehouseCodeMap.isEmpty()) {
            log.warn("app.publish.warehouse-code-map 비어있음");
            return;
        }
        warehouseCodeMap.forEach((warehouseCode, configuredValue) -> parseConfiguredUuid(
                warehouseCode, configuredValue));
        log.info("warehouse-code-map 로드: {} entries", warehouseCodeMap.size());
    }

    /**
     * 설정값이 UUID 형식인지 검증한다.
     *
     * @param warehouseCode 실패 시 표시할 창고코드
     * @param configuredValue 환경변수로 주입된 설정값
     * @return 검증된 UUID
     * @throws IllegalStateException 값이 비어 있거나 UUID 형식이 아닐 때
     */
    private UUID parseConfiguredUuid(String warehouseCode, String configuredValue) {
        if (configuredValue == null || configuredValue.isBlank()) {
            throw invalidStartupMapping(warehouseCode);
        }
        try {
            return UUID.fromString(configuredValue);
        } catch (IllegalArgumentException ex) {
            throw invalidStartupMapping(warehouseCode);
        }
    }

    private IllegalStateException invalidStartupMapping(String warehouseCode) {
        return new IllegalStateException("창고 매핑 기동 검증 실패: 창고코드 '" + warehouseCode + "'");
    }

    /**
     * legacy warehouseCode를 설정된 내부 UUID로 변환한다.
     *
     * @param warehouseCode legacy 창고코드
     * @return 매핑된 warehouse UUID
     * @throws BusinessException 매핑이 없거나 값이 UUID 형식이 아닐 때
     */
    public UUID resolve(String warehouseCode) {
        if (warehouseCode == null || warehouseCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "warehouseCode 가 비어있습니다");
        }
        String configuredValue = warehouseCodeMap.get(warehouseCode.trim());
        if (configuredValue == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "매핑되지 않은 warehouseCode: '" + warehouseCode + "'");
        }
        try {
            return UUID.fromString(configuredValue);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "warehouseCode '" + warehouseCode + "' 의 매핑값이 UUID 형식이 아닙니다");
        }
    }
}
