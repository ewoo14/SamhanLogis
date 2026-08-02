package com.samhanair.logis.partnerauth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerauth.client.DcConfigClient;
import com.samhanair.logis.partnerauth.client.SmsClient;
import com.samhanair.logis.partnerauth.config.PartnerAuthJwtProperties;
import com.samhanair.logis.partnerauth.domain.PartnerAuth;
import com.samhanair.logis.partnerauth.domain.PartnerStatus;
import com.samhanair.logis.partnerauth.dto.TryLoginRequest;
import com.samhanair.logis.partnerauth.dto.ExpirationResponse;
import com.samhanair.logis.partnerauth.repository.PartnerAuthRepository;
import com.samhanair.logis.partnerauth.repository.PartnerLoginAttemptRepository;
import com.samhanair.logis.partnerauth.repository.PartnerSessionRepository;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;

/** 미리보기와 실제 상태조회가 같은 주문·출고 활동 집합을 사용하는지 검증한다. */
class PartnerAuthServiceAccessSetTest {

    @Test
    void allAccessPathsTreatExactlyThirtyDaysAsActive() {
        LocalDateTime boundary = LocalDateTime.of(2026, 8, 3, 0, 0);
        var authRepository = mock(PartnerAuthRepository.class);
        var activityReader = mock(PartnerActivityReader.class);
        var auth = PartnerAuth.seedFromLegacy(
                "2118712345", "2118712345", "{noop}hash", PartnerStatus.NEED_PW_INPUT);
        setCreatedAt(auth, boundary.minusDays(30));
        when(authRepository.findByBizNo("2118712345")).thenReturn(Optional.of(auth));
        PartnerActivity activity = new PartnerActivity(null, null);
        when(activityReader.read("2118712345")).thenReturn(activity);
        when(authRepository.findAll()).thenReturn(java.util.List.of(auth));

        var authService = new PartnerAuthService(
                authRepository,
                mock(PartnerLoginAttemptRepository.class),
                mock(PartnerSessionRepository.class),
                PasswordEncoderFactories.createDelegatingPasswordEncoder(),
                jwtProperties(),
                mock(DcConfigClient.class),
                mock(SmsClient.class),
                activityReader);

        try (MockedStatic<LocalDateTime> mockedNow = Mockito.mockStatic(LocalDateTime.class,
                Mockito.CALLS_REAL_METHODS)) {
            mockedNow.when(LocalDateTime::now).thenReturn(boundary);

            PartnerApprovalService approvalService = new PartnerApprovalService(
                    authRepository, mock(DcConfigClient.class), activityReader);

            assertThat(approvalService.previewLongUnused(30)).isEmpty();
            assertThat(authService.checkStatus("2118712345").status())
                    .isEqualTo(PartnerStatus.NEED_PW_INPUT);
            assertThat(authService.getExpiration("2118712345").expiredAlready()).isFalse();
            assertThat(PartnerAccessPolicy.isPreviewCandidate(auth, activity, boundary)).isFalse();
            assertThat(PartnerAccessPolicy.isAuthenticationLongUnused(auth, activity, boundary)).isFalse();
        }
    }

    @Test
    void boundaryMatrixUsesLegacyStrictBeforeForPreviewAuthenticationAndExpirationApi() {
        LocalDateTime boundary = LocalDateTime.of(2026, 8, 3, 0, 0);
        int[] agesInSeconds = { 29 * 24 * 60 * 60, 30 * 24 * 60 * 60, 30 * 24 * 60 * 60 + 1 };
        boolean[] expectedExpired = { false, false, true };

        try (MockedStatic<LocalDateTime> mockedNow = Mockito.mockStatic(LocalDateTime.class,
                Mockito.CALLS_REAL_METHODS)) {
            mockedNow.when(LocalDateTime::now).thenReturn(boundary);

            for (int i = 0; i < agesInSeconds.length; i++) {
                String bizNo = "21187123" + (50 + i);
                var authRepository = mock(PartnerAuthRepository.class);
                var activityReader = mock(PartnerActivityReader.class);
                var auth = PartnerAuth.seedFromLegacy(
                        bizNo, bizNo, "{noop}hash", PartnerStatus.NEED_PW_INPUT);
                setCreatedAt(auth, boundary.minusSeconds(agesInSeconds[i]));
                PartnerActivity noBusinessActivity = new PartnerActivity(null, null);
                when(authRepository.findAll()).thenReturn(java.util.List.of(auth));
                when(authRepository.findByBizNo(bizNo)).thenReturn(Optional.of(auth));
                when(activityReader.read(bizNo)).thenReturn(noBusinessActivity);

                var authService = new PartnerAuthService(
                        authRepository,
                        mock(PartnerLoginAttemptRepository.class),
                        mock(PartnerSessionRepository.class),
                        PasswordEncoderFactories.createDelegatingPasswordEncoder(),
                        jwtProperties(),
                        mock(DcConfigClient.class),
                        mock(SmsClient.class),
                        activityReader);
                var approvalService = new PartnerApprovalService(
                        authRepository, mock(DcConfigClient.class), activityReader);

                assertThat(approvalService.previewLongUnused(30)).as("미리보기 %d초 경과", agesInSeconds[i])
                        .hasSize(expectedExpired[i] ? 1 : 0);
                assertThat(authService.checkStatus(bizNo).status())
                        .as("실제 인증 %d초 경과", agesInSeconds[i])
                        .isEqualTo(expectedExpired[i] ? PartnerStatus.LONG_UNUSED : PartnerStatus.NEED_PW_INPUT);
                assertThat(authService.getExpiration(bizNo).expiredAlready())
                        .as("만료 API %d초 경과", agesInSeconds[i])
                        .isEqualTo(expectedExpired[i]);
            }
        }
    }

