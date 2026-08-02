package com.samhanair.logis.slip.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
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
 * Internal-token-authenticated client to {@code inventory-service} 의 mutation 엔드포인트
 * ({@code /inventory/reserve}, {@code /inventory/release}, {@code /inventory/deduct},
 * {@code /inventory/lots/inbound}).
 *
 * <p>출고전표 lifecycle:
 * <ul>
 *   <li>accept → {@link #reserve} (라인별 1회)</li>
 *   <li>complete → {@link #deduct} fromReservation=true (라인별 1회)</li>
 *   <li>reject/cancel after ACCEPTED → {@link #release} (라인별 1회)</li>
 * </ul>
 * 입고전표 lifecycle: complete → {@link #inbound} (라인별 1회).
 * serial-managed 입고/출고 lifecycle: complete → {@link #inboundInstances},
 * accept → {@link #reserveInstances}, complete → {@link #shipInstances},
 * reject/cancel → {@link #releaseInstances}, 반품/회차 complete → {@link #recallInstances},
 * 반품/회차 보상 → {@link #unrecallInstances}.
 *
 * <p>HTTP 상태 매핑:
 * <ul>
 *   <li>4xx (특히 409 재고 부족) → {@link BusinessException}({@link ErrorCode#CONFLICT})</li>
 *   <li>5xx / 연결 실패 → {@link BusinessException}({@link ErrorCode#INTERNAL_ERROR})</li>
 * </ul>
 */
@Component
public class InventoryClient {

    private static final Logger log = LoggerFactory.getLogger(InventoryClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String SYSTEM_MASTER_HEADER = "X-Is-System-Master";
    // Phase C5-4: X-User-Role 헤더 주입 제거.
    // 수신측 inventory-service HeaderAuthenticationFilter 는 X-User-Id 단독으로 인증 성립 (C5-3).
    // /inventory/** 경로는 /internal/ prefix 아님 → InternalTokenFilter no-op 통과.
    // PermissionAspect master bypass 는 X-Is-System-Master:true 단독 판정이므로 함께 전송한다.
    private static final String INTERNAL_CALLER_ID = "00000000-0000-0000-0000-000000000000";
    private static final String INVENTORY_SERVICE_BASE = "http://inventory-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    public InventoryClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                           InternalAuthProperties internalAuthProperties) {
        this.restClient = builder.baseUrl(INVENTORY_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * 재고 예약 — 출고전표 accept() 시 라인별 호출. 가용재고에서 예약재고로 이동.
     *
     * @param productId 제품 UUID
     * @param warehouseId 출고 창고 (Slip.sourceWarehouseId)
     * @param quantity 예약 수량 (1 이상)
     * @param refType 참조 유형 (예: "SLIP")
     * @param refId 참조 식별자 (전표 UUID)
     * @throws BusinessException(CONFLICT) inventory-service 가 4xx 반환 (재고 부족 등)
     * @throws BusinessException(INTERNAL_ERROR) 5xx / 네트워크 실패
     */
    public void reserve(UUID productId, UUID warehouseId, int quantity, String refType, UUID refId) {
        Map<String, Object> body = baseBody(productId, warehouseId, quantity, refType, refId);
        post("/inventory/reserve", body);
    }

    /**
     * 재고 예약 해제 — 출고전표가 ACCEPTED 단계에서 reject/cancel 될 때 라인별 호출.
     *
     * @param productId 제품 UUID
     * @param warehouseId 출고 창고
     * @param quantity 해제 수량
     * @param refType 참조 유형
     * @param refId 참조 식별자
     * @throws BusinessException(CONFLICT) inventory-service 가 4xx 반환 (예약 부족 등)
     * @throws BusinessException(INTERNAL_ERROR) 5xx / 네트워크 실패
     */
    public void release(UUID productId, UUID warehouseId, int quantity, String refType, UUID refId) {
        Map<String, Object> body = baseBody(productId, warehouseId, quantity, refType, refId);
        post("/inventory/release", body);
    }

    /**
     * 재고 차감 — 출고전표 complete() 시 라인별 호출. fromReservation=true 면 예약재고에서 차감.
     *
     * @param productId 제품 UUID
     * @param warehouseId 출고 창고
     * @param quantity 차감 수량
     * @param fromReservation true 면 예약재고에서, false 면 가용재고에서 직접 차감
     * @param refType 참조 유형
     * @param refId 참조 식별자
     * @throws BusinessException(CONFLICT) inventory-service 가 4xx 반환 (재고/예약 부족)
     * @throws BusinessException(INTERNAL_ERROR) 5xx / 네트워크 실패
     */
    public void deduct(UUID productId, UUID warehouseId, int quantity, boolean fromReservation,
                       String refType, UUID refId) {
        Map<String, Object> body = baseBody(productId, warehouseId, quantity, refType, refId);
        body.put("fromReservation", fromReservation);
        post("/inventory/deduct", body);
    }

    /**
     * 재고 입고 — 입고전표 complete() 시 라인별 호출. 새 lot 생성 + balance 가산.
     *
     * @param productId 제품 UUID
     * @param warehouseId 입고 창고 (Slip.destinationWarehouseId)
     * @param quantity 입고 수량
     * @param lotNo 외부 lot 번호 (보통 slipNo)
     * @param unitCost 단위 원가 (slip line 공급가액/수량, legacy 는 unitPrice)
     * @throws BusinessException(CONFLICT) inventory-service 가 4xx 반환
     * @throws BusinessException(INTERNAL_ERROR) 5xx / 네트워크 실패
     */
    public void inbound(UUID productId, UUID warehouseId, int quantity,
                        String lotNo, BigDecimal unitCost) {
        inbound(productId, warehouseId, quantity, lotNo, null, unitCost);
    }

    /** 입고전표 라인까지 전달하는 멱등 입고 호출. */
    public void inbound(UUID productId, UUID warehouseId, int quantity,
                        String lotNo, UUID inboundLineId, BigDecimal unitCost) {
        Map<String, Object> body = new HashMap<>();
        body.put("productId", productId.toString());
        body.put("warehouseId", warehouseId.toString());
        body.put("quantity", quantity);
        if (lotNo != null) {
            body.put("lotNo", lotNo);
        }
        if (inboundLineId != null) {
            body.put("inboundLineId", inboundLineId.toString());
        }
        if (unitCost != null) {
            body.put("unitCost", unitCost);
        }
        post("/inventory/lots/inbound", body);
    }

    /**
     * 시리얼 관리 품목 입고 — 입고전표 complete() 시 인스턴스 N개를 멱등 생성한다.
     *
     * @param productId     제품 UUID
     * @param productCode   품목코드 그룹 (inventory stock_instances.product_code)
     * @param warehouseId   입고 창고
     * @param quantity      입고 수량
     * @param inboundType   입고 구분(구매/차용)
     * @param inboundSlipNo 입고전표 번호
     * @param unitCost      단위 원가
     * @throws BusinessException(CONFLICT) inventory-service 가 4xx 반환
     * @throws BusinessException(INTERNAL_ERROR) 5xx / 네트워크 실패
     */
    public void inboundInstances(UUID productId, String productCode, UUID warehouseId, int quantity,
                                 String inboundType, String inboundSlipNo, BigDecimal unitCost) {
        Map<String, Object> body = new HashMap<>();
        body.put("productId", productId.toString());
        body.put("productCode", productCode);
        body.put("warehouseId", warehouseId.toString());
        body.put("quantity", quantity);
        body.put("inboundType", inboundType);
        body.put("inboundSlipNo", inboundSlipNo);
        body.put("receivedAt", LocalDateTime.now());
        if (unitCost != null) {
            body.put("unitCost", unitCost);
        }
        post("/inventory/instances/batch", body);
    }

    /**
     * 시리얼 관리 품목 출고 예약 — OUTBOUND 전표 accept() 시 인스턴스 N개를 FIFO RESERVED 처리한다.
     *
     * @param productCode    품목코드 그룹
     * @param warehouseId    출고 원천 창고
     * @param quantity       예약 수량
     * @param outboundSlipNo 출고전표 번호
     * @throws BusinessException(CONFLICT) inventory-service 가 4xx 반환(재고 부족 등)
     * @throws BusinessException(INTERNAL_ERROR) 5xx / 네트워크 실패
     */
    public void reserveInstances(String productCode, UUID warehouseId, int quantity, String outboundSlipNo) {
        Map<String, Object> body = new HashMap<>();
        body.put("productCode", productCode);
        body.put("warehouseId", warehouseId.toString());
        body.put("quantity", quantity);
        body.put("outboundSlipNo", outboundSlipNo);
        post("/inventory/instances/reserve-batch", body);
    }

    /**
     * 시리얼 관리 품목 예약분 출고 — OUTBOUND 전표 complete() 시 RESERVED 인스턴스를 SHIPPED 처리한다.
     *
     * @param outboundSlipNo 출고전표 번호
     * @param productCode    품목코드 그룹
     * @param partnerCode    출고 거래처 코드
     * @param outboundAt     출고일시(null 이면 inventory-service 기준 now)
     * @throws BusinessException(CONFLICT) inventory-service 가 4xx 반환
     * @throws BusinessException(INTERNAL_ERROR) 5xx / 네트워크 실패
     */
    public void shipInstances(String outboundSlipNo, String productCode,
                              String partnerCode, LocalDateTime outboundAt) {
        Map<String, Object> body = new HashMap<>();
        body.put("outboundSlipNo", outboundSlipNo);
        body.put("productCode", productCode);
        if (partnerCode != null) {
            body.put("partnerCode", partnerCode);
        }
        if (outboundAt != null) {
            body.put("outboundAt", outboundAt);
        }
        post("/inventory/instances/ship-batch", body);
    }

    /**
     * 시리얼 관리 품목 예약 해제 — OUTBOUND 전표 reject/cancel 시 RESERVED 인스턴스를 AVAILABLE 복원한다.
     *
     * @param outboundSlipNo 출고전표 번호
     * @param productCode    품목코드 그룹
     * @throws BusinessException(CONFLICT) inventory-service 가 4xx 반환
     * @throws BusinessException(INTERNAL_ERROR) 5xx / 네트워크 실패
     */
    public void releaseInstances(String outboundSlipNo, String productCode) {
        Map<String, Object> body = new HashMap<>();
        body.put("outboundSlipNo", outboundSlipNo);
        body.put("productCode", productCode);
        post("/inventory/instances/release-batch", body);
    }

    /**
     * 시리얼 관리 품목 회수 — INBOUND 반품/회차 전표 complete 시 SHIPPED 인스턴스를 RECALLED 처리한다.
     *
     * @param partnerCode  출고 거래처 코드
     * @param productCode  품목코드 그룹
     * @param quantity     회수 수량
     * @param recallSlipNo 회수 입고전표 번호
     * @throws BusinessException(CONFLICT) inventory-service 가 4xx 반환(회수 대상 부족 등)
     * @throws BusinessException(INTERNAL_ERROR) 5xx / 네트워크 실패
     */
    public void recallInstances(String partnerCode, String productCode, int quantity, String recallSlipNo) {
        Map<String, Object> body = new HashMap<>();
        body.put("partnerCode", partnerCode);
        body.put("productCode", productCode);
        body.put("quantity", quantity);
        body.put("recallSlipNo", recallSlipNo);
        post("/inventory/instances/recall-batch", body);
    }

    /**
     * 시리얼 관리 품목 회수 취소 — INBOUND 반품/회차 complete 보상 시 RECALLED 인스턴스를 SHIPPED 로 복원한다.
     *
     * @param recallSlipNo 회수 입고전표 번호
     * @param productCode  품목코드 그룹
     * @throws BusinessException(CONFLICT) inventory-service 가 4xx 반환(본문 포함)
     * @throws BusinessException(INTERNAL_ERROR) 5xx / 네트워크 실패
     */
    public void unrecallInstances(String recallSlipNo, String productCode) {
        Map<String, Object> body = new HashMap<>();
        body.put("recallSlipNo", recallSlipNo);
        body.put("productCode", productCode);
        post("/inventory/instances/unrecall-batch", body);
    }

    private static Map<String, Object> baseBody(UUID productId, UUID warehouseId, int quantity,
                                                String refType, UUID refId) {
        Map<String, Object> body = new HashMap<>();
        body.put("productId", productId.toString());
        body.put("warehouseId", warehouseId.toString());
        body.put("quantity", quantity);
        if (refType != null) {
            body.put("referenceType", refType);
        }
        if (refId != null) {
            body.put("referenceId", refId.toString());
        }
        return body;
    }

    private void post(String path, Map<String, Object> body) {
        try {
            restClient.post()
                    .uri(path)
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .header(USER_ID_HEADER, INTERNAL_CALLER_ID)
                    .header(SYSTEM_MASTER_HEADER, "true")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.CONFLICT,
                                "inventory-service 호출 실패(" + res.getStatusCode() + "): "
                                        + readErrorBody(res));
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "inventory-service 호출 실패: " + res.getStatusCode());
                    })
                    .toBodilessEntity();
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("InventoryClient {} failed: {}", path, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "inventory-service 호출 실패", ex);
        }
    }

    /**
     * inventory-service 4xx 응답 본문을 추출 — 재고 부족 상세("가용 N < 필요 M (productCode=...)") 등을
     * 호출자/로그에 전달해 디버깅성을 확보한다. 읽기 실패 시 일반 문구로 폴백한다.
     */
    private static String readErrorBody(org.springframework.http.client.ClientHttpResponse res) {
        try {
            String body = new String(res.getBody().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            return body.isBlank() ? "재고 부족 등" : body;
        } catch (java.io.IOException ex) {
            return "재고 부족 등";
        }
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "app.security.internal.token 미설정");
        }
        return token;
    }
}
