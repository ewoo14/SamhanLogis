package com.samhanair.logis.user.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** 계정 연결 미리보기 후보. 이름과 로그인 ID는 직원 원장과 정확히 비교한다. */
public record EmployeeAccountLinkCandidateRequest(
        @NotNull UUID accountId,
        @NotBlank String fullName,
        @NotBlank String loginId) {
}
