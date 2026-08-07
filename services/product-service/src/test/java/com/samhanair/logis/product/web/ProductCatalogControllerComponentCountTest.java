package com.samhanair.logis.product.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleComponentConsentToken;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.realtime.ProductCatalogChangePublisher;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.SpecKeyTemplateRepository;
import com.samhanair.logis.product.service.BundleComponentService;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.service.ProductSpecService;
import com.samhanair.logis.product.web.dto.ProductCatalogResponse;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import static org.mockito.Mockito.verify;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * ProductCatalogController §1b componentCount 벌크 주입 단위 테스트 (2026-06-11).
 *
 * <p>listProducts 가 BUNDLE 품목의 componentCount 를 N+1 없이 벌크로 채우는지 검증한다.
 * 구성품 목록 1회 조회로 전 BUNDLE 의 count와 consent token을 같은 관측에서 파생해야 한다.
 */
@ExtendWith(MockitoExtension.class)
class ProductCatalogControllerComponentCountTest {

    @Mock
    private ProductRepository productRepository;

    @Mock
    private BundleComponentRepository bundleComponentRepository;

    @Mock
    private ProductEstimateExposureRepository exposureRepository;

    @Mock
    private ProductSpecService specService;

    @Mock
    private SpecKeyTemplateRepository templateRepository;

    @Mock
    private ProductService productService;

    @Mock
    private BundleComponentService bundleComponentService;

    @Mock
    private ProductCatalogChangePublisher catalogChangePublisher;

    private ProductCatalogController controller;

    private Product bundleProduct;
    private Product singleProduct;
    private UUID bundleId;

    @BeforeEach
    void setUp() {
        controller = new ProductCatalogController(
                productRepository, specService, templateRepository,
                productService, bundleComponentService, bundleComponentRepository,
                exposureRepository, catalogChangePublisher);

        Category cat = Category.create("INDOOR_WALL", "벽걸이형", null, 1);

        bundleProduct = Product.seedFromSheet(
                "테스트 세트", "BUNDLE-001", cat,
                BigDecimal.valueOf(1_000_000), BigDecimal.valueOf(800_000),
                ProductType.SINGLE, null, UsageScope.BOTH, null);
        bundleId = UUID.randomUUID();
        ReflectionTestUtils.setField(bundleProduct, "id", bundleId);
        bundleProduct.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);

        singleProduct = Product.seedFromSheet(
                "단품", "SINGLE-001", cat,
                BigDecimal.valueOf(100_000), BigDecimal.valueOf(80_000),
                ProductType.SINGLE, null, UsageScope.BOTH, null);
        ReflectionTestUtils.setField(singleProduct, "id", UUID.randomUUID());
    }

    @Test
    void listProducts_BUNDLE_componentCount_벌크_주입() {
        // given — 페이지에 BUNDLE + SINGLE 혼재
        PageImpl<Product> page = new PageImpl<>(List.of(bundleProduct, singleProduct),
                PageRequest.of(0, 50), 2);
        when(productRepository.searchByUsageScope(any(), any(), any(), any()))
                .thenReturn(page);
        when(productRepository.findAllWithClassificationsByIdIn(anyCollection()))
                .thenReturn(List.of(bundleProduct, singleProduct));
        // P2-2 N+1 제거: searchByUsageScope 가 반환한 Page<Product> 에 id 가 이미 있으므로
        // findByCatalogExposedModelCodeAndIsDeletedFalse 재조회가 불필요해졌다.
        // 이전 stub 은 lenient 로 유지하여 이후 변경 테스트에서 필요 시 참조 가능.
        lenient().when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        List<BundleComponent> components = List.of(
                component(bundleId, "CHILD-1"), component(bundleId, "CHILD-2"), component(bundleId, "CHILD-3"));
        when(bundleComponentRepository.findActiveByBundleProductIdIn(anyCollection()))
                .thenReturn(components);
        when(exposureRepository.findByProductIdInAndIsDeletedFalse(anyCollection()))
                .thenReturn(List.of());

        // when
        var result = controller.listProducts(null, null, null, 0, 50);

        // then
        assertThat(result.getContent()).hasSize(2);
        ProductCatalogResponse bundleResp = result.getContent().stream()
                .filter(r -> "BUNDLE-001".equals(r.modelCode()))
                .findFirst().orElseThrow();
        ProductCatalogResponse singleResp = result.getContent().stream()
                .filter(r -> "SINGLE-001".equals(r.modelCode()))
                .findFirst().orElseThrow();

        assertThat(bundleResp.productType()).isEqualTo(ProductType.BUNDLE);
        assertThat(bundleResp.componentCount()).isEqualTo(3);
        assertThat(bundleResp.componentSetToken()).isEqualTo(BundleComponentConsentToken.from(components));
        verify(bundleComponentRepository).findActiveByBundleProductIdIn(anyCollection());
        org.mockito.Mockito.verify(bundleComponentRepository, org.mockito.Mockito.never())
                .countMapByBundleProductIds(anyCollection());
        assertThat(singleResp.productType()).isEqualTo(ProductType.SINGLE);
        assertThat(singleResp.componentCount()).isEqualTo(0);
    }

    @Test
    void listProducts_BUNDLE없으면_countMap_미호출() {
        // given — 페이지에 SINGLE 만
        PageImpl<Product> page = new PageImpl<>(List.of(singleProduct),
                PageRequest.of(0, 50), 1);
        when(productRepository.searchByUsageScope(any(), any(), any(), any()))
                .thenReturn(page);
        when(productRepository.findAllWithClassificationsByIdIn(anyCollection()))
                .thenReturn(List.of(singleProduct));

        // when
        var result = controller.listProducts(null, null, null, 0, 50);

        // then — SINGLE 만 있으면 bundleComponentRepository 호출 없음
        org.mockito.Mockito.verify(bundleComponentRepository, org.mockito.Mockito.never())
                .findActiveByBundleProductIdIn(anyCollection());
        assertThat(result.getContent().get(0).componentCount()).isEqualTo(0);
    }

    private BundleComponent component(UUID parentId, String code) {
        BundleComponent component = BundleComponent.seed(parentId, code, BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET, BundleComponent.ComponentKind.ACCESSORY,
                null, false, null);
        ReflectionTestUtils.setField(component, "id", UUID.nameUUIDFromBytes(code.getBytes()));
        return component;
    }
}
