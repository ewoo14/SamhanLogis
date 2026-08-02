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

    private static void setLastLoginAt(PartnerAuth auth, LocalDateTime value) {
        try {
            var field = PartnerAuth.class.getDeclaredField("lastLoginAt");
            field.setAccessible(true);
            field.set(auth, value);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("테스트용 기준 시각 설정 실패", e);
        }
    }
}
