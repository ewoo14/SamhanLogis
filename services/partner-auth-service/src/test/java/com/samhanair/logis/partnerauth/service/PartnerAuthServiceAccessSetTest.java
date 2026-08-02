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
import com.samhanair.logis.partnerauth.repository.PartnerAuthRepository;
import com.samhanair.logis.partnerauth.repository.PartnerLoginAttemptRepository;
import com.samhanair.logis.partnerauth.repository.PartnerSessionRepository;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;

/** 미리보기와 실제 상태조회가 같은 주문·출고 활동 집합을 사용하는지 검증한다. */
class PartnerAuthServiceAccessSetTest {

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
