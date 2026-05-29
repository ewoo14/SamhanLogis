package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.domain.TutorialState;
import com.samhanair.logis.partnerorder.repository.TutorialStateRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 튜토리얼 상태 mirror 갱신 서비스.
 *
 * <p>PARTNER 호출은 {@code X-Partner-Code} 를 필수로 요구해 본인 거래처 상태만 갱신한다.
 */
@Service
@RequiredArgsConstructor
public class TutorialStateService {

    private final TutorialStateRepository tutorialStateRepository;
    private final PartnerAuthClient partnerAuthClient;
    private final PartnerSelfScopeGuard partnerSelfScopeGuard;

    /**
     * 튜토리얼 상태를 M2 partner-auth 와 local mirror 에 반영한다.
     *
     * @param partnerCode {@code X-Partner-Code}
     * @param completed 완료 여부
     */
    @Transactional
    public void patch(String partnerCode, boolean completed) {
        String partnerScope = partnerSelfScopeGuard.partnerScopeOrNull(partnerCode);
        if (partnerScope == null && (partnerCode == null || partnerCode.isBlank())) {
            return;
        }
        String effectivePartnerCode = partnerScope == null ? partnerCode.trim() : partnerScope;
        tutorialStateRepository.findByPartnerCode(effectivePartnerCode)
                .ifPresentOrElse(
                        state -> state.mark(completed),
                        () -> tutorialStateRepository.save(
                                TutorialState.of(effectivePartnerCode, completed)));
        partnerAuthClient.patchTutorialState(effectivePartnerCode, completed);
    }
}
