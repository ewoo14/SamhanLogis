package com.samhanair.logis.dashboard.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 클라이언트 앱 릴리스 정책.
 *
 * <p>클라이언트 앱별 개발 버전 최신값, 최소 지원 버전, 강제 수준과 릴리스노트를 저장한다.
 * 마이그레이션 전 semver 값은 기존 행의 호환을 위해 그대로 보존한다.
 * BaseEntity 7 audit + Soft Delete 만 사용하며 물리 삭제하지 않는다.
 */
@Entity
@Getter
@Table(name = "app_release")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class AppRelease extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "client_type", nullable = false, length = 40)
    private AppClientType clientType;

    @Column(name = "version", nullable = false, length = 50)
    private String version;

    @Enumerated(EnumType.STRING)
    @Column(name = "force_level", nullable = false, length = 20)
    private AppReleaseForceLevel forceLevel;

    @Column(name = "release_notes", nullable = false, columnDefinition = "TEXT")
    private String releaseNotes;

    @Column(name = "released_at", nullable = false)
    private LocalDateTime releasedAt;

    @Column(name = "min_supported_version", nullable = false, length = 50)
    private String minSupportedVersion;

    @Column(name = "is_published", nullable = false)
    private boolean published = false;

    private AppRelease(
            AppClientType clientType,
            String version,
            AppReleaseForceLevel forceLevel,
            String releaseNotes,
            LocalDateTime releasedAt,
            String minSupportedVersion) {
        apply(clientType, version, forceLevel, releaseNotes, releasedAt, minSupportedVersion);
    }

    /**
     * 신규 릴리스 정책 row 생성.
     *
     * @return 영속화 가능한 신규 인스턴스
     */
    public static AppRelease create(
            AppClientType clientType,
            String version,
            AppReleaseForceLevel forceLevel,
            String releaseNotes,
            LocalDateTime releasedAt,
            String minSupportedVersion) {
        return new AppRelease(clientType, version, forceLevel, releaseNotes, releasedAt, minSupportedVersion);
    }

    /** 릴리스 정책 수정. */
    public AppRelease update(
            AppClientType clientType,
            String version,
            AppReleaseForceLevel forceLevel,
            String releaseNotes,
            LocalDateTime releasedAt,
            String minSupportedVersion) {
        apply(clientType, version, forceLevel, releaseNotes, releasedAt, minSupportedVersion);
        return this;
    }

    /** 앱 릴리스 soft-delete. */
    public AppRelease softDelete(String actor) {
        markDeleted(actor == null || actor.isBlank() ? "system" : actor);
        return this;
    }

    /** 릴리스를 사용자 버전 게이트에 노출한다. */
    public AppRelease publish() {
        this.published = true;
        return this;
    }

    /** 릴리스를 테스트 상태로 전환해 사용자 버전 게이트에서 제외한다. */
    public AppRelease unpublish() {
        this.published = false;
        return this;
    }

    private void apply(
            AppClientType clientType,
            String version,
            AppReleaseForceLevel forceLevel,
            String releaseNotes,
            LocalDateTime releasedAt,
            String minSupportedVersion) {
        if (clientType == null) {
            throw new IllegalArgumentException("clientType 필수");
        }
        Semver.requireValid(version, "version");
        if (forceLevel == null) {
            throw new IllegalArgumentException("forceLevel 필수");
        }
        if (releaseNotes == null || releaseNotes.isBlank()) {
            throw new IllegalArgumentException("releaseNotes 필수");
        }
        if (releasedAt == null) {
            throw new IllegalArgumentException("releasedAt 필수");
        }
        Semver.requireValid(minSupportedVersion, "minSupportedVersion");
        this.clientType = clientType;
        this.version = version.trim();
        this.forceLevel = forceLevel;
        this.releaseNotes = releaseNotes.trim();
        this.releasedAt = releasedAt;
        this.minSupportedVersion = minSupportedVersion.trim();
    }
}
