package com.samhanair.logis.dashboard.dto;

import com.samhanair.logis.dashboard.domain.AppClientType;
import com.samhanair.logis.dashboard.domain.AppReleaseForceLevel;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;

/** 앱 릴리스 등록/수정 요청. */
public record AppReleaseRequest(
        @NotNull AppClientType clientType,
        @NotBlank(message = "버전은 필수입니다.") String version,
        @NotNull AppReleaseForceLevel forceLevel,
        @NotBlank String releaseNotes,
        @NotNull LocalDateTime releasedAt,
        @NotBlank(message = "최소 지원 버전은 필수입니다.") String minSupportedVersion
) {
}
