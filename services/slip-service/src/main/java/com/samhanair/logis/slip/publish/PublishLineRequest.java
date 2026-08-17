package com.samhanair.logis.slip.publish;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.UUID;
import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;

/**
 * Phase 6 M5 (slip-service-integration) 발행 endpoint 의 라인 요청 — 양식 1종 공통.
 *
 * <p>설계 §3 라인 매핑 (legacy {@code BulkDatas.PROD_*}):
 * <ul>
 *   <li>{@code productCode} — 제품 모델/코드 (legacy {@code PROD_CD}). product-service
 *       {@code lookupByModel} 로 productId 변환.</li>
 *   <li>{@code productName} — snapshot 명 (legacy {@code PROD_DES}, 선택)</li>
 *   <li>{@code spec} — 규격 (legacy {@code SIZE_DES}, zero-width 정규화 후 저장)</li>
 *   <li>{@code qty} — 수량 (문자열 가능 → 서비스 레이어에서 int parse)</li>
 *   <li>{@code unitPriceVat} — VAT 포함 단가 (legacy {@code USER_PRICE_VAT}, abs 처리)</li>
 *   <li>{@code unitPriceExVat} — VAT 제외 단가 (legacy {@code PRICE}, audit 보존용)</li>
 *   <li>{@code supplyAmount} — 공급가액 (legacy {@code SUPPLY_AMT}, audit 보존용)</li>
 *   <li>{@code vatAmount} — 세액 (legacy {@code VAT_AMT}, audit 보존용)</li>
 *   <li>{@code remarks} — 라인 메모 (legacy {@code REMARKS})</li>
 *   <li>{@code sourceOrderLineId} — 출처 주문 라인 UUID (Phase 2.6a 부분전환, nullable)</li>
 * </ul>
 *
 * <p>SlipLine 엔티티에는 {@code unitPrice} (= unitPriceVat) 만 저장. Audit 합계는
 * {@link com.samhanair.logis.slip.domain.SlipPublishAudit} 에 supplyAmount / vatAmount 합계로 보존.
 */
public record PublishLineRequest(
        Integer lineNo,
        @NotBlank @Size(max = 100) String productCode,
        @Size(max = 200) String productName,
        @Size(max = 100) String spec,
        @NotBlank String qty,
        @PositiveOrZero BigDecimal unitPriceExVat,
        @PositiveOrZero BigDecimal unitPriceVat,
        @PositiveOrZero BigDecimal supplyAmount,
        @PositiveOrZero BigDecimal vatAmount,
        @Size(max = 200) String remarks,
        UUID sourceOrderLineId,
        @Size(max = 40) String categoryKey,
        BundleSetOptions bundleSetOptions) {

    public PublishLineRequest(Integer lineNo, String productCode, String productName, String spec,
                              String qty, BigDecimal unitPriceExVat, BigDecimal unitPriceVat,
                              BigDecimal supplyAmount, BigDecimal vatAmount, String remarks,
                              UUID sourceOrderLineId, String categoryKey) {
        this(lineNo, productCode, productName, spec, qty, unitPriceExVat, unitPriceVat,
                supplyAmount, vatAmount, remarks, sourceOrderLineId, categoryKey, null);
    }
}
