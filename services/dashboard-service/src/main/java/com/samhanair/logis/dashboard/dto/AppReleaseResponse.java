package com.samhanair.logis.dashboard.dto;

import com.samhanair.logis.dashboard.domain.AppClientType;
import com.samhanair.logis.dashboard.domain.AppRelease;
import com.samhanair.logis.dashboard.domain.AppReleaseForceLevel;
import java.time.LocalDateTime;
import java.util.UUID;

/** 앱 릴리스 admin 응답. */
public record AppReleaseResponse(
        UUID id,
        AppClientType clientType,
        String version,
        AppReleaseForceLevel forceLevel,
        String releaseNotes,
        LocalDateTime releasedAt,
        String minSupportedVersion
) {

    /** entity 를 admin 응답 DTO 로 변환한다. */
    public static AppReleaseResponse from(AppRelease release) {
        return new AppReleaseResponse(
                release.getId(),
                release.getClientType(),
                release.getVersion(),
                release.getForceLevel(),
                release.getReleaseNotes(),
                release.getReleasedAt(),
                release.getMinSupportedVersion());
    }
}
