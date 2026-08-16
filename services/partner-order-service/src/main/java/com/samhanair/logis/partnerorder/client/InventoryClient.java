package com.samhanair.logis.partnerorder.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.LinkedHashMap;
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
 * inventory-service RPC client — Phase 2.6c reserve(예약) / release(해제) / warehouseCode 역조회.
 *
 * <p>설계 원칙:
 * <ul>
 *   <li>reserve 호출에 referenceType / referenceId 를 전달하여 inventory-service 의 멱등 가드 활성화.</li>
 *   <li>가용 부족 409 → {@link BusinessException}(CONFLICT) 전파 → convert 사전차단.</li>
 *   <li>release 는 보상 트랜잭션용 — 실패 시 alert 로그만 (상위 흐름이 별도 처리).</li>
 *   <li>resolveWarehouseIdByCode — inventory DB 단일 출처로 warehouseCode → UUID 변환.</li>
 *   <li>{@link ReservationResult} — reserve 응답에서 {@code alreadyReserved} 추출.
 *       멱등 no-op(true) 이면 PartnerOrderConvertService 가 보상 대상에서 제외한다.</li>
 * </ul>
 *
 * <p>회로 차단기 인스턴스: {@code inventoryClient}.
 */
@Component
public class InventoryClient {

    /**
     * reserve 호출 결과 — alreadyReserved 플래그 포함.
     *
     * <p>{@code alreadyReserved=true}: 멱등 no-op. 실제 reservedQty 변동 없음.
     * 보상(compensateReserved) 대상에서 제외해야 double-release 를 방지할 수 있다.
     * {@code alreadyReserved=false}: 실제 예약 movement 발생.
     */
    public record ReservationResult(boolean alreadyReserved) {
        /** 실제 예약 발생. */
        public static ReservationResult reserved() {
            return new ReservationResult(false);
        }

        /** 멱등 no-op — 이미 예약된 상태. */
        public static ReservationResult noop() {
            return new ReservationResult(true);
        }
    }

    private static final Logger log = LoggerFactory.getLogger(InventoryClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String INVENTORY_SERVICE_BASE = "http://inventory-service";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String SYSTEM_MASTER_HEADER = "X-Is-System-Master";
    // Phase C5-4: X-User-Role: MASTER 헤더 주입 제거.
    // 수신측 inventory-service HeaderAuthenticationFilter 는 X-User-Id 단독으로 인증 성립 (C5-3).
    // /inventory/reserve|release 경로는 /internal/ prefix 아님 → InternalTokenFilter no-op 통과.
    // PermissionAspect MASTER bypass 는 X-Is-System-Master:true 단독으로 수행되므로 role 불필요.
    private static final String INTERNAL_CALLER_ID = "00000000-0000-0000-0000-000000000000";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    public InventoryClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                           InternalAuthProperties internalAuthProperties) {
        this.restClient = builder.baseUrl(INVENTORY_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * 재고 reserve — availableQty → reservedQty 이동 (Phase 2.6c 멱등 가드 포함).
     *
     * <p>referenceType / referenceId 를 inventory-service 에 전달하여
     * (referenceType, referenceId, productId, RESERVE) 중복 시 no-op 응답을 받는다.
     * 동일 convertKey 로 재시도해도 이중 예약이 발생하지 않는다.
     *
     * <p>응답의 {@code alreadyReserved} 필드가 {@code true} 이면 멱등 no-op.
     * 호출자는 해당 라인을 보상(reservedLines) 에서 제외하여 double-release 를 방지해야 한다.
     *
     * @param productId     제품 UUID
     * @param warehouseId   창고 UUID
     * @param quantity      예약 수량 (1 이상)
     * @param referenceType 참조 유형 (예: "PARTNER_ORDER_CONVERT")
     * @param referenceId   참조 ID UUID (예: convertKey를 UUID 변환한 값)
     * @return {@link ReservationResult} — alreadyReserved 플래그 포함
     * @throws BusinessException(CONFLICT)       가용 부족 (409) — 전환 사전차단
     * @throws BusinessException(INVALID_INPUT)  파라미터 오류
     * @throws BusinessException(INTERNAL_ERROR) 5xx 또는 token 미설정
     */
    public ReservationResult reserve(UUID productId, UUID warehouseId, int quantity,
                                     String referenceType, UUID referenceId) {
        if (productId == null || warehouseId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "productId, warehouseId 필수");
        }
        if (quantity <= 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "quantity 는 1 이상");
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("productId", productId.toString());
        body.put("warehouseId", warehouseId.toString());
        body.put("quantity", quantity);
        if (referenceType != null) {
            body.put("referenceType", referenceType);
        }
        if (referenceId != null) {
            body.put("referenceId", referenceId.toString());
        }

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> envelope = restClient.post()
                    .uri("/inventory/reserve")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .header(USER_ID_HEADER, INTERNAL_CALLER_ID)
                    .header(SYSTEM_MASTER_HEADER, "true")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        if (res.getStatusCode().value() == 409) {
                            throw new BusinessException(ErrorCode.CONFLICT,
                                    "재고 부족 또는 예약 충돌 (가용 재고 부족)");
                        }
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "inventory-service 4xx: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "inventory-service 5xx: " + res.getStatusCode());
                    })
                    .body(Map.class);

