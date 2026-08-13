package com.samhanair.logis.inventory.web.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * 재고 실사 라인 입력 — POST /inventory/audits/&#123;id&#125;/lines 또는 PUT .../lines/&#123;lineId&#125;.
 *
 * <p>productId 로 snapshot 단계의 라인을 찾아 actual_qty 를 set. lineId 가 path 로 주어지면
 * 해당 라인 직접 update (PUT). productId 만 주어진 경우 (POST) 는 audit 의 라인에서 매칭 검색.
 *
 * @param productId 제품 UUID (POST 의 경우 필수, snapshot 라인 검색)
 * @param actualQty 실사자 입력 실물 수량 (0 이상)
 * @param scanned   true 면 바코드 스캔 입력 (모바일), false 면 수동 (default false)
 */
public record AuditLineRequest(
        UUID productId,
        String productCode,
        @NotNull(message = "actualQty 는 필수입니다 (0 이상)")
        @Min(value = 0, message = "actualQty 는 0 이상이어야 합니다")
        Integer actualQty,
        Boolean scanned) {

    public AuditLineRequest(UUID productId, Integer actualQty, Boolean scanned) {
        this(productId, null, actualQty, scanned);
    }

    public boolean hasProductIdentifier() {
        return productId != null || (productCode != null && !productCode.isBlank());
    }

    /** scanned 가 null 이면 false 로 처리. */
    public boolean scannedOrFalse() {
        return Boolean.TRUE.equals(scanned);
    }
}
