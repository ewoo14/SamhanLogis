package com.samhanair.logis.partner.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partner.domain.PartnerStatus;
import com.samhanair.logis.partner.repository.PartnerRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

class PartnerExcelExportServiceTest {

    private final PartnerRepository repository = mock(PartnerRepository.class);
    private final PartnerExcelExportService service = new PartnerExcelExportService(repository);

    @Test
    void export_escapes_like_wildcards_before_repository_search() {
        when(repository.searchAdmin(any(), any(), any())).thenReturn(new PageImpl<>(List.of()));

        service.export("%_", PartnerStatus.ACTIVE);

        verify(repository).searchAdmin(eq("\\%\\_"), eq(PartnerStatus.ACTIVE), any(Pageable.class));
    }
}