    @Test
    void recentLoginDoesNotExemptPartnerWithNoOrderOrShipmentActivity() {
        var authRepository = mock(PartnerAuthRepository.class);
        var activityReader = mock(PartnerActivityReader.class);
        var encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
        var auth = PartnerAuth.seedFromLegacy(
                "2118712345", "2118712345", encoder.encode("1357"), PartnerStatus.NEED_PW_INPUT);
        setCreatedAt(auth, LocalDateTime.now().minusDays(31));
        setLastLoginAt(auth, LocalDateTime.now().minusDays(1));
        setEntityId(auth, UUID.randomUUID());
        when(authRepository.findByBizNo("2118712345")).thenReturn(Optional.of(auth));
        when(activityReader.read("2118712345")).thenReturn(new PartnerActivity(null, null));

        var service = new PartnerAuthService(
                authRepository,
                mock(PartnerLoginAttemptRepository.class),
                mock(PartnerSessionRepository.class),
                encoder,
                jwtProperties(),
                mock(DcConfigClient.class),
                mock(SmsClient.class),
                activityReader);

        assertThat(service.tryLogin(new TryLoginRequest("2118712345", "1357", false),
                "127.0.0.1", "test").status()).isEqualTo(PartnerStatus.LONG_UNUSED);
    }

    @Test
    void activityLookupFailureDoesNotBlockAuthenticationAsIfThereWereNoActivity() {
        var authRepository = mock(PartnerAuthRepository.class);
        var activityReader = mock(PartnerActivityReader.class);
        var encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
        var auth = PartnerAuth.seedFromLegacy(
                "2118712345", "2118712345", encoder.encode("1357"), PartnerStatus.NEED_PW_INPUT);
        setCreatedAt(auth, LocalDateTime.now().minusDays(60));
        setEntityId(auth, UUID.randomUUID());
        when(authRepository.findByBizNo("2118712345")).thenReturn(Optional.of(auth));
        when(activityReader.read("2118712345")).thenThrow(new IllegalStateException("order service 503"));

        var service = new PartnerAuthService(
                authRepository,
                mock(PartnerLoginAttemptRepository.class),
                mock(PartnerSessionRepository.class),
                encoder,
                jwtProperties(),
                mock(DcConfigClient.class),
                mock(SmsClient.class),
                activityReader);

        assertThat(service.tryLogin(new TryLoginRequest("2118712345", "1357", false),
                "127.0.0.1", "test").status()).isEqualTo(PartnerStatus.OK);
    }

    @Test
    void adminRestoreRemainsEffectiveOnNextStatusCheck() {
        var authRepository = mock(PartnerAuthRepository.class);
        var activityReader = mock(PartnerActivityReader.class);
        var auth = PartnerAuth.seedFromLegacy(
                "2118712345", "2118712345", "{noop}hash", PartnerStatus.LONG_UNUSED);
        setCreatedAt(auth, LocalDateTime.now().minusDays(60));
        when(authRepository.findByBizNo("2118712345")).thenReturn(Optional.of(auth));
        when(activityReader.read("2118712345")).thenReturn(new PartnerActivity(null, null));

        var approvalService = new PartnerApprovalService(
                authRepository, mock(DcConfigClient.class), activityReader);
        approvalService.updateStatus("2118712345", com.samhanair.logis.partnerauth.dto.PartnerApprovalStatus.APPROVED);

        var authService = new PartnerAuthService(
                authRepository,
                mock(PartnerLoginAttemptRepository.class),
                mock(PartnerSessionRepository.class),
                PasswordEncoderFactories.createDelegatingPasswordEncoder(),
                jwtProperties(),
                mock(DcConfigClient.class),
                mock(SmsClient.class),
                activityReader);

        assertThat(authService.checkStatus("2118712345").status()).isEqualTo(PartnerStatus.NEED_PW_INPUT);
    }

