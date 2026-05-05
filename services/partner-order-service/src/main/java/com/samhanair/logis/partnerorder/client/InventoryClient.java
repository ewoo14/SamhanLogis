package com.samhanair.logis.partnerorder.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.config.InternalAuthProperties;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * M1b inventory-service (8085) RPC client — confirm 흐름의 reservation/commit. 실제 재고 차감은
 * slip-service 가 담당하므로 본 client 는 reserve 만 호출 (slip 발행 후 commit 또는 release 는
 * 향후 슬라이스).
 *
 * <p>회로 차단기 인스턴스: {@code inventoryClient}.
 */
@Component
public class InventoryClient {

    private static final Logger log = LoggerFactory.getLogger(InventoryClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String INVENTORY_SERVICE_BASE = "http://inventory-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    public InventoryClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                           InternalAuthProperties internalAuthProperties) {
        this.restClient = builder.baseUrl(INVENTORY_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * 재고 reserve — productId / quantity 단건 (라인별 호출). availableQty → reservedQty 이동.
     *
     * @param productId 제품 UUID
     * @param warehouseId 창고 UUID (M4 skeleton 은 default warehouse 가정 — 향후 슬라이스에서 라인별 분기)
     * @param quantity 예약 수량 (1 이상)
     * @return inventory-service ReservationResponse 의 raw Map (wire-format)
     * @throws BusinessException(CONFLICT) 가용 부족 (409)
     * @throws BusinessException(INTERNAL_ERROR) 5xx 또는 token 미설정
     */
    public Map<String, Object> reserve(UUID productId, UUID warehouseId, int quantity) {
        if (productId == null || warehouseId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "productId, warehouseId 필수");
        }
        if (quantity <= 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "quantity 는 1 이상");
        }

        Map<String, Object> body = Map.of(
                "productId", productId.toString(),
                "warehouseId", warehouseId.toString(),
                "quantity", quantity);

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> envelope = restClient.post()
                    .uri("/inventory/reserve")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        if (res.getStatusCode().value() == 409) {
                            throw new BusinessException(ErrorCode.CONFLICT,
                                    "재고 부족 또는 예약 충돌");
                        }
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "inventory-service 4xx: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "inventory-service 5xx: " + res.getStatusCode());
                    })
                    .body(Map.class);
            return envelope == null ? Map.of() : envelope;
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("InventoryClient reserve failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "inventory-service 호출 실패", ex);
        }
    }

    /**
     * 재고 release — confirm 도중 slip 발행 실패 시 보상 트랜잭션 (M5 skeleton 은 호출만 노출).
     *
     * @param productId 제품 UUID
     * @param warehouseId 창고 UUID
     * @param quantity 해제 수량
     */
    public void release(UUID productId, UUID warehouseId, int quantity) {
        if (productId == null || warehouseId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "productId, warehouseId 필수");
        }
        Map<String, Object> body = Map.of(
                "productId", productId.toString(),
                "warehouseId", warehouseId.toString(),
                "quantity", quantity);
        try {
            restClient.post()
                    .uri("/inventory/release")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RuntimeException ex) {
            log.error("InventoryClient release failed: {}", ex.getMessage());
            // release 실패는 alert 만 — 보상은 상위 흐름이 별도 처리
        }
    }

    private String requireToken() {
        String token = internalAuthProperties.getInternalToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "samhan.internal-token 미설정");
        }
        return token;
    }
}
