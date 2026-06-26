package com.samhanair.logis.dashboard.repository;

import com.samhanair.logis.dashboard.domain.AppClientType;
import com.samhanair.logis.dashboard.domain.AppRelease;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 앱 릴리스 정책 repository. */
public interface AppReleaseRepository extends JpaRepository<AppRelease, UUID> {

    /** 클라이언트 유형별 활성 릴리스 목록. */
    List<AppRelease> findByClientType(AppClientType clientType);

    /** 활성 릴리스 중 클라이언트 유형과 semver 조합 조회. */
    Optional<AppRelease> findByClientTypeAndVersion(AppClientType clientType, String version);
}