    @Test
    void expirationApiUsesTheSameBaselineAsAuthenticationBlock() {
        var authRepository = mock(PartnerAuthRepository.class);
        var activityReader = mock(PartnerActivityReader.class);
        var auth = PartnerAuth.seedFromLegacy(
                "2118712345", "2118712345", "{noop}hash", PartnerStatus.NEED_PW_INPUT);
        setCreatedAt(auth, LocalDateTime.now().minusDays(60));
        setLastLoginAt(auth, LocalDateTime.now().minusDays(31));
        when(authRepository.findByBizNo("2118712345")).thenReturn(Optional.of(auth));
        when(activityReader.read("2118712345")).thenReturn(new PartnerActivity(null, null));

        var authService = new PartnerAuthService(
                authRepository,
                mock(PartnerLoginAttemptRepository.class),
                mock(PartnerSessionRepository.class),
                PasswordEncoderFactories.createDelegatingPasswordEncoder(),
                jwtProperties(),
                mock(DcConfigClient.class),
                mock(SmsClient.class),
                activityReader);

        ExpirationResponse expiration = authService.getExpiration("2118712345");

        assertThat(expiration.expiresAt()).isEqualTo(PartnerAccessPolicy.authenticationExpirationAt(
                auth, new PartnerActivity(null, null)));
        assertThat(authService.checkStatus("2118712345").status()).isEqualTo(PartnerStatus.LONG_UNUSED);
    }

    @Test
    void checkStatusUsesRecentActivityEvenWhenLastLoginIsOlderThanThirtyDays() {
        var authRepository = mock(PartnerAuthRepository.class);
        var activityReader = mock(PartnerActivityReader.class);
        var encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
        var auth = PartnerAuth.seedFromLegacy(
                "7777777777", "P007", encoder.encode("1357"), PartnerStatus.NEED_PW_INPUT);
        setLastLoginAt(auth, LocalDateTime.now().minusDays(90));
        when(authRepository.findByBizNo("7777777777")).thenReturn(Optional.of(auth));
        when(activityReader.read("P007")).thenReturn(new PartnerActivity(
                LocalDateTime.now().minusDays(2), null));

        var jwtProperties = new PartnerAuthJwtProperties();
        jwtProperties.setSecret("test-only-secret-32bytes-minimum-key!!");
        var service = new PartnerAuthService(
                authRepository,
                mock(PartnerLoginAttemptRepository.class),
                mock(PartnerSessionRepository.class),
                encoder,
                jwtProperties,
                mock(DcConfigClient.class),
                mock(SmsClient.class),
                activityReader);

        assertThat(service.checkStatus("7777777777").status())
                .isEqualTo(PartnerStatus.NEED_PW_INPUT);
        setEntityId(auth, UUID.randomUUID());
        assertThat(service.tryLogin(new TryLoginRequest("7777777777", "1357", false), "127.0.0.1", "test")
                .status()).isEqualTo(PartnerStatus.OK);
    }

    private static void setLastLoginAt(PartnerAuth auth, LocalDateTime value) {
        try {
            var field = PartnerAuth.class.getDeclaredField("lastLoginAt");
            field.setAccessible(true);
            field.set(auth, value);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("테스트용 기준 시각 설정 실패", e);
        }
    }

    private static void setCreatedAt(PartnerAuth auth, LocalDateTime value) {
        try {
            var field = com.samhanair.logis.common.entity.BaseEntity.class.getDeclaredField("createdAt");
            field.setAccessible(true);
            field.set(auth, value);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("테스트용 생성시각 설정 실패", e);
        }
    }

    private static PartnerAuthJwtProperties jwtProperties() {
        var properties = new PartnerAuthJwtProperties();
        properties.setSecret("test-only-secret-32bytes-minimum-key!!");
        return properties;
    }

    private static void setEntityId(PartnerAuth auth, UUID value) {
        try {
            var field = PartnerAuth.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(auth, value);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("테스트용 식별자 설정 실패", e);
        }
    }
}
