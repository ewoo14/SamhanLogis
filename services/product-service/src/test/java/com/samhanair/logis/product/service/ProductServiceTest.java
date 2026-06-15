package com.samhanair.logis.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.web.dto.CreateProductRequest;
import com.samhanair.logis.product.web.dto.ProductItemKind;
import com.samhanair.logis.product.web.dto.ProductResponse;
import com.samhanair.logis.product.web.dto.ProductSummaryResponse;
import com.samhanair.logis.product.web.dto.UpdatePriceRequest;
import com.samhanair.logis.product.web.dto.UpdateProductRequest;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class ProductServiceTest {

    @Mock
    private ProductRepository productRepository;

    @Mock
    private CategoryRepository categoryRepository;

    @Mock
    private com.samhanair.logis.product.repository.BundleComponentRepository bundleComponentRepository;

    @Mock
    private BundleComponentService bundleComponentService;

    @Mock
    private ProductSheetSyncService productSheetSyncService;

    @InjectMocks
    private ProductService service;

    private Category category;
    private UUID categoryId;
    private Product product;
    private UUID productId;

    @BeforeEach
    void setUp() {
        category = Category.create("INDOOR_WALL", "벽걸이형", null, 1);
        categoryId = UUID.randomUUID();
        ReflectionTestUtils.setField(category, "id", categoryId);

        product = Product.create("스마트 벽걸이", "SHA-W15K",
                category, new BigDecimal("1500000.00"), new BigDecimal("1100000.00"),
                "KRW", Map.of("hp", "1.5"), "1.5마력 벽걸이형");
        productId = UUID.randomUUID();
        ReflectionTestUtils.setField(product, "id", productId);
    }

    @Test
    void create_succeeds_withDefaultCurrency() {
        when(productRepository.existsByModelNameAndIsDeletedFalse("SHA-W20K")).thenReturn(false);
        when(categoryRepository.findById(categoryId)).thenReturn(Optional.of(category));
        when(productRepository.save(any(Product.class))).thenAnswer(inv -> {
            Product saved = inv.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", UUID.randomUUID());
            return saved;
        });

        ProductResponse response = service.create(new CreateProductRequest(
                "스마트 벽걸이 2.0", "SHA-W20K", categoryId,
                new BigDecimal("1800000.00"), new BigDecimal("1300000.00"),
                null, Map.of("hp", "2.0"), null));

        assertThat(response.modelName()).isEqualTo("SHA-W20K");
        assertThat(response.currency()).isEqualTo("KRW");
        assertThat(response.status()).isEqualTo(ProductStatus.ACTIVE);
        assertThat(response.tags()).containsEntry("hp", "2.0");
    }

    @Test
    void create_duplicateModelName_throwsConflict() {
        when(productRepository.existsByModelNameAndIsDeletedFalse("SHA-W15K")).thenReturn(true);

        assertThatThrownBy(() -> service.create(new CreateProductRequest(
                "중복", "SHA-W15K", categoryId,
                BigDecimal.ONE, BigDecimal.ONE, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void create_unknownCategory_throwsNotFound() {
        UUID missingCategoryId = UUID.randomUUID();
        when(productRepository.existsByModelNameAndIsDeletedFalse("X")).thenReturn(false);
        when(categoryRepository.findById(missingCategoryId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create(new CreateProductRequest(
                "X", "X", missingCategoryId,
                BigDecimal.ONE, BigDecimal.ONE, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void create_negativePrice_throwsInvalidInput() {
        when(productRepository.existsByModelNameAndIsDeletedFalse("X")).thenReturn(false);
        when(categoryRepository.findById(categoryId)).thenReturn(Optional.of(category));

        assertThatThrownBy(() -> service.create(new CreateProductRequest(
                "X", "X", categoryId,
                new BigDecimal("-1.00"), BigDecimal.ONE, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void update_changesNameAndDescription() {
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));

        ProductResponse response = service.update(productId,
                new UpdateProductRequest("새 이름", null, null, "새 설명"));

        assertThat(response.name()).isEqualTo("새 이름");
        assertThat(response.description()).isEqualTo("새 설명");
        assertThat(response.modelName()).isEqualTo("SHA-W15K");
    }

    @Test
    void update_modelNameChange_checksDuplication() {
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));
        when(productRepository.existsByModelNameAndIsDeletedFalse("SHA-NEW")).thenReturn(true);

        assertThatThrownBy(() -> service.update(productId,
                new UpdateProductRequest(null, "SHA-NEW", null, null)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void update_modelNameChange_keepsModelCodeImmutable() {
        product.changeModelCode("SHA-W15K");
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));
        when(productRepository.existsByModelNameAndIsDeletedFalse("SHA-NEW")).thenReturn(false);

        ProductResponse response = service.update(productId,
                new UpdateProductRequest(null, "SHA-NEW", null, null));

        assertThat(response.modelName()).isEqualTo("SHA-NEW");
        assertThat(response.modelCode()).isEqualTo("SHA-W15K");
    }

    @Test
    void update_setToGeneral_removesOwnChildBundleComponents() {
        product.changeModelCode("SET-001");
        product.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));

        service.update(productId, new UpdateProductRequest(
                null, null, null, null,
                ProductItemKind.GENERAL, null, null, null, null,
                null, null, null, null));

        org.mockito.Mockito.verify(bundleComponentService)
                .removeBundleChildren(productId, "system");
    }

    @Test
    void update_setToSetComponent_removesOwnChildrenThenReplacesParentLink() {
        product.changeModelCode("SET-001");
        product.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));

        service.update(productId, new UpdateProductRequest(
                null, null, null, null,
                ProductItemKind.SET_COMPONENT, null, null, "PARENT-SET",
                BundleComponent.ComponentKind.OUTDOOR,
                null, null, null, null));

        org.mockito.Mockito.verify(bundleComponentService)
                .removeBundleChildren(productId, "system");
        org.mockito.Mockito.verify(bundleComponentService)
                .replaceRegisteredComponentLink(
                        "PARENT-SET",
                        "SET-001",
                        BundleComponent.ComponentKind.OUTDOOR,
                        "system");
    }

    @Test
    void update_componentKindOnly_keepsExistingParentAndReplacesLink() {
        product.changeModelCode("IDU-001");
        Product parent = Product.seedFromSheet("세트 부모", "SET-001", category,
                BigDecimal.valueOf(1_000_000), BigDecimal.valueOf(800_000),
                ProductType.BUNDLE, ProductCategory.SINGLE_SET,
                com.samhanair.logis.product.domain.UsageScope.BOTH, null);
        UUID parentId = UUID.randomUUID();
        ReflectionTestUtils.setField(parent, "id", parentId);
        parent.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        BundleComponent link = BundleComponent.seed(
                parentId,
                "IDU-001",
                BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.INDOOR,
                null,
                false,
                null);

        when(productRepository.findById(productId)).thenReturn(Optional.of(product));
        when(bundleComponentRepository.findByComponentProductCode("IDU-001"))
                .thenReturn(List.of(link));
        when(productRepository.findAllByIdIn(List.of(parentId)))
                .thenReturn(List.of(parent));

        service.update(productId, new UpdateProductRequest(
                null, null, null, null,
                null, null, null, null,
                BundleComponent.ComponentKind.REMOTE,
                null, null, null, null));

        org.mockito.Mockito.verify(bundleComponentService)
                .replaceRegisteredComponentLink(
                        "SET-001",
                        "IDU-001",
                        BundleComponent.ComponentKind.REMOTE,
                        "system");
    }

    @Test
    void updatePrice_repricesBoth() {
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));

        ProductResponse response = service.updatePrice(productId,
                new UpdatePriceRequest(new BigDecimal("1700000.00"), new BigDecimal("1200000.00"), "USD"));

        assertThat(response.sellingPrice()).isEqualByComparingTo(new BigDecimal("1700000.00"));
        assertThat(response.purchasePrice()).isEqualByComparingTo(new BigDecimal("1200000.00"));
        assertThat(response.currency()).isEqualTo("USD");
    }

    @Test
    void updatePrice_negative_throwsInvalidInput() {
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));

        assertThatThrownBy(() -> service.updatePrice(productId,
                new UpdatePriceRequest(new BigDecimal("-1.00"), null, null)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void replaceTags_overwritesEntireMap() {
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));

        ProductResponse response = service.replaceTags(productId, Map.of("color", "white", "wifi", "true"));

        assertThat(response.tags()).hasSize(2)
                .containsEntry("color", "white")
                .containsEntry("wifi", "true")
                .doesNotContainKey("hp");
    }

    @Test
    void replaceTags_withNull_clearsTags() {
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));

        ProductResponse response = service.replaceTags(productId, null);

        assertThat(response.tags()).isNull();
    }

    @Test
    void discontinue_then_reactivate_togglesStatus() {
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));

        service.discontinue(productId);
        assertThat(product.getStatus()).isEqualTo(ProductStatus.DISCONTINUED);

        service.reactivate(productId);
        assertThat(product.getStatus()).isEqualTo(ProductStatus.ACTIVE);
    }

    @Test
    void delete_softDeletesWithCallerId() {
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));

        service.delete(productId, "user-1");

        assertThat(product.getIsDeleted()).isTrue();
        assertThat(product.getDeletedBy()).isEqualTo("user-1");
    }

    @Test
    void getOne_notFound_throwsNotFound() {
        UUID missing = UUID.randomUUID();
        when(productRepository.findById(missing)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getOne(missing))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void lookup_returnsSummaries() {
        when(productRepository.findAllByIdIn(List.of(productId))).thenReturn(List.of(product));

        List<ProductSummaryResponse> result = service.lookup(List.of(productId));

        assertThat(result).hasSize(1);
        assertThat(result.get(0).modelName()).isEqualTo("SHA-W15K");
        assertThat(result.get(0).sellingPrice()).isEqualByComparingTo(new BigDecimal("1500000.00"));
    }

    @Test
    void lookup_overSizeLimit_throwsInvalidInput() {
        List<UUID> tooMany = new ArrayList<>(IntStream.range(0, 101)
                .mapToObj(i -> UUID.randomUUID())
                .toList());

        assertThatThrownBy(() -> service.lookup(tooMany))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void lookup_empty_throwsInvalidInput() {
        assertThatThrownBy(() -> service.lookup(List.of()))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void findByModelName_existing_returnsProduct() {
        when(productRepository.findByModelNameAndIsDeletedFalse("SHA-W15K"))
                .thenReturn(Optional.of(product));

        ProductSummaryResponse summary = service.lookupSummaryByModelName("SHA-W15K");

        assertThat(summary).isNotNull();
        assertThat(summary.modelName()).isEqualTo("SHA-W15K");
        assertThat(summary.id()).isEqualTo(productId);
        assertThat(summary.sellingPrice()).isEqualByComparingTo(new BigDecimal("1500000.00"));
    }

    @Test
    void findByModelName_existing_trimsWhitespace() {
        when(productRepository.findByModelNameAndIsDeletedFalse("SHA-W15K"))
                .thenReturn(Optional.of(product));

        ProductSummaryResponse summary = service.lookupSummaryByModelName("  SHA-W15K  ");

        assertThat(summary).isNotNull();
        assertThat(summary.modelName()).isEqualTo("SHA-W15K");
    }

    @Test
    void findByModelName_missing_throwsNotFound() {
        when(productRepository.findByModelNameAndIsDeletedFalse("UNKNOWN-MODEL"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.lookupSummaryByModelName("UNKNOWN-MODEL"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void findByModelName_blank_throwsInvalidInput() {
        assertThatThrownBy(() -> service.lookupSummaryByModelName("   "))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void findByModelName_null_throwsInvalidInput() {
        assertThatThrownBy(() -> service.lookupSummaryByModelName(null))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void getByModelName_existing_returnsFullResponse() {
        when(productRepository.findByModelNameAndIsDeletedFalse("SHA-W15K"))
                .thenReturn(Optional.of(product));

        ProductResponse response = service.getByModelName("SHA-W15K");

        assertThat(response).isNotNull();
        assertThat(response.modelName()).isEqualTo("SHA-W15K");
        assertThat(response.tags()).containsEntry("hp", "1.5");
        assertThat(response.purchasePrice()).isEqualByComparingTo(new BigDecimal("1100000.00"));
    }

    @Test
    void getByModelName_setComponent_returnsEditRoundTripFields() {
        product.changeModelCode("IDU-001");
        product.changeProductCategory(ProductCategory.SINGLE_PART);
        product.changeUnit("SET");

        Product parent = Product.seedFromSheet("세트 부모", "SET-001", category,
                BigDecimal.valueOf(1_000_000), BigDecimal.valueOf(800_000),
                ProductType.BUNDLE, ProductCategory.SINGLE_SET,
                com.samhanair.logis.product.domain.UsageScope.BOTH, null);
        UUID parentId = UUID.randomUUID();
        ReflectionTestUtils.setField(parent, "id", parentId);
        parent.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);

        BundleComponent link = BundleComponent.seed(
                parentId,
                "IDU-001",
                BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.INDOOR,
                null,
                false,
                null);

        when(productRepository.findByModelNameAndIsDeletedFalse("SHA-W15K"))
                .thenReturn(Optional.of(product));
        when(bundleComponentRepository.findByComponentProductCode("IDU-001"))
                .thenReturn(List.of(link));
        when(productRepository.findAllByIdIn(List.of(parentId)))
                .thenReturn(List.of(parent));

        ProductResponse response = service.getByModelName("SHA-W15K");

        assertThat(response.itemKind()).isEqualTo(ProductItemKind.SET_COMPONENT);
        assertThat(response.unit()).isEqualTo("SET");
        assertThat(response.productCategory()).isEqualTo(ProductCategory.SINGLE_PART);
        assertThat(response.componentKind()).isEqualTo(BundleComponent.ComponentKind.INDOOR);
        assertThat(response.parentSetModelCode()).isEqualTo("SET-001");
    }

    @Test
    void getByModelName_missing_throwsNotFound() {
        when(productRepository.findByModelNameAndIsDeletedFalse("MISSING"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getByModelName("MISSING"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    // =========================================================================
    // 사이클2 지적 P3-4: escapeLikeWildcards 단위 테스트
    // =========================================================================

    /**
     * P3-4: LIKE 와일드카드 이스케이프 단위 검증 (사이클2 지적 P3-4, 2026-06-11).
     *
     * <p>백슬래시·퍼센트·언더스코어가 각각 올바르게 이스케이프되고,
     * 복합 입력에서도 순서 의존성 없이 정상 동작함을 확인한다.
     */
    @Test
    void escapeLikeWildcards_percent_escaped() {
        assertThat(ProductService.escapeLikeWildcards("50%DC")).isEqualTo("50\\%DC");
    }

    @Test
    void escapeLikeWildcards_underscore_escaped() {
        assertThat(ProductService.escapeLikeWildcards("A_B")).isEqualTo("A\\_B");
    }

    @Test
    void escapeLikeWildcards_backslash_escaped_first() {
        // 백슬래시를 먼저 이스케이프해야 %→\% 변환 후 이중 이스케이프 방지
        assertThat(ProductService.escapeLikeWildcards("C:\\%DC")).isEqualTo("C:\\\\\\%DC");
    }

    @Test
    void escapeLikeWildcards_noSpecialChars_unchanged() {
        assertThat(ProductService.escapeLikeWildcards("AJ040RXH4BC1")).isEqualTo("AJ040RXH4BC1");
    }
}
