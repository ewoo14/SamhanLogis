package com.samhanair.logis.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductEstimateExposure;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.realtime.ProductCatalogChangePublisher;
import com.samhanair.logis.product.realtime.ProductRealtimeBroker;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.web.dto.BundleComponentRequest;
import com.samhanair.logis.product.web.dto.BundleComponentResponse;
import com.samhanair.logis.product.web.dto.DisplayOrderRequest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * BundleComponentService 단위 테스트 (§1c/§1d 2026-06-11).
 *
 * <p>Mockito 기반 단위 테스트 — 비즈니스 룰 검증 집중:
 * <ul>
 *   <li>listComponents — BUNDLE 구성품 목록 반환 / model_name fallback (D-PCE-03)</li>
 *   <li>replaceComponents — 409 BUNDLE 아님 / 400 빈배열 / 400 자기참조 / 400 미해소코드 / 정상 교체
 *       (D-PCE-01: 모두 BusinessException)</li>
 *   <li>updateDisplayOrders — 404 미존재 / 전건 적용 원자성 / estimateCategory 검증 (D-PCE-02)</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class BundleComponentServiceTest {

    @Mock
    private ProductRepository productRepository;

    @Mock
    private BundleComponentRepository bundleComponentRepository;

    @Mock
    private ProductEstimateExposureRepository exposureRepository;

    @Mock
    private EntityManager entityManager;

    @Mock
    private QuantitySyncRuleService quantitySyncRuleService;

    /**
     * 실제 broker + 실제 publisher 사용 (mock 아님) — afterCommit 지연/발화 시점을
     * publishCount() 로 실측하기 위함. 구독자가 없어도 publish 시도 카운터는 증가한다.
     */
    private ProductRealtimeBroker broker;
    private ProductCatalogChangePublisher catalogChangePublisher;

    private BundleComponentService service;

    private Product bundleProduct;
    private Product componentProduct;
    private UUID bundleId;
    private UUID componentId;

    @BeforeEach
    void setUp() {
        broker = new ProductRealtimeBroker();
        catalogChangePublisher = new ProductCatalogChangePublisher(broker);
        service = new BundleComponentService(
                productRepository, bundleComponentRepository, exposureRepository,
                catalogChangePublisher, entityManager, quantitySyncRuleService);
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

        // #2 동시성 가드: replaceComponents 가 부모 해소 직후 findByIdForUpdate(PESSIMISTIC_WRITE)
        // 로 부모를 재조회한다. bundleProduct 를 부모로 쓰는 케이스가 대부분이므로 lenient 공통 stub.
        // (BUNDLE_아님_409 등 다른 부모를 쓰는 케이스는 각 테스트에서 별도 stub.)
        lenient().when(productRepository.findByIdForUpdate(bundleId))
                .thenReturn(Optional.of(bundleProduct));
    }

    @AfterEach
    void tearDown() {
        // afterCommit 테스트가 동기화를 활성화하면 다른 테스트로 누수되지 않도록 정리.
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clear();
        }
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

    /**
     * D-PCE-03: model_code null 레거시 행 — 1차(modelCode IN) 미매칭 시
     * model_name 2차 조회로 componentName 해소.
     */
    @Test
    void listComponents_modelCode_null_레거시_modelName_2차_조회() {
        // 구성품 코드 = "LEGACY-IDU-001" 이지만 DB 행은 model_code=null, model_name="LEGACY-IDU-001"
        BundleComponent bc = BundleComponent.seed(bundleId, "LEGACY-IDU-001",
                BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.INDOOR, null, true, null);

        // legacyProduct: modelCode=null, modelName="LEGACY-IDU-001"
        Product legacyProduct = Product.seedFromSheet(
                "레거시 실내기", "LEGACY-IDU-001", null,
                BigDecimal.valueOf(200_000), BigDecimal.valueOf(160_000),
                ProductType.SINGLE, null, UsageScope.NONE, null);
        // model_code null 시뮬레이션 — seedFromSheet 은 modelCode 를 set 하므로 null 로 덮음
        ReflectionTestUtils.setField(legacyProduct, "modelCode", null);
        ReflectionTestUtils.setField(legacyProduct, "id", UUID.randomUUID());

        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        when(bundleComponentRepository.findByBundleProductId(bundleId))
                .thenReturn(List.of(bc));
        // 1차 modelCode IN 조회 → 빈 결과 (model_code=null 이므로 매칭 안 됨)
        when(productRepository.findByModelCodeInAndIsDeletedFalse(List.of("LEGACY-IDU-001")))
                .thenReturn(List.of());
        // 2차 modelName 조회 → 레거시 품목 반환
        when(productRepository.findByModelNameAndIsDeletedFalse("LEGACY-IDU-001"))
                .thenReturn(Optional.of(legacyProduct));

        List<BundleComponentResponse> result = service.listComponents("TEST-BUNDLE-001");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).componentProductCode()).isEqualTo("LEGACY-IDU-001");
        // D-PCE-03 fix: 코드 폴백이 아닌 실제 품목명 해소
        assertThat(result.get(0).componentName()).isEqualTo("레거시 실내기");
    }

    // ============================================================
    // replaceComponents — D-PCE-01: 모두 BusinessException
    // ============================================================

    /**
     * D-PCE-01: 비-BUNDLE PUT → 409 CONFLICT — BusinessException(CONFLICT) 단언.
     * 기존 ResponseStatusException(409) 는 GlobalExceptionHandler handleUnknown → 500 이었으나
     * BusinessException(CONFLICT) 로 교체하여 정확히 409 반환.
     */
    @Test
    void replaceComponents_BUNDLE_아님_409_BusinessException() {
        // SINGLE 품목
        Product singleProduct = Product.seedFromSheet(
                "단품", "SINGLE-001", null,
                BigDecimal.valueOf(100_000), BigDecimal.valueOf(80_000),
                ProductType.SINGLE, null, UsageScope.NONE, null);
        UUID singleId = UUID.randomUUID();
        ReflectionTestUtils.setField(singleProduct, "id", singleId);

        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("SINGLE-001"))
                .thenReturn(Optional.of(singleProduct));
        // #2: 부모 해소 직후 PESSIMISTIC_WRITE 재조회 — 비-BUNDLE 부모도 잠금 후 409 판정.
        when(productRepository.findByIdForUpdate(singleId))
                .thenReturn(Optional.of(singleProduct));

        BundleComponentRequest req = new BundleComponentRequest(
                "IDU-001", BigDecimal.ONE, null, null, null, true, null);

        assertThatThrownBy(() -> service.replaceComponents("SINGLE-001", List.of(req), "system"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void replaceComponents_빈배열_400_BusinessException() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));

        assertThatThrownBy(() -> service.replaceComponents("TEST-BUNDLE-001", List.of(), "system"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void replaceComponents_자기자신포함_400_BusinessException() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));

        BundleComponentRequest req = new BundleComponentRequest(
                "TEST-BUNDLE-001", BigDecimal.ONE, null, null, null, false, null);

        assertThatThrownBy(() -> service.replaceComponents("TEST-BUNDLE-001", List.of(req), "system"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void replaceComponents_미해소코드_400_BusinessException() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        // A fix: 구성품 해소는 modelCode-only (expander 와 동일 축)
        when(productRepository.findByModelCodeAndIsDeletedFalse("NO-SUCH-CODE"))
                .thenReturn(Optional.empty());

        BundleComponentRequest req = new BundleComponentRequest(
                "NO-SUCH-CODE", BigDecimal.ONE, null, null, null, false, null);

        assertThatThrownBy(() -> service.replaceComponents("TEST-BUNDLE-001", List.of(req), "system"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    /**
     * #3 (2026-06-11): 구성품이 BUNDLE 타입(세트-안-세트) → 400 INVALID_INPUT.
     *
     * <p>해소 검증 루프에서 이미 조회한 Product 의 productType==BUNDLE 이면 거부한다(추가 쿼리 0).
     * 세트가 다른 세트의 구성품이 되면 전개가 재귀/순환될 수 있어 사전 차단한다.
     */
    @Test
    void replaceComponents_구성품이_BUNDLE_타입이면_400_세트안세트_거부() {
        // 구성품 후보가 BUNDLE 인 품목
        Product bundleComponentCandidate = Product.seedFromSheet(
                "세트 구성후보", "INNER-BUNDLE-001", null,
                BigDecimal.valueOf(500_000), BigDecimal.valueOf(400_000),
                ProductType.SINGLE, null, UsageScope.BOTH, null);
        ReflectionTestUtils.setField(bundleComponentCandidate, "id", UUID.randomUUID());
        bundleComponentCandidate.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);

        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        when(productRepository.findByModelCodeAndIsDeletedFalse("INNER-BUNDLE-001"))
                .thenReturn(Optional.of(bundleComponentCandidate));

        BundleComponentRequest req = new BundleComponentRequest(
                "INNER-BUNDLE-001", BigDecimal.ONE, null, null, null, true, null);

        assertThatThrownBy(() -> service.replaceComponents("TEST-BUNDLE-001", List.of(req), "system"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT))
                .hasMessageContaining("INNER-BUNDLE-001");
    }

    @Test
    void replaceComponents_정상교체_기존_soft_delete_후_신규_INSERT() {
        BundleComponent oldBc = BundleComponent.seed(bundleId, "OLD-001",
                BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.ACCESSORY, null, false, null);

        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        when(productRepository.findByModelCodeAndIsDeletedFalse("IDU-001"))
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

        List<BundleComponentResponse> result = service.replaceComponents("TEST-BUNDLE-001", List.of(req), "tester-user");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).componentProductCode()).isEqualTo("IDU-001");
        assertThat(result.get(0).defaultQty()).isEqualByComparingTo(BigDecimal.valueOf(2));
        assertThat(result.get(0).displayOrder()).isEqualTo(1);
    }

    @Test
    void replaceComponents_displayOrder_종류순_기본먼저_정규화() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        stubResolvableComponents("REMOTE-NON", "INDOOR-OPT", "REMOTE-DEFAULT", "PANEL-OPT", "PANEL-DEFAULT");
        when(bundleComponentRepository.findByBundleProductId(bundleId))
                .thenReturn(List.of());
        lenient().when(bundleComponentRepository.save(any(BundleComponent.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(
                        product("INDOOR-OPT"),
                        product("PANEL-DEFAULT"),
                        product("PANEL-OPT"),
                        product("REMOTE-DEFAULT"),
                        product("REMOTE-NON")));

        List<BundleComponentResponse> result = service.replaceComponents("TEST-BUNDLE-001", List.of(
                componentRequest("REMOTE-NON", BundleComponent.ComponentKind.REMOTE, false),
                componentRequest("INDOOR-OPT", BundleComponent.ComponentKind.INDOOR, false),
                componentRequest("REMOTE-DEFAULT", BundleComponent.ComponentKind.REMOTE, true),
                componentRequest("PANEL-OPT", BundleComponent.ComponentKind.PANEL, false),
                componentRequest("PANEL-DEFAULT", BundleComponent.ComponentKind.PANEL, true)
        ), "tester-user");

        assertThat(componentCodes(result)).containsExactly(
                "INDOOR-OPT",
                "PANEL-DEFAULT",
                "PANEL-OPT",
                "REMOTE-DEFAULT",
                "REMOTE-NON");
        assertThat(result).extracting(BundleComponentResponse::displayOrder)
                .containsExactly(1, 2, 3, 4, 5);
    }

    @Test
    void replaceComponents_displayOrder_종류내_비기본_사용자순서_보존() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        stubResolvableComponents("PANEL-B", "OUTDOOR-DEFAULT", "PANEL-A", "PANEL-C");
        when(bundleComponentRepository.findByBundleProductId(bundleId))
                .thenReturn(List.of());
        lenient().when(bundleComponentRepository.save(any(BundleComponent.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(
                        product("OUTDOOR-DEFAULT"),
                        product("PANEL-B"),
                        product("PANEL-A"),
                        product("PANEL-C")));

        List<BundleComponentResponse> result = service.replaceComponents("TEST-BUNDLE-001", List.of(
                componentRequest("PANEL-B", BundleComponent.ComponentKind.PANEL, false),
                componentRequest("OUTDOOR-DEFAULT", BundleComponent.ComponentKind.OUTDOOR, true),
                componentRequest("PANEL-A", BundleComponent.ComponentKind.PANEL, false),
                componentRequest("PANEL-C", BundleComponent.ComponentKind.PANEL, false)
        ), "tester-user");

        assertThat(componentCodes(result)).containsExactly(
                "OUTDOOR-DEFAULT",
                "PANEL-B",
                "PANEL-A",
                "PANEL-C");
    }

    @Test
    void replaceComponents_displayOrder_기본이_종류내_최상단() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        stubResolvableComponents("PANEL-A", "PANEL-DEFAULT", "PANEL-B");
        when(bundleComponentRepository.findByBundleProductId(bundleId))
                .thenReturn(List.of());
        lenient().when(bundleComponentRepository.save(any(BundleComponent.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(product("PANEL-DEFAULT"), product("PANEL-A"), product("PANEL-B")));

        List<BundleComponentResponse> result = service.replaceComponents("TEST-BUNDLE-001", List.of(
                componentRequest("PANEL-A", BundleComponent.ComponentKind.PANEL, false),
                componentRequest("PANEL-DEFAULT", BundleComponent.ComponentKind.PANEL, true),
                componentRequest("PANEL-B", BundleComponent.ComponentKind.PANEL, false)
        ), "tester-user");

        assertThat(componentCodes(result)).containsExactly("PANEL-DEFAULT", "PANEL-A", "PANEL-B");
    }

    /**
     * P1-D (2026-06-11): 동일 코드 유지 편집(수량만 변경) 시
     * entityManager.flush() 가 soft-delete 후, INSERT 전에 호출됨을 검증.
     *
     * <p>실제 DB 부분 유니크 인덱스(is_deleted=false) 충돌 방지를 위해
     * flush 가 반드시 soft-delete save 직후, 신규 INSERT 전에 발화해야 한다.
     * Mockito 로 flush 호출 순서를 단언한다.
     */
    @Test
    void replaceComponents_동일코드_유지_편집_flush_호출_확인() {
        // 기존 구성품: IDU-001 (동일 코드 유지)
        BundleComponent existingBc = BundleComponent.seed(bundleId, "IDU-001",
                BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.INDOOR, null, true, null);

        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        when(productRepository.findByModelCodeAndIsDeletedFalse("IDU-001"))
                .thenReturn(Optional.of(componentProduct));
        when(bundleComponentRepository.findByBundleProductId(bundleId))
                .thenReturn(List.of(existingBc));
        lenient().when(bundleComponentRepository.save(any(BundleComponent.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(componentProduct));

        // 동일 코드(IDU-001) 유지하되 수량만 3으로 변경
        BundleComponentRequest req = new BundleComponentRequest(
                "IDU-001", BigDecimal.valueOf(3), BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.INDOOR, null, true, null);

        List<BundleComponentResponse> result = service.replaceComponents("TEST-BUNDLE-001", List.of(req), "tester-user");

        // flush 가 1회 호출되어야 함 (soft-delete 후, INSERT 전)
        verify(entityManager).flush();
        assertThat(result).hasSize(1);
        assertThat(result.get(0).componentProductCode()).isEqualTo("IDU-001");
        assertThat(result.get(0).defaultQty()).isEqualByComparingTo(BigDecimal.valueOf(3));
        assertThat(result.get(0).displayOrder()).isEqualTo(1);
    }

    /**
     * P3-2 (2026-06-11): 요청 내 중복 componentProductCode → 400 INVALID_INPUT.
     *
     * <p>중복 코드는 부분 유니크 인덱스(bundle_product_id, component_product_code, is_deleted=false)
     * 위반으로 INSERT 단계에서 500 을 유발하므로, 사전 검증으로 400 거부한다.
     */
    @Test
    void replaceComponents_중복_componentProductCode_400_BusinessException() {
        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        lenient().when(productRepository.findByModelCodeAndIsDeletedFalse("IDU-001"))
                .thenReturn(Optional.of(componentProduct));

        BundleComponentRequest first = new BundleComponentRequest(
                "IDU-001", BigDecimal.ONE, null, null, null, true, null);
        BundleComponentRequest dup = new BundleComponentRequest(
                "IDU-001", BigDecimal.valueOf(2), null, null, null, false, null);

        assertThatThrownBy(() -> service.replaceComponents(
                "TEST-BUNDLE-001", List.of(first, dup), "system"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT))
                .hasMessageContaining("IDU-001");
    }

    /**
     * P3-3 (2026-06-11): 기존 구성품 soft-delete actor = 전달된 X-User-Id.
     *
     * <p>{@code markDeleted} 가 호출된 기존 BundleComponent 의 {@code deletedBy} 가
     * 리터럴("bundle-component-replace-all") 이 아닌 실제 호출자 식별자와 일치해야 한다.
     */
    @Test
    void replaceComponents_soft_delete_actor_X_User_Id_기록() {
        BundleComponent oldBc = BundleComponent.seed(bundleId, "OLD-001",
                BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.ACCESSORY, null, false, null);

        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        when(productRepository.findByModelCodeAndIsDeletedFalse("IDU-001"))
                .thenReturn(Optional.of(componentProduct));
        when(bundleComponentRepository.findByBundleProductId(bundleId))
                .thenReturn(List.of(oldBc));
        lenient().when(bundleComponentRepository.save(any(BundleComponent.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(componentProduct));

        BundleComponentRequest req = new BundleComponentRequest(
                "IDU-001", BigDecimal.ONE, null, null, null, true, null);

        service.replaceComponents("TEST-BUNDLE-001", List.of(req), "caller-42");

        // 기존 구성품이 caller-42 로 soft-delete 되어야 한다 (리터럴 아님)
        assertThat(oldBc.getIsDeleted()).isTrue();
        assertThat(oldBc.getDeletedBy()).isEqualTo("caller-42");
    }

    /**
     * P3-3 보강: actor 가 null 이면 "system" 으로 soft-delete 된다.
     */
    @Test
    void replaceComponents_actor_null_이면_system_으로_soft_delete() {
        BundleComponent oldBc = BundleComponent.seed(bundleId, "OLD-001",
                BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.ACCESSORY, null, false, null);

        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        when(productRepository.findByModelCodeAndIsDeletedFalse("IDU-001"))
                .thenReturn(Optional.of(componentProduct));
        when(bundleComponentRepository.findByBundleProductId(bundleId))
                .thenReturn(List.of(oldBc));
        lenient().when(bundleComponentRepository.save(any(BundleComponent.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(componentProduct));

        BundleComponentRequest req = new BundleComponentRequest(
                "IDU-001", BigDecimal.ONE, null, null, null, true, null);

        service.replaceComponents("TEST-BUNDLE-001", List.of(req), null);

        assertThat(oldBc.getDeletedBy()).isEqualTo("system");
    }

    /**
     * P3-1 (2026-06-11): 활성 트랜잭션 내에서는 SSE publish 가 커밋 전 발화되지 않고
     * afterCommit 동기화로 지연 등록되어야 한다.
     *
     * <p>실제 {@link ProductRealtimeBroker} + {@link ProductCatalogChangePublisher} 를 사용하여
     * {@code publishCount()} 로 발화 여부를 실측한다.
     * <ul>
     *   <li>{@code TransactionSynchronizationManager.initSynchronization()} 으로 활성 트랜잭션을 모사</li>
     *   <li>replaceComponents 직후(커밋 전) publishCount 는 0 (지연됨)</li>
     *   <li>동기화 콜백을 수동으로 {@code afterCommit()} 호출 → publishCount 1 로 증가 (발화)</li>
     * </ul>
     */
    @Test
    void replaceComponents_활성_트랜잭션_내_publish_는_afterCommit_으로_지연() {
        BundleComponent oldBc = BundleComponent.seed(bundleId, "OLD-001",
                BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.ACCESSORY, null, false, null);

        when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse("TEST-BUNDLE-001"))
                .thenReturn(Optional.of(bundleProduct));
        when(productRepository.findByModelCodeAndIsDeletedFalse("IDU-001"))
                .thenReturn(Optional.of(componentProduct));
        when(bundleComponentRepository.findByBundleProductId(bundleId))
                .thenReturn(List.of(oldBc));
        lenient().when(bundleComponentRepository.save(any(BundleComponent.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(componentProduct));

        BundleComponentRequest req = new BundleComponentRequest(
                "IDU-001", BigDecimal.ONE, null, null, null, true, null);

        // 활성 트랜잭션 동기화 모사 (실제 @Transactional 진입 시 Spring 이 하는 작업)
        TransactionSynchronizationManager.initSynchronization();
        try {
            long before = broker.publishCount();

            service.replaceComponents("TEST-BUNDLE-001", List.of(req), "caller-tx");

            // 커밋 전 — publish 지연됨 (아직 발화 안 됨)
            assertThat(broker.publishCount()).isEqualTo(before);
            assertThat(TransactionSynchronizationManager.getSynchronizations()).hasSize(1);

            // 커밋 모사 — afterCommit 콜백 수동 발화
            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(org.springframework.transaction.support.TransactionSynchronization::afterCommit);

            // 발화 후 — publishCount 증가
            assertThat(broker.publishCount()).isEqualTo(before + 1);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void removeBundleChildren_부모_하위_구성품_soft_delete() {
        BundleComponent child = BundleComponent.seed(bundleId, "IDU-001",
                BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.INDOOR, null, true, null);
        when(bundleComponentRepository.findByBundleProductId(bundleId))
                .thenReturn(List.of(child));
        lenient().when(bundleComponentRepository.save(any(BundleComponent.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        long before = broker.publishCount();

        service.removeBundleChildren(bundleId, "actor-1");

        assertThat(child.getIsDeleted()).isTrue();
        assertThat(child.getDeletedBy()).isEqualTo("actor-1");
        verify(entityManager).flush();
        assertThat(broker.publishCount()).isEqualTo(before + 1);
    }

    @Test
    void removeBundleChildren_대상_없으면_noop() {
        when(bundleComponentRepository.findByBundleProductId(bundleId))
                .thenReturn(List.of());

        service.removeBundleChildren(bundleId, "actor-1");

        verify(entityManager, org.mockito.Mockito.never()).flush();
    }

    // ============================================================
    // updateDisplayOrders
    // ============================================================

    @Test
    void updateDisplayOrders_미존재_modelCode_404() {
        // #5 벌크 해소: modelCode IN / modelName IN 모두 빈 결과 → 404
        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of());
        when(productRepository.findByModelNameInAndIsDeletedFalse(any()))
                .thenReturn(List.of());

        DisplayOrderRequest req = new DisplayOrderRequest("NO-CODE", EstimateCategory.HOME_MULTI, 1);

        assertThatThrownBy(() -> service.updateDisplayOrders(List.of(req)))
                .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void updateDisplayOrders_전건_카테고리별_재번호() {
        Product p1 = Product.seedFromSheet("품목1", "PROD-001", null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE, null, UsageScope.BOTH, null);
        UUID p1Id = UUID.randomUUID();
        ReflectionTestUtils.setField(p1, "id", p1Id);
        Product p2 = Product.seedFromSheet("품목2", "PROD-002", null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE, null, UsageScope.BOTH, null);
        UUID p2Id = UUID.randomUUID();
        ReflectionTestUtils.setField(p2, "id", p2Id);
        ProductEstimateExposure e1 = ProductEstimateExposure.create(p1Id, EstimateCategory.HOME_MULTI, 10);
        ProductEstimateExposure e2 = ProductEstimateExposure.create(p2Id, EstimateCategory.HOME_MULTI, 20);

        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(p1, p2));
        when(exposureRepository.findByProductIdInAndEstimateCategoryAndIsDeletedFalse(
                any(), any())).thenReturn(List.of(e1, e2));
        when(exposureRepository.findActiveProductExposuresByEstimateCategory(any()))
                .thenReturn(List.of(e1, e2));
        service.updateDisplayOrders(List.of(
                new DisplayOrderRequest("PROD-001", EstimateCategory.HOME_MULTI, 50),
                new DisplayOrderRequest("PROD-002", EstimateCategory.HOME_MULTI, 10)));

        assertThat(e1.getDisplayOrder()).isEqualTo(1);
        assertThat(e2.getDisplayOrder()).isEqualTo(2);
    }

    @Test
    void updateDisplayOrders_빈_목록_noop() {
        // 예외 없이 정상 종료
        service.updateDisplayOrders(List.of());
    }

    /**
     * H fix (2026-06-11): 요청 내 중복 modelCode → 400 INVALID_INPUT.
     *
     * <p>같은 modelCode 가 두 번 들어오면 마지막 값으로 덮어써 의도와 다른 순서가 저장되므로,
     * 전건 검증 단계(적용 전, 미존재 조회 전)에서 중복을 검출하고 거부한다.
     */
    @Test
    void updateDisplayOrders_중복_modelCode_400_BusinessException() {
        // 중복 검출이 미존재 조회보다 먼저 일어나므로 repository stub 불필요.
        assertThatThrownBy(() -> service.updateDisplayOrders(List.of(
                new DisplayOrderRequest("DUP-001", EstimateCategory.HOME_MULTI, 1),
                new DisplayOrderRequest("DUP-001", EstimateCategory.HOME_MULTI, 2))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT))
                .hasMessageContaining("DUP-001");
    }

    /**
     * D-PCE-02 (a): 서로 다른 estimateCategory 혼합 → 400 INVALID_INPUT.
     * 기존 productCategory 검증이 null+null 로 통과하던 케이스도 정확히 처리됨.
     */
    @Test
    void updateDisplayOrders_서로_다른_estimateCategory_혼합_400() {
        // HOME_MULTI 카테고리 품목
        Product catA = Product.seedFromSheet("품목A", "PROD-A", null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.ESTIMATE, EstimateCategory.HOME_MULTI);
        ReflectionTestUtils.setField(catA, "id", UUID.randomUUID());

        // SINGLE_SET 카테고리 품목
        Product catB = Product.seedFromSheet("품목B", "PROD-B", null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.SINGLE_SET, UsageScope.ESTIMATE, EstimateCategory.SINGLE_SET);
        ReflectionTestUtils.setField(catB, "id", UUID.randomUUID());

        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(catA, catB));

        assertThatThrownBy(() -> service.updateDisplayOrders(List.of(
                new DisplayOrderRequest("PROD-A", EstimateCategory.HOME_MULTI, 1),
                new DisplayOrderRequest("PROD-B", EstimateCategory.SINGLE_SET, 2))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    /**
     * D-PCE-02 (b): 요청 estimateCategory 누락 → 400 INVALID_INPUT.
     */
    @Test
    void updateDisplayOrders_null_estimateCategory_400() {
        Product nullCat = Product.seedFromSheet("미분류", "PROD-NULL", null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                null, UsageScope.NONE, null);
        ReflectionTestUtils.setField(nullCat, "id", UUID.randomUUID());

        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(nullCat));

        assertThatThrownBy(() -> service.updateDisplayOrders(List.of(
                new DisplayOrderRequest("PROD-NULL", null, 1))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    /**
     * D-PCE-02 (c): 동일 estimateCategory non-null → 204 (정상 처리).
     */
    @Test
    void updateDisplayOrders_동일_estimateCategory_정상_204() {
        Product p1 = Product.seedFromSheet("홈멀티A", "HM-001", null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.ESTIMATE, EstimateCategory.HOME_MULTI);
        UUID p1Id = UUID.randomUUID();
        ReflectionTestUtils.setField(p1, "id", p1Id);

        Product p2 = Product.seedFromSheet("홈멀티B", "HM-002", null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.ESTIMATE, EstimateCategory.HOME_MULTI);
        UUID p2Id = UUID.randomUUID();
        ReflectionTestUtils.setField(p2, "id", p2Id);
        ProductEstimateExposure e1 = ProductEstimateExposure.create(p1Id, EstimateCategory.HOME_MULTI, 10);
        ProductEstimateExposure e2 = ProductEstimateExposure.create(p2Id, EstimateCategory.HOME_MULTI, 20);

        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(p1, p2));
        when(exposureRepository.findByProductIdInAndEstimateCategoryAndIsDeletedFalse(
                any(), any())).thenReturn(List.of(e1, e2));
        when(exposureRepository.findActiveProductExposuresByEstimateCategory(any()))
                .thenReturn(List.of(e1, e2));
        // 예외 없이 정상 종료
        service.updateDisplayOrders(List.of(
                new DisplayOrderRequest("HM-001", EstimateCategory.HOME_MULTI, 1),
                new DisplayOrderRequest("HM-002", EstimateCategory.HOME_MULTI, 2)));

        assertThat(e1.getDisplayOrder()).isEqualTo(1);
        assertThat(e2.getDisplayOrder()).isEqualTo(2);
    }

    @Test
    void updateDisplayOrders_부분요청이면_400() {
        Product p1 = Product.seedFromSheet("홈멀티A", "HM-GUARD-001", null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.ESTIMATE, EstimateCategory.HOME_MULTI);
        UUID p1Id = UUID.randomUUID();
        ReflectionTestUtils.setField(p1, "id", p1Id);
        Product p2 = Product.seedFromSheet("홈멀티B", "HM-GUARD-002", null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.ESTIMATE, EstimateCategory.HOME_MULTI);
        UUID p2Id = UUID.randomUUID();
        ReflectionTestUtils.setField(p2, "id", p2Id);
        UUID p3Id = UUID.randomUUID();
        ProductEstimateExposure e1 = ProductEstimateExposure.create(p1Id, EstimateCategory.HOME_MULTI, 1);
        ProductEstimateExposure e2 = ProductEstimateExposure.create(p2Id, EstimateCategory.HOME_MULTI, 2);
        ProductEstimateExposure e3 = ProductEstimateExposure.create(p3Id, EstimateCategory.HOME_MULTI, 3);

        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(p1, p2));
        when(exposureRepository.findByProductIdInAndEstimateCategoryAndIsDeletedFalse(
                any(), any())).thenReturn(List.of(e1, e2));
        when(exposureRepository.findActiveProductExposuresByEstimateCategory(any()))
                .thenReturn(List.of(e1, e2, e3));

        assertThatThrownBy(() -> service.updateDisplayOrders(List.of(
                new DisplayOrderRequest("HM-GUARD-002", EstimateCategory.HOME_MULTI, 1),
                new DisplayOrderRequest("HM-GUARD-001", EstimateCategory.HOME_MULTI, 2))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT))
                .hasMessageContaining("전체 활성 노출");
    }

    /**
     * D-PCE-02 (d): 요청 카테고리의 exposure 가 없으면 404.
     */
    @Test
    void updateDisplayOrders_exposure_없으면_404() {
        Product p1 = Product.seedFromSheet("미분류A", "NC-001", null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                null, UsageScope.BOTH, null);
        ReflectionTestUtils.setField(p1, "id", UUID.randomUUID());

        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(p1));
        when(exposureRepository.findByProductIdInAndEstimateCategoryAndIsDeletedFalse(
                any(), any())).thenReturn(List.of());

        assertThatThrownBy(() -> service.updateDisplayOrders(List.of(
                new DisplayOrderRequest("NC-001", EstimateCategory.HOME_MULTI, 3))))
                .isInstanceOf(EntityNotFoundException.class);
    }

    // ============================================================
    // updateDisplayOrders — 기존 productCategory 검증 (하위호환 참고용)
    // ============================================================

    /**
     * 기존 §2-1 다른 productCategory 혼합 테스트 — D-PCE-02 fix 이후 이 케이스는
     * productCategory 가 다르더라도 estimateCategory 가 동일하면 통과한다.
     * 하지만 estimateCategory 도 다른 경우에는 여전히 400 을 반환한다.
     */
    @Test
    void updateDisplayOrders_다른_productCategory_이어도_estimateCategory_다르면_400() {
        Product catA = Product.seedFromSheet("품목A", "PROD-A", null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.ESTIMATE, EstimateCategory.HOME_MULTI);
        ReflectionTestUtils.setField(catA, "id", UUID.randomUUID());

        Product catB = Product.seedFromSheet("품목B", "PROD-B", null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.SINGLE_SET, UsageScope.ESTIMATE, EstimateCategory.SINGLE_SET);
        ReflectionTestUtils.setField(catB, "id", UUID.randomUUID());

        when(productRepository.findByModelCodeInAndIsDeletedFalse(any()))
                .thenReturn(List.of(catA, catB));

        assertThatThrownBy(() -> service.updateDisplayOrders(List.of(
                new DisplayOrderRequest("PROD-A", EstimateCategory.HOME_MULTI, 1),
                new DisplayOrderRequest("PROD-B", EstimateCategory.SINGLE_SET, 2))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    private void stubResolvableComponents(String... modelCodes) {
        for (String modelCode : modelCodes) {
            lenient().when(productRepository.findByModelCodeAndIsDeletedFalse(modelCode))
                    .thenReturn(Optional.of(product(modelCode)));
        }
    }

    private static BundleComponentRequest componentRequest(String modelCode,
                                                           BundleComponent.ComponentKind kind,
                                                           boolean isDefault) {
        return new BundleComponentRequest(
                modelCode, BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET,
                kind, null, isDefault, null);
    }

    private Product product(String modelCode) {
        Product product = Product.seedFromSheet(modelCode, modelCode, null,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE, null, UsageScope.NONE, null);
        ReflectionTestUtils.setField(product, "id", UUID.randomUUID());
        return product;
    }

    private static List<String> componentCodes(List<BundleComponentResponse> responses) {
        return responses.stream()
                .map(BundleComponentResponse::componentProductCode)
                .toList();
    }
}
