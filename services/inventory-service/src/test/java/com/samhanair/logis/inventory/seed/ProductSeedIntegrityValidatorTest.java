package com.samhanair.logis.inventory.seed;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ProductSeedIntegrityValidatorTest {

    @Test
    void reportsMissingModelsAndHowToRepairTheSeedContract() {
        ProductClient productClient = mock(ProductClient.class);
        ProductSummary present = new ProductSummary(
                ProductSeedIntegrityValidator.productId("AR05TXEAAWKNEU-01"),
                "present",
                "AR05TXEAAWKNEU-01",
                null,
                null,
                null,
                "ACTIVE");
        when(productClient.lookupForSeedIntegrity(org.mockito.ArgumentMatchers.anyList()))
                .thenReturn(List.of(present));

        ProductSeedIntegrityValidator validator = new ProductSeedIntegrityValidator(productClient);

        assertThatThrownBy(() -> validator.validate(List.of("AR05TXEAAWKNEU-01", "AR06TXEAAWKNEU-02")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("1개")
                .hasMessageContaining("AR06TXEAAWKNEU-02")
                .hasMessageContaining("product-service")
                .hasMessageContaining("공통 seed toggle");
    }
}
