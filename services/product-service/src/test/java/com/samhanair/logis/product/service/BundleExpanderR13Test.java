package com.samhanair.logis.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class BundleExpanderR13Test {

    private final ProductRepository products = mock(ProductRepository.class);
    private final BundleComponentRepository components = mock(BundleComponentRepository.class);
    private final BundleExpander expander = new BundleExpander(products, components);

    @Test
    void ar06d1150hzs_set_allocation_matches_gas_and_remainder() {
        Product parent = parent("AR06D1150HZS", "상업용 세트", "370000");
        String modelCode = parent.getModelCode();
        UUID parentId = parent.getId();
        when(products.findByModelCodeAndIsDeletedFalse(modelCode)).thenReturn(java.util.Optional.of(parent));
        List<BundleComponent> bundleComponents = List.of(
                component("AR-IN", BundleComponent.ComponentKind.INDOOR),
                component("AR-OUT", BundleComponent.ComponentKind.OUTDOOR));
        when(components.findByBundleProductId(parentId)).thenReturn(bundleComponents);
        List<Product> componentProducts = List.of(part("AR-IN", "100"), part("AR-OUT", "100"));
        when(products.findByModelCodeInAndIsDeletedFalse(org.mockito.ArgumentMatchers.anySet()))
                .thenReturn(componentProducts);

        var lines = expander.expand(parent.getModelCode(), BigDecimal.ONE);
        assertThat(price(lines, "AR-IN")).isEqualByComparingTo("148000");
        assertThat(price(lines, "AR-OUT")).isEqualByComparingTo("222000");
        assertThat(lines.stream().map(BundleExpander.ExpandedLine::unitPrice)
                .reduce(BigDecimal.ZERO, BigDecimal::add)).isEqualByComparingTo("370000");
    }

    @Test
    void ac060cs6pbh1sy_set_allocation_matches_gas_and_remainder() {
        Product parent = parent("AC060CS6PBH1SY", "가정용 세트", "1660000");
        String modelCode = parent.getModelCode();
        UUID parentId = parent.getId();
        when(products.findByModelCodeAndIsDeletedFalse(modelCode)).thenReturn(java.util.Optional.of(parent));
        List<BundleComponent> bundleComponents = List.of(
                component("AC-IN", BundleComponent.ComponentKind.INDOOR),
                component("AC-OUT", BundleComponent.ComponentKind.OUTDOOR),
                component("AC-PANEL", BundleComponent.ComponentKind.PANEL),
                component("AC-REMOTE", BundleComponent.ComponentKind.REMOTE));
        when(components.findByBundleProductId(parentId)).thenReturn(bundleComponents);
        List<Product> componentProducts = List.of(part("AC-IN", "616975"), part("AC-OUT", "925050"),
                part("AC-PANEL", "104060"), part("AC-REMOTE", "13915"));
        when(products.findByModelCodeInAndIsDeletedFalse(org.mockito.ArgumentMatchers.anySet()))
                .thenReturn(componentProducts);

        var lines = expander.expand(parent.getModelCode(), BigDecimal.ONE);
        assertThat(price(lines, "AC-IN")).isEqualByComparingTo("925050");
        assertThat(price(lines, "AC-OUT")).isEqualByComparingTo("616975");
        assertThat(price(lines, "AC-PANEL")).isEqualByComparingTo("104060");
        assertThat(price(lines, "AC-REMOTE")).isEqualByComparingTo("13915");
        assertThat(lines.stream().map(BundleExpander.ExpandedLine::unitPrice)
                .reduce(BigDecimal.ZERO, BigDecimal::add)).isEqualByComparingTo("1660000");
    }

    private static Product parent(String code, String name, String price) {
        Product p = mock(Product.class);
        when(p.getId()).thenReturn(UUID.randomUUID());
        when(p.getModelCode()).thenReturn(code);
        when(p.getName()).thenReturn(name);
        when(p.getSpecText()).thenReturn(null);
        when(p.getProductType()).thenReturn(ProductType.BUNDLE);
        when(p.getBundleMode()).thenReturn(BundleMode.EXPAND);
        when(p.getProductCategory()).thenReturn(ProductCategory.SINGLE_SET);
        when(p.getDeliveryPrice()).thenReturn(new BigDecimal(price));
        return p;
    }

    private static BundleComponent component(String code, BundleComponent.ComponentKind kind) {
        BundleComponent c = mock(BundleComponent.class);
        when(c.getComponentProductCode()).thenReturn(code);
        when(c.getComponentKind()).thenReturn(kind);
        when(c.getComponentVariant()).thenReturn(null);
        when(c.getIsDefault()).thenReturn(true);
        when(c.getQtyMode()).thenReturn(BundleComponent.QtyMode.FOLLOW_SET);
        when(c.getDefaultQty()).thenReturn(BigDecimal.ONE);
        when(c.getSpecText()).thenReturn(null);
        return c;
    }

    private static Product part(String code, String price) {
        Product p = mock(Product.class);
        when(p.getId()).thenReturn(UUID.randomUUID());
        when(p.getModelCode()).thenReturn(code);
        when(p.getName()).thenReturn(code);
        when(p.getModelName()).thenReturn(code);
        when(p.getDeliveryPrice()).thenReturn(new BigDecimal(price));
        return p;
    }

    private static BigDecimal price(List<BundleExpander.ExpandedLine> lines, String code) {
        return lines.stream().filter(line -> code.equals(line.modelCode()))
                .findFirst().orElseThrow().unitPrice();
    }
}
