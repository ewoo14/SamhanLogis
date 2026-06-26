package com.samhanair.logis.notification.domain;

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
 * 사용자별 네이티브 푸시 디바이스 토큰.
 *
 * <p>토큰은 FCM registration token 이며 active row 기준으로 전역 유일하다. 로그아웃/기기 변경 시
 * hard delete 대신 BaseEntity soft delete 를 사용한다.
 */
@Entity
@Getter
@Table(name = "push_device_tokens")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PushDeviceToken extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "token", nullable = false, length = 512)
    private String token;

    @Enumerated(EnumType.STRING)
    @Column(name = "platform", nullable = false, length = 20)
    private PushDevicePlatform platform;

    @Column(name = "app_client", nullable = false, length = 50)
    private String appClient;

    @Column(name = "last_seen_at", nullable = false)
    private LocalDateTime lastSeenAt;

    private PushDeviceToken(UUID userId, String token, PushDevicePlatform platform, String appClient) {
        validate(userId, token, platform, appClient);
        this.userId = userId;
        this.token = token.trim();
        this.platform = platform;
        this.appClient = appClient.trim().toUpperCase();
        this.lastSeenAt = LocalDateTime.now();
    }

    /**
     * 신규 디바이스 토큰 row 를 생성한다.
     *
     * @param userId 토큰 소유 사용자 UUID
     * @param token FCM registration token
     * @param platform 디바이스 플랫폼
     * @param appClient 앱 클라이언트 구분
     * @return 영속화 전 entity
     */
    public static PushDeviceToken register(UUID userId, String token,
                                           PushDevicePlatform platform, String appClient) {
        return new PushDeviceToken(userId, token, platform, appClient);
    }

    /**
     * 동일 토큰 재등록 시 현재 사용자/플랫폼/클라이언트와 lastSeenAt 을 갱신한다.
     *
     * @param userId 현재 인증 사용자 UUID
     * @param platform 디바이스 플랫폼
     * @param appClient 앱 클라이언트 구분
     * @return method chain 용 현재 entity
     */
    public PushDeviceToken refresh(UUID userId, PushDevicePlatform platform, String appClient) {
        validate(userId, this.token, platform, appClient);
        this.userId = userId;
        this.platform = platform;
        this.appClient = appClient.trim().toUpperCase();
        this.lastSeenAt = LocalDateTime.now();
        return this;
    }

    /**
     * 로그아웃/기기 변경으로 토큰을 비활성화한다.
     *
     * @param actor 삭제 audit 사용자
     * @return method chain 용 현재 entity
     */
    public PushDeviceToken revoke(String actor) {
        markDeleted(actor);
        return this;
    }

    private static void validate(UUID userId, String token, PushDevicePlatform platform, String appClient) {
        if (userId == null) {
            throw new IllegalArgumentException("userId 필수");
        }
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("token 필수");
        }
        if (token.length() > 512) {
            throw new IllegalArgumentException("token 은 512자 이하만 허용");
        }
        if (platform == null) {
            throw new IllegalArgumentException("platform 필수");
        }
        if (appClient == null || appClient.isBlank()) {
            throw new IllegalArgumentException("appClient 필수");
        }
        if (appClient.length() > 50) {
            throw new IllegalArgumentException("appClient 는 50자 이하만 허용");
        }
    }
}
