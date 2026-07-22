package com.samhanair.logis.partnerorder.client;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 외부 estimate-service 조회 포트.
 *
 * <p>SP-08-4-3 에서는 estimate-service 별도 client 가 아직 없으므로 포트/fixture 로 계약을 먼저
 * 고정한다. 실제 HTTP client 는 후속 estimate-service 분리 시 본 interface 뒤에 교체한다.
 */
public interface EstimateClient {

    Optional<EstimateSnapshot> findById(UUID estimateId);

    record EstimateSnapshot(
            UUID estimateId,
            String estimateNumber,
            String partnerCode,
            String bizCode,
            String dueDate,
            String memo,
            List<EstimateLineSnapshot> lines
    ) {
    }

    record EstimateLineSnapshot(
            UUID productId,
            String modelCode,
            String productName,
            String categoryKey,
            int quantity,
            BigDecimal deliveryPrice,
            String remark,
            BigDecimal supplyAmount,
            BigDecimal vatAmount,
            BigDecimal lineTotal,
            String authority
    ) {
        /** 기존 견적 client fixture의 7개 인자 계약을 보존한다. */
        public EstimateLineSnapshot(UUID productId, String modelCode, String productName,
                                    String categoryKey, int quantity, BigDecimal deliveryPrice,
                                    String remark) {
            this(productId, modelCode, productName, categoryKey, quantity, deliveryPrice, remark,
                    null, null, null, null);
        }
    }
}
