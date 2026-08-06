package com.samhanair.logis.slip.publish;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.annotation.PostConstruct;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** eCount 코드 consumer map과 권위 alias 검증 결과를 분리해 보유한다. */
@Slf4j
@Component
@ConfigurationProperties(prefix = "app.publish")
@Getter
@Setter
public class WarehouseCodeMapper {

    private static final String CHOWOL_CODE = "00003";
    private static final String SANGIL_CODE = "2";
    private static final String CANONICAL_UUID_PATTERN =
            "(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

    /** 환경이 명시하지 않으면 어느 정책도 추론하지 않고 미검증 상태로 둔다. */
    private String mappingMode = "";

    /** 요청 consumer가 보유한 선택적 교차검증 map. 권위 원본이 아니다. */
    private Map<String, String> warehouseCodeMap = new HashMap<>();

    /** 비동기 검증기가 갱신하는 관찰 상태와 권위 UUID. */
    private final Map<String, WarehouseMappingStatus> validationStatuses = new ConcurrentHashMap<>();
    private final Map<String, UUID> verifiedWarehouseIds = new ConcurrentHashMap<>();

    /** 설정 형식은 기록만 한다. 외부 조회나 예외를 기동 경로에서 실행하지 않는다. */
    @PostConstruct
    void logEffectiveMap() {
        if (warehouseCodeMap.isEmpty()) {
            log.warn("warehouse-code-map 비어있음 mode={}", normalizedMode());
            return;
        }
        warehouseCodeMap.forEach((warehouseCode, configuredValue) -> {
            if (configuredUuid(warehouseCode).isEmpty()
                    && configuredValue != null && !configuredValue.isBlank()) {
                validationStatuses.put(warehouseCode, WarehouseMappingStatus.INVALID_CONFIGURATION);
                log.warn("warehouse-code-map 설정 형식 오류 code={} status=INVALID_CONFIGURATION",
                        warehouseCode);
            } else {
                validationStatuses.putIfAbsent(warehouseCode, WarehouseMappingStatus.UNVERIFIED);
            }
        });
        log.info("warehouse-code-map 로드 entries={} mode={}", warehouseCodeMap.size(), normalizedMode());
    }

    /** Spring 바인딩 및 단위 테스트가 명시 정책을 문자열로 공급한다. */
    public void setMappingMode(String mappingMode) {
        this.mappingMode = mappingMode == null ? "" : mappingMode.trim();
    }

    /** 잘못된 정책 문자열도 기동 예외 대신 안전한 미검증 상태로 남긴다. */
    public Optional<WarehouseMappingMode> mode() {
        try {
            return Optional.of(WarehouseMappingMode.valueOf(normalizedMode()));
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
    }

    public Set<String> configuredWarehouseCodes() {
        return Collections.unmodifiableSet(warehouseCodeMap.keySet());
    }

    /** 설정된 consumer UUID를 형식 검증만 하며, 실재성은 검증 서비스가 담당한다. */
    Optional<UUID> configuredUuid(String warehouseCode) {
        String value = warehouseCodeMap.get(warehouseCode);
        if (value == null || value.isBlank()) return Optional.empty();
        try {
            if (!value.matches(CANONICAL_UUID_PATTERN)) {
                return Optional.empty();
            }
            return Optional.of(UUID.fromString(value));
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
    }

    boolean hasConfiguredValue(String warehouseCode) {
        String value = warehouseCodeMap.get(warehouseCode);
        return value != null && !value.isBlank();
    }

    /** 비동기 validator가 성공한 권위 UUID를 consumer에 반영한다. */
    void markVerified(String warehouseCode, UUID warehouseId) {
        verifiedWarehouseIds.put(warehouseCode, warehouseId);
        validationStatuses.put(warehouseCode, WarehouseMappingStatus.VERIFIED);
    }

    void markStatus(String warehouseCode, WarehouseMappingStatus status) {
        validationStatuses.put(warehouseCode, status);
        if (status != WarehouseMappingStatus.UNAVAILABLE) {
            verifiedWarehouseIds.remove(warehouseCode);
        }
    }

    public WarehouseMappingStatus validationStatus(String warehouseCode) {
        return validationStatuses.getOrDefault(warehouseCode, WarehouseMappingStatus.UNVERIFIED);
    }

    /** actuator 노출용 상태 사본. UUID와 설정 원문은 포함하지 않는다. */
    public Map<String, WarehouseMappingStatus> validationStatusSnapshot() {
        return Map.copyOf(validationStatuses);
    }

    /**
     * 발행 경로의 UUID 해석.
     *
     * <p>DEV_SUBSTITUTE는 외부 검증을 하지 않고 명시된 개발값을 사용한다. STRICT는 권위
     * alias가 VERIFIED일 때만 사용하므로, 행 존재만 확인된 뒤바뀐 UUID는 조용히 통과하지 않는다.
     */
    public UUID resolve(String warehouseCode) {
        if (warehouseCode == null || warehouseCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "warehouseCode 가 비어있습니다");
        }
        String code = warehouseCode.trim();
        if (!warehouseCodeMap.containsKey(code)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "매핑되지 않은 warehouseCode: '" + warehouseCode + "'");
        }
        WarehouseMappingMode mode = mode().orElse(null);
        if (mode == WarehouseMappingMode.DEV_SUBSTITUTE) {
            return configuredUuidOrThrow(code, WarehouseMappingStatus.DEV_SUBSTITUTE);
        }
        UUID verified = verifiedWarehouseIds.get(code);
        if (mode != WarehouseMappingMode.STRICT
                || verified == null
                || validationStatus(code) != WarehouseMappingStatus.VERIFIED) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "warehouseCode '" + code + "' 매핑이 검증되지 않았습니다: "
                            + validationStatus(code));
        }
        return verified;
    }

    private UUID configuredUuidOrThrow(String code, WarehouseMappingStatus status) {
        return configuredUuid(code).orElseThrow(() -> new BusinessException(ErrorCode.INTERNAL_ERROR,
                "warehouseCode '" + code + "' 매핑값이 유효하지 않습니다: " + status));
    }

    /** 레거시 warehouseCode 자체를 업무 구분으로 변환한다. */
    public String businessType(String warehouseCode) {
        String code = warehouseCode == null ? "" : warehouseCode.trim();
        if (SANGIL_CODE.equals(code)) return "SANGIL";
        if (CHOWOL_CODE.equals(code)) return "CHOWOL";
        return "UNKNOWN";
    }

    private String normalizedMode() {
        return mappingMode == null ? "" : mappingMode.trim().toUpperCase(Locale.ROOT);
    }
}
