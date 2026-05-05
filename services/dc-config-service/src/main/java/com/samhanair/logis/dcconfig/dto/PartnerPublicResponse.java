package com.samhanair.logis.dcconfig.dto;

import com.samhanair.logis.dcconfig.domain.Partner;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Partner public 응답 — Gateway 경유 외부 응답.
 *
 * <p>DC 노출 5겹 가드 의 2번째: 본 record 에는 DC 관련 필드 (rate / amount /
 * showIHose / unitRound*) 가 자체 부재. {@code DcConfigResponse} (internal 전용) 와
 * 클래스 분리.
 *
 * <p>UUID 비공개 — partnerCode + name + 연락처만 노출, partnerId UUID 미포함.
 */
@Schema(description = "거래처 public 정보 (DC 정보 제외)")
public record PartnerPublicResponse(
        @Schema(description = "거래처 코드 (사용자 노출 식별자)") String partnerCode,
        @Schema(description = "상호") String name,
        @Schema(description = "주소") String address,
        @Schema(description = "대표 연락처") String phone,
        @Schema(description = "담당자명") String manager
) {

    public static PartnerPublicResponse from(Partner partner) {
        return new PartnerPublicResponse(
                partner.getPartnerCode(),
                partner.getName(),
                partner.getAddress(),
                partner.getPhone(),
                partner.getManager()
        );
    }
}
