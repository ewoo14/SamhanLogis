package com.samhanair.logis.dcconfig.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.dcconfig.domain.DcConfig;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.util.Locale;

/**
 * 데스크탑 영업 "거래처 DC 설정" 화면(`/sales/partner-dc-config`) grid source.
 *
 * <p>frontend (`clients/desktop/src/renderer/api/sales.ts#PartnerDcConfig`) interface 1:1.
 *
 * <p>내부 {@link DcConfig} (BigDecimal 0~1 비율, BigDecimal 원 단위) →
 * 외부 표시 문자열 ("46%", "₩70,000", "Yes/No") 로 변환. 빈 값은 null 그대로 반환 —
 * frontend 는 null → "—" 또는 빈 셀로 표시.
 *
 * <p>DC 노출 5겹 가드 의 새 외부 endpoint — internal `/internal/partner-dc-configs/{code}` 와
 * 분리. 본 endpoint 는 X-User-Id 기반 인증 후 영업 화면이 호출하며, gateway 가 `/internal/**`
 * 외부 노출을 막는 가드는 그대로 유지된다.
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record PartnerDcConfigResponse(
        String partnerCode,
        String companyName,
        String homeMultiDc,
        String commercialMultiDc,
        String flexibleHoseTypeI,
        String threeSixty,
        String fourWay,
        String oneWay,
        String stand,
        String deluxe,
        String firstGrade,
        String unitProcess,
        String remark) {

    private static final NumberFormat KRW = NumberFormat.getNumberInstance(Locale.KOREA);

    public static PartnerDcConfigResponse from(DcConfig dc) {
        return new PartnerDcConfigResponse(
                dc.getPartner().getPartnerCode(),
                dc.getPartner().getName(),
                formatPercent(dc.getHomeDiscountRate()),
                formatPercent(dc.getCommercialDiscountRate()),
                formatYesNo(dc.getShowIHose()),
                formatWon(dc.getDiscount360Amount()),
                formatWon(dc.getDiscount4WayAmount()),
                formatWon(dc.getDiscount1WayAmount()),
                formatWon(dc.getDiscountStandAmount()),
                formatWon(dc.getDiscountDeluxeAmount()),
                formatWon(dc.getDiscountFirstGradeAmount()),
                formatYesNo(dc.getUnitProcessingEnabled()),
                dc.getNote());
    }

    private static String formatPercent(BigDecimal rate) {
        if (rate == null) return null;
        BigDecimal scaled = rate.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP);
        return scaled.toPlainString() + "%";
    }

    private static String formatWon(BigDecimal amount) {
        if (amount == null) return null;
        return "₩" + KRW.format(amount);
    }

    private static String formatYesNo(Boolean v) {
        if (v == null) return null;
        return v ? "Yes" : "No";
    }
}
