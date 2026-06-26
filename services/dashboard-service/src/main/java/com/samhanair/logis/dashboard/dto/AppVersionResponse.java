package com.samhanair.logis.dashboard.dto;

import com.samhanair.logis.dashboard.domain.AppRelease;
import com.samhanair.logis.dashboard.domain.AppVersionForceLevel;
import java.time.LocalDateTime;

/** 공개 앱 버전 조회 응답. */
public record AppVersionResponse(
        String latestVersion,
        String minSupportedVersion,
        AppVersionForceLevel forceLevel,
        String releaseNotes,
        LocalDateTime releasedAt
) {

    /** 최신 릴리스와 산정된 강제 수준으로 응답을 생성한다. */
    public static AppVersionResponse of(AppRelease release, AppVersionForceLevel forceLevel) {
        return new AppVersionResponse(
                release.getVersion(),
                release.getMinSupportedVersion(),
                forceLevel,
                release.getReleaseNotes(),
                release.getReleasedAt());
    }
}
