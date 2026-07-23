package com.samhanair.logis.partner.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.repository.PartnerRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

/**
 * Phase 10 PR-D Part A — {@link PartnerService#findByName(String)} +
 * {@link PartnerService#findByNameForLookup(String)} 단위 테스트.
 *
 * <p>4 시나리오: exact match / LIKE 1건 / 0건 (NOT_FOUND) / 2건+ (CONFLICT).
 */
@ExtendWith(MockitoExtension.class)
class PartnerServiceFindByNameTest {

    @Mock
    private PartnerRepository partnerRepository;

    @InjectMocks
    private PartnerService partnerService;

    private Partner samplePartner(String code, String name) {
        return Partner.register(code, "999-88-77777", name, null, null, BigDecimal.ZERO);
    }

    @Test
    void findByName_exactMatch_returnsPartnerWithoutLikeFallback() {
        Partner p = samplePartner("P-2026-0001", "(주)에어뱅크");
        when(partnerRepository.findByName("(주)에어뱅크")).thenReturn(Optional.of(p));

        Partner found = partnerService.findByName("(주)에어뱅크");

        assertThat(found.getPartnerCode()).isEqualTo("P-2026-0001");
        verify(partnerRepository, never()).findAllByNameContaining(anyString(), any(Pageable.class));
    }

    @Test
    void findByName_exactMiss_likeSingleHit_returnsPartner() {
        Partner p = samplePartner("P-2026-0002", "주식회사 삼성이엔지 (윤정희)");
        when(partnerRepository.findByName("삼성이엔지")).thenReturn(Optional.empty());
        Page<Partner> single = new PageImpl<>(List.of(p));
        when(partnerRepository.findAllByNameContaining(anyString(), any(Pageable.class)))
                .thenReturn(single);

        Partner found = partnerService.findByName("삼성이엔지");

        assertThat(found.getPartnerCode()).isEqualTo("P-2026-0002");
    }

    @Test
    void findByName_likeFallback_escapesWildcardLiterals() {
        Partner p = samplePartner("P-2026-0008", "%_ 거래처");
        when(partnerRepository.findByName("%_")).thenReturn(Optional.empty());
        when(partnerRepository.findAllByNameContaining(eq("\\%\\_"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(p)));

        Partner found = partnerService.findByName("%_");

        assertThat(found.getPartnerCode()).isEqualTo("P-2026-0008");
        verify(partnerRepository).findAllByNameContaining(eq("\\%\\_"), any(Pageable.class));
    }

    @Test
    void findByName_exactMiss_likeZeroHits_throwsNotFound() {
        when(partnerRepository.findByName(anyString())).thenReturn(Optional.empty());
        when(partnerRepository.findAllByNameContaining(anyString(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        assertThatThrownBy(() -> partnerService.findByName("존재하지않는상호"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.NOT_FOUND);
    }

    @Test
    void findByName_exactMiss_likeMultipleHits_throwsConflict() {
        Partner p1 = samplePartner("P-2026-0003", "에스원이엔지 (주)");
        Partner p2 = samplePartner("P-2026-0004", "주식회사 대승 (에스원이엔지)");
        when(partnerRepository.findByName(anyString())).thenReturn(Optional.empty());
        when(partnerRepository.findAllByNameContaining(anyString(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(p1, p2)));

        assertThatThrownBy(() -> partnerService.findByName("에스원이엔지"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    void findByName_blankName_throwsInvalidInput() {
        assertThatThrownBy(() -> partnerService.findByName("  "))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    void findByNameForLookup_exactMatch_returnsOptional() {
        Partner p = samplePartner("P-2026-0005", "훼밀리공조 주식회사");
        when(partnerRepository.findByName("훼밀리공조 주식회사")).thenReturn(Optional.of(p));

        Optional<Partner> result = partnerService.findByNameForLookup("훼밀리공조 주식회사");

        assertThat(result).isPresent();
        assertThat(result.get().getPartnerCode()).isEqualTo("P-2026-0005");
    }

    @Test
    void findByNameForLookup_multipleHits_returnsEmpty() {
        Partner p1 = samplePartner("P-2026-0006", "에스원이엔지 (주)");
        Partner p2 = samplePartner("P-2026-0007", "주식회사 대승 (에스원이엔지)");
        when(partnerRepository.findByName(anyString())).thenReturn(Optional.empty());
        when(partnerRepository.findAllByNameContaining(anyString(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(p1, p2)));

        Optional<Partner> result = partnerService.findByNameForLookup("에스원이엔지");

        assertThat(result).isEmpty();
    }

    @Test
    void findByNameForLookup_blankName_returnsEmpty() {
        Optional<Partner> result = partnerService.findByNameForLookup(null);
        assertThat(result).isEmpty();
    }
}
