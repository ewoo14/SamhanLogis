package com.samhanair.logis.dashboard.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.dashboard.domain.AppClientType;
import com.samhanair.logis.dashboard.domain.AppRelease;
import com.samhanair.logis.dashboard.domain.AppReleaseForceLevel;
import com.samhanair.logis.dashboard.domain.AppVersionForceLevel;
import com.samhanair.logis.dashboard.domain.Semver;
import com.samhanair.logis.dashboard.dto.AppReleaseRequest;
import com.samhanair.logis.dashboard.dto.AppVersionResponse;
import com.samhanair.logis.dashboard.repository.AppReleaseRepository;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 앱 버전 정책 조회 및 admin CRUD 서비스. */
@Service
@RequiredArgsConstructor
public class AppReleaseService {

    private final AppReleaseRepository repository;

    /** 공개 버전 조회. 인증 전 호출될 수 있으므로 자격 정보에 의존하지 않는다. */
    @Transactional(readOnly = true)
    public AppVersionResponse checkVersion(AppClientType clientType, String currentVersion) {
        Semver.requireValid(currentVersion, "currentVersion");
        AppRelease latest = latestRelease(clientType);
        AppVersionForceLevel forceLevel = resolveForceLevel(latest, currentVersion);
        return AppVersionResponse.of(latest, forceLevel);
    }

    /** admin 릴리스 목록 조회. */
    @Transactional(readOnly = true)
    public List<AppRelease> list(AppClientType clientType) {
        List<AppRelease> releases = clientType == null ? repository.findAll() : repository.findByClientType(clientType);
        return releases.stream()
                .sorted(Comparator.comparing(AppRelease::getClientType)
                        .thenComparing(AppRelease::getVersion, Semver::compare)
                        .reversed())
                .toList();
    }

    /** admin 릴리스 등록. */
    @Transactional
    public AppRelease create(AppReleaseRequest request) {
        Semver.requireDevelopmentVersion(request.version(), "version");
        Semver.requireDevelopmentVersion(request.minSupportedVersion(), "minSupportedVersion");
        ensureUnique(null, request.clientType(), request.version());
        try {
            return repository.saveAndFlush(AppRelease.create(
                    request.clientType(),
                    request.version(),
                    request.forceLevel(),
                    request.releaseNotes(),
                    request.releasedAt(),
                    request.minSupportedVersion()));
        } catch (DataIntegrityViolationException ex) {
            throw duplicateReleaseConflict(ex);
        }
    }

    /** admin 릴리스 수정. */
    @Transactional
    public AppRelease update(UUID id, AppReleaseRequest request) {
        AppRelease release = findActive(id);
        validateUpdateVersions(release, request);
        ensureUnique(id, request.clientType(), request.version());
        try {
            release.update(
                    request.clientType(),
                    request.version(),
                    request.forceLevel(),
                    request.releaseNotes(),
                    request.releasedAt(),
                    request.minSupportedVersion());
            repository.flush();
            return release;
        } catch (DataIntegrityViolationException ex) {
            throw duplicateReleaseConflict(ex);
        }
    }

    /** admin 릴리스 soft-delete. */
    @Transactional
    public void delete(UUID id, String actor) {
        findActive(id).softDelete(actor);
    }

    /** 릴리스를 사용자 노출 상태로 전환한다. */
    @Transactional
    public AppRelease publish(UUID id) {
        AppRelease release = findActive(id);
        release.publish();
        return release;
    }

    /** 릴리스를 테스트 상태로 전환한다. */
    @Transactional
    public AppRelease unpublish(UUID id) {
        AppRelease release = findActive(id);
        release.unpublish();
        return release;
    }

    private AppRelease latestRelease(AppClientType clientType) {
        if (clientType == null) {
            throw new IllegalArgumentException("clientType 필수");
        }
        return repository.findByClientTypeAndPublishedTrue(clientType).stream()
                .max(Comparator.comparing(AppRelease::getVersion, Semver::compare)
                        .thenComparing(AppRelease::getReleasedAt))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "등록된 앱 릴리스가 없습니다: " + clientType));
    }

    private AppVersionForceLevel resolveForceLevel(AppRelease latest, String currentVersion) {
        if (Semver.compare(currentVersion, latest.getMinSupportedVersion()) < 0) {
            // 현재 버전이 minSupportedVersion 미만이면 등록 force_level과 무관하게 강제차단 CRITICAL이다.
            return AppVersionForceLevel.CRITICAL;
        }
        if (Semver.compare(currentVersion, latest.getVersion()) < 0) {
            return toVersionForceLevel(latest.getForceLevel());
        }
        return AppVersionForceLevel.NONE;
    }

    private AppRelease findActive(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "앱 릴리스를 찾을 수 없습니다."));
    }

    private void ensureUnique(UUID currentId, AppClientType clientType, String version) {
        repository.findByClientTypeAndVersion(clientType, version.trim())
                .filter(existing -> currentId == null || !existing.getId().equals(currentId))
                .ifPresent(existing -> {
                    throw duplicateReleaseConflict(null);
                });
    }

    private void validateUpdateVersions(AppRelease release, AppReleaseRequest request) {
        boolean preservingLegacyValues = Objects.equals(release.getVersion().trim(), request.version().trim())
                && Objects.equals(
                        release.getMinSupportedVersion().trim(), request.minSupportedVersion().trim())
                && !Semver.isDevelopmentVersion(release.getVersion())
                && !Semver.isDevelopmentVersion(release.getMinSupportedVersion());
        if (preservingLegacyValues) {
            // 마이그레이션 전 semver 레코드는 두 버전 값을 그대로 유지하는 편집만 허용한다.
            Semver.requireValid(request.version(), "version");
            Semver.requireValid(request.minSupportedVersion(), "minSupportedVersion");
            return;
        }
        // 한 필드만 새 형식으로 바꾸어 semver/dev 버전이 섞이는 상태는 허용하지 않는다.
        Semver.requireDevelopmentVersion(request.version(), "version");
        Semver.requireDevelopmentVersion(request.minSupportedVersion(), "minSupportedVersion");
    }

    private BusinessException duplicateReleaseConflict(Throwable cause) {
        return new BusinessException(ErrorCode.CONFLICT, "이미 등록된 앱 릴리스입니다.", cause);
    }

    private static AppVersionForceLevel toVersionForceLevel(AppReleaseForceLevel forceLevel) {
        return switch (forceLevel) {
            case CRITICAL -> AppVersionForceLevel.CRITICAL;
            case MAJOR -> AppVersionForceLevel.MAJOR;
            case MINOR -> AppVersionForceLevel.MINOR;
        };
    }
}
