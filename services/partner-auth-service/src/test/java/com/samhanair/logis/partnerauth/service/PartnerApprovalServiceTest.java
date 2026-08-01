package com.samhanair.logis.partnerauth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerauth.client.DcConfigClient;
import com.samhanair.logis.partnerauth.domain.PartnerAuth;
import com.samhanair.logis.partnerauth.domain.PartnerStatus;
import com.samhanair.logis.partnerauth.dto.PartnerApprovalStatus;
import com.samhanair.logis.partnerauth.repository.PartnerAuthRepository;
import java.util.Optional;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 주문서 승인현황의 상태 전환 계약을 검증한다. */
class PartnerApprovalServiceTest {

    @Test
    @DisplayName("장기미발주 거래처를 승인으로 복구하면 실제 인증 상태가 정상 입력 대기로 바뀐다")
    void longUnused_toApproved_changesPersistedState() {
        PartnerAuthRepository repository = mock(PartnerAuthRepository.class);
        DcConfigClient dcConfigClient = mock(DcConfigClient.class);
        PartnerAuth auth = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", "{noop}not-a-real-password", PartnerStatus.LONG_UNUSED);
        when(repository.findByBizNo("1234567890")).thenReturn(Optional.of(auth));
        when(dcConfigClient.findByBizNo("1234567890")).thenReturn(Optional.empty());
        setLastLoginAt(auth, LocalDateTime.of(2026, 7, 1, 9, 0));
        LocalDateTime expirationBeforeRestore = auth.expirationAt();

        PartnerApprovalService service = new PartnerApprovalService(repository, dcConfigClient);

        service.updateStatus("1234567890", PartnerApprovalStatus.APPROVED);

        assertThat(auth.getStatus()).isEqualTo(PartnerStatus.NEED_PW_INPUT);
        assertThat(auth.expirationAt()).isEqualTo(expirationBeforeRestore);
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
