package com.samhanair.logis.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.web.dto.BundleComponentRequest;
import com.samhanair.logis.product.web.dto.BundleComponentResponse;
import com.samhanair.logis.product.web.dto.DisplayOrderRequest;
import jakarta.persistence.EntityNotFoundException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

/**
 * BundleComponentService 단위 테스트 (§1c/§1d 2026-06-11).
 *
 * <p>Mockito 기반 단위 테스트 — 비즈니스 룰 검증 집중:
 * <ul>
 *   <li>listComponents — BUNDLE 구성품 목록 반환</li>
 *   <li>replaceComponents — 409 BUNDLE 아님 / 400 빈배열 / 400 자기참조 / 400 미해소코드 / 정상 교체</li>
 *   <li>updateDisplayOrders — 404 미존재 / 전건 적용 원자성</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class BundleComponentServiceTest {

    @Mock
    private ProductRepository productRepository;

    @Mock
    private BundleComponentRepository bundleComponentRepository;

    @InjectMocks
    private BundleComponentService service;

    private Product bundleProduct;
    private Product componentProduct;
    private UUID bundleId;
    private UUID componentId;

    @BeforeEach
    void setUp() {
        Category cat = Category.create("INDOOR_WALL", "벽걸이형", null, 1);

        // BUNDLE 부모
        bundleProduct = Product.seedFromSheet(
                "테스트 세트", "TEST-BUNDLE-001", cat,
                BigDecimal.valueOf(1_000_000), BigDecimal.valueOf(800_000),
                ProductType.SINGLE, null, UsageScope.BOTH, null);
        bundleId = UUID.randomUUID();
        ReflectionTestUtils.setField(bundleProduct, "id", bundleId);
        bundleProduct.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);

        // 구성 품목
        componentProduct = Product.seedFromSheet(
                "실내기", "IDU-001", cat,
                BigDecimal.valueOf(300_000), BigDecimal.valueOf(250_000),
                ProductType.SINGLE, null, UsageScope.NONE, null);
        componentId = UUID.randomUUID();
        ReflectionTestUtils.setField(componentProduct, "id", componentId);
    }

    // ============================================================
    // listComponents
    // ============================================================

    @Test
    void listComponents_BUNDLE_구성품_목록_반환() {
        BundleComponent bc = BundleComponent.seed(bundleId, "IDU-001",
                BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.INDOOR, null, true, null);

        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        when(bundleComponentRepository.findByBundleProductId(bundleId))
                .thenReturn(List.of(bc));
        when(productRepository.findByModelCodeInAndIsDeletedFalse(List.of("IDU-001")))
                .thenReturn(List.of(componentProduct));

        List<BundleComponentResponse> result = service.listComponents("TEST-BUNDLE-001");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).componentProductCode()).isEqualTo("IDU-001");
        assertThat(result.get(0).componentName()).isEqualTo("실내기");
        assertThat(result.get(0).displayOrder()).isEqualTo(1);
    }

    @Test
    void listComponents_품목없음_404() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("NO-CODE"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.listComponents("NO-CODE"))
                .isInstanceOf(EntityNotFoundException.class);
    }

    // ============================================================
    // replaceComponents
    // ============================================================

    @Test
    void replaceComponents_BUNDLE_아님_409() {
        // SINGLE 품목
        Product singleProduct = Product.seedFromSheet(
                "단품", "SINGLE-001", null,
                BigDecimal.valueOf(100_000), BigDecimal.valueOf(80_000),
                ProductType.SINGLE, null, UsageScope.NONE, null);
        ReflectionTestUtils.setField(singleProduct, "id", UUID.randomUUID());

        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("SINGLE-001"))
                .thenReturn(Optional.of(singleProduct));

        BundleComponentRequest req = new BundleComponentRequest(
                "IDU-001", BigDecimal.ONE, null, null, null, true, null);

        assertThatThrownBy(() -> service.replaceComponents("SINGLE-001", List.of(req)))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void replaceComponents_빈배열_400() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));

        assertThatThrownBy(() -> service.replaceComponents("TEST-BUNDLE-001", List.of()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void replaceComponents_자기자신포함_400() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));

        BundleComponentRequest req = new BundleComponentRequest(
                "TEST-BUNDLE-001", BigDecimal.ONE, null, null, null, false, null);

        assertThatThrownBy(() -> service.replaceComponents("TEST-BUNDLE-001", List.of(req)))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void replaceComponents_미해소코드_400() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("NO-SUCH-CODE"))
                .thenReturn(Optional.empty());

        BundleComponentRequest req = new BundleComponentRequest(
                "NO-SUCH-CODE", BigDecimal.ONE, null, null, null, false, null);

        assertThatThrownBy(() -> service.replaceComponents("TEST-BUNDLE-001", List.of(req)))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void replaceComponents_정상교체_기존_soft_delete_후_신규_INSERT() {
        BundleComponent oldBc = BundleComponent.seed(bundleId, "OLD-001",
                BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.ACCESSORY, null, false, null);

        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("IDU-001"))
                .thenReturn(Optional.of(componentProduct));
        when(bundleComponentRepository.findByBundleProductId(bundleId))
                .thenReturn(List.of(oldBc));
        lenient().when(bundleComponentRepository.save(any(BundleComponent.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(componentProduct));

        BundleComponentRequest req = new BundleComponentRequest(
                "IDU-001", BigDecimal.valueOf(2), BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.INDOOR, null, true, "규격A");

        List<BundleComponentResponse> result = service.replaceComponents("TEST-BUNDLE-001", List.of(req));

        assertThat(result).hasSize(1);
        assertThat(result.get(0).componentProductCode()).isEqualTo("IDU-001");
        assertThat(result.get(0).defaultQty()).isEqualByComparingTo(BigDecimal.valueOf(2));
        assertThat(result.get(0).displayOrder()).isEqualTo(1);
    }

    // ============================================================
    // updateDisplayOrders
    // ============================================================

    @Test
    void updateDisplayOrders_미존재_modelCode_404() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("NO-CODE"))
                .thenReturn(Optional.empty());

        DisplayOrderRequest req = new DisplayOrderRequest("NO-CODE", 1);

        assertThatThrownBy(() -> service.updateDisplayOrders(List.of(req)))
                .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void updateDisplayOrders_전건_적용() {
        Product p1 = Product.seedFromSheet("품목1", "PROD-001", null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE, null, UsageScope.NONE, null);
        ReflectionTestUtils.setField(p1, "id", UUID.randomUUID());
        Product p2 = Product.seedFromSheet("품목2", "PROD-002", null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE, null, UsageScope.NONE, null);
        ReflectionTestUtils.setField(p2, "id", UUID.randomUUID());

        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("PROD-001"))
                .thenReturn(Optional.of(p1));
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("PROD-002"))
                .thenReturn(Optional.of(p2));
        lenient().when(productRepository.save(any(Product.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        service.updateDisplayOrders(List.of(
                new DisplayOrderRequest("PROD-001", 5),
                new DisplayOrderRequest("PROD-002", 10)));

        assertThat(p1.getDisplayOrder()).isEqualTo(5);
        assertThat(p2.getDisplayOrder()).isEqualTo(10);
    }

    @Test
    void updateDisplayOrders_빈_목록_noop() {
        // 예외 없이 정상 종료
        service.updateDisplayOrders(List.of());
    }
}
