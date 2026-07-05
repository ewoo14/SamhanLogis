package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.domain.TutorialState;
import com.samhanair.logis.partnerorder.repository.TutorialStateRepository;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerSummary;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 튜토리얼 상태 mirror 갱신 서비스.
 *
 * <p>PARTNER 호출은 {@code X-Partner-Code} 를 필수로 요구해 본인 거래처 상태만 갱신한다.
 *
 * <p>PR #746(#22) 라운드1 fix — M2 partner-auth-service {@code PATCH /api/v1/auth/partner-tutorial}
 * 은 {@code bizNo}(사업자등록번호) + {@code platform}(PC|MOBILE) 를 요구한다 (partnerCode 가 아님).
 * 본 서비스는 {@link PartnerLookupClient} 로 partnerCode → bizNo 를 해소한 뒤 M2 proxy 를 호출하며,
 * 해소 실패(거래처 lookup miss) 시에는 M2 proxy 를 skip 하고 local mirror 만 갱신한다(fail-soft).
 * 본 mirror endpoint 는 legacy saveTutorialState(9423, PC 발주 전용) 이식으로 platform 구분 입력이
 * 없어 {@link #PLATFORM_PC} 로 고정 전달한다 — MOBILE 튜토리얼 상태는 api-gateway 가
 * {@code /api/v1/auth/partner-tutorial} 을 M2 로 직결하는 실 경로에서 별도로 갱신된다.
 */
@Service
@RequiredArgsConstructor
public class TutorialStateService {

    private static final Logger log = LoggerFactory.getLogger(TutorialStateService.class);

    /** 본 mirror endpoint 가 대응하는 legacy 흐름 — PC 발주 전용 (MOBILE 구분 입력 없음). */
    private static final String PLATFORM_PC = "PC";

    private final TutorialStateRepository tutorialStateRepository;
    private final PartnerAuthClient partnerAuthClient;
    private final PartnerSelfScopeGuard partnerSelfScopeGuard;
    private final PartnerLookupClient partnerLookupClient;

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
        partnerLookupClient.findByPartnerCode(effectivePartnerCode)
                .map(PartnerSummary::businessNo)
                .filter(bizNo -> bizNo != null && !bizNo.isBlank())
                .ifPresentOrElse(
                        bizNo -> partnerAuthClient.patchTutorialState(bizNo, PLATFORM_PC, completed),
                        () -> log.warn(
                                "TutorialStateService — bizNo 미해소로 M2 proxy skip (partnerCode={})",
                                effectivePartnerCode));
    }
}
