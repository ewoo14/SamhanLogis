package com.samhanair.logis.partner.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import com.samhanair.logis.partner.dto.AdminPartnerListResponse;
import com.samhanair.logis.partner.repository.PartnerRepository;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

/**
 * PartnerService.searchAdmin 단위 테스트 — Phase 10 P0-5.
 *
 * <p>핵심: q normalize (blank → null) 가 repository 호출에 정확히 전달되는지 + DTO 변환 검증.
 */
class PartnerSearchServiceTest {

    private final PartnerRepository repo = mock(PartnerRepository.class);
    private final com.samhanair.logis.partner.revision.service.PartnerRevisionService revisionService =
            mock(com.samhanair.logis.partner.revision.service.PartnerRevisionService.class);
    private final PartnerService service = new PartnerService(repo, revisionService);

    @Test
    @DisplayName("searchAdmin — q blank → repo 에 null 전달 (필터 미적용)")
    void searchAdmin_normalizes_blank_q_to_null() {
        Pageable pageable = PageRequest.of(0, 10);
        when(repo.searchAdmin(any(), any(), any())).thenReturn(new PageImpl<>(List.of()));

        service.searchAdmin("   ", null, pageable);

        verify(repo).searchAdmin(eq(null), eq(null), eq(pageable));
    }

    @Test
    @DisplayName("searchAdmin — items / total / page / size 응답 형태")
    void searchAdmin_returns_paginated_dto() {
        Partner p = Partner.register("P-2026-0001", "123-45-67890", "(주)테스트",
                "서울", "02-1111-2222", new BigDecimal("1000000"));
        Pageable pageable = PageRequest.of(0, 10);
        when(repo.searchAdmin(eq("테스트"), eq(PartnerStatus.ACTIVE), eq(pageable)))
                .thenReturn(new PageImpl<>(List.of(p), pageable, 1L));

        Page<Partner> page = service.searchAdmin("테스트", PartnerStatus.ACTIVE, pageable);
        AdminPartnerListResponse dto = AdminPartnerListResponse.from(page);

        assertThat(dto.items()).hasSize(1);
        assertThat(dto.items().get(0).partnerCode()).isEqualTo("P-2026-0001");
        assertThat(dto.items().get(0).name()).isEqualTo("(주)테스트");
        assertThat(dto.total()).isEqualTo(1);
        assertThat(dto.page()).isEqualTo(0);
        assertThat(dto.size()).isEqualTo(10);
    }
}
