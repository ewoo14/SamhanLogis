package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import java.math.BigDecimal;
import java.util.UUID;

/**
 * 라인 응답 — id, product 정보, 규격, 수량, 단가, lineTotal, note.
 *
 * <p>Slice A (sales-polish-2): {@code specification} 필드 신규 응답 (사용자 피드백 #4).
 *
 * <p>PR-3 세트 전개 식별 필드 (PR #461 갱신):
 * <ul>
 *   <li>{@code setHead} — 세트 전개 첫 구성품 여부. 일반 라인/비전개 구성품 = false.</li>
 *   <li>{@code parentSetModel} — 세트 구성품일 때 부모 세트 modelCode. 일반 라인 = null.</li>
 * </ul>
 * FE SlipDetailPage 가 구성품 그룹을 시각 표시하거나 재고조회 제외 여부를 판단할 때 사용한다.
 * BUNDLE 부모 라인은 전개 저장이므로 전표 라인 목록에 존재하지 않는다 — 구성품 라인이
 * 재고조회 대상인 경우 단품 기준 조회가 올바른 동작.
 */
public record SlipLineResponse(
        UUID id,
        UUID productId,
        String productName,
        String modelName,
        String specification,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal,
        String note,
        /** VAT 포함 단가 — 단가 부가세포함 전환(2026-06-09). 화면 '단가' 표시값. nullable(legacy). */
        BigDecimal unitPriceWithVat,
        /** 공급가액(라인 단위, VAT 미포함). nullable(legacy). */
        BigDecimal supplyAmount,
        /** 부가세(라인 단위). nullable(legacy). */
        BigDecimal vatAmount,
        /**
         * 단가 권위 도메인 — #937 재수렴 6차 A안 (V59). {@code "VAT_INCLUSIVE"}/{@code "SUPPLY"},
         * V59 이전 legacy 행은 null.
         *
         * <p>FE 표시 계층({@code lineVat.resolveUnitPrices})이 두 단가 컬럼 중 어느 쪽이 사용자
         * 입력인지 <b>추측하지 않기 위해</b> 필요하다. 이 값이 없으면(legacy) FE 는 현행
         * 휴리스틱으로 떨어진다. 화면에 표시하는 값이 아니라 해석 계약이다.
         */
        String unitPriceDomain,
        /**
         * 세트 전개 첫 구성품 여부 — PR-3 V34 신규 (PR #461 갱신).
         * 세트 전개된 첫 번째 구성품 라인 = true. 일반 단품 라인 = false.
         */
        boolean setHead,
        /**
         * 세트 구성품의 부모 세트 modelCode — PR-3 V34 신규 (PR #461 갱신).
         * 세트 구성품 라인인 경우 부모 세트의 modelCode. 일반 단품 라인 = null.
         */
        String parentSetModel,
        BundleSetOptions setOptions) {

    /**
     * {@link SlipLine} 도메인 객체에서 응답 DTO 로 변환한다.
     *
     * @param line 전표 라인 엔티티
     * @return 라인 응답 DTO (setHead / parentSetModel 포함)
     */
    public static SlipLineResponse from(SlipLine line) {
        return new SlipLineResponse(
                line.getId(),
                line.getProductId(),
                line.getProductName(),
                line.getModelName(),
                line.getSpecification(),
                line.getQuantity(),
                line.getUnitPrice(),
                line.getLineTotal(),
                line.getNote(),
                line.getUnitPriceWithVat(),
                line.getSupplyAmount(),
                line.getVatAmount(),
                line.getUnitPriceDomain() == null ? null : line.getUnitPriceDomain().name(),
                line.isSetHead(),
                line.getParentSetModel(),
                line.getBundleSetOptions());
    }
}