            // alreadyReserved 플래그 추출 — inventory-service 가 true 를 반환하면 멱등 no-op
            boolean alreadyReserved = false;
            if (envelope != null) {
                Object data = envelope.get("data");
                if (data instanceof Map<?, ?> dataMap) {
                    Object flag = dataMap.get("alreadyReserved");
                    if (Boolean.TRUE.equals(flag)) {
                        alreadyReserved = true;
                    }
                }
            }
            return alreadyReserved ? ReservationResult.noop() : ReservationResult.reserved();
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("InventoryClient reserve failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "inventory-service 호출 실패", ex);
        }
    }

    /**
     * 재고 reserve (기존 시그니처 유지 — confirm 경로 호환).
     *
     * <p>referenceType / referenceId 없이 호출하는 레거시 경로용. 멱등 가드 미적용.
     * 반환값의 {@code alreadyReserved} 는 항상 {@code false} (멱등 가드 비활성).
     *
     * @param productId   제품 UUID
     * @param warehouseId 창고 UUID
     * @param quantity    예약 수량 (1 이상)
     * @return {@link ReservationResult} — alreadyReserved=false 고정
     */
    public ReservationResult reserve(UUID productId, UUID warehouseId, int quantity) {
        return reserve(productId, warehouseId, quantity, null, null);
    }

    /**
     * 재고 release — 보상 트랜잭션 (slip 발행 실패 시 예약 해제).
     *
     * <p>referenceType / referenceId 를 포함하여 어떤 예약에 대한 해제인지 inventory-service 에 전달.
     * 실패 시 alert 로그만 — 상위 흐름이 별도 처리.
     *
     * @param productId     제품 UUID
     * @param warehouseId   창고 UUID
     * @param quantity      해제 수량
     * @param referenceType 참조 유형 (null 허용)
     * @param referenceId   참조 ID (null 허용)
     */
    public void release(UUID productId, UUID warehouseId, int quantity,
                        String referenceType, UUID referenceId) {
        if (productId == null || warehouseId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "productId, warehouseId 필수");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("productId", productId.toString());
        body.put("warehouseId", warehouseId.toString());
        body.put("quantity", quantity);
        if (referenceType != null) {
            body.put("referenceType", referenceType);
        }
        if (referenceId != null) {
            body.put("referenceId", referenceId.toString());
        }
        try {
            restClient.post()
                    .uri("/inventory/release")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .header(USER_ID_HEADER, INTERNAL_CALLER_ID)
                    .header(SYSTEM_MASTER_HEADER, "true")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RuntimeException ex) {
            log.error("InventoryClient release failed (보상 실패 — 수동 복구 필요): {}", ex.getMessage());
            // release 실패는 alert 만 — 보상은 상위 흐름이 별도 처리
        }
    }

    /**
     * 재고 release (기존 시그니처 유지 — confirm 경로 호환).
     *
     * @param productId   제품 UUID
     * @param warehouseId 창고 UUID
     * @param quantity    해제 수량
     */
    public void release(UUID productId, UUID warehouseId, int quantity) {
        release(productId, warehouseId, quantity, null, null);
    }

    /**
     * warehouseCode → warehouseId(UUID) 역조회.
     *
     * <p>inventory-service {@code GET /internal/inventory/warehouses/by-code?code=} 호출.
     * slip-service 의 정적 yml 매핑(WarehouseCodeMapper) 을 복제하지 않고
     * inventory DB 를 단일 출처로 활용한다.
     *
     * @param warehouseCode 창고 코드 (예: "MAIN", "CAR-01")
     * @return 창고 UUID
     * @throws BusinessException(NOT_FOUND)      해당 코드의 창고 없음 (404)
     * @throws BusinessException(INVALID_INPUT)  warehouseCode 가 blank
     * @throws BusinessException(INTERNAL_ERROR) 5xx 또는 network 오류
     */
    public UUID resolveWarehouseIdByCode(String warehouseCode) {
        if (warehouseCode == null || warehouseCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "warehouseCode 는 필수입니다");
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> envelope = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/internal/inventory/warehouses/by-code")
                            .queryParam("code", warehouseCode.trim())
                            .build())
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        if (res.getStatusCode().value() == 404) {
                            throw new BusinessException(ErrorCode.NOT_FOUND,
                                    "창고 코드 '" + warehouseCode + "' 를 찾을 수 없습니다");
                        }
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "inventory-service warehouse 조회 4xx: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "inventory-service 5xx: " + res.getStatusCode());
                    })
                    .body(Map.class);
            if (envelope == null) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "inventory-service warehouse 응답이 null");
            }
            // ApiResponse 래핑: data.warehouseId
            @SuppressWarnings("unchecked")
            Map<String, Object> data = (Map<String, Object>) envelope.get("data");
            if (data == null) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "inventory-service warehouse 응답 data 필드 없음");
            }
            String warehouseIdStr = (String) data.get("warehouseId");
            if (warehouseIdStr == null) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "inventory-service warehouse 응답 warehouseId 필드 없음");
            }
            return OpaqueUuidDecoder.decode(warehouseIdStr);
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("InventoryClient resolveWarehouseIdByCode failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "inventory-service warehouse 조회 실패", ex);
        }
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "samhan.internal-token 미설정");
        }
        return token;
    }
}
