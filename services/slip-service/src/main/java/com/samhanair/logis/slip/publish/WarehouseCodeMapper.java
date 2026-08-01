package com.samhanair.logis.slip.publish;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import jakarta.annotation.PostConstruct;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Phase 6 M5 (slip-service-integration) — legacy ecount warehouseCode → 내부 warehouse UUID
 * 매핑.
 *
 * <p>설계 §3: legacy 가 사용한 warehouseCode 는 {@code "00003"} (본사), {@code "2"} (후발),
 * {@code "14"} (안성), {@code "1"} (창원) 등 짧은 문자열. SamhanLogis 내부에서는 warehouse
 * 마스터의 UUID 를 사용하므로 발행 시점에 변환이 필요하다.
 *
 * <p>매핑 누락 → {@link BusinessException}({@link ErrorCode#INVALID_INPUT}) 으로 즉시 실패.
 * legacy 가 신규 코드를 보낸 경우 운영자가 환경 변수에 추가해야 한다.
 *
 * <p>설정 예 ({@code application.yml}):
 * <pre>
 * app:
 *   publish:
 *     warehouse-code-map:
 *       "00003": "${WAREHOUSE_UUID_HQ}"
 *       "2":     "${WAREHOUSE_UUID_HUBAL}"
 *       "14":    "${WAREHOUSE_UUID_ANSEONG}"
 *       "1":     "${WAREHOUSE_UUID_CHANGWON}"
 * </pre>
 */
@Slf4j
@Component
@ConfigurationProperties(prefix = "app.publish")
@Getter
@Setter
public class WarehouseCodeMapper {

    /** Spring 이 yaml/env 에서 주입. key 는 legacy 코드, value 는 내부 warehouse UUID. */
    private Map<String, String> warehouseCodeMap = new HashMap<>();

    /** 기동 시 inventory-service의 활성 창고 마스터와 매핑을 대조한다. */
    @Autowired
    private WarehouseInternalClient warehouseInternalClient;

    /** 창고 데이터가 없는 단위/통합 테스트에서는 외부 검증을 명시적으로 끈다. */
    @Value("${app.publish.warehouse-validation.enabled:true}")
    private boolean warehouseValidationEnabled;

    /** 기동 당시 창고 서비스 장애로 검증을 보류한 legacy 창고 코드 집합. */
    private final Set<String> unavailableWarehouseCodes = ConcurrentHashMap.newKeySet();

    /** Spring 이 주입한 legacy warehouseCode → 내부 UUID 매핑을 로깅한다. */
    @PostConstruct
    void logEffectiveMap() {
        if (warehouseCodeMap.isEmpty()) {
            log.warn("[Phase 6 M5] app.publish.warehouse-code-map 비어있음. "
                    + "from-estimate / from-partner-order 호출 시 모두 INVALID_INPUT 으로 실패. "
                    + "환경 변수 또는 application.yml 에 매핑 추가 필요.");
            return;
        }
        log.info("[Phase 6 M5] warehouse-code-map 로드: {} entries", warehouseCodeMap.size());
        if (warehouseValidationEnabled) {
            validateConfiguredWarehouses();
        }
    }

    /**
     * 설정된 모든 창고 매핑이 inventory-service의 활성 창고와 일치하는지 기동 시 검증한다.
     *
     * <p>창고 UUID는 사용자에게 공개하지 않으며, 실패 원인은 창고코드로만 전달한다.
     *
     * @throws IllegalStateException 매핑이 비어 있거나 실재하지 않거나 코드와 불일치할 때
     */
    synchronized void validateConfiguredWarehouses() {
        if (warehouseInternalClient == null) {
            throw new IllegalStateException("창고 매핑 기동 검증 실패: 창고코드 조회 client가 구성되지 않았습니다");
        }
        for (Map.Entry<String, String> entry : warehouseCodeMap.entrySet()) {
            String warehouseCode = entry.getKey();
            UUID configuredId;
            try {
                configuredId = UUID.fromString(entry.getValue());
            } catch (RuntimeException ex) {
                throw invalidStartupMapping(warehouseCode, "UUID 설정값이 유효하지 않습니다");
            }

            WarehouseInternalClient.WarehouseLookup lookup = warehouseInternalClient.findWarehouseById(configuredId);
            if (lookup.status() == WarehouseInternalClient.LookupStatus.UNAVAILABLE) {
                unavailableWarehouseCodes.add(warehouseCode);
                log.warn("창고 매핑 기동 검증을 보류합니다 — 창고 서비스 일시 조회 불가 (창고코드={})",
                        warehouseCode);
                continue;
            }
            if (lookup.status() == WarehouseInternalClient.LookupStatus.NOT_FOUND
                    || lookup.summary() == null) {
                throw invalidStartupMapping(warehouseCode, "설정된 활성 창고가 존재하지 않습니다");
            }
            if (!configuredId.equals(lookup.summary().warehouseId())) {
                throw invalidStartupMapping(warehouseCode, "설정값과 활성 창고 정보가 일치하지 않습니다");
            }
            WarehouseInternalClient.WarehouseSummary codeLookup =
                    warehouseInternalClient.findWarehouseByCode(warehouseCode).orElse(null);
            if (codeLookup == null || !configuredId.equals(codeLookup.warehouseId())) {
                throw invalidStartupMapping(warehouseCode, "UUID와 창고코드가 서로 다른 창고를 가리킵니다");
            }
            unavailableWarehouseCodes.remove(warehouseCode);
        }
    }

    /**
     * 기동 시 일시 장애로 보류한 창고 매핑을 주기적으로 재검증한다.
     *
     * <p>개별 HTTP 조회는 명시적 timeout으로 제한되며 UUID는 로그에 남기지 않는다.
     */
    @Scheduled(
            fixedDelayString = "${app.publish.warehouse-validation.retry-delay-ms:30000}",
            initialDelayString = "${app.publish.warehouse-validation.retry-initial-delay-ms:30000}")
    void revalidateUnavailableWarehouses() {
        if (!warehouseValidationEnabled || unavailableWarehouseCodes.isEmpty()) {
            return;
        }
        validateConfiguredWarehouses();
    }

    private IllegalStateException invalidStartupMapping(String warehouseCode, String reason) {
        return new IllegalStateException(
                "창고 매핑 기동 검증 실패: 창고코드 '" + warehouseCode + "' — " + reason);
    }

    /**
     * legacy warehouseCode 를 내부 UUID 로 변환.
     *
     * @param warehouseCode legacy 코드 (예: "00003", "2", "14", "1")
     * @return 매핑된 warehouse UUID
     * @throws BusinessException(INVALID_INPUT) 매핑 누락 또는 입력이 비어있을 때
     */
    public UUID resolve(String warehouseCode) {
        if (warehouseCode == null || warehouseCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "warehouseCode 가 비어있습니다");
        }
        String uuidStr = warehouseCodeMap.get(warehouseCode.trim());
        if (uuidStr == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "매핑되지 않은 warehouseCode: '" + warehouseCode + "'. "
                            + "운영자가 app.publish.warehouse-code-map 에 추가 필요.");
        }
        try {
            return UUID.fromString(uuidStr);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "warehouseCode '" + warehouseCode + "' 의 매핑값이 UUID 형식이 아닙니다");
        }
    }
}
