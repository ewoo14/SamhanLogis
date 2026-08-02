package com.samhanair.logis.partnerauth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerauth.client.DcConfigClient;
import com.samhanair.logis.partnerauth.domain.PartnerAuth;
import com.samhanair.logis.partnerauth.domain.PartnerStatus;
import com.samhanair.logis.partnerauth.repository.PartnerAuthRepository;
import com.samhanair.logis.partnerauth.dto.PartnerApprovalResponse;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 주문서 앱 접근권한 설정의 기간별 미사용 후보 계산 계약을 검증한다. */
class OrderAppAccessPreviewTest {

    @Test
    void previewAndAuthenticationUseCreatedAtWhenItIsNewerThanBusinessActivity() {
        LocalDateTime now = LocalDateTime.of(2026, 8, 3, 0, 0);
        PartnerAuth auth = PartnerAuth.seedFromLegacy(
                "8888888888", "P-CREATED-AT", "{noop}hash", PartnerStatus.NEED_PW_INPUT);
        setCreatedAt(auth, now.minusDays(1));
        PartnerActivity oldActivity = new PartnerActivity(
                now.minusDays(60), now.minusDays(45));

        assertThat(PartnerAccessPolicy.isPreviewCandidate(auth, oldActivity, now)).isFalse();
        assertThat(PartnerAccessPolicy.isAuthenticationLongUnused(auth, oldActivity, now)).isFalse();
    }

    @Test
    void legacyBoundaryIsActiveAtExactlyThirtyDaysAndExpiresOnlyAfterIt() {
        LocalDateTime now = LocalDateTime.of(2026, 8, 3, 0, 0);
        PartnerAuth exactlyThirtyDays = PartnerAuth.seedFromLegacy(
                "1010101010", "P-30", "{noop}hash", PartnerStatus.NEED_PW_INPUT);
        setCreatedAt(exactlyThirtyDays, now.minusDays(30));
        PartnerActivity noBusinessActivity = new PartnerActivity(null, null);

        PartnerAuth oneSecondOlder = PartnerAuth.seedFromLegacy(
                "2020202020", "P-30-PLUS-1S", "{noop}hash", PartnerStatus.NEED_PW_INPUT);
        setCreatedAt(oneSecondOlder, now.minusDays(30).minusSeconds(1));
        PartnerAuth twentyNineDays = PartnerAuth.seedFromLegacy(
                "3030303030", "P-29", "{noop}hash", PartnerStatus.NEED_PW_INPUT);
        setCreatedAt(twentyNineDays, now.minusDays(29));

        assertThat(PartnerAccessPolicy.isPreviewCandidate(exactlyThirtyDays, noBusinessActivity, now)).isFalse();
        assertThat(PartnerAccessPolicy.isAuthenticationLongUnused(exactlyThirtyDays, noBusinessActivity, now)).isFalse();
        assertThat(PartnerAccessPolicy.isPreviewCandidate(oneSecondOlder, noBusinessActivity, now)).isTrue();
        assertThat(PartnerAccessPolicy.isAuthenticationLongUnused(oneSecondOlder, noBusinessActivity, now)).isTrue();
        assertThat(PartnerAccessPolicy.isPreviewCandidate(twentyNineDays, noBusinessActivity, now)).isFalse();
        assertThat(PartnerAccessPolicy.isAuthenticationLongUnused(twentyNineDays, noBusinessActivity, now)).isFalse();
    }

    @Test
    void previewExposesDeferredLookupInsteadOfSilentlyReturningNoCandidates() {
        PartnerAuthRepository repository = mock(PartnerAuthRepository.class);
        DcConfigClient dcConfigClient = mock(DcConfigClient.class);
        PartnerActivityReader activityReader = mock(PartnerActivityReader.class);
        PartnerAuth auth = PartnerAuth.seedFromLegacy(
                "7777777777", "P-DEFERRED", "{noop}hash", PartnerStatus.NEED_PW_INPUT);
        setCreatedAt(auth, LocalDateTime.now().minusDays(60));
        when(repository.findAll()).thenReturn(List.of(auth));
        when(activityReader.read("P-DEFERRED"))
                .thenThrow(new IllegalStateException("order service 503"));

        PartnerApprovalService service = new PartnerApprovalService(repository, dcConfigClient, activityReader);

        Object result = service.previewLongUnusedReport(30);

        assertThat(result).isNotInstanceOf(List.class);
        assertThat(result).extracting("deferred").isEqualTo(true);
        assertThat(result).extracting("deferredPartnerCount").isEqualTo(1);
    }

