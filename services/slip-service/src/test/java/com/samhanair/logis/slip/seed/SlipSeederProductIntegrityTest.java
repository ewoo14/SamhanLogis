package com.samhanair.logis.slip.seed;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import java.util.List;
import java.util.UUID;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SlipSeederProductIntegrityTest {

    @Mock
    private SlipRepository slipRepository;

    @Mock
    private SlipClosedDateGuard closedDateGuard;

    @Mock
    private ProductClient productClient;

    @Test
    void missingSeedProductStopsBeforeAnySlipIsSaved() {
        when(productClient.lookup(anyList())).thenReturn(List.of());

        SlipSeeder seeder = new SlipSeeder(slipRepository, closedDateGuard, productClient);

        assertThatThrownBy(seeder::run)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("활성 product");

        verify(productClient).lookup(org.mockito.ArgumentMatchers.argThat(ids -> ids.size() == 100));
        verify(slipRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void completeSeedProductCatalogStillCreatesAllHundredSlips() {
        when(slipRepository.findBySlipTypeAndSlipNoIncludingDeleted(
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(java.util.Optional.empty());
        List<ProductSummary> products = java.util.stream.IntStream.rangeClosed(1, HvacSeedProductCatalog.size())
                .mapToObj(seq -> {
                    String model = HvacSeedProductCatalog.byOneBasedSeq(seq).modelName();
                    UUID id = HvacSeedProductCatalog.deterministicProductId(model);
                    return new ProductSummary(id, "제품-" + model, model, "CODE-" + model,
                            null, null, "ACTIVE");
                }).toList();
        when(productClient.lookup(anyList())).thenReturn(products);

        new SlipSeeder(slipRepository, closedDateGuard, productClient).run();

        ArgumentCaptor<Slip> captor = ArgumentCaptor.forClass(Slip.class);
        verify(slipRepository, times(100)).save(captor.capture());
        assertThat(captor.getAllValues()).allSatisfy(slip ->
                assertThat(slip.getLines()).isNotEmpty());
    }

}
