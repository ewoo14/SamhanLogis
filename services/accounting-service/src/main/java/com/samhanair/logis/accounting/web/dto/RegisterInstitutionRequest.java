package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.client.codef.dto.CodefRegisterCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Map;

/**
 * CODEF 기관 등록 요청.
 *
 * @param businessType 업무 구분(BANK/CARD/LOAN)
 * @param organization CODEF 기관 코드
 * @param loginType    CODEF 로그인 방식
 * @param credentials  일회성 로그인 자격. 응답·DB·로그에 저장하지 않는다.
 */
public record RegisterInstitutionRequest(
        @NotBlank(message = "기관 업무 구분은 필수입니다")
        @Pattern(regexp = "BANK|CARD|LOAN", message = "기관 업무 구분 값이 올바르지 않습니다")
        String businessType,

        @NotBlank(message = "기관 코드는 필수입니다")
        @Size(max = 50, message = "기관 코드는 최대 50자입니다")
        String organization,

        @NotBlank(message = "로그인 방식은 필수입니다")
        @Size(max = 30, message = "로그인 방식은 최대 30자입니다")
        String loginType,

        @NotEmpty(message = "기관 로그인 자격은 필수입니다")
        Map<String, String> credentials
) {
    /** 서비스 등록 명령으로 변환한다. */
    public CodefRegisterCommand toCommand() {
        return new CodefRegisterCommand(null, businessType, organization, loginType, credentials);
    }

    @Override
    public String toString() {
        return "RegisterInstitutionRequest[businessType=%s, organization=%s, loginType=%s, credentials=****]"
                .formatted(businessType, organization, loginType);
    }
}
