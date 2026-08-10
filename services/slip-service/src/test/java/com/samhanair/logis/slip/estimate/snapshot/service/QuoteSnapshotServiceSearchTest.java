package com.samhanair.logis.slip.estimate.snapshot.service;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.estimate.snapshot.repository.QuoteSnapshotRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

@ExtendWith(MockitoExtension.class)
class QuoteSnapshotServiceSearchTest {

    @Mock QuoteSnapshotRepository repository;
    @Mock ObjectMapper objectMapper;

    @Test
    void historyByCustomer_escapesLikeWildcardsBeforeRepositoryCall() {
        when(repository.findByCustomer(null, "\\%\\_\\\\", PageRequest.of(0, 30))).thenReturn(List.of());

        new QuoteSnapshotService(repository, objectMapper).historyByCustomer(null, " %_\\ ");

        verify(repository).findByCustomer(null, "\\%\\_\\\\", PageRequest.of(0, 30));
    }
}
