package com.samhanair.logis.partnerorder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.domain.TutorialState;
import com.samhanair.logis.partnerorder.repository.TutorialStateRepository;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerSummary;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * TutorialStateService 단위 테스트 — partnerCode → bizNo 해소 + M2 proxy 호출 계약 (PR #746(#22) 라운드1 fix).
 *
 * <p>시나리오:
 * <ul>
 *   <li>bizNo 해소 성공 — {@link PartnerAuthClient#patchTutorialState} 가 bizNo/PC/completed 로 호출됨</li>
 *   <li>bizNo 미해소(거래처 lookup miss) — M2 proxy skip, local mirror 는 정상 갱신(fail-soft)</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class TutorialStateServiceTest {

    private static final String PARTNER_CODE = "P-IT-100";
    private static final String BIZ_NO = "1234567890";

    @Mock
    private TutorialStateRepository tutorialStateRepository;

    @Mock
    private PartnerAuthClient partnerAuthClient;

    @Mock
    private PartnerLookupClient partnerLookupClient;

    private TutorialStateService service;

    @BeforeEach
    void setUp() {
        service = new TutorialStateService(
                tutorialStateRepository, partnerAuthClient, new PartnerSelfScopeGuard(), partnerLookupClient);
    }

    @Test
    void patch_bizNo_해소되면_M2_proxy를_bizNo_PC_completed로_호출한다() {
        when(tutorialStateRepository.findByPartnerCode(PARTNER_CODE)).thenReturn(Optional.empty());
        when(tutorialStateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(partnerLookupClient.findByPartnerCode(PARTNER_CODE))
                .thenReturn(Optional.of(new PartnerSummary(UUID.randomUUID(), PARTNER_CODE, "삼한테스트", BIZ_NO)));

        service.patch(PARTNER_CODE, true);

        verify(partnerAuthClient).patchTutorialState(BIZ_NO, "PC", true);
    }

    @Test
    void patch_bizNo_미해소면_M2_proxy를_skip하고_local_mirror만_갱신한다() {
        TutorialState existing = TutorialState.of(PARTNER_CODE, false);
        when(tutorialStateRepository.findByPartnerCode(PARTNER_CODE)).thenReturn(Optional.of(existing));
        when(partnerLookupClient.findByPartnerCode(PARTNER_CODE)).thenReturn(Optional.empty());

        service.patch(PARTNER_CODE, true);

        assertThat(existing.isCompleted()).isTrue();
        verify(partnerAuthClient, never()).patchTutorialState(anyString(), anyString(), anyBoolean());
    }
}
