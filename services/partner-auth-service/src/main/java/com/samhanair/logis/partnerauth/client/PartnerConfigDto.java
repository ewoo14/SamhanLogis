package com.samhanair.logis.partnerauth.client;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * dc-config-service (M3) RPC 응답 — 거래처 설정 + DC 정책 nested.
 *
 * <p>설계서 §3 의 {@code TryLoginResponse.config} nested object 구조.
 * 3d backlog (PR — 본 PR) 에서 stub → 실제 dc-config-service {@code PartnerInternalResponse}
 * 를 매핑한 정식 DTO 로 확장.
 *
 * <p>DC 노출 5겹 가드 의 4번째 (응답 가공): 거래처 본인 로그인 응답은 DC 율 + 옵션 정액 DC
 * 를 포함하나, 본인 거래처에 한정되며 partnerCode 만 식별자로 노출 (UUID 미포함).
 */
public record PartnerConfigDto(
        String partnerCode,
        String partnerName,
        String representativeName,
        String mobileNo,
        List<String> allowedFeatures,
        Map<String, Object> options,
        /** 거래처 본인의 DC 정책 (없으면 null — 0% DC 로 처리). */
        Dc dc
) {

    /**
     * dc-config-service {@code DcConfigResponse} 와 1:1 매핑.
     *
     * <p>홈멀티 / 상업멀티 DC 율 + 옵션별 정액 DC + 반올림 정책.
     */
    public record Dc(
            BigDecimal homeDiscountRate,
            BigDecimal commercialDiscountRate,
            Boolean showIHose,
            BigDecimal discount360Amount,
            BigDecimal discount4WayAmount,
            BigDecimal discount1WayAmount,
            BigDecimal discountStandAmount,
            BigDecimal discountDeluxeAmount,
            BigDecimal discountFirstGradeAmount,
            Integer unitRoundTo,
            String unitRoundMode
    ) {}
}
