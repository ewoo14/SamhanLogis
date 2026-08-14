package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.ExpandedLineDto;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.estimate.service.EstimateService;
import com.samhanair.logis.slip.estimate.web.dto.CreateEstimateRequest;
import com.samhanair.logis.slip.estimate.web.dto.UpdateEstimateRequest;
import com.samhanair.logis.slip.mobile.dto.MobileQuotationRequest;
import com.samhanair.logis.slip.mobile.service.MobileQuotationService;
import com.samhanair.logis.slip.price.config.PartnerProductPriceMemoryProperties;
import com.samhanair.logis.slip.price.domain.PartnerProductPriceMemory;
import com.samhanair.logis.slip.price.repository.PartnerProductPriceMemoryBatchRepository;
import com.samhanair.logis.slip.price.repository.PartnerProductPriceMemoryRepository;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryCommand;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryBulkItemResponse;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryResponse;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.SlipService;
import com.samhanair.logis.slip.service.SalesSlipUpdateService;
import com.samhanair.logis.slip.service.SlipUpdateService;
import com.samhanair.logis.slip.web.dto.CreateSlipRequest;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import com.samhanair.logis.slip.web.dto.SlipLineResponse;
import com.samhanair.logis.slip.web.dto.SlipUpdateRequest;
import io.micrometer.core.instrument.MeterRegistry;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * #809 거래처+품목 최근 수동단가 기억 실 DB 통합 테스트.
 *
 * <p>native upsert 는 컴파일 타임 검증이 없으므로 Testcontainers PostgreSQL 에 Flyway V58 을
 * 실제 적용한 뒤 라운드트립, 충돌 갱신, soft-delete revive, UNIQUE 제약, fail-soft 경계를 검증한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class PartnerProductPriceMemoryIT extends AbstractPostgresIT {

    private static final String FAIL_CONSTRAINT = "chk_pppm_test_fail";

    @Autowired
    private PartnerProductPriceMemoryService priceMemoryService;

    @Autowired
    private SlipService slipService;

    @Autowired
    private SlipUpdateService slipUpdateService;

    @Autowired
    private SalesSlipUpdateService salesSlipUpdateService;

    /** R6-H2 — 서버측 전표 복사 (세트 계보 승계 + 구성품 가격기억 제외). */
    @Autowired
    private com.samhanair.logis.slip.service.SlipDuplicateService slipDuplicateService;

    @Autowired
    private EstimateService estimateService;

    @Autowired
    private MobileQuotationService mobileQuotationService;

    @Autowired
    private SlipRepository slipRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PartnerProductPriceMemoryRepository priceMemoryRepository;

    @Autowired
    private PartnerProductPriceMemoryBatchRepository priceMemoryBatchRepository;

    @Autowired
    private com.samhanair.logis.slip.config.SlipDataSourceConfig.PriceMemoryJdbcAccess priceMemoryJdbcAccess;

    @Autowired
    private MeterRegistry meterRegistry;

    @Autowired
    private Clock clock;

    @Autowired
    private PartnerProductPriceMemoryProperties priceMemoryProperties;

    @Autowired
    @Qualifier("priceMemoryExecutor")
    private Executor priceMemoryExecutor;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @MockBean
    private UserInternalClient userInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setUp() {
        jdbcTemplate.execute("ALTER TABLE partner_product_price_memory DROP CONSTRAINT IF EXISTS " + FAIL_CONSTRAINT);
        jdbcTemplate.update("DELETE FROM partner_product_price_memory");

        lenient().when(productClient.lookup(anyList())).thenAnswer(inv -> {
            List<UUID> productIds = inv.getArgument(0);
            return productIds.stream()
                    .map(this::product)
                    .toList();
        });
        lenient().when(productClient.requireExists(any(UUID.class))).thenAnswer(inv -> product(inv.getArgument(0)));
        lenient().when(partnerInternalClient.resolveBusinessNumber(any(UUID.class))).thenReturn(Optional.empty());
        lenient().when(partnerInternalClient.resolvePartnerCode(any(UUID.class))).thenReturn(Optional.empty());
        lenient().when(userInternalClient.resolveFullName(any(UUID.class))).thenReturn(Optional.of("테스트 담당자"));
        lenient().when(warehouseInternalClient.findWarehouseName(any(UUID.class))).thenReturn(Optional.of("테스트 창고"));
    }

    @Test
    void roundTrip_returnsExactVatInclusiveInputPrice() {
        UUID partnerId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        BigDecimal inputPrice = new BigDecimal("123456.78");

        priceMemoryService.remember(partnerId, productId, inputPrice, "actor-a");

        PartnerProductPriceMemoryResponse found = priceMemoryService.find(partnerId, productId)
                .orElseThrow();
        assertThat(found.unitPrice()).isEqualByComparingTo(inputPrice);
        assertThat(found.updatedAt()).isNotNull();
    }

    @Test
    void bulkFind_matchesSingleValuesAndOmitsMissesInRequestOrder() {
        UUID partnerId = UUID.randomUUID();
        UUID firstProductId = UUID.randomUUID();
        UUID missProductId = UUID.randomUUID();
        UUID secondProductId = UUID.randomUUID();
        priceMemoryService.remember(
                partnerId, firstProductId, new BigDecimal("111000.00"), "actor-1");
        priceMemoryService.remember(
                partnerId, secondProductId, new BigDecimal("222000.00"),
                PartnerProductPriceMemory.SOURCE_BUNDLE_SET, "actor-2");

        List<PartnerProductPriceMemoryBulkItemResponse> bulk = priceMemoryService.findAll(
                partnerId, List.of(firstProductId, missProductId, secondProductId));

        assertThat(bulk).extracting(PartnerProductPriceMemoryBulkItemResponse::productId)
                .containsExactly(firstProductId, secondProductId);
        assertThat(bulk.get(0).unitPrice()).isEqualByComparingTo(
                priceMemoryService.find(partnerId, firstProductId).orElseThrow().unitPrice());
        assertThat(bulk.get(1).source()).isEqualTo("BUNDLE_SET");
        assertThat(bulk.get(1).updatedAt()).isEqualTo(
                priceMemoryService.find(partnerId, secondProductId).orElseThrow().updatedAt());
    }

    @Test
    void upsert_updatesExistingRowAndAuditWithoutDuplicatingPair() {
        UUID partnerId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        priceMemoryService.remember(partnerId, productId, new BigDecimal("1000.00"), "actor-1");
        priceMemoryService.remember(partnerId, productId, new BigDecimal("2000.00"), "actor-2");

        Integer rowCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM partner_product_price_memory
                 WHERE partner_id = ? AND product_id = ?
                """, Integer.class, partnerId, productId);
        assertThat(rowCount).isEqualTo(1);

        PriceMemoryRow row = jdbcTemplate.queryForObject("""
                SELECT unit_price, created_by, modified_by, modified_at IS NOT NULL AS has_modified_at
                  FROM partner_product_price_memory
                 WHERE partner_id = ? AND product_id = ?
                """, (rs, rowNum) -> new PriceMemoryRow(
                rs.getBigDecimal("unit_price"),
                rs.getString("created_by"),
                rs.getString("modified_by"),
                rs.getBoolean("has_modified_at")), partnerId, productId);
        assertThat(row).isNotNull();
        assertThat(row.unitPrice()).isEqualByComparingTo("2000.00");
        assertThat(row.createdBy()).isEqualTo("actor-1");
        assertThat(row.modifiedBy()).isEqualTo("actor-2");
        assertThat(row.hasModifiedAt()).isTrue();
    }

    @Test
    void upsert_revivesSoftDeletedRow() {
        UUID partnerId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        priceMemoryService.remember(partnerId, productId, new BigDecimal("1000.00"), "actor-1");
        jdbcTemplate.update("""
                UPDATE partner_product_price_memory
                   SET is_deleted = TRUE,
                       deleted_at = CURRENT_TIMESTAMP,
                       deleted_by = 'deleter'
                 WHERE partner_id = ? AND product_id = ?
                """, partnerId, productId);

        assertThat(priceMemoryService.find(partnerId, productId)).isEmpty();

        priceMemoryService.remember(partnerId, productId, new BigDecimal("3000.00"), "actor-2");

        RevivedRow row = jdbcTemplate.queryForObject("""
                SELECT unit_price,
                       is_deleted,
                       deleted_at IS NULL AS deleted_at_null,
                       deleted_by IS NULL AS deleted_by_null
                  FROM partner_product_price_memory
                 WHERE partner_id = ? AND product_id = ?
                """, (rs, rowNum) -> new RevivedRow(
                rs.getBigDecimal("unit_price"),
                rs.getBoolean("is_deleted"),
                rs.getBoolean("deleted_at_null"),
                rs.getBoolean("deleted_by_null")), partnerId, productId);
        assertThat(row).isNotNull();
        assertThat(row.unitPrice()).isEqualByComparingTo("3000.00");
        assertThat(row.deleted()).isFalse();
        assertThat(row.deletedAtNull()).isTrue();
        assertThat(row.deletedByNull()).isTrue();
    }

    @Test
    void v58Migration_createsRealUniqueConstraintForPartnerProductPair() {
        UUID partnerId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        rawInsert(partnerId, productId, new BigDecimal("1000.00"), "actor-1");

        assertThatThrownBy(() -> rawInsert(partnerId, productId, new BigDecimal("2000.00"), "actor-2"))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    void callerFailSoft_keepsSlipCommittedWhenPriceMemoryRequiresNewFailsOnRealDatabaseConstraint() {
        UUID partnerId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        CreateSlipRequest request = inboundSlipRequest(partnerId, productId, new BigDecimal("99000.00"));

        jdbcTemplate.update("DELETE FROM partner_product_price_memory");
        jdbcTemplate.execute("ALTER TABLE partner_product_price_memory ADD CONSTRAINT "
                + FAIL_CONSTRAINT + " CHECK (unit_price < 0)");
        double failedBefore = meterRegistry.get(PartnerProductPriceMemoryService.UPSERT_FAILED_COUNTER)
                .counter().count();
        UUID createdSlipId = null;
        try {
            var response = slipService.create(request, "actor-fail-soft", "가격기억 실패 테스트");
            createdSlipId = response.id();

            assertThat(slipRepository.findById(createdSlipId)).isPresent();
            awaitUntil(() -> meterRegistry.get(PartnerProductPriceMemoryService.UPSERT_FAILED_COUNTER)
                    .counter().count() >= failedBefore + 1.0, "가격기억 실패 metric 증가");
            Integer memoryRows = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*)
                      FROM partner_product_price_memory
                     WHERE partner_id = ? AND product_id = ?
                    """, Integer.class, partnerId, productId);
            assertThat(memoryRows).isZero();
        } finally {
            try {
                jdbcTemplate.execute("ALTER TABLE partner_product_price_memory DROP CONSTRAINT IF EXISTS " + FAIL_CONSTRAINT);
            } finally {
                if (createdSlipId != null) {
                    cleanupSlip(createdSlipId);
                }
            }
        }
    }

    @Test
    void bundleCreate_remembersParentSetPriceOnlyAndSkipsComponents() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID componentProductId = UUID.randomUUID();
        ProductSummary bundle = bundleProduct(bundleProductId);
        when(productClient.lookup(anyList())).thenReturn(List.of(bundle));
        when(productClient.expand(any(), any(), any(), any())).thenReturn(List.of(
                new ExpandedLineDto(componentProductId, "COMP-1", "COMP-1", "구성품",
                        new BigDecimal("1"), new BigDecimal("1000.00"), "COMPONENT", true)));

        var response = slipService.create(
                inboundSlipRequest(partnerId, bundleProductId, new BigDecimal("550000.00")),
                "actor-bundle", "세트 기억 테스트");
        try {
            PartnerProductPriceMemoryResponse memory = awaitPriceMemory(partnerId, bundleProductId);
            assertThat(memory.unitPrice()).isEqualByComparingTo("550000.00");
            assertThat(memory.source()).isEqualTo("BUNDLE_SET");
            assertThat(priceMemoryService.find(partnerId, componentProductId)).isEmpty();
        } finally {
            cleanupSlip(response.id());
        }
    }

    @Test
    void bundleCreateRollback_doesNotLeaveGhostParentPriceMemory() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        ProductSummary bundle = bundleProduct(bundleProductId);
        when(productClient.lookup(anyList())).thenReturn(List.of(bundle));
        when(productClient.expand(any(), any(), any(), any())).thenReturn(List.of(
                new ExpandedLineDto(null, "MISSING", "MISSING", "미등록",
                        new BigDecimal("1"), new BigDecimal("1000.00"), "COMPONENT", true)));

        assertThatThrownBy(() -> slipService.create(
                inboundSlipRequest(partnerId, bundleProductId, new BigDecimal("660000.00")),
                "actor-rollback", "세트 롤백 테스트"))
                .isInstanceOf(BusinessException.class);

        assertThat(priceMemoryService.find(partnerId, bundleProductId)).isEmpty();
    }

    @Test
    void bundleSlipUnchangedSalesPut_keepsLineageAndDoesNotRememberComponents() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        ProductSummary bundle = bundleProduct(bundleProductId);
        when(productClient.lookup(anyList())).thenAnswer(inv -> {
            List<UUID> productIds = inv.getArgument(0);
            return productIds.stream()
                    .map(productId -> productId.equals(bundleProductId) ? bundle : product(productId))
                    .toList();
        });
        when(productClient.expand(any(), any(), any(), any())).thenReturn(List.of(
                new ExpandedLineDto(firstComponentId, "COMP-1", "COMP-1", "실내기",
                        new BigDecimal("1"), new BigDecimal("330000.00"), "COMPONENT", true),
                new ExpandedLineDto(secondComponentId, "COMP-2", "COMP-2", "실외기",
                        new BigDecimal("1"), new BigDecimal("220000.00"), "COMPONENT", false)));

        var created = slipService.create(
                slipRequest(SlipType.OUTBOUND, partnerId, bundleProductId,
                        new BigDecimal("550000.00")),
                "actor-bundle-sales", "세트 매출 PUT 계보 테스트");
        try {
            awaitPriceMemory(partnerId, bundleProductId);
            LocalDateTime updateToken = slipRepository.findById(created.id())
                    .map(slip -> slip.getModifiedAt() == null ? slip.getCreatedAt() : slip.getModifiedAt())
                    .orElseThrow();

            salesSlipUpdateService.update(
                    created.id(),
                    new SlipUpdateRequest(
                            updateToken,
                            created.partnerId(),
                            created.partnerName(),
                            created.partnerCode(),
                            created.memo(),
                            created.businessNumber(),
                            created.deliveryAddress(),
                            created.supervisionAddress(),
                            created.projectName(),
                            created.recipientPhone(),
                            created.paymentDueDate(),
                            created.lines().stream()
                                    .map(line -> new SlipUpdateRequest.LineRequest(
                                            line.productId(), line.productName(), line.modelName(),
                                            line.specification(), line.quantity(), line.unitPrice(), line.note(), line.id()))
                                    .toList(), true),
                    UUID.randomUUID(),
                    "세트 매출 수정자");
            awaitPriceMemoryExecutorIdle();

            assertBundleSlipLineage(created.id(), firstComponentId, secondComponentId);
            assertOnlyParentBundleMemory(partnerId, bundleProductId,
                    firstComponentId, secondComponentId);
        } finally {
            cleanupSlip(created.id());
        }
    }

    @Test
    void bundleEstimateUnchangedUpdate_keepsLineageAndDoesNotRememberComponents() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        ProductSummary bundle = bundleProduct(bundleProductId);
        when(productClient.lookup(anyList())).thenAnswer(inv -> {
            List<UUID> productIds = inv.getArgument(0);
            return productIds.stream()
                    .map(productId -> productId.equals(bundleProductId) ? bundle : product(productId))
                    .toList();
        });
        when(productClient.expand(any(), any(), any(), any())).thenReturn(List.of(
                new ExpandedLineDto(firstComponentId, "COMP-1", "COMP-1", "실내기",
                        new BigDecimal("1"), new BigDecimal("330000.00"), "COMPONENT", true),
                new ExpandedLineDto(secondComponentId, "COMP-2", "COMP-2", "실외기",
                        new BigDecimal("1"), new BigDecimal("220000.00"), "COMPONENT", false)));

        var created = estimateService.create(
                new CreateEstimateRequest(
                        LocalDate.of(2026, 7, 16), partnerId, "테스트 거래처", null, null,
                        LocalDate.of(2026, 8, 15), "세트 견적 PUT 계보 테스트",
                        List.of(new CreateEstimateRequest.EstimateLineRequest(
                                bundleProductId, "테스트 세트", "SET-809", null,
                                1, new BigDecimal("550000.00"), "세트 라인", null, true))),
                "actor-bundle-estimate", "세트 견적 작성자");
        try {
            awaitPriceMemory(partnerId, bundleProductId);

            estimateService.update(
                    created.id(),
                    new UpdateEstimateRequest(
                            created.partnerId(), created.partnerName(), created.partnerBusinessNo(),
                            created.partnerAddress(), created.validUntil(), created.memo(),
                            created.lines().stream()
                                    .map(line -> new UpdateEstimateRequest.EstimateLineUpdate(
                                            line.productId(), line.productName(), line.modelName(),
                                            line.specification(), line.quantity(),
                                            line.unitPriceWithVat() == null
                                                    ? line.unitPrice() : line.unitPriceWithVat(),
                                            line.note(), null, line.unitPriceWithVat() != null, line.id()))
                                    .toList(), true),
                    "actor-bundle-estimate", "세트 견적 수정자");
            awaitPriceMemoryExecutorIdle();

            assertBundleEstimateLineage(created.id(), firstComponentId, secondComponentId);
            assertOnlyParentBundleMemory(partnerId, bundleProductId,
                    firstComponentId, secondComponentId);
        } finally {
            cleanupEstimate(created.id());
        }
    }

    /**
     * [R7-1 실 PostgreSQL 회귀] 세트 head 구성품의 수량만 수정해도 lineId 로 계보가 유지되고,
     * 구성품 배분가는 LINE_SAVE 가격기억으로 각인되지 않는다.
     */
    @Test
    void lineIdModifiedSetHead_quantityOnly_preservesLineageAndSkipsComponentMemory() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        ProductSummary bundle = bundleProduct(bundleProductId);
        when(productClient.lookup(anyList())).thenAnswer(inv -> {
            List<UUID> productIds = inv.getArgument(0);
            return productIds.stream()
                    .map(productId -> productId.equals(bundleProductId) ? bundle : product(productId))
                    .toList();
        });
        when(productClient.expand(any(), any(), any(), any())).thenReturn(List.of(
                new ExpandedLineDto(firstComponentId, "COMP-1", "COMP-1", "구성품A",
                        new BigDecimal("2"), new BigDecimal("80000.00"), "COMPONENT", true),
                new ExpandedLineDto(secondComponentId, "COMP-2", "COMP-2", "구성품B",
                        new BigDecimal("1"), new BigDecimal("40000.00"), "COMPONENT", false)));

        var created = slipService.create(
                slipRequest(SlipType.OUTBOUND, partnerId, bundleProductId,
                        new BigDecimal("120000.00")),
                "actor-r7-head", "R7 head 수량 수정");
        try {
            awaitPriceMemory(partnerId, bundleProductId);
            var updated = salesSlipUpdateService.update(
                    created.id(),
                    new SlipUpdateRequest(
                            currentSlipUpdatedAt(created.id()),
                            created.partnerId(),
                            created.partnerName(), created.partnerCode(), created.memo(),
                            created.businessNumber(), created.deliveryAddress(),
                            created.supervisionAddress(), created.projectName(),
                            created.recipientPhone(), created.paymentDueDate(),
                            created.lines().stream()
                                    .map(line -> new SlipUpdateRequest.LineRequest(
                                            line.productId(), line.productName(), line.modelName(),
                                            line.specification(), line.setHead() ? 3 : line.quantity(),
                                            line.unitPrice(), line.note(), line.id()))
                                    .toList(), true),
                    UUID.randomUUID(), "R7 head 수정자");
            awaitPriceMemoryExecutorIdle();

            assertThat(updated.lines()).anySatisfy(line -> {
                assertThat(line.productId()).isEqualTo(firstComponentId);
                assertThat(line.quantity()).isEqualTo(3);
                assertThat(line.setHead()).isTrue();
                assertThat(line.parentSetModel()).isEqualTo("SET-809");
            });
            assertThat(priceMemoryService.find(partnerId, firstComponentId)).isEmpty();
            assertThat(priceMemoryService.find(partnerId, secondComponentId)).isEmpty();
        } finally {
            cleanupSlip(created.id());
        }
    }

    /**
     * [R7-2·3 실 PostgreSQL 회귀] 같은 productId 의 세트 구성품(qty=1)과 단품(qty=3)을
     * 각각 2·4로 수정해도 lineId 계보가 뒤바뀌지 않으며, 요청 순서를 바꾼 재저장도 동일하다.
     */
    @Test
    void lineIdSameProductComponentAndPlainLine_areStableAcrossRequestOrder() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID sharedProductId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        ProductSummary bundle = bundleProduct(bundleProductId);
        when(productClient.lookup(anyList())).thenAnswer(inv -> {
            List<UUID> productIds = inv.getArgument(0);
            return productIds.stream()
                    .map(productId -> productId.equals(bundleProductId) ? bundle : product(productId))
                    .toList();
        });
        when(productClient.expand(any(), any(), any(), any())).thenReturn(List.of(
                new ExpandedLineDto(sharedProductId, "SHARED", "SHARED", "공유 구성품",
                        new BigDecimal("1"), new BigDecimal("80000.00"), "COMPONENT", true),
                new ExpandedLineDto(secondComponentId, "COMP-2", "COMP-2", "구성품B",
                        new BigDecimal("1"), new BigDecimal("40000.00"), "COMPONENT", false)));

        var created = slipService.create(
                slipRequestWithLines(SlipType.OUTBOUND, partnerId, List.of(
                        new CreateSlipRequest.SlipLineRequest(
                                bundleProductId, "세트", "SET-809", null, 1,
                                new BigDecimal("120000.00"), "세트", null, true),
                        new CreateSlipRequest.SlipLineRequest(
                                sharedProductId, "단품", "SHARED", null, 3,
                                new BigDecimal("120000.00"), "단품", null, true))),
                "actor-r7-order", "R7 요청순서 테스트");
        try {
            awaitPriceMemory(partnerId, bundleProductId);
            var head = created.lines().stream().filter(line -> line.setHead()).findFirst().orElseThrow();
            var plain = created.lines().stream()
                    .filter(line -> sharedProductId.equals(line.productId()) && !line.setHead()
                            && line.parentSetModel() == null)
                    .findFirst().orElseThrow();
            var otherComponent = created.lines().stream()
                    .filter(line -> secondComponentId.equals(line.productId())).findFirst().orElseThrow();

            var firstUpdate = salesSlipUpdateService.update(
                    created.id(),
                    updateRequest(created.id(), created, List.of(
                            lineRequest(plain, 4, new BigDecimal("120000.00")),
                            lineRequest(head, 2, head.unitPrice()),
                            lineRequest(otherComponent, 1, otherComponent.unitPrice()))),
                    UUID.randomUUID(), "R7 순서1 수정자");
            awaitPriceMemoryExecutorIdle();
            assertThat(lineageQuantityRows(created.id())).containsExactlyInAnyOrder(
                    new LineageQuantityRow(sharedProductId, 2, true, "SET-809"),
                    new LineageQuantityRow(sharedProductId, 4, false, null),
                    new LineageQuantityRow(secondComponentId, 1, false, "SET-809"));
            assertThat(awaitPriceMemoryValue(partnerId, sharedProductId,
                    new BigDecimal("132000.00")).source())
                    .isEqualTo(PartnerProductPriceMemory.SOURCE_LINE_SAVE);
            assertThat(priceMemoryService.find(partnerId, secondComponentId)).isEmpty();

            // 같은 값을 반대 순서로 다시 PUT — 결과가 요청 순서에 의존하지 않아야 한다.
            salesSlipUpdateService.update(
                    created.id(),
                    updateRequest(created.id(), firstUpdate,
                            reversedLines(firstUpdate.lines().stream().map(line -> line.setHead()
                                    ? lineRequest(line, 2, line.unitPrice())
                                    : line.parentSetModel() == null
                                            ? lineRequest(line, 4, new BigDecimal("120000.00"))
                                            : lineRequest(line, 1, line.unitPrice())
                            ).toList())),
                    UUID.randomUUID(), "R7 순서2 수정자");
            awaitPriceMemoryExecutorIdle();
            assertThat(lineageQuantityRows(created.id())).containsExactlyInAnyOrder(
                    new LineageQuantityRow(sharedProductId, 2, true, "SET-809"),
                    new LineageQuantityRow(sharedProductId, 4, false, null),
                    new LineageQuantityRow(secondComponentId, 1, false, "SET-809"));
        } finally {
            cleanupSlip(created.id());
        }
    }

    @Test
    void lineIdFromAnotherSlip_isRejectedAsBadRequestBeforeReplacement() {
        UUID partnerId = UUID.randomUUID();
        var first = slipService.create(
                inboundSlipRequest(partnerId, UUID.randomUUID(), new BigDecimal("10000.00")),
                "actor-r7-owner-1", "소유권 전표1");
        var second = slipService.create(
                inboundSlipRequest(partnerId, UUID.randomUUID(), new BigDecimal("20000.00")),
                "actor-r7-owner-2", "소유권 전표2");
        try {
            assertThatThrownBy(() -> slipUpdateService.update(
                    first.id(),
                    updateRequest(first.id(), first, List.of(
                            new SlipUpdateRequest.LineRequest(
                                    first.lines().get(0).productId(),
                                    first.lines().get(0).productName(),
                                    first.lines().get(0).modelName(),
                                    first.lines().get(0).specification(),
                                    first.lines().get(0).quantity(),
                                    first.lines().get(0).unitPrice(),
                                    first.lines().get(0).note(),
                                    second.lines().get(0).id()))),
                    UUID.randomUUID(), "소유권 공격자"))
                    .isInstanceOfSatisfying(BusinessException.class, ex ->
                            assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));
        } finally {
            cleanupSlip(first.id());
            cleanupSlip(second.id());
        }
    }

    /**
     * [R6-H1 BE 변형 회귀] 신규 라인(동일 품목, qty3·123,000)이 요청 맨 앞에 와도 세트 head 를
     * 탈취하지 못하고, 무수정 재전송된 진짜 구성품이 계보를 보존하며, 구성품 배분가가 아니라
     * 신규 일반 라인의 단가만 기억되어야 한다.
     */
    @Test
    void bundleSalesPutWithNewLineFirst_doesNotStealHeadOrImprintAllocatedPrice() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        ProductSummary bundle = bundleProduct(bundleProductId);
        when(productClient.lookup(anyList())).thenAnswer(inv -> {
            List<UUID> productIds = inv.getArgument(0);
            return productIds.stream()
                    .map(productId -> productId.equals(bundleProductId) ? bundle : product(productId))
                    .toList();
        });
        when(productClient.expand(any(), any(), any(), any())).thenReturn(List.of(
                new ExpandedLineDto(firstComponentId, "COMP-1", "COMP-1", "실내기",
                        new BigDecimal("1"), new BigDecimal("330000.00"), "COMPONENT", true),
                new ExpandedLineDto(secondComponentId, "COMP-2", "COMP-2", "실외기",
                        new BigDecimal("1"), new BigDecimal("220000.00"), "COMPONENT", false)));

        var created = slipService.create(
                slipRequest(SlipType.OUTBOUND, partnerId, bundleProductId,
                        new BigDecimal("550000.00")),
                "actor-be-variant", "BE 변형 재현");
        try {
            awaitPriceMemory(partnerId, bundleProductId);
            LocalDateTime updateToken = slipRepository.findById(created.id())
                    .map(slip -> slip.getModifiedAt() == null ? slip.getCreatedAt() : slip.getModifiedAt())
                    .orElseThrow();

            // 신규 라인을 맨 앞에 — 종전 per-line greedy 가 head 를 선소비하던 정확한 배치
            List<SlipUpdateRequest.LineRequest> putLines = new ArrayList<>();
            putLines.add(new SlipUpdateRequest.LineRequest(
                    firstComponentId, "COMP-1", "COMP-1", "실내기",
                    3, new BigDecimal("123000.00"), "신규 단품", null));
            created.lines().forEach(line -> putLines.add(new SlipUpdateRequest.LineRequest(
                    line.productId(), line.productName(), line.modelName(),
                    line.specification(), line.quantity(), line.unitPrice(), line.note(), line.id())));

            salesSlipUpdateService.update(
                    created.id(),
                    new SlipUpdateRequest(
                            updateToken,
                            created.partnerId(),
                            created.partnerName(),
                            created.partnerCode(),
                            created.memo(),
                            created.businessNumber(),
                            created.deliveryAddress(),
                            created.supervisionAddress(),
                            created.projectName(),
                            created.recipientPhone(),
                            created.paymentDueDate(),
                            putLines, true),
                    UUID.randomUUID(),
                    "BE 변형 수정자");
            awaitPriceMemoryExecutorIdle();

            // 계보: 재전송 구성품이 head/parent 를 그대로 보존, 신규 qty3 라인은 일반 라인
            int componentQuantity = created.lines().stream()
                    .filter(line -> firstComponentId.equals(line.productId()))
                    .findFirst().orElseThrow().quantity();
            assertThat(lineageQuantityRows(created.id())).containsExactlyInAnyOrder(
                    new LineageQuantityRow(firstComponentId, componentQuantity, true, "SET-809"),
                    new LineageQuantityRow(secondComponentId, 1, false, "SET-809"),
                    new LineageQuantityRow(firstComponentId, 3, false, null));

            // 기억: 신규 일반 라인 123,000×1.1 만 — 구성품 배분가(재전송 라인)가 기억되면
            // 마지막 command 가 이겨 값이 어긋난다
            PartnerProductPriceMemoryResponse memory = awaitPriceMemoryValue(
                    partnerId, firstComponentId, new BigDecimal("135300.00"));
            assertThat(memory.source()).isEqualTo(PartnerProductPriceMemory.SOURCE_LINE_SAVE);
            assertThat(priceMemoryService.find(partnerId, secondComponentId)).isEmpty();
            assertThat(priceMemoryService.find(partnerId, bundleProductId).orElseThrow().source())
                    .isEqualTo(PartnerProductPriceMemory.SOURCE_BUNDLE_SET);
        } finally {
            cleanupSlip(created.id());
        }
    }

    /**
     * [R6-H1 QA 변형 회귀] 세트(head+구성품)와 같은 품목 단품(77,000)이 공존하는 견적에서
     * 세트 head 삭제 + 단품 88,000 수정 시: 단품이 head 로 오귀속되지 않고, 사용자 최신 단가
     * 88,000 이 기억되어야 한다 (결함에선 77,000 고착 + head 오귀속).
     */
    @Test
    void bundleEstimateHeadDeletedAndStandaloneRepriced_staysPlainAndRemembersLatestPrice() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        ProductSummary bundle = bundleProduct(bundleProductId);
        when(productClient.lookup(anyList())).thenAnswer(inv -> {
            List<UUID> productIds = inv.getArgument(0);
            return productIds.stream()
                    .map(productId -> productId.equals(bundleProductId) ? bundle : product(productId))
                    .toList();
        });
        when(productClient.expand(any(), any(), any(), any())).thenReturn(List.of(
                new ExpandedLineDto(firstComponentId, "COMP-1", "COMP-1", "실내기",
                        new BigDecimal("1"), new BigDecimal("330000.00"), "COMPONENT", true),
                new ExpandedLineDto(secondComponentId, "COMP-2", "COMP-2", "실외기",
                        new BigDecimal("1"), new BigDecimal("220000.00"), "COMPONENT", false)));

        var created = estimateService.create(
                new CreateEstimateRequest(
                        LocalDate.of(2026, 7, 16), partnerId, "테스트 거래처", null, null,
                        LocalDate.of(2026, 8, 15), "QA 변형 재현",
                        List.of(
                                new CreateEstimateRequest.EstimateLineRequest(
                                        bundleProductId, "테스트 세트", "SET-809", null,
                                        1, new BigDecimal("550000.00"), "세트 라인", null, true),
                                new CreateEstimateRequest.EstimateLineRequest(
                                        firstComponentId, "COMP-1", "COMP-1", null,
                                        1, new BigDecimal("77000.00"), "단품 라인", null, true))),
                "actor-qa-variant", "QA 변형 작성자");
        try {
            awaitPriceMemoryValue(partnerId, firstComponentId, new BigDecimal("77000.00"));
            var componentLine = created.lines().stream()
                    .filter(line -> secondComponentId.equals(line.productId()))
                    .findFirst().orElseThrow();
            var standaloneLine = created.lines().stream()
                    .filter(line -> firstComponentId.equals(line.productId()) && !line.setHead())
                    .findFirst().orElseThrow();

            // 세트 head 미재전송(명시 삭제) + tail/기존 단품은 각자의 lineId를 유지해 재전송.
            // 단품을 lineId=null로 보내면 신규 라인이라는 새 계약과 모순되어 R9 Gate가 정상 거부한다.
            estimateService.update(
                    created.id(),
                    new UpdateEstimateRequest(
                            created.partnerId(), created.partnerName(), created.partnerBusinessNo(),
                            created.partnerAddress(), created.validUntil(), created.memo(),
                            List.of(
                                    new UpdateEstimateRequest.EstimateLineUpdate(
                                            componentLine.productId(), componentLine.productName(),
                                            componentLine.modelName(), componentLine.specification(),
                                            componentLine.quantity(),
                                            componentLine.unitPriceWithVat() == null
                                                    ? componentLine.unitPrice()
                                                    : componentLine.unitPriceWithVat(),
                                            componentLine.note(), null,
                                            componentLine.unitPriceWithVat() != null, componentLine.id()),
                                    new UpdateEstimateRequest.EstimateLineUpdate(
                                            firstComponentId, "COMP-1", "COMP-1", null, 1,
                                            new BigDecimal("88000.00"), "단품 라인", null, true,
                                            standaloneLine.id())), true),
                    "actor-qa-variant", "QA 변형 수정자");
            awaitPriceMemoryExecutorIdle();

            // 단품이 head 로 오귀속되지 않고 일반 라인으로 남는다 (잔존 구성품 계보는 보존)
            List<BundleLineageRow> rows = jdbcTemplate.query("""
                    SELECT product_id, set_head, parent_set_model
                      FROM estimate_lines
                     WHERE estimate_id = ? AND is_deleted = FALSE
                     ORDER BY line_no
                    """, (rs, rowNum) -> new BundleLineageRow(
                    rs.getObject("product_id", UUID.class),
                    rs.getBoolean("set_head"),
                    rs.getString("parent_set_model")), created.id());
            assertThat(rows).containsExactly(
                    new BundleLineageRow(secondComponentId, false, "SET-809"),
                    new BundleLineageRow(firstComponentId, false, null));

            // 사용자 최신 단가 88,000 이 기억된다 (결함: 77,000 침묵 고착)
            PartnerProductPriceMemoryResponse memory = awaitPriceMemoryValue(
                    partnerId, firstComponentId, new BigDecimal("88000.00"));
            assertThat(memory.source()).isEqualTo(PartnerProductPriceMemory.SOURCE_LINE_SAVE);
            assertThat(priceMemoryService.find(partnerId, secondComponentId)).isEmpty();
        } finally {
            cleanupEstimate(created.id());
        }
    }

    /**
     * [R6-L4 INBOUND 미러 회귀] 매입(INBOUND) direct PUT 무수정 재전송에서도 세트 계보가
     * 보존되고 구성품이 기억되지 않아야 한다 — addSlipLinesExpanded 는 slipType 비gate.
     */
    @Test
    void bundleSlipUnchangedPurchasePut_keepsLineageAndDoesNotRememberComponents() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        ProductSummary bundle = bundleProduct(bundleProductId);
        when(productClient.lookup(anyList())).thenAnswer(inv -> {
            List<UUID> productIds = inv.getArgument(0);
            return productIds.stream()
                    .map(productId -> productId.equals(bundleProductId) ? bundle : product(productId))
                    .toList();
        });
        when(productClient.expand(any(), any(), any(), any())).thenReturn(List.of(
                new ExpandedLineDto(firstComponentId, "COMP-1", "COMP-1", "실내기",
                        new BigDecimal("1"), new BigDecimal("330000.00"), "COMPONENT", true),
                new ExpandedLineDto(secondComponentId, "COMP-2", "COMP-2", "실외기",
                        new BigDecimal("1"), new BigDecimal("220000.00"), "COMPONENT", false)));

        var created = slipService.create(
                slipRequest(SlipType.INBOUND, partnerId, bundleProductId,
                        new BigDecimal("550000.00")),
                "actor-bundle-purchase", "세트 매입 PUT 계보 테스트");
        try {
            awaitPriceMemory(partnerId, bundleProductId);
            LocalDateTime updateToken = slipRepository.findById(created.id())
                    .map(slip -> slip.getModifiedAt() == null ? slip.getCreatedAt() : slip.getModifiedAt())
                    .orElseThrow();

            slipUpdateService.update(
                    created.id(),
                    new SlipUpdateRequest(
                            updateToken,
                            created.partnerId(),
                            created.partnerName(),
                            created.partnerCode(),
                            created.memo(),
                            created.businessNumber(),
                            created.deliveryAddress(),
                            created.supervisionAddress(),
                            created.projectName(),
                            created.recipientPhone(),
                            created.paymentDueDate(),
                            created.lines().stream()
                                    .map(line -> new SlipUpdateRequest.LineRequest(
                                            line.productId(), line.productName(), line.modelName(),
                                            line.specification(), line.quantity(), line.unitPrice(), line.note(), line.id()))
                                    .toList(), true),
                    UUID.randomUUID(),
                    "세트 매입 수정자");
            awaitPriceMemoryExecutorIdle();

            assertBundleSlipLineage(created.id(), firstComponentId, secondComponentId);
            assertOnlyParentBundleMemory(partnerId, bundleProductId,
                    firstComponentId, secondComponentId);
        } finally {
            cleanupSlip(created.id());
        }
    }

    /**
     * [R6-H3 회귀 — 전표] 세트 전표 생성 → 버전이력 복원 → 무수정 재저장 순서에서 계보가
     * 전 구간 보존되고 구성품 기억이 0건이어야 한다 (결함: 스냅샷에 계보 필드가 없어 복원 시
     * 평면화 → 이후 저장 1회면 배분가 각인).
     */
    @Test
    void bundleSlipRevisionRestore_preservesLineage_thenUnchangedPutDoesNotImprintComponents() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        ProductSummary bundle = bundleProduct(bundleProductId);
        when(productClient.lookup(anyList())).thenAnswer(inv -> {
            List<UUID> productIds = inv.getArgument(0);
            return productIds.stream()
                    .map(productId -> productId.equals(bundleProductId) ? bundle : product(productId))
                    .toList();
        });
        when(productClient.expand(any(), any(), any(), any())).thenReturn(List.of(
                new ExpandedLineDto(firstComponentId, "COMP-1", "COMP-1", "실내기",
                        new BigDecimal("1"), new BigDecimal("330000.00"), "COMPONENT", true),
                new ExpandedLineDto(secondComponentId, "COMP-2", "COMP-2", "실외기",
                        new BigDecimal("1"), new BigDecimal("220000.00"), "COMPONENT", false)));

        var created = slipService.create(
                slipRequest(SlipType.OUTBOUND, partnerId, bundleProductId,
                        new BigDecimal("550000.00")),
                "actor-restore-slip", "세트 복원 테스트");
        try {
            awaitPriceMemory(partnerId, bundleProductId);

            // revision 1(CREATE 스냅샷)로 point-in-time 복원 — 계보 소실 여부 검증 지점
            var restored = slipService.restoreToRevision(
                    created.id(), 1, UUID.randomUUID().toString(), "복원 사용자");
            assertBundleSlipLineage(created.id(), firstComponentId, secondComponentId);

            // 복원 직후 무수정 재저장 — 결함이라면 이 1회로 구성품 배분가가 각인된다
            LocalDateTime updateToken = slipRepository.findById(created.id())
                    .map(slip -> slip.getModifiedAt() == null ? slip.getCreatedAt() : slip.getModifiedAt())
                    .orElseThrow();
            salesSlipUpdateService.update(
                    created.id(),
                    new SlipUpdateRequest(
                            updateToken,
                            restored.partnerId(),
                            restored.partnerName(),
                            restored.partnerCode(),
                            restored.memo(),
                            restored.businessNumber(),
                            restored.deliveryAddress(),
                            restored.supervisionAddress(),
                            restored.projectName(),
                            restored.recipientPhone(),
                            restored.paymentDueDate(),
                            restored.lines().stream()
                                    .map(line -> new SlipUpdateRequest.LineRequest(
                                            line.productId(), line.productName(), line.modelName(),
                                            line.specification(), line.quantity(), line.unitPrice(), line.note(), line.id()))
                                    .toList(), true),
                    UUID.randomUUID(),
                    "복원 후 수정자");
            awaitPriceMemoryExecutorIdle();

            assertBundleSlipLineage(created.id(), firstComponentId, secondComponentId);
            assertOnlyParentBundleMemory(partnerId, bundleProductId,
                    firstComponentId, secondComponentId);
        } finally {
            cleanupSlip(created.id());
        }
    }

    /**
     * [R6-H3 회귀 — 견적] 세트 견적 생성 → 버전이력 복원 → 무수정 재저장에서 계보 보존 +
     * 구성품 기억 0건 (전표 미러 — EstimateSnapshot.Line 계보 필드 회귀 락인).
     */
    @Test
    void bundleEstimateRevisionRestore_preservesLineage_thenUnchangedUpdateDoesNotImprintComponents() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        ProductSummary bundle = bundleProduct(bundleProductId);
        when(productClient.lookup(anyList())).thenAnswer(inv -> {
            List<UUID> productIds = inv.getArgument(0);
            return productIds.stream()
                    .map(productId -> productId.equals(bundleProductId) ? bundle : product(productId))
                    .toList();
        });
        when(productClient.expand(any(), any(), any(), any())).thenReturn(List.of(
                new ExpandedLineDto(firstComponentId, "COMP-1", "COMP-1", "실내기",
                        new BigDecimal("1"), new BigDecimal("330000.00"), "COMPONENT", true),
                new ExpandedLineDto(secondComponentId, "COMP-2", "COMP-2", "실외기",
                        new BigDecimal("1"), new BigDecimal("220000.00"), "COMPONENT", false)));

        var created = estimateService.create(
                new CreateEstimateRequest(
                        LocalDate.of(2026, 7, 16), partnerId, "테스트 거래처", null, null,
                        LocalDate.of(2026, 8, 15), "세트 견적 복원 테스트",
                        List.of(new CreateEstimateRequest.EstimateLineRequest(
                                bundleProductId, "테스트 세트", "SET-809", null,
                                1, new BigDecimal("550000.00"), "세트 라인", null, true))),
                "actor-restore-estimate", "세트 견적 복원 작성자");
        try {
            awaitPriceMemory(partnerId, bundleProductId);

            var restored = estimateService.restoreToRevision(
                    created.id(), 1, "actor-restore-estimate", "복원 사용자");
            assertBundleEstimateLineage(created.id(), firstComponentId, secondComponentId);

            // 복원 직후 무수정 재저장 (#822 fix 후 복원 라인은 unitPriceWithVat 를 보존하므로
            // VAT 포함 단가+true 로 재전송된다 — null 분기는 legacy 라인 하위호환용으로 유지)
            estimateService.update(
                    created.id(),
                    new UpdateEstimateRequest(
                            restored.partnerId(), restored.partnerName(), restored.partnerBusinessNo(),
                            restored.partnerAddress(), restored.validUntil(), restored.memo(),
                            restored.lines().stream()
                                    .map(line -> new UpdateEstimateRequest.EstimateLineUpdate(
                                            line.productId(), line.productName(), line.modelName(),
                                            line.specification(), line.quantity(),
                                            line.unitPriceWithVat() == null
                                                    ? line.unitPrice() : line.unitPriceWithVat(),
                                            line.note(), null, line.unitPriceWithVat() != null, line.id()))
                                    .toList(), true),
                    "actor-restore-estimate", "복원 후 수정자");
            awaitPriceMemoryExecutorIdle();

            assertBundleEstimateLineage(created.id(), firstComponentId, secondComponentId);
            assertOnlyParentBundleMemory(partnerId, bundleProductId,
                    firstComponentId, secondComponentId);
        } finally {
            cleanupEstimate(created.id());
        }
    }

    /**
     * [R6-H2 회귀] 서버측 전표 복사가 세트 계보(금액 권위값 포함)를 그대로 승계하고,
     * 가격기억은 일반 라인만 재각인하며 구성품은 제외해야 한다 (결함: FE 평면 재-POST 복사가
     * 1클릭마다 구성품 배분가를 각인 + 세트 표시 소실).
     */
    @Test
    void duplicateBundleSlip_serverSideCopy_preservesLineageAndSkipsComponentMemory() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        UUID plainProductId = UUID.randomUUID();
        ProductSummary bundle = bundleProduct(bundleProductId);
        when(productClient.lookup(anyList())).thenAnswer(inv -> {
            List<UUID> productIds = inv.getArgument(0);
            return productIds.stream()
                    .map(productId -> productId.equals(bundleProductId) ? bundle : product(productId))
                    .toList();
        });
        when(productClient.expand(any(), any(), any(), any())).thenReturn(List.of(
                new ExpandedLineDto(firstComponentId, "COMP-1", "COMP-1", "실내기",
                        new BigDecimal("1"), new BigDecimal("330000.00"), "COMPONENT", true),
                new ExpandedLineDto(secondComponentId, "COMP-2", "COMP-2", "실외기",
                        new BigDecimal("1"), new BigDecimal("220000.00"), "COMPONENT", false)));

        var source = slipService.create(
                slipRequestWithLines(SlipType.OUTBOUND, partnerId, List.of(
                        new CreateSlipRequest.SlipLineRequest(
                                bundleProductId, "테스트 세트", "SET-809", null,
                                1, new BigDecimal("550000.00"), "세트 라인", null, true),
                        new CreateSlipRequest.SlipLineRequest(
                                plainProductId, "일반 품목", "PLAIN-809", null,
                                1, new BigDecimal("99000.00"), "일반 라인", null, true))),
                "actor-duplicate-src", "복사 원본 작성자");
        UUID copyId = null;
        try {
            awaitPriceMemoryValue(partnerId, plainProductId, new BigDecimal("99000.00"));
            // 복사 전 일반 품목 기억을 다른 값으로 바꿔, 복사가 서버측에서 재각인함을 구분 검증
            priceMemoryService.remember(
                    partnerId, plainProductId, new BigDecimal("111111.00"), "actor-poison");

            var copy = slipDuplicateService.duplicate(
                    source.id(), UUID.randomUUID().toString(), "복사 실행자");
            copyId = copy.id();
            awaitPriceMemoryExecutorIdle();

            assertThat(copy.id()).isNotEqualTo(source.id());
            assertThat(copy.slipNo()).isNotEqualTo(source.slipNo());

            // 복사본 계보 + 일반 라인 금액 권위값 verbatim 승계
            assertThat(lineageQuantityRows(copy.id())).containsExactlyInAnyOrder(
                    new LineageQuantityRow(firstComponentId, 1, true, "SET-809"),
                    new LineageQuantityRow(secondComponentId, 1, false, "SET-809"),
                    new LineageQuantityRow(plainProductId, 1, false, null));
            BigDecimal copiedPlainVatPrice = jdbcTemplate.queryForObject("""
                    SELECT unit_price_with_vat
                      FROM slip_lines
                     WHERE slip_id = ? AND product_id = ? AND is_deleted = FALSE
                    """, BigDecimal.class, copy.id(), plainProductId);
            assertThat(copiedPlainVatPrice).isEqualByComparingTo("99000.00");

            // 기억: 일반 라인만 복사값으로 재각인, 구성품 2종 제외, 세트 parent 는 생성 시점
            // BUNDLE_SET 유지 (복사는 세트 단가 사용자 입력이 없으므로 BUNDLE_SET 미기록)
            PartnerProductPriceMemoryResponse plainMemory = awaitPriceMemoryValue(
                    partnerId, plainProductId, new BigDecimal("99000.00"));
            assertThat(plainMemory.source()).isEqualTo(PartnerProductPriceMemory.SOURCE_LINE_SAVE);
            assertThat(priceMemoryService.find(partnerId, firstComponentId)).isEmpty();
            assertThat(priceMemoryService.find(partnerId, secondComponentId)).isEmpty();
            assertThat(priceMemoryService.find(partnerId, bundleProductId).orElseThrow().source())
                    .isEqualTo(PartnerProductPriceMemory.SOURCE_BUNDLE_SET);
        } finally {
            try {
                if (copyId != null) {
                    cleanupSlip(copyId);
                }
            } finally {
                cleanupSlip(source.id());
            }
        }
    }

    @Test
    void afterCommitExecutionInversion_keepsLaterLogicalSave() {
        UUID partnerId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        List<Runnable> queuedTasks = new ArrayList<>();
        Executor collectingExecutor = queuedTasks::add;
        PartnerProductPriceMemoryService controlledService = new PartnerProductPriceMemoryService(
                priceMemoryRepository,
                priceMemoryBatchRepository,
                clock,
                priceMemoryJdbcAccess,
                meterRegistry,
                priceMemoryProperties,
                collectingExecutor);

        PartnerProductPriceMemoryCommand firstLogicalSave = new PartnerProductPriceMemoryCommand(
                partnerId, productId, new BigDecimal("100000.00"),
                PartnerProductPriceMemory.SOURCE_LINE_SAVE, "actor-a",
                LocalDateTime.of(2026, 7, 15, 10, 0));
        PartnerProductPriceMemoryCommand laterLogicalSave = new PartnerProductPriceMemoryCommand(
                partnerId, productId, new BigDecimal("200000.00"),
                PartnerProductPriceMemory.SOURCE_LINE_SAVE, "actor-b",
                LocalDateTime.of(2026, 7, 15, 10, 1));

        TransactionSynchronization firstAfterCommit = registerAfterCommit(
                controlledService, firstLogicalSave, "first-logical-save");
        TransactionSynchronization laterAfterCommit = registerAfterCommit(
                controlledService, laterLogicalSave, "later-logical-save");

        // 결함 재현 순서: 논리 저장은 A→B 였지만 afterCommit 실행/flush 는 B→A 로 역전한다.
        laterAfterCommit.afterCommit();
        firstAfterCommit.afterCommit();
        assertThat(queuedTasks).hasSize(2);
        queuedTasks.forEach(Runnable::run);

        PartnerProductPriceMemoryResponse found = priceMemoryService.find(partnerId, productId).orElseThrow();
        assertThat(found.unitPrice()).isEqualByComparingTo("200000.00");
        assertThat(found.updatedAt()).isEqualTo(LocalDateTime.of(2026, 7, 15, 10, 1));
    }

    @Test
    void purchasePut_remembersVatInclusivePriceAfterMultiply() {
        UUID partnerId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        BigDecimal supplyPrice = new BigDecimal("135000.00");
        BigDecimal expectedVatInclusivePrice = new BigDecimal("148500.00");
        var created = slipService.create(
                inboundSlipRequest(partnerId, productId, new BigDecimal("120000.00")),
                "actor-purchase-create", "구매 PUT 가격기억 준비");
        var currentSlip = slipRepository.findById(created.id()).orElseThrow();
        LocalDateTime updateToken = currentSlip.getModifiedAt() == null
                ? currentSlip.getCreatedAt()
                : currentSlip.getModifiedAt();

        try {
            var updated = slipUpdateService.update(
                    created.id(),
                    new SlipUpdateRequest(
                            updateToken,
                            partnerId,
                            "테스트 거래처",
                            "P-809-PUT",
                            "구매 PUT VAT 포함 가격기억",
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            List.of(new SlipUpdateRequest.LineRequest(
                                    productId, "테스트 품목", "MODEL-809", null,
                                    1, supplyPrice, "구매 수정 라인", null)), true),
                    UUID.randomUUID(),
                    "구매 수정자");

            assertThat(updated.lines()).singleElement().satisfies(line ->
                    assertThat(line.unitPrice()).isEqualByComparingTo(supplyPrice));
            PartnerProductPriceMemoryResponse memory = awaitPriceMemoryValue(
                    partnerId, productId, expectedVatInclusivePrice);
            assertThat(memory.unitPrice()).isEqualByComparingTo(expectedVatInclusivePrice);
        } finally {
            cleanupSlip(created.id());
        }
    }

    @Test
    void duplicateSlip_roundTripsNonLegacyVatInclusivePrice() {
        UUID partnerId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        BigDecimal copiedVatInclusivePrice = new BigDecimal("321000.00");

        // desktop duplicateSlip 이 non-legacy 행에 보내는 BE 계약: 원 VAT 포함값 + priceVatInclusive=true.
        var duplicated = slipService.create(
                inboundSlipRequest(partnerId, productId, copiedVatInclusivePrice),
                "actor-duplicate", "전표 복사 VAT 포함 라운드트립");
        try {
            assertThat(duplicated.lines()).singleElement().satisfies(line ->
                    assertThat(line.unitPriceWithVat()).isEqualByComparingTo(copiedVatInclusivePrice));
            PartnerProductPriceMemoryResponse memory = awaitPriceMemoryValue(
                    partnerId, productId, copiedVatInclusivePrice);
            assertThat(memory.unitPrice()).isEqualByComparingTo(copiedVatInclusivePrice);
        } finally {
            cleanupSlip(duplicated.id());
        }
    }

    @Test
    void mobileQuotation_remembersVatInclusivePrice() {
        UUID partnerId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        BigDecimal mobileSupplyPrice = new BigDecimal("500000.00");
        BigDecimal expectedVatInclusivePrice = new BigDecimal("550000.00");
        when(partnerInternalClient.verifyPartnerCode("P-809-MOBILE"))
                .thenReturn(PartnerInternalClient.PartnerVerifyResult.found(Optional.of(partnerId)));

        var quotation = mobileQuotationService.createQuotation(
                new MobileQuotationRequest(
                        "P-809-MOBILE",
                        LocalDate.of(2026, 7, 15),
                        LocalDate.of(2026, 8, 14),
                        "모바일 견적 VAT 포함 가격기억",
                        List.of(new MobileQuotationRequest.MobileQuotationLineRequest(
                                productId, "테스트 품목", "MODEL-809", null,
                                1, mobileSupplyPrice, "모바일 견적 라인"))),
                "actor-mobile");
        try {
            PartnerProductPriceMemoryResponse memory = awaitPriceMemoryValue(
                    partnerId, productId, expectedVatInclusivePrice);
            assertThat(memory.unitPrice()).isEqualByComparingTo(expectedVatInclusivePrice);
        } finally {
            cleanupEstimate(quotation.id());
        }
    }

    @Test
    void softDeletedPartnerOrProduct_stillReturnsMemoryForDocumentEditing() {
        UUID softDeletedPartnerId = UUID.randomUUID();
        UUID softDeletedProductId = UUID.randomUUID();
        BigDecimal rememberedPrice = new BigDecimal("777000.00");

        // 거래처/품목의 soft-delete 상태는 각 외부 서비스 소관이다. 가격기억 조회는 생존 확인 RPC나
        // FK join 없이 활성 memory row 자체를 반환해야 기존 전표·견적 편집 단가가 보존된다(D-R3-3).
        priceMemoryService.remember(
                softDeletedPartnerId, softDeletedProductId, rememberedPrice, "document-editor");

        PartnerProductPriceMemoryResponse found = priceMemoryService.find(
                softDeletedPartnerId, softDeletedProductId).orElseThrow();
        assertThat(found.unitPrice()).isEqualByComparingTo(rememberedPrice);
        verifyNoInteractions(productClient, partnerInternalClient);
    }

    /**
     * [D-R8-6 · D-R8-9 / R8-QA-1 실 PostgreSQL 회귀 — BLOCKING]
     *
     * <p>라이브 실증: 세트 전표를 <b>아무것도 수정하지 않고</b> 왕복 PUT(lineId 없음) → <b>200</b> →
     * {@code GZN:t:GZS｜DCX:f:GZS} → <b>{@code GZN:f:-｜DCX:f:-}</b> (계보 전량 소실 + 구성품
     * 배분가 LINE_SAVE 각인). 이제 400 으로 거부하고 계보·기억이 그대로 남아야 한다.
     *
     * <p><b>D-R8-9 갱신</b>: 구 클라이언트를 가르는 기준이 "lineId 개수" 에서 <b>"계약 마커 유무"</b>
     * 로 바뀌었다. 따라서 이 재현은 lineId 를 싣지 않는 것에 더해 <b>마커도 싣지 않는다</b> —
     * 그게 R8-QA-1 을 일으킨 실제 클라이언트의 모습이다. 마커를 실어도 기존 계보 구성품 ID가
     * 익명 라인으로 대체되면 아래 per-line 계약 테스트들이 별도로 차단한다.
     */
    @Test
    void bundleSlipRoundTripPutWithoutContractMarker_isRejectedAndLeavesLineageIntact() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        stubBundleExpansion(bundleProductId, firstComponentId, secondComponentId);

        var created = slipService.create(
                slipRequest(SlipType.OUTBOUND, partnerId, bundleProductId,
                        new BigDecimal("550000.00")),
                "actor-r8-qa1", "R8-QA-1 무수정 왕복 PUT");
        try {
            awaitPriceMemory(partnerId, bundleProductId);

            // 구 클라이언트 재현 — 마커도 lineId 도 없이 전 라인을 통째 재전송
            assertThatThrownBy(() -> salesSlipUpdateService.update(
                    created.id(),
                    updateRequest(created.id(), created, created.lines().stream()
                            .map(line -> new SlipUpdateRequest.LineRequest(
                                    line.productId(), line.productName(), line.modelName(),
                                    line.specification(), line.quantity(), line.unitPrice(),
                                    line.note(), null))
                            .toList(), null),
                    UUID.randomUUID(), "구 클라이언트"))
                    .isInstanceOfSatisfying(BusinessException.class, ex ->
                            assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));
            awaitPriceMemoryExecutorIdle();

            // 계보 그대로 + 구성품 기억 0건 (결함이라면 여기서 평면화 + 배분가 각인이 보인다)
            assertBundleSlipLineage(created.id(), firstComponentId, secondComponentId);
            assertOnlyParentBundleMemory(partnerId, bundleProductId,
                    firstComponentId, secondComponentId);
        } finally {
            cleanupSlip(created.id());
        }
    }

    /**
     * [D-R8-13 — 실 PostgreSQL 회귀] 마커가 계보 파괴를 우회하지 못한다.
     *
     * <p><b>D-R8-9 로부터의 개정</b>: D-R8-9 는 계보 보유 세트 전표의 "전 라인 교체(lineId 0개)"를
     * 오탐 제거 명목으로 허용했다. 그러나 R8-QA-13 이 라이브에서 실증한 것 — 그 허용은 마커라는
     * 다른 문으로 R8-QA-1(세트 전표 무수정 왕복 → 계보 전량 소실)을 재개방한다. 마커
     * ({@code lineIdContract=true})는 클라이언트 <i>자기신고</i>일 뿐이므로, 계보 보유 문서에서 실제로
     * lineId 를 실었는지는 서버가 내용과 대조해 별도 검증한다.
     *
     * <p>따라서 계보 보유 전표 + 마커 + lineId 전무는 이제 <b>400</b> 으로 거부하고, 원 세트 계보와
     * 구성품 기억(0건)이 <b>전량 보존</b>돼야 한다. 계보 <b>없는</b> 평면 문서의 전 라인 교체는
     * 여전히 정상이다({@link com.samhanair.logis.slip.service.SlipUpdateLineIdContractTest} 의
     * plain 오라클 + 게이트 단위 테스트가 오탐 없음을 고정).
     */
    @Test
    void bundleSlipFullLineReplacementWithMarker_butNoLineIds_isRejectedToPreventLineageDestruction() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        UUID replacementProductId = UUID.randomUUID();
        stubBundleExpansion(bundleProductId, firstComponentId, secondComponentId);

        var created = slipService.create(
                slipRequest(SlipType.OUTBOUND, partnerId, bundleProductId,
                        new BigDecimal("550000.00")),
                "actor-r8-13", "D-R8-13 전 라인 교체 거부");
        try {
            awaitPriceMemory(partnerId, bundleProductId);

            // 전 라인 교체 — 마커는 싣고 lineId 는 하나도 싣지 않는다(R8-QA-13 재현).
            assertThatThrownBy(() -> salesSlipUpdateService.update(
                    created.id(),
                    updateRequest(created.id(), created, List.of(
                            new SlipUpdateRequest.LineRequest(
                                    replacementProductId, "교체 단품", "PLAIN-809", null,
                                    2, new BigDecimal("150000.00"), "전 라인 교체", null)),
                            true),
                    UUID.randomUUID(), "전 라인 교체자"))
                    .isInstanceOfSatisfying(BusinessException.class, ex ->
                            assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));
            awaitPriceMemoryExecutorIdle();

            // 계보 그대로 + 구성품 기억 0건 — 마커 우회 경로가 실 DB 에서 차단됐음을 실증.
            assertBundleSlipLineage(created.id(), firstComponentId, secondComponentId);
            assertOnlyParentBundleMemory(partnerId, bundleProductId,
                    firstComponentId, secondComponentId);
        } finally {
            cleanupSlip(created.id());
        }
    }

    /**
     * [R9 per-line 실 PostgreSQL 회귀] 구성품 2개 중 하나의 lineId만 남아도 누락 구성품을 익명
     * 라인으로 재생성하면 400이어야 한다. 종전 개수 게이트는 non-null ID 1개만 보고 통과시켜
     * 누락 구성품의 parentSetModel/setHead를 소실시켰다.
     */
    @Test
    void bundleSlipPartialRecreationWithoutOneComponentLineId_isRejectedAndLeavesLineageIntact() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        UUID anonymousReplacementProductId = UUID.randomUUID();
        stubBundleExpansion(bundleProductId, firstComponentId, secondComponentId);

        var created = slipService.create(
                slipRequest(SlipType.OUTBOUND, partnerId, bundleProductId,
                        new BigDecimal("550000.00")),
                "actor-r9-partial", "R9 부분 계보 파괴 거부");
        try {
            awaitPriceMemory(partnerId, bundleProductId);
            SlipLineResponse kept = created.lines().get(0);

            assertThatThrownBy(() -> salesSlipUpdateService.update(
                    created.id(),
                    updateRequest(created.id(), created, List.of(
                            new SlipUpdateRequest.LineRequest(
                                    kept.productId(), kept.productName(), kept.modelName(),
                                    kept.specification(), kept.quantity(), kept.unitPrice(),
                                    kept.note(), kept.id()),
                            new SlipUpdateRequest.LineRequest(
                                    anonymousReplacementProductId, "익명 재생성", "NEW-R9", null,
                                    1, new BigDecimal("150000.00"), "lineId 누락", null)),
                            true),
                    UUID.randomUUID(), "부분 파괴자"))
                    .isInstanceOfSatisfying(BusinessException.class, ex ->
                            assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));
            awaitPriceMemoryExecutorIdle();

            assertBundleSlipLineage(created.id(), firstComponentId, secondComponentId);
            assertOnlyParentBundleMemory(partnerId, bundleProductId,
                    firstComponentId, secondComponentId);
        } finally {
            cleanupSlip(created.id());
        }
    }

    /**
     * [D-R8-8 / R8-BE-1 / R8-QA-6 실 PostgreSQL 회귀]
     *
     * <p>라이브 실증: 세트 head 라인의 품목을 무관 단품({@code ACD-2558G})으로 교체 + 단가 150000
     * → 200 → {@code ACD-2558G:t:AF17B6474GZS}(거짓 세트 head 각인) + 기억행 <b>NONE</b>(사용자가
     * 입력한 단가가 구성품으로 오판되어 통째 증발).
     *
     * <p>도메인 확정(D-R8-8) — 품목을 교체하면 더 이상 그 세트의 구성품이 아니다. 따라서 교체된
     * 라인은 평면 라인으로 남고, 사용자 단가가 정상적으로 기억돼야 한다.
     */
    @Test
    void bundleHeadProductSwappedToUnrelatedItem_dropsLineageAndRemembersUserPrice() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        UUID swappedProductId = UUID.randomUUID();
        stubBundleExpansion(bundleProductId, firstComponentId, secondComponentId);

        var created = slipService.create(
                slipRequest(SlipType.OUTBOUND, partnerId, bundleProductId,
                        new BigDecimal("550000.00")),
                "actor-r8-qa6", "R8-QA-6 품목 교체");
        try {
            awaitPriceMemory(partnerId, bundleProductId);
            var head = created.lines().stream()
                    .filter(SlipLineResponse::setHead).findFirst().orElseThrow();

            // head 라인의 lineId 는 그대로, 품목만 무관 단품으로 교체 + 단가 150000
            salesSlipUpdateService.update(
                    created.id(),
                    updateRequest(created.id(), created, created.lines().stream()
                            .map(line -> line.id().equals(head.id())
                                    ? new SlipUpdateRequest.LineRequest(
                                            swappedProductId, "무관한 단품", "ACD-2558G", null,
                                            1, new BigDecimal("150000.00"), "품목 교체", line.id())
                                    : new SlipUpdateRequest.LineRequest(
                                            line.productId(), line.productName(), line.modelName(),
                                            line.specification(), line.quantity(), line.unitPrice(),
                                            line.note(), line.id()))
                            .toList()),
                    UUID.randomUUID(), "품목 교체자");
            awaitPriceMemoryExecutorIdle();

            // 교체 라인은 평면 — 거짓 세트 head 로 각인되지 않는다
            assertThat(lineageQuantityRows(created.id())).containsExactlyInAnyOrder(
                    new LineageQuantityRow(swappedProductId, 1, false, null),
                    new LineageQuantityRow(secondComponentId, 1, false, "SET-809"));

            // 사용자 단가 150,000 × 1.1 이 기억된다 (결함: 구성품 오판 → 기억행 NONE)
            PartnerProductPriceMemoryResponse memory = awaitPriceMemoryValue(
                    partnerId, swappedProductId, new BigDecimal("165000.00"));
            assertThat(memory.source()).isEqualTo(PartnerProductPriceMemory.SOURCE_LINE_SAVE);
            // 남은 진짜 구성품은 여전히 기억 대상이 아니다
            assertThat(priceMemoryService.find(partnerId, secondComponentId)).isEmpty();
        } finally {
            cleanupSlip(created.id());
        }
    }

    /**
     * [D-R8-7 / R8-BE-3 / R8-QA-3 실 PostgreSQL 회귀]
     *
     * <p>라이브 실증: 거래처명 {@code R8검증-다른거래처} + 단가 277000 저장 → 200 →
     * {@code partner_name} 변경 / {@code partner_id} <b>불변</b> → 기억 {@code 304700} 이
     * <b>원 거래처</b> {@code 44f0cfc1} 에 각인. 계약에 partnerId 를 추가하고
     * {@code collectPriceMemory} 를 헤더 갱신 이후로 옮겨, 기억이 <b>새 거래처</b>에 붙어야 한다.
     */
    @Test
    void salesPutChangingPartner_imprintsMemoryOnNewPartnerNotTheOriginal() {
        UUID originalPartnerId = UUID.randomUUID();
        UUID newPartnerId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        var created = slipService.create(
                slipRequest(SlipType.OUTBOUND, originalPartnerId, productId,
                        new BigDecimal("100000.00")),
                "actor-r8-qa3", "R8-QA-3 거래처 변경");
        try {
            awaitPriceMemory(originalPartnerId, productId);

            salesSlipUpdateService.update(
                    created.id(),
                    new SlipUpdateRequest(
                            currentSlipUpdatedAt(created.id()),
                            newPartnerId,
                            "R8검증-다른거래처",
                            created.partnerCode(), created.memo(), created.businessNumber(),
                            created.deliveryAddress(), created.supervisionAddress(),
                            created.projectName(), created.recipientPhone(),
                            created.paymentDueDate(),
                            created.lines().stream()
                                    .map(line -> new SlipUpdateRequest.LineRequest(
                                            line.productId(), line.productName(), line.modelName(),
                                            line.specification(), line.quantity(),
                                            new BigDecimal("277000.00"), line.note(), line.id()))
                                    .toList(), true),
                    UUID.randomUUID(), "거래처 변경자");
            awaitPriceMemoryExecutorIdle();

            // partner_id 가 실제로 바뀌었는지 (종전: partner_name 만 바뀌고 partner_id 불변)
            UUID persistedPartnerId = jdbcTemplate.queryForObject(
                    "SELECT partner_id FROM slips WHERE id = ?", UUID.class, created.id());
            assertThat(persistedPartnerId).isEqualTo(newPartnerId);

            // 기억은 새 거래처에 각인된다 (277,000 × 1.1 = 304,700)
            PartnerProductPriceMemoryResponse newPartnerMemory = awaitPriceMemoryValue(
                    newPartnerId, productId, new BigDecimal("304700.00"));
            assertThat(newPartnerMemory.source()).isEqualTo(PartnerProductPriceMemory.SOURCE_LINE_SAVE);

            // 원 거래처 기억은 생성 시점 값(VAT 포함 입력 100,000) 그대로 — 새 단가로 오염되지
            // 않는다. 결함에서는 바로 이 자리에 304,700 이 각인됐다 (R8-QA-3 라이브 실측).
            assertThat(priceMemoryService.find(originalPartnerId, productId).orElseThrow().unitPrice())
                    .isEqualByComparingTo("100000.00");
        } finally {
            cleanupSlip(created.id());
        }
    }

    /**
     * [D-R8-6 견적 미러] 계보 보유 <b>견적</b>의 lineId 미전송 수정도 400 으로 거부한다.
     *
     * <p>전표/견적 비대칭은 이 PR 의 재발 패턴이므로 미러 회귀를 함께 고정한다. 견적은
     * {@code lines == null}(라인 보존) / 빈 list(전 라인 제거) 계약이 별도로 있어, 게이트가 그
     * 두 경로를 막지 않는지도 함께 확인한다.
     */
    @Test
    void bundleEstimateUpdateWithoutContractMarker_isRejectedAndLeavesLineageIntact() {
        UUID partnerId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        stubBundleExpansion(bundleProductId, firstComponentId, secondComponentId);

        var created = estimateService.create(
                new CreateEstimateRequest(
                        LocalDate.of(2026, 7, 16), partnerId, "테스트 거래처", null, null,
                        LocalDate.of(2026, 8, 15), "R8-QA-1 견적 미러",
                        List.of(new CreateEstimateRequest.EstimateLineRequest(
                                bundleProductId, "테스트 세트", "SET-809", null,
                                1, new BigDecimal("550000.00"), "세트 라인", null, true))),
                "actor-r8-est", "견적 작성자");
        try {
            awaitPriceMemory(partnerId, bundleProductId);

            assertThatThrownBy(() -> estimateService.update(
                    created.id(),
                    new UpdateEstimateRequest(
                            created.partnerId(), created.partnerName(), created.partnerBusinessNo(),
                            created.partnerAddress(), created.validUntil(), created.memo(),
                            created.lines().stream()
                                    .map(line -> new UpdateEstimateRequest.EstimateLineUpdate(
                                            line.productId(), line.productName(), line.modelName(),
                                            line.specification(), line.quantity(),
                                            line.unitPriceWithVat() == null
                                                    ? line.unitPrice() : line.unitPriceWithVat(),
                                            line.note(), null, line.unitPriceWithVat() != null, null))
                                    .toList(), null),
                    "actor-r8-est", "구 클라이언트"))
                    .isInstanceOfSatisfying(BusinessException.class, ex ->
                            assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));
            awaitPriceMemoryExecutorIdle();

            // 400 은 트랜잭션 롤백을 동반하므로 계보·기억이 그대로여야 한다
            assertBundleEstimateLineage(created.id(), firstComponentId, secondComponentId);
            assertOnlyParentBundleMemory(partnerId, bundleProductId,
                    firstComponentId, secondComponentId);

            // [D-R8-9] 헤더 전용 수정(lines == null)도 마커가 없으면 거부된다 — 게이트 우회 금지.
            // 구 클라이언트는 partnerId 도 보내지 않아 헤더만 바꿔도 기억이 원 거래처에 각인된다.
            assertThatThrownBy(() -> estimateService.update(
                    created.id(),
                    new UpdateEstimateRequest(
                            created.partnerId(), created.partnerName(), created.partnerBusinessNo(),
                            created.partnerAddress(), created.validUntil(), "메모만 수정", null, null),
                    "actor-r8-est", "구 클라이언트 메모 수정"))
                    .isInstanceOfSatisfying(BusinessException.class, ex ->
                            assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));

            // 마커를 실은 헤더 전용 수정은 정상 — 라인 보존 계약은 그대로다.
            estimateService.update(
                    created.id(),
                    new UpdateEstimateRequest(
                            created.partnerId(), created.partnerName(), created.partnerBusinessNo(),
                            created.partnerAddress(), created.validUntil(), "메모만 수정", null, true),
                    "actor-r8-est", "메모 수정자");
            assertBundleEstimateLineage(created.id(), firstComponentId, secondComponentId);
        } finally {
            cleanupEstimate(created.id());
        }
    }

    /** 세트 전개 stub — head(COMP-1) + 구성품(COMP-2) 2행으로 전개되는 BUNDLE 품목. */
    private void stubBundleExpansion(UUID bundleProductId, UUID firstComponentId,
                                     UUID secondComponentId) {
        ProductSummary bundle = bundleProduct(bundleProductId);
        when(productClient.lookup(anyList())).thenAnswer(inv -> {
            List<UUID> productIds = inv.getArgument(0);
            return productIds.stream()
                    .map(productId -> productId.equals(bundleProductId) ? bundle : product(productId))
                    .toList();
        });
        when(productClient.expand(any(), any(), any(), any())).thenReturn(List.of(
                new ExpandedLineDto(firstComponentId, "COMP-1", "COMP-1", "실내기",
                        new BigDecimal("1"), new BigDecimal("330000.00"), "COMPONENT", true),
                new ExpandedLineDto(secondComponentId, "COMP-2", "COMP-2", "실외기",
                        new BigDecimal("1"), new BigDecimal("220000.00"), "COMPONENT", false)));
    }

    private ProductSummary product(UUID productId) {
        return new ProductSummary(productId, "테스트 품목", "MODEL-809", "P-809",
                UUID.randomUUID(), new BigDecimal("110000.00"), "ACTIVE", false);
    }

    private ProductSummary bundleProduct(UUID productId) {
        return new ProductSummary(productId, "테스트 세트", "SET-809", "SET-809",
                UUID.randomUUID(), new BigDecimal("550000.00"), "ACTIVE", false,
                "SET-809", "BUNDLE");
    }

    private CreateSlipRequest inboundSlipRequest(UUID partnerId, UUID productId, BigDecimal unitPrice) {
        return slipRequest(SlipType.INBOUND, partnerId, productId, unitPrice);
    }

    private LocalDateTime currentSlipUpdatedAt(UUID slipId) {
        return slipRepository.findById(slipId)
                .map(slip -> slip.getModifiedAt() == null ? slip.getCreatedAt() : slip.getModifiedAt())
                .orElseThrow();
    }

    /** 정상 최신 클라이언트 요청 — 계약 마커를 싣는다 (D-R8-9). */
    private SlipUpdateRequest updateRequest(UUID slipId, SlipDetailResponse detail,
                                            List<SlipUpdateRequest.LineRequest> lines) {
        return updateRequest(slipId, detail, lines, true);
    }

    /**
     * 마커를 명시하는 요청 빌더 — 구 클라이언트 재현({@code lineIdContract = null})에 쓴다.
     *
     * <p>[D-R8-9] 구 클라이언트를 가르는 것은 lineId 개수가 아니라 <b>마커 유무</b>다.
     */
    private SlipUpdateRequest updateRequest(UUID slipId, SlipDetailResponse detail,
                                            List<SlipUpdateRequest.LineRequest> lines,
                                            Boolean lineIdContract) {
        return new SlipUpdateRequest(
                currentSlipUpdatedAt(slipId), detail.partnerId(),
                detail.partnerName(), detail.partnerCode(), detail.memo(),
                detail.businessNumber(), detail.deliveryAddress(), detail.supervisionAddress(),
                detail.projectName(), detail.recipientPhone(), detail.paymentDueDate(), lines,
                lineIdContract);
    }

    private SlipUpdateRequest.LineRequest lineRequest(SlipLineResponse line, int quantity,
                                                       BigDecimal unitPrice) {
        return new SlipUpdateRequest.LineRequest(
                line.productId(), line.productName(), line.modelName(), line.specification(),
                quantity, unitPrice, line.note(), line.id());
    }

    private List<SlipUpdateRequest.LineRequest> reversedLines(
            List<SlipUpdateRequest.LineRequest> lines) {
        List<SlipUpdateRequest.LineRequest> reversed = new ArrayList<>(lines);
        Collections.reverse(reversed);
        return reversed;
    }

    private CreateSlipRequest slipRequest(
            SlipType slipType, UUID partnerId, UUID productId, BigDecimal unitPrice) {
        return slipRequestWithLines(slipType, partnerId,
                List.of(new CreateSlipRequest.SlipLineRequest(
                        productId,
                        "테스트 품목",
                        "MODEL-809",
                        null,
                        1,
                        unitPrice,
                        "라인",
                        null,
                        true)));
    }

    /** 라인 배열을 직접 지정하는 생성 요청 — 세트+일반 혼합 전표(R6-H2 복사 회귀) 등에 사용. */
    private CreateSlipRequest slipRequestWithLines(
            SlipType slipType, UUID partnerId, List<CreateSlipRequest.SlipLineRequest> lines) {
        UUID warehouseId = UUID.randomUUID();
        return new CreateSlipRequest(
                slipType,
                LocalDate.of(2026, 7, 15),
                slipType == SlipType.OUTBOUND ? warehouseId : null,
                slipType == SlipType.INBOUND ? warehouseId : null,
                partnerId,
                "테스트 거래처",
                slipType == SlipType.OUTBOUND ? DeliveryTag.SALE : DeliveryTag.RETURN_TRIP,
                "가격기억 fail-soft 검증",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                lines);
    }

    private void rawInsert(UUID partnerId, UUID productId, BigDecimal unitPrice, String actor) {
        jdbcTemplate.update("""
                INSERT INTO partner_product_price_memory
                    (id, partner_id, product_id, unit_price, source, remembered_at,
                     created_at, created_by, is_deleted)
                VALUES
                    (?, ?, ?, ?, 'LINE_SAVE', CURRENT_TIMESTAMP,
                     CURRENT_TIMESTAMP, ?, FALSE)
                """, UUID.randomUUID(), partnerId, productId, unitPrice, actor);
    }

    private TransactionSynchronization registerAfterCommit(
            PartnerProductPriceMemoryService controlledService,
            PartnerProductPriceMemoryCommand command,
            String context) {
        TransactionSynchronizationManager.initSynchronization();
        try {
            controlledService.rememberBatchAfterCommit(List.of(command), context);
            return TransactionSynchronizationManager.getSynchronizations().get(0);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private PartnerProductPriceMemoryResponse awaitPriceMemory(UUID partnerId, UUID productId) {
        awaitUntil(() -> priceMemoryService.find(partnerId, productId).isPresent(), "가격기억 비동기 저장");
        return priceMemoryService.find(partnerId, productId).orElseThrow();
    }

    private PartnerProductPriceMemoryResponse awaitPriceMemoryValue(
            UUID partnerId, UUID productId, BigDecimal expectedPrice) {
        awaitUntil(() -> priceMemoryService.find(partnerId, productId)
                        .map(memory -> memory.unitPrice().compareTo(expectedPrice) == 0)
                        .orElse(false),
                "가격기억 비동기 저장값 " + expectedPrice.toPlainString());
        return priceMemoryService.find(partnerId, productId).orElseThrow();
    }

    private void awaitUntil(BooleanSupplier condition, String description) {
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            try {
                Thread.sleep(25);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                throw new AssertionError(description + " 대기 중 interrupt", ex);
            }
        }
        throw new AssertionError(description + " 5초 내 미완료");
    }

    private void awaitPriceMemoryExecutorIdle() {
        ThreadPoolTaskExecutor executor = (ThreadPoolTaskExecutor) priceMemoryExecutor;
        awaitUntil(() -> executor.getActiveCount() == 0
                        && executor.getThreadPoolExecutor().getQueue().isEmpty(),
                "가격기억 executor drain");
    }

    private void assertBundleSlipLineage(
            UUID slipId, UUID firstComponentId, UUID secondComponentId) {
        List<BundleLineageRow> rows = jdbcTemplate.query("""
                SELECT product_id, set_head, parent_set_model
                  FROM slip_lines
                 WHERE slip_id = ? AND is_deleted = FALSE
                 ORDER BY created_at, id
                """, (rs, rowNum) -> new BundleLineageRow(
                rs.getObject("product_id", UUID.class),
                rs.getBoolean("set_head"),
                rs.getString("parent_set_model")), slipId);

        assertThat(rows).containsExactlyInAnyOrder(
                new BundleLineageRow(firstComponentId, true, "SET-809"),
                new BundleLineageRow(secondComponentId, false, "SET-809"));
    }

    /**
     * 전표 활성 라인의 (품목, 수량, 계보) 행 — 동일 품목이 구성품·일반 라인으로 공존하는
     * R6-H1/H2 회귀에서 두 행을 수량으로 구분 단언하기 위한 조회.
     */
    private List<LineageQuantityRow> lineageQuantityRows(UUID slipId) {
        return jdbcTemplate.query("""
                SELECT product_id, quantity, set_head, parent_set_model
                  FROM slip_lines
                 WHERE slip_id = ? AND is_deleted = FALSE
                 ORDER BY created_at, id
                """, (rs, rowNum) -> new LineageQuantityRow(
                rs.getObject("product_id", UUID.class),
                rs.getInt("quantity"),
                rs.getBoolean("set_head"),
                rs.getString("parent_set_model")), slipId);
    }

    private void assertBundleEstimateLineage(
            UUID estimateId, UUID firstComponentId, UUID secondComponentId) {
        List<BundleLineageRow> rows = jdbcTemplate.query("""
                SELECT product_id, set_head, parent_set_model
                  FROM estimate_lines
                 WHERE estimate_id = ? AND is_deleted = FALSE
                 ORDER BY line_no
                """, (rs, rowNum) -> new BundleLineageRow(
                rs.getObject("product_id", UUID.class),
                rs.getBoolean("set_head"),
                rs.getString("parent_set_model")), estimateId);

        assertThat(rows).containsExactly(
                new BundleLineageRow(firstComponentId, true, "SET-809"),
                new BundleLineageRow(secondComponentId, false, "SET-809"));
    }

    private void assertOnlyParentBundleMemory(
            UUID partnerId, UUID bundleProductId, UUID firstComponentId, UUID secondComponentId) {
        List<UUID> rememberedProductIds = jdbcTemplate.queryForList("""
                SELECT product_id
                  FROM partner_product_price_memory
                 WHERE partner_id = ? AND is_deleted = FALSE
                 ORDER BY product_id
                """, UUID.class, partnerId);
        assertThat(rememberedProductIds).containsExactly(bundleProductId);
        assertThat(priceMemoryService.find(partnerId, bundleProductId).orElseThrow().source())
                .isEqualTo(PartnerProductPriceMemory.SOURCE_BUNDLE_SET);
        assertThat(priceMemoryService.find(partnerId, firstComponentId)).isEmpty();
        assertThat(priceMemoryService.find(partnerId, secondComponentId)).isEmpty();
    }

    private void cleanupSlip(UUID slipId) {
        jdbcTemplate.update("DELETE FROM slip_audit_logs WHERE slip_id = ?", slipId);
        jdbcTemplate.update("DELETE FROM slip_revisions WHERE slip_id = ?", slipId);
        jdbcTemplate.update("DELETE FROM slip_lines WHERE slip_id = ?", slipId);
        jdbcTemplate.update("DELETE FROM slips WHERE id = ?", slipId);
    }

    private void cleanupEstimate(UUID estimateId) {
        jdbcTemplate.update("DELETE FROM estimate_revisions WHERE estimate_id = ?", estimateId);
        jdbcTemplate.update("DELETE FROM estimate_lines WHERE estimate_id = ?", estimateId);
        jdbcTemplate.update("DELETE FROM estimates WHERE id = ?", estimateId);
    }

    private record PriceMemoryRow(BigDecimal unitPrice, String createdBy, String modifiedBy,
                                  boolean hasModifiedAt) {
    }

    private record RevivedRow(BigDecimal unitPrice, boolean deleted, boolean deletedAtNull,
                              boolean deletedByNull) {
    }

    private record BundleLineageRow(UUID productId, boolean setHead, String parentSetModel) {
    }

    /** 계보 + 수량 행 — 동일 품목 다행(구성품/일반) 구분 단언용 (R6-H1/H2 회귀). */
    private record LineageQuantityRow(UUID productId, int quantity, boolean setHead,
                                      String parentSetModel) {
    }
}
