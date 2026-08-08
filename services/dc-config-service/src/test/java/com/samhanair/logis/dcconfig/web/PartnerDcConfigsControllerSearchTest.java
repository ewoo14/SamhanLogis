package com.samhanair.logis.dcconfig.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import com.samhanair.logis.dcconfig.service.DcConfigService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;

@ExtendWith(MockitoExtension.class)
class PartnerDcConfigsControllerSearchTest {

    @Mock DcConfigRepository repository;
    @Mock DcConfigService service;

    @Test
    void list_escapesLikeWildcardsBeforeRepositoryCall() {
        when(repository.search(any(), any())).thenReturn(new PageImpl<>(java.util.List.of()));

        new PartnerDcConfigsController(repository, service).list(0, 50, " %_\\ ");

        verify(repository).search("\\%\\_\\\\", org.springframework.data.domain.PageRequest.of(0, 50));
    }
}