    @Test
    void previewUsesOrderAndShipmentActivityInsteadOfLoginOrPasswordDates() {
        PartnerAuthRepository repository = mock(PartnerAuthRepository.class);
        DcConfigClient dcConfigClient = mock(DcConfigClient.class);
        PartnerActivityReader activityReader = mock(PartnerActivityReader.class);
        PartnerAuth recentOrder = PartnerAuth.seedFromLegacy(
                "3333333333", "P003", "{noop}hash", PartnerStatus.NEED_PW_INPUT);
        PartnerAuth oldActivity = PartnerAuth.seedFromLegacy(
                "4444444444", "P004", "{noop}hash", PartnerStatus.NEED_PW_INPUT);
        setLastLoginAt(recentOrder, LocalDateTime.now().minusDays(90));
        setLastLoginAt(oldActivity, LocalDateTime.now().minusDays(2));
        when(repository.findAll()).thenReturn(List.of(recentOrder, oldActivity));
        when(activityReader.read("P003")).thenReturn(new PartnerActivity(
                LocalDateTime.now().minusDays(2), LocalDateTime.now().minusDays(40)));
        when(activityReader.read("P004")).thenReturn(new PartnerActivity(
                LocalDateTime.now().minusDays(40), LocalDateTime.now().minusDays(35)));

        PartnerApprovalService service = new PartnerApprovalService(repository, dcConfigClient, activityReader);

        assertThat(service.previewLongUnused(30)).extracting(PartnerApprovalResponse::partnerCode)
                .containsExactly("4444444444");
    }

    @Test
    void previewUsesFixedLegacyThirtyDaysAndIgnoresLoginBaseline() {
        PartnerAuthRepository repository = mock(PartnerAuthRepository.class);
        DcConfigClient dcConfigClient = mock(DcConfigClient.class);
        PartnerActivityReader activityReader = mock(PartnerActivityReader.class);
        PartnerAuth oldLogin = PartnerAuth.seedFromLegacy(
                "1111111111", "P001", "{noop}hash", PartnerStatus.NEED_PW_INPUT);
        PartnerAuth recentLogin = PartnerAuth.seedFromLegacy(
                "2222222222", "P002", "{noop}hash", PartnerStatus.NEED_PW_INPUT);
        setLastLoginAt(oldLogin, LocalDateTime.now().minusDays(45));
        setLastLoginAt(recentLogin, LocalDateTime.now().minusDays(20));
        when(repository.findAll()).thenReturn(List.of(oldLogin, recentLogin));
        when(activityReader.read("P001")).thenReturn(new PartnerActivity(
                LocalDateTime.now().minusDays(45), null));
        when(activityReader.read("P002")).thenReturn(new PartnerActivity(
                LocalDateTime.now().minusDays(20), null));

        PartnerApprovalService service = new PartnerApprovalService(repository, dcConfigClient, activityReader);

        assertThat(service.previewLongUnused(30)).hasSize(1);
        assertThat(service.previewLongUnused(60)).hasSize(1);
    }

    @Test
    void previewIncludesApprovedPartnerWithNoActivityWhenAuthWasCreatedOverThirtyDaysAgo() {
        PartnerAuth noActivity = PartnerAuth.seedFromLegacy(
                "5555555555", "P005", "{noop}hash", PartnerStatus.NEED_PW_INPUT);
        setCreatedAt(noActivity, LocalDateTime.now().minusDays(31));
        PartnerAuth recentRegistration = PartnerAuth.seedFromLegacy(
                "6666666666", "P006", "{noop}hash", PartnerStatus.NEED_PW_INPUT);
        setCreatedAt(recentRegistration, LocalDateTime.now().minusDays(2));

        PartnerAuthRepository repository = mock(PartnerAuthRepository.class);
        DcConfigClient dcConfigClient = mock(DcConfigClient.class);
        PartnerActivityReader activityReader = mock(PartnerActivityReader.class);
        when(repository.findAll()).thenReturn(List.of(noActivity, recentRegistration));
        when(activityReader.read("P005")).thenReturn(new PartnerActivity(null, null));
        when(activityReader.read("P006")).thenReturn(new PartnerActivity(null, null));

        PartnerApprovalService service = new PartnerApprovalService(repository, dcConfigClient, activityReader);

        assertThat(service.previewLongUnused(30)).extracting(PartnerApprovalResponse::partnerCode)
                .containsExactly("5555555555");
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
}
