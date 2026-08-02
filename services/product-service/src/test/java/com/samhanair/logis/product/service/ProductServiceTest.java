package com.samhanair.logis.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductAlias;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ClassificationRepository;
import com.samhanair.logis.product.repository.ProductAliasRepository;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.ProductSpecRepository;
import com.samhanair.logis.product.web.dto.CreateProductRequest;
import com.samhanair.logis.product.web.dto.LabelResolutionResult;
import com.samhanair.logis.product.web.dto.ProductItemKind;
import com.samhanair.logis.product.web.dto.ProductResponse;
import com.samhanair.logis.product.web.dto.ProductSpecRequest;
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
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class ProductServiceTest {

    @Mock
    private ProductRepository productRepository;

    @Mock
    private ProductSpecRepository productSpecRepository;

    @Mock
    private ProductEstimateExposureRepository exposureRepository;

    @Mock
    private ProductAliasRepository productAliasRepository;

    @Mock
    private CategoryRepository categoryRepository;

    @Mock
    private ClassificationRepository classificationRepository;

    @Mock
    private com.samhanair.logis.product.repository.BundleComponentRepository bundleComponentRepository;

    @Mock
    private BundleComponentService bundleComponentService;

    @Mock
    private ProductSheetSyncService productSheetSyncService;

    @Mock
    private QuantitySyncRuleService quantitySyncRuleService;

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
        when(productSpecRepository.findByProductIdOrderByDisplayOrderAsc(any(UUID.class))).thenReturn(List.of());

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
    void create_persistsDynamicSpecsInRequestOrder() {
        when(productRepository.existsByModelNameAndIsDeletedFalse("SHA-W20K")).thenReturn(false);
        when(categoryRepository.findById(categoryId)).thenReturn(Optional.of(category));
        when(productRepository.save(any(Product.class))).thenAnswer(inv -> {
            Product saved = inv.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", productId);
            return saved;
        });
        when(productSpecRepository.save(any(ProductSpec.class))).thenAnswer(inv -> inv.getArgument(0));
        when(productSpecRepository.findByProductIdOrderByDisplayOrderAsc(productId))
                .thenReturn(List.of(
                        ProductSpec.create(productId, "냉방능력, kW", "6.0", "kW", 1),
                        ProductSpec.create(productId, "전원", "220V", null, 2)));

        ProductResponse response = service.create(new CreateProductRequest(
                "스마트 벽걸이 2.0", "SHA-W20K", categoryId,
                new BigDecimal("1800000.00"), new BigDecimal("1300000.00"),
                null, Map.of("hp", "2.0"), null,
                null, null, null, null, null, null, null, null, null,
                List.of(
                        new ProductSpecRequest("냉방능력, kW", "6.0", "kW"),
                        new ProductSpecRequest("전원", "220V", null))));

        assertThat(response.specs())
                .extracting("specKey", "specValue", "unit", "displayOrder")
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("냉방능력, kW", "6.0", "kW", 1),
                        org.assertj.core.groups.Tuple.tuple("전원", "220V", null, 2));
        org.mockito.Mockito.verify(productSpecRepository, org.mockito.Mockito.times(2))
                .save(any(ProductSpec.class));
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
    void lookupByModelCodes_fallsBackToModelNameWhenModelCodeIsBlank() {
        when(productRepository.findByModelCodeInAndIsDeletedFalse(List.of("SHA-W15K")))
                .thenReturn(List.of());
        when(productRepository.findByModelNameInAndIsDeletedFalse(List.of("SHA-W15K")))
                .thenReturn(List.of(product));

        List<ProductSummaryResponse> result = service.lookupByModelCodes(List.of("SHA-W15K"));

        assertThat(result).hasSize(1);
        assertThat(result.get(0).modelCode()).isEqualTo("SHA-W15K");
        verify(productRepository).findByModelNameInAndIsDeletedFalse(List.of("SHA-W15K"));
    }

    @Test
    void lookupByModelNames_resolvesEcountProductWithoutModelCodeLookup() {
        when(productRepository.findByModelNameInAndIsDeletedFalse(List.of("EC-ONLY-001")))
                .thenReturn(List.of(product));

        List<ProductSummaryResponse> result = service.lookupByModelNames(List.of("EC-ONLY-001"));

        assertThat(result).hasSize(1);
        assertThat(result.get(0).modelName()).isEqualTo("SHA-W15K");
        verify(productRepository, never()).findByModelCodeInAndIsDeletedFalse(any());
    }

    @Test
    void update_changesNameAndDescription() {
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));
        when(productSpecRepository.findByProductIdOrderByDisplayOrderAsc(productId)).thenReturn(List.of());

        ProductResponse response = service.update(productId,
                new UpdateProductRequest("새 이름", null, null, "새 설명"));

        assertThat(response.name()).isEqualTo("새 이름");
        assertThat(response.description()).isEqualTo("새 설명");
        assertThat(response.modelName()).isEqualTo("SHA-W15K");
    }

    @Test
    void update_whenSpecsProvided_replacesAllDynamicSpecs() {
        ProductSpec oldSpec = ProductSpec.create(productId, "기존", "old", null, 1);
        ReflectionTestUtils.setField(oldSpec, "id", UUID.randomUUID());

        when(productRepository.findById(productId)).thenReturn(Optional.of(product));
        when(productSpecRepository.findByProductIdOrderByDisplayOrderAsc(productId))
                .thenReturn(List.of(oldSpec))
                .thenReturn(List.of(
                        ProductSpec.create(productId, "냉방능력, kW", "6.0", "kW", 1),
                        ProductSpec.create(productId, "전원", "220V", null, 2)));
        when(productSpecRepository.save(any(ProductSpec.class))).thenAnswer(inv -> inv.getArgument(0));

        ProductResponse response = service.update(productId,
                new UpdateProductRequest(null, null, null, null,
                        null, null, null, null, null,
                        null, null, null, null,
                        List.of(
                                new ProductSpecRequest("냉방능력, kW", "6.0", "kW"),
                                new ProductSpecRequest("전원", "220V", null))));

        assertThat(oldSpec.getIsDeleted()).isTrue();
        assertThat(response.specs())
                .extracting("specKey", "specValue", "displayOrder")
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("냉방능력, kW", "6.0", 1),
                        org.assertj.core.groups.Tuple.tuple("전원", "220V", 2));
    }

    @Test
    void update_whenSpecsNull_keepsExistingDynamicSpecs() {
        ProductSpec currentSpec = ProductSpec.create(productId, "전원", "220V", null, 1);

        when(productRepository.findById(productId)).thenReturn(Optional.of(product));
        when(productSpecRepository.findByProductIdOrderByDisplayOrderAsc(productId))
                .thenReturn(List.of(currentSpec));

        ProductResponse response = service.update(productId,
                new UpdateProductRequest(null, null, null, "설명만 변경"));

        assertThat(response.description()).isEqualTo("설명만 변경");
        assertThat(response.specs())
                .extracting("specKey", "specValue")
                .containsExactly(org.assertj.core.groups.Tuple.tuple("전원", "220V"));
        org.mockito.Mockito.verify(productSpecRepository, org.mockito.Mockito.never())
                .save(any(ProductSpec.class));
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
    void update_componentSavedAsGeneral_preservesParentComponentLinks() {
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

        ProductResponse response = service.update(productId, new UpdateProductRequest(
                null, null, null, null,
                ProductItemKind.GENERAL, null, null, null, null,
                "EA", BigDecimal.valueOf(310_000), BigDecimal.valueOf(250_000),
                null));

        assertThat(response.itemKind()).isEqualTo(ProductItemKind.SET_COMPONENT);
        assertThat(response.parentSetModelCode()).isEqualTo("SET-001");
        org.mockito.Mockito.verify(bundleComponentService, org.mockito.Mockito.never())
                .removeRegisteredComponentLinks("IDU-001", "system");
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

    // R1 결함 3 [MED] — discontinue/delete가 수량 동기화 규칙 참조 때문에 막힐 때
    // 원인이 드러나야 한다(J-4). 단위 테스트라 실 DB 트리거 없이 서비스 계층의
    // 선제 확인만 격리해 검증한다.
    @Test
    void discontinue_참조하는_활성_규칙이_있으면_수량동기화_사유와_함께_거부한다() {
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));
        when(quantitySyncRuleService.findEnabledRuleKeysReferencing(productId))
                .thenReturn(List.of("QSREV-LIVE-01"));

        assertThatThrownBy(() -> service.discontinue(productId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("QSREV-LIVE-01");
        assertThat(product.getStatus()).isEqualTo(ProductStatus.ACTIVE);
    }

    @Test
    void delete_참조하는_활성_규칙이_있으면_수량동기화_사유와_함께_거부한다() {
        when(productRepository.findById(productId)).thenReturn(Optional.of(product));
        when(quantitySyncRuleService.findEnabledRuleKeysReferencing(productId))
                .thenReturn(List.of("QSREV-LIVE-01"));

        assertThatThrownBy(() -> service.delete(productId, "user-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("QSREV-LIVE-01");
        assertThat(product.getIsDeleted()).isFalse();
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
        when(productSpecRepository.findByProductIdOrderByDisplayOrderAsc(productId))
                .thenReturn(List.of(ProductSpec.create(productId, "냉방능력, kW", "5.2", "kW", 1)));

        ProductResponse response = service.getByModelName("SHA-W15K");

        assertThat(response).isNotNull();
        assertThat(response.modelName()).isEqualTo("SHA-W15K");
        assertThat(response.tags()).containsEntry("hp", "1.5");
        assertThat(response.purchasePrice()).isEqualByComparingTo(new BigDecimal("1100000.00"));
        assertThat(response.specs())
                .extracting("specKey", "specValue", "unit")
                .containsExactly(org.assertj.core.groups.Tuple.tuple("냉방능력, kW", "5.2", "kW"));
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
    // #773 후속 — lookupSummaryByLabel(단건)/lookupSummaryByLabelBulk(벌크) 판정 공유 + parity
    // =========================================================================

    private Product newLabelProduct(String name, String modelName, String modelCode) {
        Product product = Product.create(name, modelName, category,
                new BigDecimal("1000000"), new BigDecimal("800000"), "KRW", null, name + " 설명");
        ReflectionTestUtils.setField(product, "id", UUID.randomUUID());
        if (modelCode != null) {
            product.changeModelCode(modelCode);
        }
        return product;
    }

    @Test
    void lookupSummaryByLabelBulk_모델코드_alias_LIKE_매칭을_각각_반환한다() {
        Product modelCodeMatch = newLabelProduct("모델코드 매칭 제품", "MC-NAME-1", "ZZ-MODELCODE-1");
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("ZZ-MODELCODE-1"))
                .thenReturn(Optional.of(modelCodeMatch));

        Product aliasMain = newLabelProduct("별칭 매핑 제품", "MC-NAME-2", "ZZ-ALIAS-MAIN-1");
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("ZZ-ALIAS-1"))
                .thenReturn(Optional.empty());
        when(productAliasRepository.findByAliasCodeAndIsDeletedFalse("ZZ-ALIAS-1"))
                .thenReturn(Optional.of(ProductAlias.create("ZZ-ALIAS-1", aliasMain, "ECOUNT_IMPORT")));

        Product likeMatch = newLabelProduct("LIKE 매칭 제품", "MC-NAME-3", "ZZ-LIKE-1");
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("ZZ-LIKE-1"))
                .thenReturn(Optional.empty());
        when(productAliasRepository.findByAliasCodeAndIsDeletedFalse("ZZ-LIKE-1"))
                .thenReturn(Optional.empty());
        when(productRepository.search(null, null, "ZZ-LIKE-1", null, null, null, PageRequest.of(0, 2)))
                .thenReturn(new PageImpl<>(List.of(likeMatch)));

        Map<String, LabelResolutionResult> result = service.lookupSummaryByLabelBulk(List.of(
                "ZZ-MODELCODE-1 [규격A]", "ZZ-ALIAS-1 [규격B]", "ZZ-LIKE-1 [규격C]"));

        assertThat(result).hasSize(3);
        assertThat(result.get("ZZ-MODELCODE-1 [규격A]").status()).isEqualTo(LabelResolutionResult.MATCHED);
        assertThat(result.get("ZZ-MODELCODE-1 [규격A]").productId()).isEqualTo(modelCodeMatch.getId());
        assertThat(result.get("ZZ-MODELCODE-1 [규격A]").modelCode()).isEqualTo("ZZ-MODELCODE-1");

        assertThat(result.get("ZZ-ALIAS-1 [규격B]").status()).isEqualTo(LabelResolutionResult.MATCHED);
        assertThat(result.get("ZZ-ALIAS-1 [규격B]").productId()).isEqualTo(aliasMain.getId());
        assertThat(result.get("ZZ-ALIAS-1 [규격B]").modelCode()).isEqualTo("ZZ-ALIAS-MAIN-1");

        assertThat(result.get("ZZ-LIKE-1 [규격C]").status()).isEqualTo(LabelResolutionResult.MATCHED);
        assertThat(result.get("ZZ-LIKE-1 [규격C]").productId()).isEqualTo(likeMatch.getId());
        assertThat(result.get("ZZ-LIKE-1 [규격C]").modelCode()).isEqualTo("ZZ-LIKE-1");
    }

    @Test
    void lookupSummaryByLabelBulk_notFound와_ambiguous를_구분해서_반환한다() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("ZZ-NOTFOUND-1"))
                .thenReturn(Optional.empty());
        when(productAliasRepository.findByAliasCodeAndIsDeletedFalse("ZZ-NOTFOUND-1"))
                .thenReturn(Optional.empty());
        when(productRepository.search(null, null, "ZZ-NOTFOUND-1", null, null, null, PageRequest.of(0, 2)))
                .thenReturn(new PageImpl<>(List.of()));

        Product ambigA = newLabelProduct("다의성 후보 A", "MC-NAME-4", null);
        Product ambigB = newLabelProduct("다의성 후보 B", "MC-NAME-5", null);
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("ZZ-TWOROWS-1"))
                .thenReturn(Optional.empty());
        when(productAliasRepository.findByAliasCodeAndIsDeletedFalse("ZZ-TWOROWS-1"))
                .thenReturn(Optional.empty());
        when(productRepository.search(null, null, "ZZ-TWOROWS-1", null, null, null, PageRequest.of(0, 2)))
                .thenReturn(new PageImpl<>(List.of(ambigA, ambigB)));

        Map<String, LabelResolutionResult> result = service.lookupSummaryByLabelBulk(List.of(
                "ZZ-NOTFOUND-1 [규격]", "ZZ-TWOROWS-1 [규격]"));

        assertThat(result.get("ZZ-NOTFOUND-1 [규격]").status()).isEqualTo(LabelResolutionResult.NOT_FOUND);
        assertThat(result.get("ZZ-NOTFOUND-1 [규격]").productId()).isNull();

        assertThat(result.get("ZZ-TWOROWS-1 [규격]").status()).isEqualTo(LabelResolutionResult.AMBIGUOUS);
        assertThat(result.get("ZZ-TWOROWS-1 [규격]").productId()).isNull();
        assertThat(result.get("ZZ-TWOROWS-1 [규격]").modelCode()).isNull();
    }

    @Test
    void lookupSummaryByLabelBulk_blank_토큰은_INVALID_INPUT으로_실패한다() {
        assertThatThrownBy(() -> service.lookupSummaryByLabelBulk(List.of("[포장재 비용]")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        // 토큰 추출 실패는 repository 조회 자체를 발생시키지 않는다(단건과 동일한 short-circuit).
        verify(productRepository, never()).findByCatalogExposedModelCodeAndIsDeletedFalse(any());
        verify(productAliasRepository, never()).findByAliasCodeAndIsDeletedFalse(any());
    }

    @Test
    void lookupSummaryByLabelBulk_혼합배치를_한번에_해석한다() {
        Product matched = newLabelProduct("혼합배치 매칭", "MC-NAME-6", "ZZ-MIX-MATCH-1");
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("ZZ-MIX-MATCH-1"))
                .thenReturn(Optional.of(matched));
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("ZZ-MIX-NOTFOUND-1"))
                .thenReturn(Optional.empty());
        when(productAliasRepository.findByAliasCodeAndIsDeletedFalse("ZZ-MIX-NOTFOUND-1"))
                .thenReturn(Optional.empty());
        when(productRepository.search(null, null, "ZZ-MIX-NOTFOUND-1", null, null, null, PageRequest.of(0, 2)))
                .thenReturn(new PageImpl<>(List.of()));

        assertThatThrownBy(() -> service.lookupSummaryByLabelBulk(List.of(
                "ZZ-MIX-MATCH-1 [규격]", "ZZ-MIX-NOTFOUND-1 [규격]", "[포장재 비용]")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void lookupSummaryByLabelBulk_null또는_빈리스트는_빈Map을_반환한다() {
        assertThat(service.lookupSummaryByLabelBulk(null)).isEmpty();
        assertThat(service.lookupSummaryByLabelBulk(List.of())).isEmpty();
    }

    @Test
    void lookupSummaryByLabelBulk_size상한초과시_INVALID_INPUT() {
        List<String> tooMany = IntStream.range(0, 101)
                .mapToObj(i -> "ZZ-LABEL-" + i)
                .toList();

        assertThatThrownBy(() -> service.lookupSummaryByLabelBulk(tooMany))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void lookupSummaryByLabelBulk_중복라벨은_한번만_조회한다() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("ZZ-DUP-1"))
                .thenReturn(Optional.empty());
        when(productAliasRepository.findByAliasCodeAndIsDeletedFalse("ZZ-DUP-1"))
                .thenReturn(Optional.empty());
        when(productRepository.search(null, null, "ZZ-DUP-1", null, null, null, PageRequest.of(0, 2)))
                .thenReturn(new PageImpl<>(List.of()));

        Map<String, LabelResolutionResult> result = service.lookupSummaryByLabelBulk(
                List.of("ZZ-DUP-1 [규격]", "ZZ-DUP-1 [규격]"));

        assertThat(result).hasSize(1);
        verify(productRepository, times(1))
                .search(null, null, "ZZ-DUP-1", null, null, null, PageRequest.of(0, 2));
    }

    /**
     * parity 핵심 검증 — {@link ProductService#lookupSummaryByLabel} 단건(throw)과
     * {@link ProductService#lookupSummaryByLabelBulk} 벌크(status)가 동일 라벨에 대해 항상
     * 같은 판정에서 갈라짐을 4개 상태(MATCHED/NOT_FOUND/AMBIGUOUS/BLANK_TOKEN)로 증명한다.
     */
    @Test
    void 단건과_벌크는_matched에서_동일결과를_반환한다() {
        Product matched = newLabelProduct("parity 매칭 제품", "MC-NAME-7", "ZZ-PARITY-MATCH-1");
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("ZZ-PARITY-MATCH-1"))
                .thenReturn(Optional.of(matched));

        ProductSummaryResponse single = service.lookupSummaryByLabel("ZZ-PARITY-MATCH-1 [규격]");
        LabelResolutionResult bulk = service.lookupSummaryByLabelBulk(
                List.of("ZZ-PARITY-MATCH-1 [규격]")).get("ZZ-PARITY-MATCH-1 [규격]");

        assertThat(bulk.status()).isEqualTo(LabelResolutionResult.MATCHED);
        assertThat(bulk.productId()).isEqualTo(single.id());
        assertThat(bulk.modelCode()).isEqualTo(single.modelCode());
    }

    @Test
    void 단건과_벌크는_notFound에서_동일결과를_반환한다() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("ZZ-PARITY-NF-1"))
                .thenReturn(Optional.empty());
        when(productAliasRepository.findByAliasCodeAndIsDeletedFalse("ZZ-PARITY-NF-1"))
                .thenReturn(Optional.empty());
        when(productRepository.search(null, null, "ZZ-PARITY-NF-1", null, null, null, PageRequest.of(0, 2)))
                .thenReturn(new PageImpl<>(List.of()));

        assertThatThrownBy(() -> service.lookupSummaryByLabel("ZZ-PARITY-NF-1 [규격]"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
        LabelResolutionResult bulk = service.lookupSummaryByLabelBulk(
                List.of("ZZ-PARITY-NF-1 [규격]")).get("ZZ-PARITY-NF-1 [규격]");
        assertThat(bulk.status()).isEqualTo(LabelResolutionResult.NOT_FOUND);
    }

    @Test
    void 단건과_벌크는_ambiguous에서_동일결과를_반환한다() {
        Product ambigA = newLabelProduct("parity 다의성 A", "MC-NAME-8", null);
        Product ambigB = newLabelProduct("parity 다의성 B", "MC-NAME-9", null);
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("ZZ-PARITY-TWOROWS-1"))
                .thenReturn(Optional.empty());
        when(productAliasRepository.findByAliasCodeAndIsDeletedFalse("ZZ-PARITY-TWOROWS-1"))
                .thenReturn(Optional.empty());
        when(productRepository.search(null, null, "ZZ-PARITY-TWOROWS-1", null, null, null, PageRequest.of(0, 2)))
                .thenReturn(new PageImpl<>(List.of(ambigA, ambigB)));

        assertThatThrownBy(() -> service.lookupSummaryByLabel("ZZ-PARITY-TWOROWS-1 [규격]"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
        LabelResolutionResult bulk = service.lookupSummaryByLabelBulk(
                List.of("ZZ-PARITY-TWOROWS-1 [규격]")).get("ZZ-PARITY-TWOROWS-1 [규격]");
        assertThat(bulk.status()).isEqualTo(LabelResolutionResult.AMBIGUOUS);
    }

    @Test
    void 단건과_벌크는_blank토큰에서_모두_INVALID_INPUT으로_실패한다() {
        assertThatThrownBy(() -> service.lookupSummaryByLabel("[포장재 비용]"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        assertThatThrownBy(() -> service.lookupSummaryByLabelBulk(List.of("[포장재 비용]")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
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
