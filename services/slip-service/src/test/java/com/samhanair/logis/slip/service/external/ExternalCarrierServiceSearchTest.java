package com.samhanair.logis.slip.service.external;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.repository.external.ExternalCarrierRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

@ExtendWith(MockitoExtension.class)
class ExternalCarrierServiceSearchTest {

    @Mock ExternalCarrierRepository repository;

    @Test
    void search_escapesLikeWildcardsBeforeRepositoryCall() {
        when(repository.searchAdmin("\\%\\_\\\\", PageRequest.of(0, 20)))
                .thenReturn(new PageImpl<>(java.util.List.of()));

        new ExternalCarrierService(repository).search(" %_\\ ", PageRequest.of(0, 20));

        verify(repository).searchAdmin("\\%\\_\\\\", PageRequest.of(0, 20));
    }
}
