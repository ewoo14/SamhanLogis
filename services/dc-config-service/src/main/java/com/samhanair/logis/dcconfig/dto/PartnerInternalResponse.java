package com.samhanair.logis.dcconfig.dto;

import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.domain.PartnerGroup;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.util.UUID;

/**
 * Partner + DcConfig nested 응답 — internal 전용 (M2 RPC 응답).
 *
 * <p>DC 노출 5겹 가드 의 1·2번째: 본 record 는 internal controller 만 사용.
 * Public 응답은 {@link PartnerPublicResponse} 별도 분리.
 */
@Schema(description = "거래처 + DC 설정 통합 응답 (internal 전용)")
public record PartnerInternalResponse(
        @Schema(description = "거래처 UUID (서비스 간 internal 만)") UUID partnerId,
        @Schema(description = "거래처 코드") String partnerCode,
        @Schema(description = "사업자번호") String bizNo,
        @Schema(description = "상호") String name,
        @Schema(description = "주소") String address,
        @Schema(description = "대표 연락처") String phone,
        @Schema(description = "담당자명") String manager,
        @Schema(description = "거래처 그룹") PartnerGroup partnerGroup,
        @Schema(description = "채권 한도") BigDecimal creditLimit,
        @Schema(description = "비고") String remark,
        @Schema(description = "DC 설정 (없으면 null)") DcConfigResponse dcConfig
) {

    public static PartnerInternalResponse from(Partner partner, DcConfig dcConfig) {
        return new PartnerInternalResponse(
                partner.getId(),
                partner.getPartnerCode(),
                partner.getBizNo(),
                partner.getName(),
                partner.getAddress(),
                partner.getPhone(),
                partner.getManager(),
                partner.getPartnerGroup(),
                partner.getCreditLimit(),
                partner.getRemark(),
                dcConfig == null ? null : DcConfigResponse.from(dcConfig)
        );
    }
}
