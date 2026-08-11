package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.client.GoogleSheetsClient.ValueRenderMode;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Classification;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.ProductLineage;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.domain.PriceHistory;
import com.samhanair.logis.product.domain.ProductEstimateExposure;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ClassificationRepository;
import com.samhanair.logis.product.repository.PriceHistoryRepository;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.ProductSpecRepository;
import com.samhanair.logis.product.service.BundleExpander;
import com.samhanair.logis.product.service.ProductSheetSyncService;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.service.EcountAliasReservationService;
import com.samhanair.logis.product.web.dto.UpdateProductClassificationRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * ProductSheetSyncService IT — 외부 GoogleSheetsClient {@code @MockBean} 격리
 * (memory feedback_it_mockbean_external_clients.md 가드).
 *
 * <p>테스트 시나리오:
 * <ul>
 *     <li>1) 첫 sync: insert 만 발생, DB row 수 = 시트 row 수</li>
 *     <li>2) 동일 시트 재 sync: DB 상태 일치 → unchanged 만 (update X)</li>
 *     <li>3) 시트 row 가격 변경 → update 발생 (releasePrice 갱신)</li>
 *     <li>4) 시트에서 row 사라짐 → soft-delete (isDeleted=true)</li>
 * </ul>
 *
 * <p>본 IT 는 Testcontainers PostgreSQL + ddl-auto=validate + Flyway V1~V4 적용 환경.
 * SchedulerEnabled=false 로 cron 자동 실행 차단.
 */
@SpringBootTest(properties = {
        "app.scheduling.enabled=false",
        "google.sheets.sheet-id=test-sheet-id",
        "google.sheets.endpoint-override=http://localhost:0"
})
@DirtiesContext
@WithMockUser(username = "test-sync")
@Transactional
class ProductSheetSyncServiceIT extends AbstractPostgresIT {

    @MockBean
    private GoogleSheetsClient sheetsClient;

    @Autowired
    private ProductSheetSyncService syncService;

    @Autowired
    private ProductService productService;

    @Autowired
    private EcountAliasReservationService ecountAliasReservationService;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @PersistenceContext
    private EntityManager entityManager;

    @Autowired
    private PriceHistoryRepository priceHistoryRepository;

    @Autowired
    private BundleComponentRepository bundleComponentRepository;

    @Autowired
    private BundleExpander bundleExpander;

    @Autowired
    private ProductSpecRepository productSpecRepository;

    @SpyBean
    private ProductEstimateExposureRepository exposureRepository;

    @Autowired
    private ClassificationRepository classificationRepository;

    @BeforeEach
    void resetState() throws Exception {
        // 캐시 invalidate mock — 호출 검증용
        lenient().doNothing().when(sheetsClient).invalidateCache();
        // FORMULA read 기본값 — 개별 테스트에서 필요한 탭만 override.
        lenient().when(sheetsClient.readSheetFormulas(anyString(), anyString())).thenReturn(List.of());
    }

    @AfterEach
    void cleanupRollbackFixture() {
        productRepository.findByModelCodeAndIsDeletedFalse("ROLLBACK_PRICE_MODEL").ifPresent(product -> {
            product.markDeleted("test-cleanup");
            productRepository.save(product);
        });
    }

    @Test
    void sync_첫실행_insert_only() throws Exception {
        // given: 홈멀티 시트 1 row 만 mock 응답 (legacy getDisplayValues 1:1 → readSheetDisplay)
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi 4-Way", "AJ040RXH4BC1", "", "1,500,000", "", "1,200,000")
        ));

        // when
        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();

        // then
        assertThat(summary.totalInsertedRows).isEqualTo(1);
        assertThat(summary.totalUpdatedRows).isZero();
        assertThat(summary.totalSoftDeletedRows).isZero();

        Optional<Product> p = productRepository.findByModelCodeAndIsDeletedFalse("AJ040RXH4BC1");
        assertThat(p).isPresent();
        assertThat(p.get().getProductCategory()).isEqualTo(ProductCategory.HOME_MULTI);
        // BigDecimal 비교는 compareTo 로 — Hibernate scale (NUMERIC(12,2)) 무관
        assertThat(p.get().getReleasePrice()).isEqualByComparingTo(new BigDecimal("1500000"));
    }

    @Test
    void sync_시트_상태_세_가지_반영하고_상태_공란은_기존상태를_보존한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "단위", "출고가", "수량", "납품가", "소계", "비고"),
                row("상태 단종", "STATUS-DISCONTINUED", "EA", "100,000", "", "80,000", "-", "단종"),
                row("상태 미판매", "STATUS-NOT-FOR-SALE", "EA", "100,000", "", "80,000", "-", "미판매"),
                row("상태 품절", "STATUS-OUT-OF-STOCK", "EA", "100,000", "", "80,000", "-", "품절")
        ));

        syncService.syncAll();

        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("STATUS-DISCONTINUED").orElseThrow().getStatus())
                .isEqualTo(ProductStatus.DISCONTINUED);
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("STATUS-NOT-FOR-SALE").orElseThrow().getStatus())
                .isEqualTo(ProductStatus.NOT_FOR_SALE);
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("STATUS-OUT-OF-STOCK").orElseThrow().getStatus())
                .isEqualTo(ProductStatus.OUT_OF_STOCK);

        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "단위", "출고가", "수량", "납품가", "소계", "비고"),
                row("상태 단종", "STATUS-DISCONTINUED", "EA", "101,000", "", "81,000", "-", "")
        ));
        syncService.syncAll();

        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("STATUS-DISCONTINUED").orElseThrow().getStatus())
                .as("시트 상태 공란은 기존 상태를 임의로 덮지 않음")
                .isEqualTo(ProductStatus.DISCONTINUED);
    }

    @Test
    void sync_종합견적서는_단가인상탭을_기본값으로_저장하고_base탭을_인상전_priceHistory로_보존한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi 최신", "AJ060MXHNBC1", "", "2,000,000", "", "1,611,115")
        ));
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi 기존", "AJ060MXHNBC1", "", "1,800,000", "", "1,519,760")
        ));

        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();

        ProductSheetSyncService.TabSyncResult homeTab = summary.byTab.get("홈멀티");
        assertThat(homeTab.insertedRows).isEqualTo(1);
        Optional<Product> product = productRepository.findByModelCodeAndIsDeletedFalse("AJ060MXHNBC1");
        assertThat(product).isPresent();
        assertThat(product.get().getReleasePrice()).isEqualByComparingTo(new BigDecimal("2000000"));
        assertThat(product.get().getDeliveryPrice()).isEqualByComparingTo(new BigDecimal("1611115"));

        List<PriceHistory> histories = priceHistoryRepository.findByProductIdOrderByEffectiveDateDesc(
                product.get().getId());
        assertThat(histories).hasSize(2);
        assertThat(priceHistoryRepository.findApplicableLatest(product.get().getId(), LocalDate.of(2026, 5, 16)))
                .get()
                .satisfies(priceHistory -> assertThat(priceHistory.getDeliveryPrice())
                        .isEqualByComparingTo(new BigDecimal("1611115")));
        assertThat(priceHistoryRepository.findApplicableLatest(product.get().getId(), LocalDate.of(2026, 3, 31)))
                .get()
                .satisfies(priceHistory -> assertThat(priceHistory.getDeliveryPrice())
                        .isEqualByComparingTo(new BigDecimal("1519760")));
    }

    @Test
    void sync_재실행_DB상태_동일이면_update_없음() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        List<List<Object>> homeMulti = homeMultiRows(
                row("Hi-Multi", "MODEL_HASH_TEST", "", "1,000,000", "", "900,000")
        );
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMulti);

        // 1차 sync — insert
        syncService.syncAll();
        // 2차 sync — 동일 데이터
        ProductSheetSyncService.SyncSummary second = syncService.syncAll();

        // DB 상태 일치 → updatedRows=0 (해당 tab 만)
        ProductSheetSyncService.TabSyncResult homeTab = second.byTab.get("홈멀티");
        assertThat(homeTab).isNotNull();
        assertThat(homeTab.updatedRows).isZero();
        assertThat(homeTab.unchangedRows).isEqualTo(1);
    }

    @Test
    void sync_시트명과_DB명이_달라도_update를_반복하지_않는다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        List<List<Object>> homeMulti = homeMultiRows(
                row("Sheet name", "NAME_DRIFT_MODEL", "", "1,000,000", "", "900,000")
        );
        when(sheetsClient.readSheetDisplay(eq("test-sheet-id"), anyString())).thenReturn(homeMulti);
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_출고증가!A1:Z")).thenReturn(homeMulti);
        syncService.syncAll();
        Product product = productRepository.findByModelCodeAndIsDeletedFalse("NAME_DRIFT_MODEL").orElseThrow();
        product.rename("DB authoritative name");
        productRepository.saveAndFlush(product);

        ProductSheetSyncService.SyncSummary second = syncService.syncAll();
        ProductSheetSyncService.TabSyncResult homeTab = second.byTab.get("홈멀티");

        assertThat(homeTab.updatedRows).isZero();
        assertThat(homeTab.unchangedRows).isEqualTo(1);
        assertThat(homeTab.nameDriftOccurrences).isEqualTo(1);
        String homeTabName = second.byTab.entrySet().stream()
                .filter(entry -> entry.getValue() == homeTab)
                .map(java.util.Map.Entry::getKey)
                .findFirst().orElseThrow();

        ProductSheetSyncService.SyncSummary third = syncService.syncAll();
        ProductSheetSyncService.TabSyncResult thirdHomeTab = third.byTab.get(homeTabName);
        assertThat(thirdHomeTab.updatedRows).isZero();
        assertThat(thirdHomeTab.unchangedRows).isEqualTo(1);
        assertThat(thirdHomeTab.nameDriftOccurrences).isEqualTo(1);
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("NAME_DRIFT_MODEL").orElseThrow()
                .getName()).isEqualTo("DB authoritative name");
    }

    @Test
    void sync_동일한_값이어도_ECOUNT_승격은_updated로_판정하고_시트_정본을_적용한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 구성품_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "구분", "단위", "출고가", "비고", "납품가", "세트", "구성품특징", "규격"),
                row("시트 정본 이름", "", "ECOUNT_PROMOTION_MODEL", "", "EA", "1,000,000", "", "900,000", "", "", "")
        ));

        syncService.syncAll();
        Product insertedProduct = productRepository.findByModelCodeAndIsDeletedFalse("ECOUNT_PROMOTION_MODEL")
                .orElseThrow();
        jdbcTemplate.update("""
                UPDATE products
                   SET lineage = 'ECOUNT', product_category = NULL, usage_scope = 'NONE'
                 WHERE id = ?
                """, insertedProduct.getId());
        entityManager.clear();

        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();

        ProductSheetSyncService.TabSyncResult componentTab = summary.byTab.get("싱글 구성품");
        assertThat(componentTab.updatedRows).isEqualTo(1);
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("ECOUNT_PROMOTION_MODEL")).get()
                .satisfies(product -> {
                    assertThat(product.getLineage()).isEqualTo(ProductLineage.SHEET);
                    assertThat(product.getProductCategory()).isEqualTo(ProductCategory.SINGLE_PART);
                    assertThat(product.getName()).isEqualTo("시트 정본 이름");
                });
    }

    /**
     * 변경 행의 후속 DB 저장이 실패해 탭 트랜잭션이 롤백되면,
     * 같은 JVM의 재시도는 롤백된 DB 단가를 기준으로 행을 다시 처리해야 한다.
     */
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void syncTab_후속저장실패로_롤백된_단가는_같은행_재시도에서_반영되어야한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("롤백 단가 품목", "ROLLBACK_PRICE_MODEL", "", "1,000,000", "", "900,000")
        ));
        syncService.syncAll();

        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("롤백 단가 품목", "ROLLBACK_PRICE_MODEL", "", "1,200,000", "", "1,080,000")
        ));
        doThrow(new IllegalStateException("injected exposure save failure"))
                .when(exposureRepository).save(any(ProductEstimateExposure.class));

        ProductSheetSyncService.SyncSummary rolledBack = syncService.syncAll();
        assertThat(rolledBack.byTab.get("홈멀티").error).isEqualTo("injected exposure save failure");
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("ROLLBACK_PRICE_MODEL").orElseThrow()
                .getReleasePrice()).isEqualByComparingTo(new BigDecimal("1000000"));

        reset(exposureRepository);
        ProductSheetSyncService.SyncSummary retry = syncService.syncAll();

        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("ROLLBACK_PRICE_MODEL").orElseThrow()
                .getReleasePrice()).isEqualByComparingTo(new BigDecimal("1200000"));
        assertThat(retry.byTab.get("홈멀티").updatedRows).isEqualTo(1);
    }

    @Test
    void sync_가격변경시_update_발생() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi", "PRICE_CHANGE_MODEL", "", "1,000,000", "", "900,000")
        ));
        syncService.syncAll();

        // 가격 변경 시트 응답으로 swap
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi", "PRICE_CHANGE_MODEL", "", "1,100,000", "", "950,000")
        ));
        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();

        ProductSheetSyncService.TabSyncResult homeTab = summary.byTab.get("홈멀티");
        assertThat(homeTab.updatedRows).isEqualTo(1);
        Optional<Product> p = productRepository.findByModelCodeAndIsDeletedFalse("PRICE_CHANGE_MODEL");
        assertThat(p).isPresent();
        assertThat(p.get().getReleasePrice()).isEqualByComparingTo(new BigDecimal("1100000"));
    }

    @Test
    void sync_Product가_변경되지_않아도_priceHistory와_exposure_변경을_별도카운터로_관측한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("External write one", "EXTERNAL_WRITE_ONE", "", "1,000,000", "", "900,000"),
                row("External write two", "EXTERNAL_WRITE_TWO", "", "2,000,000", "", "1,800,000")
        ));
        syncService.syncAll();

        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("External write two", "EXTERNAL_WRITE_TWO", "", "2,000,000", "", "1,800,000"),
                row("External write one", "EXTERNAL_WRITE_ONE", "", "1,000,000", "", "900,000")
        ));
        ProductSheetSyncService.TabSyncResult reordered = syncService.syncAll().byTab.get("홈멀티");

        assertThat(reordered.updatedRows).isZero();
        assertThat(reordered.unchangedRows).isEqualTo(2);
        assertThat(reordered.priceHistoryExposureSpecChangedRows).isEqualTo(2);

        ProductSheetSyncService.TabSyncResult repeated = syncService.syncAll().byTab.get("홈멀티");

        assertThat(repeated.updatedRows).isZero();
        assertThat(repeated.unchangedRows).isEqualTo(2);
        assertThat(repeated.priceHistoryExposureSpecChangedRows).isZero();
    }

    @Test
    void sync_동일_Product의_ProductSpec_두행_변경은_변경행수_2로_센다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 세트_단가인상!A1:Z"))
                .thenReturn(singleSetSpecRows("A", "1등급"));
        syncService.syncAll();

        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 세트_단가인상!A1:Z"))
                .thenReturn(singleSetSpecRows("B", "2등급"));

        ProductSheetSyncService.TabSyncResult result = syncService.syncAll().byTab.get("싱글 세트");

        assertThat(result.updatedRows).isZero();
        assertThat(result.unchangedRows).isEqualTo(1);
        assertThat(result.priceHistoryExposureSpecChangedRows).isEqualTo(2);

        ProductSheetSyncService.TabSyncResult repeated = syncService.syncAll().byTab.get("싱글 세트");
        assertThat(repeated.priceHistoryExposureSpecChangedRows).isZero();
    }

    @Test
    void sync_시트에서_사라진_row_softDelete() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi", "WILL_VANISH", "", "1,000,000", "", "900,000")
        ));
        syncService.syncAll();
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("WILL_VANISH")).isPresent();

        // 시트에서 해당 row 제거 — 빈 응답
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows());
        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();

        ProductSheetSyncService.TabSyncResult homeTab = summary.byTab.get("홈멀티");
        assertThat(homeTab.softDeletedProductRows).isEqualTo(1);
        // soft delete 후 active 조회 X
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("WILL_VANISH")).isEmpty();
    }

    @Test
    void sync_활성_ecount_alias_reservation_중에는_시트_부재_softDelete를_보류한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Reserved Product", "RESERVED_NOSHEET", "", "1,000,000", "", "900,000")
        ));
        syncService.syncAll();
        Product product = productRepository.findByModelCodeAndIsDeletedFalse("RESERVED_NOSHEET").orElseThrow();
        UUID reservationToken = UUID.fromString("00000000-0000-0000-0000-000000009844");
        ecountAliasReservationService.reserve(reservationToken, List.of(product.getId()));

        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z"))
                .thenReturn(homeMultiRows());
        ProductSheetSyncService.TabSyncResult result = syncService.syncAll().byTab.get("홈멀티");

        assertThat(result.softDeletedProductRows).isZero();
        assertThat(result.deferredByEcountReservationProductOccurrences).isEqualTo(1);
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("RESERVED_NOSHEET")).isPresent();
        ecountAliasReservationService.release(reservationToken);
    }

    @Test
    void sync_싱글세트는_구글시트_C열_모델명과_H열_납품가를_그대로_읽는다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 세트_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "단위", "출고가", "수량", "납품가", "납품가", "소계"),
                row("360 CST UV", "15", "AC060CS6PBH1SY", "SET", "2,488,200", "", "1,490,000", "1,490,000", "-")
        ));

        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();

        ProductSheetSyncService.TabSyncResult singleSet = summary.byTab.get("싱글 세트");
        assertThat(singleSet.insertedRows).isEqualTo(1);
        Optional<Product> product = productRepository.findByModelCodeAndIsDeletedFalse("AC060CS6PBH1SY");
        assertThat(product).isPresent();
        assertThat(product.get().getProductCategory()).isEqualTo(ProductCategory.SINGLE_SET);
        assertThat(product.get().getReleasePrice()).isEqualByComparingTo(new BigDecimal("2488200"));
        assertThat(product.get().getDeliveryPrice()).isEqualByComparingTo(new BigDecimal("1490000"));
    }

    @Test
    void sync_GAS_singleSet_화면분류기와_catL_catM_분류가_일치한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 세트_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "단위", "출고가", "수량", "납품가", "납품가", "소계"),
                row("360 CST UV", "15", "SS_PARITY_360", "SET", "2,488,200", "", "1,490,000", "1,490,000", "-"),
                row("무풍 4way 냉난방 프레스티지", "30", "SS_PARITY_4WAY", "SET", "3,000,000", "", "2,100,000", "2,100,000", "-"),
                row("무풍 1way 냉난방", "18", "SS_PARITY_1WAY", "SET", "2,100,000", "", "1,260,000", "1,260,000", "-"),
                row("비스포크 스탠드(콰이엇 그레이)", "25", "SS_PARITY_BESPOKE", "SET", "2,500,000", "", "1,800,000", "1,800,000", "-"),
                row("24년형 가정용 에어컨 무풍갤러리", "18", "SS_PARITY_HOME", "SET", "2,200,000", "", "1,500,000", "1,500,000", "-")
        ));

        syncService.syncAll();

        assertSingleClassification("SS_PARITY_360", "360", "CST UV");
        assertSingleClassification("SS_PARITY_4WAY", "4way 냉난방", "프레스티지");
        assertSingleClassification("SS_PARITY_1WAY", "1way 냉난방", "");
        assertSingleClassification("SS_PARITY_BESPOKE", "비스포크 스탠드", "콰이엇 그레이");
        assertSingleClassification("SS_PARITY_HOME", "가정용 에어컨", "무풍갤러리");

        List<Product> singleSets = productRepository.findByProductCategoryAndIsDeletedFalse(ProductCategory.SINGLE_SET);
        assertThat(singleSets)
                .as("싱글 세트 대표 품목은 홈멀티 fallback 부자재로 쏠리면 안 된다")
                .noneSatisfy(product -> assertThat(product.getCatL())
                        .extracting(Classification::getName)
                        .isEqualTo("부자재"));
        assertThat(singleSets.stream().map(product -> product.getCatL().getName()).distinct().count())
                .as("싱글 세트 catL 분포")
                .isGreaterThan(1);
    }

    @Test
    void sync_상업멀티구성은_구글시트_F열_납품가를_그대로_읽는다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티 구성_단가인상!A1:Z")).thenReturn(rows(
                row("품    명", "모델명", "단위", "출고가", "수량", " 납품가", "소   계", " 비고", " 세트", " 고정DC"),
                row("DVM S2 프라임 8HP", "AM080AXVHHH1", "대", "8,012,400", "", "4,406,820", "-", "프라임", "", "-")
        ));

        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();

        ProductSheetSyncService.TabSyncResult commercialPart = summary.byTab.get("상업멀티 구성");
        assertThat(commercialPart.insertedRows).isEqualTo(1);
        Optional<Product> product = productRepository.findByModelCodeAndIsDeletedFalse("AM080AXVHHH1");
        assertThat(product).isPresent();
        assertThat(product.get().getProductCategory()).isEqualTo(ProductCategory.COMMERCIAL_PART);
        assertThat(product.get().getReleasePrice()).isEqualByComparingTo(new BigDecimal("8012400"));
        assertThat(product.get().getDeliveryPrice()).isEqualByComparingTo(new BigDecimal("4406820"));
    }

    /**
     * legacy 1:1 보존 가드 (개발책임자 정정 2026-05-05) — sync 가 가격/사양 값은
     * {@link GoogleSheetsClient#readSheetDisplay} 로 읽고, 변동DC 마커만
     * {@link GoogleSheetsClient#readSheetFormulas} 로 별도 읽는다. raw
     * {@link GoogleSheetsClient#readSheet(String, String)} (legacy {@code getValues()}) 는 사용 X.
     */
    @Test
    void sync_시트read는_DISPLAY와_FORMULA만_호출하고_raw_getValues는_사용하지_않는다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi", "RENDER_MODE_GUARD", "", "1,000,000", "", "900,000")
        ));

        syncService.syncAll();

        // 6 current tab + 홈멀티 base tab(인상 전 단가 PriceHistory) + 구성품 2 tab(싱글/상업 BUNDLE 적재) read.
        verify(sheetsClient, times(9)).readSheetDisplay(eq("test-sheet-id"), anyString());
        verify(sheetsClient, times(1)).readSheetFormulas("test-sheet-id", "홈멀티_단가인상!A1:ZZ");
        verify(sheetsClient, times(0)).readSheet(eq("test-sheet-id"), anyString());
    }

    @Test
    void sync_FORMULA_A1ZZ_모델코드매칭으로_행순서_어긋남과_후행수식을_보존한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi A", "HM_FORMULA_A", "", "1,500,000", "", "1,200,000"),
                row("Hi-Multi B", "HM_FORMULA_B", "", "1,600,000", "", "1,300,000")
        ));
        // FORMULA 응답은 ragged row + 넓은 A1:ZZ 범위 특성상 DISPLAY 와 폭/순서를 그대로 신뢰하지 않는다.
        when(sheetsClient.readSheetFormulas("test-sheet-id", "홈멀티_단가인상!A1:ZZ")).thenReturn(rows(
                row("품 명", "모델명"),
                row("Hi-Multi B", "HM_FORMULA_B", "", "", "", "", "=SUM(1,2)"),
                row("Hi-Multi A", "HM_FORMULA_A", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
                        "", "", "", "", "", "", "", "", "", "", "", "=\nLET(useK2,$L$2,useK2)")
        ));

        syncService.syncAll();

        Product a = productRepository.findByModelCodeAndIsDeletedFalse("HM_FORMULA_A").orElseThrow();
        Product b = productRepository.findByModelCodeAndIsDeletedFalse("HM_FORMULA_B").orElseThrow();
        assertThat(a.getHasVariableDiscount())
                .as("A1:ZZ 후행 열의 멀티라인 수식 $L$2 를 모델코드 매칭으로 검출")
                .isTrue();
        assertThat(b.getHasVariableDiscount())
                .as("행 인덱스만 신뢰해 A의 수식이 B에 붙으면 안 된다")
                .isFalse();

        verify(sheetsClient).readSheetFormulas("test-sheet-id", "홈멀티_단가인상!A1:ZZ");
    }

    /**
     * 3 mode delegation 가드 — {@link GoogleSheetsClient#readSheetDisplay} 와
     * {@link GoogleSheetsClient#readSheetFormulas} 가 mock 으로도 정상 stub 가능함을 검증
     * (Mockito @MockBean 이 신규 method 까지 감지함을 확인).
     */
    @Test
    void mockBean_은_3_render_mode_method_모두_stub_가능() throws Exception {
        List<List<Object>> dummyDisplay = List.of(List.of("display"));
        List<List<Object>> dummyFormula = List.of(List.of("=$L$2"));
        List<List<Object>> dummyRaw = List.of(List.of(123));

        when(sheetsClient.readSheetDisplay("any-id", "any-range"))
                .thenReturn(dummyDisplay);
        when(sheetsClient.readSheetFormulas("any-id", "any-range"))
                .thenReturn(dummyFormula);
        when(sheetsClient.readSheet("any-id", "any-range"))
                .thenReturn(dummyRaw);
        when(sheetsClient.readSheet("any-id", "any-range", ValueRenderMode.FORMATTED))
                .thenReturn(dummyDisplay);

        assertThat(sheetsClient.readSheetDisplay("any-id", "any-range")).isEqualTo(dummyDisplay);
        assertThat(sheetsClient.readSheetFormulas("any-id", "any-range")).isEqualTo(dummyFormula);
        assertThat(sheetsClient.readSheet("any-id", "any-range")).isEqualTo(dummyRaw);
        assertThat(sheetsClient.readSheet("any-id", "any-range", ValueRenderMode.FORMATTED))
                .isEqualTo(dummyDisplay);
    }

    @Test
    void sync_싱글세트_구성품_적재되고_부모는_BUNDLE_마킹된다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        // 부모 세트(싱글 세트_단가인상): EXPAND 대상 + KEEP 대상(발통세트) 2개.
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 세트_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "단위", "출고가", "수량", "납품가", "납품가", "소계"),
                row("360 CST 세트", "15", "AC060CS6PBH1SY", "SET", "2,488,200", "", "1,490,000", "1,490,000", "-"),
                row("발통세트 원형", "", "FOOT_SET_001", "SET", "100,000", "", "80,000", "80,000", "-")
        ));
        // 구성품(싱글 구성품_단가인상): col0=품명, col2=모델명, col5=출고가, col7=납품가, col8=세트.
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 구성품_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "구분", "단위", "출고가", "비고", "납품가", "세트", "구성품특징", "규격"),
                row("실내기 360", "", "IN_360_A", "실내기", "대", "250,000", "", "250,000", "AC060CS6PBH1SY", "기본", "규격A"),
                row("실외기 360", "", "OUT_360_A", "실외기", "대", "800,000", "", "800,000", "AC060CS6PBH1SY", "", "규격B"),
                row("발통 자재", "", "FOOT_PART_A", "자재", "EA", "10,000", "", "10,000", "FOOT_SET_001", "", "")
        ));

        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();
        assertThat(summary.totalComponentLinkOccurrences).isEqualTo(3);
        assertThat(summary.totalBundlesMarkedProducts).isEqualTo(2);

        // EXPAND 부모
        Product expandSet = productRepository.findByModelCodeAndIsDeletedFalse("AC060CS6PBH1SY").orElseThrow();
        assertThat(expandSet.getProductType()).isEqualTo(ProductType.BUNDLE);
        assertThat(expandSet.getBundleMode()).isEqualTo(BundleMode.EXPAND);
        List<BundleComponent> comps = bundleComponentRepository.findByBundleProductId(expandSet.getId());
        assertThat(comps).hasSize(2);
        assertThat(comps).extracting(BundleComponent::getComponentProductCode)
                .containsExactlyInAnyOrder("IN_360_A", "OUT_360_A");
        assertThat(comps).allSatisfy(c ->
                assertThat(c.getQtyMode()).isEqualTo(BundleComponent.QtyMode.FOLLOW_SET));
        assertThat(comps).filteredOn(c -> c.getComponentProductCode().equals("IN_360_A"))
                .singleElement()
                .satisfies(c -> {
                    assertThat(c.getComponentKind()).isEqualTo(BundleComponent.ComponentKind.INDOOR);
                    assertThat(c.getIsDefault()).isTrue();
                });
        assertThat(comps).filteredOn(c -> c.getComponentProductCode().equals("OUT_360_A"))
                .singleElement()
                .satisfies(c -> {
                    assertThat(c.getComponentKind()).isEqualTo(BundleComponent.ComponentKind.OUTDOOR);
                    assertThat(c.getIsDefault()).isFalse();
                });
        assertThat(bundleExpander.expand("AC060CS6PBH1SY", BigDecimal.ONE))
                .extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("IN_360_A");

        // 자식 parentBundleSetModel
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("IN_360_A").orElseThrow()
                .getParentBundleSetModel()).isEqualTo("AC060CS6PBH1SY");

        // KEEP 부모(발통세트)
        Product keepSet = productRepository.findByModelCodeAndIsDeletedFalse("FOOT_SET_001").orElseThrow();
        assertThat(keepSet.getProductType()).isEqualTo(ProductType.BUNDLE);
        assertThat(keepSet.getBundleMode()).isEqualTo(BundleMode.KEEP);
    }

    @Test
    void RED_A_V37_감사_부모의_시트_교체_신규행도_기본으로_전개한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "모델명", "단위", "대분류", "출고가", "비고", "납품가"),
                row("V37 상업멀티 세트", "AM240AXVHHR1SY_RED_A", "SET", "세트", "9,000,000", "", "5,000,000"),
                row("기존 실외기", "AM120AXVHHR1_RED_A", "대", "실외기", "4,000,000", "", "2,000,000"),
                row("교체 실외기", "AM100AXVHHR1_RED_A", "대", "실외기", "3,000,000", "", "1,500,000")
        ));
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티 구성_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "모델명", "단위", "출고가", "수량", "납품가", "소계", "규격", "세트", "구분"),
                row("기존 실외기", "AM120AXVHHR1_RED_A", "대", "4,000,000", "Q", "2,000,000", "", "", "AM240AXVHHR1SY_RED_A", "실외기 기본")
        ));

        syncService.syncAll();
        Product parent = productRepository.findByModelCodeAndIsDeletedFalse("AM240AXVHHR1SY_RED_A").orElseThrow();
        BundleComponent original = bundleComponentRepository.findByBundleProductId(parent.getId()).get(0);
        jdbcTemplate.update("""
                INSERT INTO bundle_component_default_backfill_audit (
                    id, migration_key, bundle_component_id, bundle_product_id, component_product_code,
                    previous_is_default, applied_is_default, reason, created_by, is_deleted
                ) VALUES (?, 'PR1132-V37', ?, ?, ?, false, true, 'RED-A fixture', 'test', false)
                """, UUID.randomUUID(), original.getId(), parent.getId(), original.getComponentProductCode());

        // 기존 감사행 유지 + 신규행 추가: 시트 raw에 '기본'이 없어도 둘 다 부모 정책으로 true.
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티 구성_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "모델명", "단위", "출고가", "수량", "납품가", "소계", "규격", "세트", "구분"),
                row("기존 실외기", "AM120AXVHHR1_RED_A", "대", "4,000,000", "Q", "2,000,000", "", "", "AM240AXVHHR1SY_RED_A", "실외기"),
                row("교체 실외기", "AM100AXVHHR1_RED_A", "대", "3,000,000", "Q", "1,500,000", "", "", "AM240AXVHHR1SY_RED_A", "실외기")
        ));
        syncService.syncAll();
        assertThat(bundleComponentRepository.findByBundleProductId(parent.getId()))
                .hasSize(2)
                .allSatisfy(component -> assertThat(component.getIsDefault()).isTrue());

        // 기존 감사행 제거 + 신규행 교체: 삭제 감사행을 되살리지 않고 신규행만 true로 전개.
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티 구성_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "모델명", "단위", "출고가", "수량", "납품가", "소계", "규격", "세트", "구분"),
                row("교체 실외기", "AM100AXVHHR1_RED_A", "대", "3,000,000", "Q", "1,500,000", "", "", "AM240AXVHHR1SY_RED_A", "실외기")
        ));

        syncService.syncAll();

        List<BundleComponent> active = bundleComponentRepository.findByBundleProductId(parent.getId());
        assertThat(active).singleElement().satisfies(component -> {
            assertThat(component.getComponentProductCode()).isEqualTo("AM100AXVHHR1_RED_A");
            assertThat(component.getIsDefault()).isTrue();
        });
        assertThat(jdbcTemplate.queryForObject(
                "SELECT is_deleted FROM bundle_component WHERE id = ?", Boolean.class, original.getId())).isTrue();
        assertThat(bundleExpander.expand("AM240AXVHHR1SY_RED_A", BigDecimal.ONE))
                .extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("AM100AXVHHR1_RED_A");

        // 관리자 PUT과 같은 manual=true + false 선택: 후속 시트가 '기본'이어도 덮지 않고 0행 전개 허용.
        BundleComponent manuallyDisabled = active.get(0);
        manuallyDisabled.changeAttributes(manuallyDisabled.getDefaultQty(), manuallyDisabled.getQtyMode(),
                manuallyDisabled.getComponentKind(), manuallyDisabled.getComponentVariant(), false,
                manuallyDisabled.getSpecText());
        bundleComponentRepository.save(manuallyDisabled);
        parent.markBundleComponentsManual();
        productRepository.save(parent);
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티 구성_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "모델명", "단위", "출고가", "수량", "납품가", "소계", "규격", "세트", "구분"),
                row("교체 실외기", "AM100AXVHHR1_RED_A", "대", "3,000,000", "Q", "1,500,000", "", "", "AM240AXVHHR1SY_RED_A", "실외기 기본")
        ));
        syncService.syncAll();
        assertThat(bundleComponentRepository.findByBundleProductId(parent.getId()))
                .singleElement()
                .satisfies(component -> assertThat(component.getIsDefault()).isFalse());
        assertThat(bundleExpander.expand("AM240AXVHHR1SY_RED_A", BigDecimal.ONE)).isEmpty();
    }

    @Test
    void RED_B_V37_rollback_완료_부모는_시트의_기본_문자열_규칙으로_복귀한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "모델명", "단위", "대분류", "출고가", "비고", "납품가"),
                row("rollback 상업멀티 세트", "V37_ROLLBACK_PARENT", "SET", "세트", "9,000,000", "", "5,000,000"),
                row("기존 실외기", "V37_ROLLBACK_OLD", "대", "실외기", "4,000,000", "", "2,000,000"),
                row("신규 실외기", "V37_ROLLBACK_NEW", "대", "실외기", "3,000,000", "", "1,500,000")
        ));
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티 구성_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "모델명", "단위", "출고가", "수량", "납품가", "소계", "규격", "세트", "구분"),
                row("기존 실외기", "V37_ROLLBACK_OLD", "대", "4,000,000", "Q", "2,000,000", "", "", "V37_ROLLBACK_PARENT", "실외기 기본")
        ));
        syncService.syncAll();
        Product parent = productRepository.findByModelCodeAndIsDeletedFalse("V37_ROLLBACK_PARENT").orElseThrow();
        BundleComponent original = bundleComponentRepository.findByBundleProductId(parent.getId()).get(0);
        jdbcTemplate.update("""
                INSERT INTO bundle_component_default_backfill_audit (
                    id, migration_key, bundle_component_id, bundle_product_id, component_product_code,
                    previous_is_default, applied_is_default, reason, rolled_back_at, rolled_back_by,
                    created_by, is_deleted
                ) VALUES (?, 'PR1132-V37', ?, ?, ?, false, true, 'RED-B fixture', now(), 'test', 'test', false)
                """, UUID.randomUUID(), original.getId(), parent.getId(), original.getComponentProductCode());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티 구성_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "모델명", "단위", "출고가", "수량", "납품가", "소계", "규격", "세트", "구분"),
                row("신규 실외기", "V37_ROLLBACK_NEW", "대", "3,000,000", "Q", "1,500,000", "", "", "V37_ROLLBACK_PARENT", "실외기")
        ));

        syncService.syncAll();

        assertThat(bundleComponentRepository.findByBundleProductId(parent.getId()))
                .singleElement()
                .satisfies(component -> assertThat(component.getIsDefault()).isFalse());
    }

    @Test
    void sync_구성품_미존재_두_occurrence는_총_skip_occurrence에_합산된다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 구성품_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "구분", "단위", "출고가", "비고", "납품가", "세트", "구성품특징", "규격"),
                row("없는 자식 1", "", "MISSING_CHILD_1", "자재", "EA", "10,000", "", "10,000", "MISSING_PARENT", "", ""),
                row("없는 자식 2", "", "MISSING_CHILD_2", "자재", "EA", "20,000", "", "20,000", "MISSING_PARENT", "", "")
        ));

        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();

        assertThat(summary.byComponentTab.get("싱글 구성품_단가인상").skippedOccurrences).isEqualTo(2);
        assertThat(summary.totalSkippedOccurrences).isEqualTo(2);
        assertThat(summary.totalComponentLinkOccurrences).isZero();
        assertThat(summary.totalPreservedManualProductOccurrences).isZero();
        assertThat(summary.totalPreservedManualComponentOccurrences).isZero();
    }

    @Test
    void sync_수기_구성품_보존은_product와_분리된_두_occurrence로_집계된다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 세트_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "단위", "출고가", "수량", "납품가", "납품가", "소계"),
                row("수기 보존 세트", "", "MANUAL_COMPONENT_PARENT", "SET", "100,000", "", "80,000", "80,000", "-")
        ));
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 구성품_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "구분", "단위", "출고가", "비고", "납품가", "세트", "구성품특징", "규격"),
                row("수기 자재 1", "", "MANUAL_COMPONENT_CHILD_1", "자재", "EA", "10,000", "", "10,000", "MANUAL_COMPONENT_PARENT", "", ""),
                row("수기 자재 2", "", "MANUAL_COMPONENT_CHILD_2", "자재", "EA", "20,000", "", "20,000", "MANUAL_COMPONENT_PARENT", "", "")
        ));
        syncService.syncAll();
        Product parent = productRepository.findByModelCodeAndIsDeletedFalse("MANUAL_COMPONENT_PARENT").orElseThrow();
        parent.markBundleComponentsManual();
        productRepository.save(parent);

        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();

        assertThat(summary.totalPreservedManualProductOccurrences).isZero();
        assertThat(summary.totalPreservedManualComponentOccurrences).isEqualTo(2);
        assertThat(summary.totalSkippedOccurrences).isZero();
    }

    @Test
    void sync_카운터_필드는_단위_suffix를_강제한다() {
        assertThat(java.util.stream.Stream.of(
                ProductSheetSyncService.TabSyncResult.class,
                ProductSheetSyncService.ComponentSyncResult.class,
                ProductSheetSyncService.SyncSummary.class)
                .flatMap(type -> java.util.Arrays.stream(type.getFields()))
                .filter(field -> field.getType() == int.class)
                .map(java.lang.reflect.Field::getName)
                .filter(name -> !name.endsWith("Rows") && !name.endsWith("Occurrences")
                        && !name.endsWith("Products") && !name.endsWith("Tabs"))
                .toList())
                .isEmpty();
    }

    @Test
    void sync_상업멀티구성_수량Q와_숫자_모두_FOLLOW_SET() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        // 부모(상업멀티_단가인상): mapping (name0, model1, release4, delivery6).
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "모델명", "단위", "대분류", "출고가", "비고", "납품가"),
                row("DVM 8HP 세트", "COMM_SET_1", "SET", "실외기", "8,000,000", "", "4,400,000")
        ));
        // 구성품(상업멀티 구성_단가인상): mapping (name0, model1, release3, delivery5) + 헤더 수량/세트/구분.
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티 구성_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "모델명", "단위", "출고가", "수량", "납품가", "소계", "규격", "세트", "구분"),
                row("구성Q", "CP_Q", "대", "100,000", "Q", "90,000", "", "", "COMM_SET_1", "실내기"),
                row("구성3", "CP_3", "대", "50,000", "3", "45,000", "", "", "COMM_SET_1", "실외기")
        ));

        syncService.syncAll();

        Product commSet = productRepository.findByModelCodeAndIsDeletedFalse("COMM_SET_1").orElseThrow();
        assertThat(commSet.getProductType()).isEqualTo(ProductType.BUNDLE);
        List<BundleComponent> comps = bundleComponentRepository.findByBundleProductId(commSet.getId());
        assertThat(comps).hasSize(2);
        assertThat(comps).filteredOn(c -> c.getComponentProductCode().equals("CP_Q"))
                .singleElement()
                .satisfies(c -> {
                    assertThat(c.getQtyMode()).isEqualTo(BundleComponent.QtyMode.FOLLOW_SET);
                    assertThat(c.getDefaultQty()).isEqualByComparingTo("1");
                });
        assertThat(comps).filteredOn(c -> c.getComponentProductCode().equals("CP_3"))
                .singleElement()
                .satisfies(c -> {
                    // 숫자 N도 FOLLOW_SET(defaultQty=N) — 전개 시 setQty×N (legacy explodeCommSets_ 정합).
                    assertThat(c.getQtyMode()).isEqualTo(BundleComponent.QtyMode.FOLLOW_SET);
                    assertThat(c.getDefaultQty()).isEqualByComparingTo("3");
                });
    }

    @Test
    void sync_상업멀티구성_구분blank_상업멀티자식은_OUTDOOR_일반자식은_ACCESSORY() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        // 부모 세트 + AM* 실외기 자식은 상업멀티 탭에서 COMMERCIAL_MULTI 로 먼저 적재된다.
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "모델명", "단위", "대분류", "출고가", "비고", "납품가"),
                row("DVM S2 세트", "COMM_SET_OUTDOOR_KIND", "SET", "세트", "9,000,000", "", "5,000,000"),
                row("DVM S2 프라임 8HP", "AM080AXVHHH1_KIND", "대", "실외기", "8,012,400", "", "4,406,820")
        ));
        // 구분 blank: AM* COMMERCIAL_MULTI 자식은 OUTDOOR override, 일반 구성품은 ACCESSORY 유지.
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티 구성_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "모델명", "단위", "출고가", "수량", "납품가", "소계", "규격", "세트", "구분"),
                row("DVM S2 프라임 8HP", "AM080AXVHHH1_KIND", "대", "8,012,400", "Q", "4,406,820", "", "", "COMM_SET_OUTDOOR_KIND", ""),
                row("통신 부속", "COMM_ACC_KIND", "EA", "10,000", "1", "8,000", "", "", "COMM_SET_OUTDOOR_KIND", "")
        ));

        syncService.syncAll();

        Product parent = productRepository.findByModelCodeAndIsDeletedFalse("COMM_SET_OUTDOOR_KIND").orElseThrow();
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("AM080AXVHHH1_KIND").orElseThrow()
                .getProductCategory()).isEqualTo(ProductCategory.COMMERCIAL_MULTI);
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("COMM_ACC_KIND").orElseThrow()
                .getProductCategory()).isEqualTo(ProductCategory.COMMERCIAL_PART);

        List<BundleComponent> comps = bundleComponentRepository.findByBundleProductId(parent.getId());
        assertThat(comps).hasSize(2);
        assertThat(comps).filteredOn(c -> c.getComponentProductCode().equals("AM080AXVHHH1_KIND"))
                .singleElement()
                .satisfies(c -> assertThat(c.getComponentKind()).isEqualTo(BundleComponent.ComponentKind.OUTDOOR));
        assertThat(comps).filteredOn(c -> c.getComponentProductCode().equals("COMM_ACC_KIND"))
                .singleElement()
                .satisfies(c -> assertThat(c.getComponentKind()).isEqualTo(BundleComponent.ComponentKind.ACCESSORY));
    }

    @Test
    void sync_구성품_재sync_멱등_그리고_사라진_구성품_softDelete() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 세트_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "단위", "출고가", "수량", "납품가", "납품가", "소계"),
                row("멱등 세트", "15", "IDEMP_SET", "SET", "2,000,000", "", "1,500,000", "1,500,000", "-")
        ));
        List<List<Object>> partsWith2 = rows(
                row("품명", "평형", "모델명", "구분", "단위", "출고가", "비고", "납품가", "세트", "구성품특징", "규격"),
                row("실내기", "", "IDEMP_IN", "실내기", "대", "250,000", "", "250,000", "IDEMP_SET", "기본", "규격A"),
                row("실외기", "", "IDEMP_OUT", "실외기", "대", "800,000", "", "800,000", "IDEMP_SET", "", "규격B")
        );
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 구성품_단가인상!A1:Z")).thenReturn(partsWith2);

        // 1차 sync
        syncService.syncAll();
        Product set = productRepository.findByModelCodeAndIsDeletedFalse("IDEMP_SET").orElseThrow();
        assertThat(bundleComponentRepository.findByBundleProductId(set.getId())).hasSize(2);

        // 2차 sync — 동일 데이터 → 멱등(중복 active 0, V11 위반 예외 없음)
        ProductSheetSyncService.SyncSummary second = syncService.syncAll();
        assertThat(second.byComponentTab.get("싱글 구성품_단가인상").error).isNull();
        assertThat(bundleComponentRepository.findByBundleProductId(set.getId())).hasSize(2);

        // 3차 sync — 구성품 1개(IDEMP_OUT) 시트에서 제거 → soft-delete
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 구성품_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "구분", "단위", "출고가", "비고", "납품가", "세트", "구성품특징", "규격"),
                row("실내기", "", "IDEMP_IN", "실내기", "대", "250,000", "", "250,000", "IDEMP_SET", "기본", "규격A")
        ));
        ProductSheetSyncService.SyncSummary third = syncService.syncAll();
        assertThat(third.byComponentTab.get("싱글 구성품_단가인상").softDeletedComponentRows).isEqualTo(1);
        List<BundleComponent> remaining = bundleComponentRepository.findByBundleProductId(set.getId());
        assertThat(remaining).hasSize(1);
        assertThat(remaining).extracting(BundleComponent::getComponentProductCode).containsExactly("IDEMP_IN");
    }

    @Test
    void sync_사양보유탭_헤더컬럼을_ProductSpec으로_적재하고_비사양컬럼은_제외() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        // 홈멀티 mapping(name0, model1, release3, delivery5) → 사양 컬럼은 col2/4/6/7.
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "배관경", "출고가", "냉매가스", "납품가", "에너지소비효율", "제품중량"),
                row("Hi-Multi 사양", "HM_SPEC_1", "9/15", "1,500,000", "R-32", "1,200,000", "1등급", "52")
        ));

        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();
        assertThat(summary.byTab.get("홈멀티").specsLinkedRows).isEqualTo(4);

        Product p = productRepository.findByModelCodeAndIsDeletedFalse("HM_SPEC_1").orElseThrow();
        List<ProductSpec> specs = productSpecRepository.findByProductIdOrderByDisplayOrderAsc(p.getId());
        assertThat(specs).extracting(ProductSpec::getSpecKey)
                .containsExactlyInAnyOrder("배관경", "냉매가스", "에너지소비효율등급", "제품중량, kg");
        // 비사양 컬럼(품명/모델명/출고가/납품가)은 제외
        assertThat(specs).extracting(ProductSpec::getSpecKey)
                .doesNotContain("품명", "모델명", "출고가", "납품가");
        assertThat(specs).filteredOn(s -> s.getSpecKey().equals("냉매가스"))
                .singleElement().satisfies(s -> assertThat(s.getSpecValue()).isEqualTo("R-32"));

        // 멱등 재sync + 값 변경 → editValue(중복 생성 0)
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "배관경", "출고가", "냉매가스", "납품가", "에너지소비효율", "제품중량"),
                row("Hi-Multi 사양", "HM_SPEC_1", "9/15", "1,500,000", "R-410A", "1,200,000", "1등급", "52")
        ));
        syncService.syncAll();
        List<ProductSpec> after = productSpecRepository.findByProductIdOrderByDisplayOrderAsc(p.getId());
        assertThat(after).hasSize(4); // 중복 생성 없음
        assertThat(after).filteredOn(s -> s.getSpecKey().equals("냉매가스"))
                .singleElement().satisfies(s -> assertThat(s.getSpecValue()).isEqualTo("R-410A"));
    }

    @Test
    void sync_판넬행_타공사이즈전산볼트간격_매핑_능력키_미생성() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        // 홈멀티 mapping(name0, model1, release3, delivery5): col4/6은 판넬에서 타공/전산볼트, 비판넬에서 냉방능력/소비전력.
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "배관경", "출고가", "냉방성능(정격)", "납품가", "소비전력(정격)", "제품크기"),
                row("판넬 360 QA", "PC1QA", "", "1,500,000", "1020", "1,200,000", "645", "100x50x100"),
                row("홈멀티 AC QA", "AMQA1", "9/15", "1,500,000", "7.2", "1,200,000", "0.39", "900x300x200")
        ));

        syncService.syncAll();

        Product panel = productRepository.findByModelCodeAndIsDeletedFalse("PC1QA").orElseThrow();
        List<ProductSpec> panelSpecs = productSpecRepository.findByProductIdOrderByDisplayOrderAsc(panel.getId());
        assertThat(panelSpecs).extracting(ProductSpec::getSpecKey)
                .contains("타공사이즈, mm", "전산볼트간격, mm")
                .doesNotContain("냉방능력, kW", "냉방능력, kcal/h", "냉방소비전력, kW");
        assertThat(panelSpecs).filteredOn(s -> s.getSpecKey().equals("타공사이즈, mm"))
                .singleElement().satisfies(s -> assertThat(s.getSpecValue()).isEqualTo("1020"));
        assertThat(panelSpecs).filteredOn(s -> s.getSpecKey().equals("전산볼트간격, mm"))
                .singleElement().satisfies(s -> assertThat(s.getSpecValue()).isEqualTo("645"));

        Product normal = productRepository.findByModelCodeAndIsDeletedFalse("AMQA1").orElseThrow();
        List<ProductSpec> normalSpecs = productSpecRepository.findByProductIdOrderByDisplayOrderAsc(normal.getId());
        assertThat(normalSpecs).extracting(ProductSpec::getSpecKey)
                .contains("냉방능력, kW", "냉방소비전력, kW");
        assertThat(normalSpecs).filteredOn(s -> s.getSpecKey().equals("냉방능력, kW"))
                .singleElement().satisfies(s -> assertThat(s.getSpecValue()).isEqualTo("7.2"));
        assertThat(normalSpecs).filteredOn(s -> s.getSpecKey().equals("냉방소비전력, kW"))
                .singleElement().satisfies(s -> assertThat(s.getSpecValue()).isEqualTo("0.39"));
    }

    @Test
    void sync_Product_attribute_panelType_remoteType을_자동_적재한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "비고", "출고가", "비고", "납품가"),
                row("공기청정 WIFI 판넬", "HM_PANEL_ATTR", "", "100,000", "", "80,000"),
                row("컬러유선리모컨", "HM_REMOTE_ATTR", "", "40,000", "", "30,000"),
                row("Hi-Multi 4-Way 실내기", "HM_NORMAL_ATTR", "", "1,500,000", "", "1,200,000")
        ));

        syncService.syncAll();

        Product panel = productRepository.findByModelCodeAndIsDeletedFalse("HM_PANEL_ATTR").orElseThrow();
        assertThat(panel.getPanelType()).isEqualTo("공청");
        assertThat(panel.getRemoteType()).isNull();

        Product remote = productRepository.findByModelCodeAndIsDeletedFalse("HM_REMOTE_ATTR").orElseThrow();
        assertThat(remote.getPanelType()).isNull();
        assertThat(remote.getRemoteType()).isEqualTo("컬러유선");

        Product normal = productRepository.findByModelCodeAndIsDeletedFalse("HM_NORMAL_ATTR").orElseThrow();
        assertThat(normal.getPanelType()).isNull();
        assertThat(normal.getRemoteType()).isNull();
    }

    @Test
    void sync_DB상태_동일해도_attribute_null이면_백필하고_다음_sync는_unchanged() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        List<List<Object>> sameRows = rows(
                row("품 명", "모델명", "비고", "출고가", "비고", "납품가"),
                row("공기청정 WIFI 판넬", "HM_PANEL_BACKFILL", "", "100,000", "", "80,000")
        );
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(sameRows);

        syncService.syncAll();
        Product panel = productRepository.findByModelCodeAndIsDeletedFalse("HM_PANEL_BACKFILL").orElseThrow();
        panel.changeAttributes(null, null);
        productRepository.save(panel);

        ProductSheetSyncService.SyncSummary second = syncService.syncAll();
        ProductSheetSyncService.TabSyncResult secondHome = second.byTab.get("홈멀티");
        assertThat(secondHome.updatedRows).isEqualTo(1);
        assertThat(secondHome.unchangedRows).isZero();
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("HM_PANEL_BACKFILL").orElseThrow()
                .getPanelType()).isEqualTo("공청");

        ProductSheetSyncService.SyncSummary third = syncService.syncAll();
        ProductSheetSyncService.TabSyncResult thirdHome = third.byTab.get("홈멀티");
        assertThat(thirdHome.updatedRows).isZero();
        assertThat(thirdHome.unchangedRows).isEqualTo(1);
    }

    @Test
    void sync_사양키_사라졌다_재등장해도_UNIQUE위반없이_재활성() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        // 1차: 냉매가스 사양 존재
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "배관경", "출고가", "냉매가스", "납품가"),
                row("Hi-Multi", "HM_CHURN", "9/15", "1,500,000", "R-32", "1,200,000")
        ));
        syncService.syncAll();
        Product p = productRepository.findByModelCodeAndIsDeletedFalse("HM_CHURN").orElseThrow();
        assertThat(productSpecRepository.findByProductIdAndSpecKey(p.getId(), "냉매가스")).isPresent();

        // 2차: 냉매가스 값 비움('-') → soft-delete
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "배관경", "출고가", "냉매가스", "납품가"),
                row("Hi-Multi", "HM_CHURN", "9/15", "1,500,000", "-", "1,200,000")
        ));
        syncService.syncAll();
        assertThat(productSpecRepository.findByProductIdAndSpecKey(p.getId(), "냉매가스")).isEmpty();

        // 3차: 냉매가스 재등장 → 전체 UNIQUE 였다면 제약위반 롤백. 부분 UNIQUE(V12)면 신규 active 정상.
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "배관경", "출고가", "냉매가스", "납품가"),
                row("Hi-Multi", "HM_CHURN", "9/15", "1,500,000", "R-410A", "1,200,000")
        ));
        ProductSheetSyncService.SyncSummary third = syncService.syncAll();
        assertThat(third.byTab.get("홈멀티").error).isNull();
        assertThat(productSpecRepository.findByProductIdAndSpecKey(p.getId(), "냉매가스"))
                .get().satisfies(s -> assertThat(s.getSpecValue()).isEqualTo("R-410A"));
    }

    /**
     * #노출구분(2026-06-10) — display_order: sync 가 각 탭의 유효 데이터 행 순번(1부터)을
     * display_order 로 적재. 견적/주문 카탈로그가 구글 시트 행 순서 그대로 표시되도록 보존.
     */
    @Test
    void sync_display_order_시트_행순서대로_적재() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        // 싱글 세트 mapping(name0, model2, release4, delivery7) — 3 행 시트 순서대로.
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 세트_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "단위", "출고가", "수량", "납품가", "납품가", "소계"),
                row("360 CST UV", "15", "DO_FIRST", "SET", "2,488,200", "", "1,490,000", "1,490,000", "-"),
                row("360 CST UV", "18", "DO_SECOND", "SET", "2,500,000", "", "1,520,000", "1,520,000", "-"),
                row("360 CST UV", "25", "DO_THIRD", "SET", "2,700,000", "", "1,690,000", "1,690,000", "-")
        ));

        syncService.syncAll();

        // 시트 행 순서(1,2,3) = display_order 그대로
        assertThat(exposureOrder("DO_FIRST", EstimateCategory.SINGLE_SET)).isEqualTo(1);
        assertThat(exposureOrder("DO_SECOND", EstimateCategory.SINGLE_SET)).isEqualTo(2);
        assertThat(exposureOrder("DO_THIRD", EstimateCategory.SINGLE_SET)).isEqualTo(3);

        // findExposedCatalog 정렬도 시트 순서대로
        List<Product> exposed = productRepository.findExposedCatalog(
                com.samhanair.logis.product.domain.EstimateCategory.SINGLE_SET,
                List.of(com.samhanair.logis.product.domain.UsageScope.ESTIMATE,
                        com.samhanair.logis.product.domain.UsageScope.BOTH));
        assertThat(exposed).extracting(Product::getModelCode)
                .containsExactly("DO_FIRST", "DO_SECOND", "DO_THIRD");
    }

    /**
     * #노출구분(2026-06-10) — stomping 방지 회귀: 견적 탭(싱글 세트, BOTH)에서 먼저 적재된 품목이
     * 같은 modelCode 로 구성품 탭(싱글 구성품, NONE)에 재출현해도 노출분류(usageScope/estimateCategory/
     * display_order)가 NONE 으로 덮어쓰이지 않아야 한다. 가드 {@code p.getProductCategory()==mapping.productCategory}
     * 제거 시 본 테스트가 실패한다(실 데이터에서 SINGLE_SET 276개 전부 NONE 으로 손상되었던 버그).
     */
    @Test
    void sync_견적탭_품목이_구성품탭에_재출현해도_노출분류_미stomping() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        // 싱글 세트(BOTH, 견적 탭 — TAB_MAPPINGS 상 구성품 탭보다 먼저 처리)
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 세트_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "단위", "출고가", "수량", "납품가", "납품가", "소계"),
                row("공기청정 WIFI 판넬", "15", "STOMP_TEST", "SET", "2,488,200", "", "1,490,000", "1,490,000", "-")
        ));
        // 싱글 구성품(NONE) — 같은 modelCode 가 구성품 행으로 재출현(col2=model, col8=세트).
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 구성품_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "구분", "단위", "출고가", "비고", "납품가", "세트", "구성품특징", "규격"),
                row("재출현 구성", "", "STOMP_TEST", "실내기", "대", "250,000", "", "250,000", "OTHER_SET", "기본", "규격A")
        ));

        syncService.syncAll();

        Product p = productRepository.findByModelCodeAndIsDeletedFalse("STOMP_TEST").orElseThrow();
        // 견적 탭(SINGLE_SET) 분류 유지 — 구성품 탭(SINGLE_PART/NONE)이 덮어쓰지 않음
        assertThat(p.getProductCategory()).isEqualTo(ProductCategory.SINGLE_SET);
        assertThat(p.getUsageScope())
                .isEqualTo(com.samhanair.logis.product.domain.UsageScope.BOTH);
        assertThat(p.getPanelType()).isEqualTo("공청");
        assertThat(p.getRemoteType()).isNull();
        assertThat(exposureOrder("STOMP_TEST", EstimateCategory.SINGLE_SET)).isEqualTo(1);
        // 노출 카탈로그에 정상 노출(NONE 으로 stomp 되었다면 미반환)
        assertThat(productRepository.findExposedCatalog(
                com.samhanair.logis.product.domain.EstimateCategory.SINGLE_SET,
                List.of(com.samhanair.logis.product.domain.UsageScope.ESTIMATE,
                        com.samhanair.logis.product.domain.UsageScope.BOTH)))
                .extracting(Product::getModelCode).contains("STOMP_TEST");

        // 2차 sync — DB 상태 동일 경로에서도 구성품 탭 재출현이 attribute 를 덮어쓰지 않아야 한다.
        syncService.syncAll();
        Product afterSecondSync = productRepository.findByModelCodeAndIsDeletedFalse("STOMP_TEST").orElseThrow();
        assertThat(afterSecondSync.getPanelType()).isEqualTo("공청");
        assertThat(afterSecondSync.getRemoteType()).isNull();
    }

    /**
     * V14 수동 override 보존 가드 — usageScopeManual=true 인 품목은 sync 시 usageScope 및 M:N 노출 불변.
     */
    @Test
    void sync_수동override_true인_품목은_usageScope_불변_displayOrder는_갱신() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        // 1차 sync — 홈멀티(BOTH) 로 insert
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi 수동테스트", "MANUAL_GUARD", "", "1,500,000", "", "1,200,000")
        ));
        syncService.syncAll();

        Product p = productRepository.findByModelCodeAndIsDeletedFalse("MANUAL_GUARD").orElseThrow();
        assertThat(p.getUsageScope()).isEqualTo(com.samhanair.logis.product.domain.UsageScope.BOTH);
        assertThat(exposureOrder("MANUAL_GUARD", EstimateCategory.HOME_MULTI)).isEqualTo(1);

        // 수동 override: usageScope 를 PARTNER_ORDER 로 변경하고 플래그 true
        p.markUsageManual(com.samhanair.logis.product.domain.UsageScope.PARTNER_ORDER);
        productRepository.save(p);
        assertThat(p.isUsageScopeManual()).isTrue();

        // 2차 sync — 시트 row 변경(가격 변경 → DB 직접 비교로 update 경로 진입)
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi 수동테스트", "MANUAL_GUARD", "", "1,600,000", "", "1,300,000")  // 가격 변경
        ));
        syncService.syncAll();

        // 보존 가드: usageScope 는 수동 설정값(PARTNER_ORDER) 유지 — 시트(BOTH) 로 덮어쓰이지 않음
        Product after = productRepository.findByModelCodeAndIsDeletedFalse("MANUAL_GUARD").orElseThrow();
        assertThat(after.getUsageScope())
                .as("수동 override 보존 — 시트 BOTH 로 덮어쓰이면 안 됨")
                .isEqualTo(com.samhanair.logis.product.domain.UsageScope.PARTNER_ORDER);
        assertThat(after.isUsageScopeManual()).isTrue();

        assertThat(exposureOrder("MANUAL_GUARD", EstimateCategory.HOME_MULTI))
                .as("manual=true 이면 sync 는 exposure 를 변경하지 않음")
                .isEqualTo(1);
        // 가격은 갱신됨
        assertThat(after.getReleasePrice()).isEqualByComparingTo(new BigDecimal("1600000"));
    }

    /**
     * V14 수동 override 보존 가드 — usageScopeManual=false(기본) 인 품목은 기존대로 시트 기준 갱신.
     *
     * <p>지적 [26] (PR-B 2026-06-11): false 케이스는 단순 "BOTH 항상 참" 이 아닌
     * 실제 변조(PARTNER_ORDER) 후 복원(BOTH) 단언으로 강화.
     * true 케이스에 estimateCategory null 단언 추가.
     */
    @Test
    void sync_수동override_false인_품목은_기존대로_시트기준_갱신() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi 자동", "AUTO_GUARD", "", "1,500,000", "", "1,200,000")
        ));
        syncService.syncAll();

        Product p = productRepository.findByModelCodeAndIsDeletedFalse("AUTO_GUARD").orElseThrow();
        assertThat(p.isUsageScopeManual()).isFalse();
        assertThat(p.getUsageScope()).isEqualTo(com.samhanair.logis.product.domain.UsageScope.BOTH);

        // 변조: DB 에서 PARTNER_ORDER 로 직접 변경 후 manual=false 유지
        p.changeUsage(com.samhanair.logis.product.domain.UsageScope.PARTNER_ORDER);
        productRepository.save(p);
        assertThat(p.isUsageScopeManual()).isFalse();

        // 2차 sync — 가격 변경으로 update 경로 진입 (DB 직접 비교)
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi 자동", "AUTO_GUARD", "", "1,700,000", "", "1,400,000")
        ));
        syncService.syncAll();

        Product after = productRepository.findByModelCodeAndIsDeletedFalse("AUTO_GUARD").orElseThrow();
        // manual=false 이므로 시트 기준(BOTH) 으로 복원되어야 함
        assertThat(after.getUsageScope())
                .as("manual=false → 시트 기준(BOTH) 으로 복원")
                .isEqualTo(com.samhanair.logis.product.domain.UsageScope.BOTH);
    }

    /**
     * V18 수동 override 보존 가드 — PARTNER_ORDER manual 전환 후 sync 는 기존 exposure 를 건드리지 않는다.
     */
    @Test
    void sync_수동override_true_PARTNER_ORDER_exposure_미변경() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        // 홈멀티(BOTH + HOME_MULTI estimateCategory) 로 insert
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi EC-TEST", "EC_GUARD", "", "1,500,000", "", "1,200,000")
        ));
        syncService.syncAll();

        Product p = productRepository.findByModelCodeAndIsDeletedFalse("EC_GUARD").orElseThrow();
        assertThat(exposureOrder("EC_GUARD", EstimateCategory.HOME_MULTI)).isEqualTo(1);

        // PARTNER_ORDER 로 수동 override
        p.markUsageManual(com.samhanair.logis.product.domain.UsageScope.PARTNER_ORDER);
        productRepository.save(p);

        assertThat(p.isUsageScopeManual()).isTrue();

        // 2차 sync — 가격 변경 후 manual=true 이므로 estimateCategory 계속 null
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi EC-TEST", "EC_GUARD", "", "1,600,000", "", "1,300,000")
        ));
        syncService.syncAll();

        Product after = productRepository.findByModelCodeAndIsDeletedFalse("EC_GUARD").orElseThrow();
        assertThat(after.getUsageScope()).isEqualTo(com.samhanair.logis.product.domain.UsageScope.PARTNER_ORDER);
        assertThat(exposureOrder("EC_GUARD", EstimateCategory.HOME_MULTI))
                .as("manual=true 이면 sync 는 exposure 를 삭제하거나 갱신하지 않음")
                .isEqualTo(1);
    }

    /**
     * V19 적재 회귀 — 상업멀티 견적 탭의 useK2=true 를 같은 modelCode 의 구성품 탭이 false 로 덮으면 안 된다.
     *
     * <p>상업멀티 구성 탭 F열은 소계라 {@code $L$2} 수식이 없으므로 기존 update 분기에서는
     * hasVariableDiscount=false 로 오염됐다. 변동DC는 productCategory 가 일치하는 견적 탭에서만 갱신한다.
     */
    @Test
    void sync_상업멀티_useK2_true를_상업멀티구성_false가_덮어쓰지_않음() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "단위", "비고", "출고가", "비고", "납품가"),
                row("상업멀티 세트", "COMM_VDC_01", "SET", "", "5,000,000", "", "4,000,000")
        ));
        when(sheetsClient.readSheetFormulas("test-sheet-id", "상업멀티_단가인상!A1:ZZ")).thenReturn(rows(
                row("품 명", "모델명", "단위", "비고", "출고가", "비고", "납품가"),
                row("상업멀티 세트", "COMM_VDC_01", "SET", "", "=100", "", "=$L$2*100")
        ));
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티 구성_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "비고", "출고가", "수량", "납품가", "소계"),
                row("상업멀티 구성", "COMM_VDC_01", "구성", "1,000,000", "1", "900,000", "900,000")
        ));
        when(sheetsClient.readSheetFormulas("test-sheet-id", "상업멀티 구성_단가인상!A1:ZZ")).thenReturn(rows(
                row("품 명", "모델명", "비고", "출고가", "수량", "납품가", "소계"),
                row("상업멀티 구성", "COMM_VDC_01", "구성", "=100", "1", "=90", "=F2*E2")
        ));

        syncService.syncAll();

        Product after = productRepository.findByModelCodeAndIsDeletedFalse("COMM_VDC_01").orElseThrow();
        assertThat(after.getProductCategory()).isEqualTo(ProductCategory.COMMERCIAL_MULTI);
        assertThat(after.getHasVariableDiscount())
                .as("구성품 탭의 useK2=false 가 견적 탭의 변동DC=true 를 덮으면 안 됨")
                .isTrue();
    }

    /**
     * V19 수동 변동DC override 보존 — variableDiscountManual=true 인 품목은 sync update 경로에서도
     * hasVariableDiscount 를 시트 값으로 덮어쓰지 않는다.
     */
    @Test
    void sync_variableDiscountManual_true인_품목은_변동DC_불변() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi Variable Manual", "VAR_MANUAL_01", "", "1,500,000", "", "1,200,000")
        ));
        when(sheetsClient.readSheetFormulas("test-sheet-id", "홈멀티_단가인상!A1:ZZ")).thenReturn(rows(
                row("품 명", "모델명", "비고", "출고가", "비고", "납품가"),
                row("Hi-Multi Variable Manual", "VAR_MANUAL_01", "", "=100", "", "=$L$2*100")
        ));
        syncService.syncAll();

        Product p = productRepository.findByModelCodeAndIsDeletedFalse("VAR_MANUAL_01").orElseThrow();
        assertThat(p.getHasVariableDiscount()).isTrue();
        p.markVariableDiscountManual(false);
        productRepository.save(p);
        assertThat(p.isVariableDiscountManual()).isTrue();

        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi Variable Manual", "VAR_MANUAL_01", "", "1,600,000", "", "1,300,000")
        ));
        when(sheetsClient.readSheetFormulas("test-sheet-id", "홈멀티_단가인상!A1:ZZ")).thenReturn(rows(
                row("품 명", "모델명", "비고", "출고가", "비고", "납품가"),
                row("Hi-Multi Variable Manual", "VAR_MANUAL_01", "", "=100", "", "=$L$2*100")
        ));
        syncService.syncAll();

        Product after = productRepository.findByModelCodeAndIsDeletedFalse("VAR_MANUAL_01").orElseThrow();
        assertThat(after.getHasVariableDiscount())
                .as("manual=false 로 지정한 변동DC 값은 sync 의 useK2=true 로 덮어쓰지 않음")
                .isFalse();
        assertThat(after.isVariableDiscountManual()).isTrue();
        assertThat(after.getReleasePrice()).isEqualByComparingTo(new BigDecimal("1600000"));
    }

    /**
     * V19 변동DC DELETE 자동복귀 — clearVariableDiscountOverride 는 manual=false 로 되돌리고
     * 수동 override 해제 후 DB 직접 비교로, 행 내용이 동일해도 다음 sync 가 시트 기준 변동DC를 재적재한다.
     */
    @Test
    void sync_variableDiscountManual_DELETE_후_행무변경_sync_시트기준_복원() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        List<List<Object>> sameRows = homeMultiRows(
                row("Hi-Multi Variable Clear", "VAR_CLEAR_01", "", "1,500,000", "", "1,200,000")
        );
        List<List<Object>> sameFormulas = rows(
                row("품 명", "모델명", "비고", "출고가", "비고", "납품가"),
                row("Hi-Multi Variable Clear", "VAR_CLEAR_01", "", "=100", "", "=$L$2*100")
        );
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(sameRows);
        when(sheetsClient.readSheetFormulas("test-sheet-id", "홈멀티_단가인상!A1:ZZ")).thenReturn(sameFormulas);

        syncService.syncAll();
        Product p = productRepository.findByModelCodeAndIsDeletedFalse("VAR_CLEAR_01").orElseThrow();
        assertThat(p.getHasVariableDiscount()).isTrue();

        // PATCH /variable-discount 와 동일: 수동값 false 지정 + manual=true.
        p.markVariableDiscountManual(false);
        productRepository.save(p);
        assertThat(p.getHasVariableDiscount()).isFalse();
        assertThat(p.isVariableDiscountManual()).isTrue();

        // DELETE /variable-discount 와 동일: manual=false 복귀.
        productService.clearVariableDiscountOverride("VAR_CLEAR_01");
        Product cleared = productRepository.findByModelCodeAndIsDeletedFalse("VAR_CLEAR_01").orElseThrow();
        assertThat(cleared.getHasVariableDiscount()).isFalse();
        assertThat(cleared.isVariableDiscountManual()).isFalse();

        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();
        ProductSheetSyncService.TabSyncResult homeTab = summary.byTab.get("홈멀티");
        assertThat(homeTab.updatedRows)
                .as("variableDiscount DELETE 후 DB 직접 비교로 행 무변경에도 update 경로 진입")
                .isEqualTo(1);

        Product after = productRepository.findByModelCodeAndIsDeletedFalse("VAR_CLEAR_01").orElseThrow();
        assertThat(after.getHasVariableDiscount())
                .as("시트 수식($L$2) 기준 변동DC true 재적재")
                .isTrue();
        assertThat(after.isVariableDiscountManual()).isFalse();
    }

    /**
     * F1-a 수동 분류/고정DC 보존 — PATCH 후 행이 다시 비교되어도
     * 사용자가 저장한 분류와 고정DC는 시트/GAS 기본값으로 되돌아가면 안 된다.
     */
    @Test
    void sync_classificationManual_true인_품목은_분류와_고정DC_불변() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        List<List<Object>> sameRows = rows(
                row("품 명", "모델명", "비고", "출고가", "비고", "납품가", "고정DC"),
                row("공기청정 WIFI 판넬", "CLASS_MANUAL_01", "", "100,000", "", "80,000", "12.5%")
        );
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(sameRows);

        syncService.syncAll();
        Product synced = productRepository.findByModelCodeAndIsDeletedFalse("CLASS_MANUAL_01").orElseThrow();
        assertThat(synced.getCatL()).extracting(Classification::getName).isEqualTo("판넬");
        assertThat(synced.getFixedDiscountRate()).isEqualByComparingTo("12.5");

        Classification manualL = classificationRepository.save(Classification.create(
                EstimateCategory.HOME_MULTI, Classification.CatLevel.L, null, "수동 대분류", 99, true));
        classificationRepository.flush();

        productService.updateClassificationAndFixedDiscount(
                "CLASS_MANUAL_01",
                new UpdateProductClassificationRequest(manualL.getId(), null, null));
        productService.updateFixedDiscountAndReturn(
                "CLASS_MANUAL_01",
                new com.samhanair.logis.product.web.dto.UpdateProductFixedDiscountRequest("33.33"));

        Product afterPatch = productRepository.findByModelCodeAndIsDeletedFalse("CLASS_MANUAL_01").orElseThrow();
        assertThat(afterPatch.isClassificationManual()).isTrue();
        assertThat(afterPatch.isFixedDiscountManual()).isTrue();

        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();
        ProductSheetSyncService.TabSyncResult homeTab = summary.byTab.get("홈멀티");
        assertThat(homeTab.updatedRows)
                .as("classification 수동값이 있는 행은 DB 직접 비교 후에도 불필요한 update 없이 유지")
                .isZero();

        Product afterSync = productRepository.findByModelCodeAndIsDeletedFalse("CLASS_MANUAL_01").orElseThrow();
        assertThat(afterSync.getCatL()).extracting(Classification::getName).isEqualTo("수동 대분류");
        assertThat(afterSync.getFixedDiscountRate()).isEqualByComparingTo("33.33");
    }

    /**
     * F1-a GAS parity — 홈멀티 품명 정규식 분류 + 고정DC% 시트값 적재.
     */
    @Test
    void sync_GAS_home_품명분류와_고정DC를_Classification으로_적재한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "비고", "출고가", "비고", "납품가", "고정DC"),
                row("공기청정 WIFI 판넬", "PANEL_WIFI_01", "", "100,000", "", "80,000", "12.5%")
        ));

        syncService.syncAll();

        Product product = productRepository.findByModelCodeAndIsDeletedFalse("PANEL_WIFI_01").orElseThrow();
        assertThat(product.getCatL()).extracting(Classification::getName).isEqualTo("판넬");
        assertThat(product.getCatM()).extracting(Classification::getName).isEqualTo("공기청정 WIFI");
        assertThat(product.getCatS()).isNull();
        assertThat(product.getFixedDiscountRate()).isEqualByComparingTo(new BigDecimal("12.5"));
        assertThat(classificationRepository.findByEstimateCategoryAndParentIsNullOrderByDisplayOrderAsc(
                        EstimateCategory.HOME_MULTI))
                .extracting(Classification::getName)
                .contains("판넬");
    }

    /**
     * F1-a GAS parity — 상업멀티 DUCT 고정압 소분류와 0-분류 전수 가드.
     */
    @Test
    void sync_GAS_commercial_품명분류는_catL_catM_catS_0분류가_없다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "단위", "비고", "출고가", "비고", "납품가", "고정DC"),
                row("DUCT 고정압 실내기", "AM120BNHDCH1", "EA", "", "1,000,000", "", "700,000", "0"),
                row("상업용 전열교환기", "ERV_COMM_01", "EA", "", "2,000,000", "", "1,400,000", "")
        ));

        syncService.syncAll();

        Product duct = productRepository.findByModelCodeAndIsDeletedFalse("AM120BNHDCH1").orElseThrow();
        assertThat(duct.getCatL()).extracting(Classification::getName).isEqualTo("실내기");
        assertThat(duct.getCatM()).extracting(Classification::getName).isEqualTo("DUCT");
        assertThat(duct.getCatS()).extracting(Classification::getName).isEqualTo("고정압");
        assertThat(duct.getFixedDiscountRate()).isEqualByComparingTo(BigDecimal.ZERO);

        List<Product> synced = productRepository.findByProductCategoryAndIsDeletedFalse(
                ProductCategory.COMMERCIAL_MULTI);
        assertThat(synced)
                .as("GAS 규칙 대상 row 는 catL 0-분류가 없어야 한다")
                .allSatisfy(product -> assertThat(product.getCatL()).isNotNull());
    }

    /**
     * [[spec-sync-full-db-distribution-check]]
     * F1-a GAS parity — 실 카탈로그 수준 다건 픽스처의 카테고리별 0-분류 분포 가드.
     *
     * <p>분류 정규식이 대량 회귀하면 특정 카테고리 전체가 {@code catL IS NULL} 로 손상된다.
     * GAS 기대 분포는 견적 카탈로그 3종 + 구성품 2종 모두 0건이다.
     */
    @Test
    void sync_GAS_다건_카탈로그_카테고리별_catL_0분류_분포를_검증한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "비고", "출고가", "비고", "납품가", "고정DC"),
                row("공기청정 WIFI 판넬", "HM_PANEL_WIFI", "", "100,000", "", "80,000", "12.5%"),
                row("실외기 단배관", "HM_ODU_SINGLE", "", "200,000", "", "160,000", ""),
                row("벽걸이 실내기 소형", "HM_INDOOR_WALL", "", "300,000", "", "240,000", "0"),
                row("리모컨 유선", "HM_REMOTE", "", "40,000", "", "30,000", "")
        ));
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 세트_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "단위", "출고가", "수량", "납품가", "납품가", "소계"),
                row("360 CST UV 세트", "15", "SS_360_UV", "SET", "2,488,200", "", "1,490,000", "1,490,000", "-"),
                row("1-Way WIFI 내장 세트", "18", "SS_1WAY_WIFI", "SET", "2,100,000", "", "1,260,000", "1,260,000", "-"),
                row("벽걸이 실내기 세트", "6", "SS_WALL", "SET", "900,000", "", "600,000", "600,000", "-"),
                row("분기관 패키지", "", "SS_BRANCH", "SET", "100,000", "", "70,000", "70,000", "-")
        ));
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 구성품_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "단위", "수량", "출고가", "비고", "납품가", "세트"),
                row("유선 리모컨", "", "SP_REMOTE_DIST", "EA", "", "40,000", "", "30,000", "SS_360_UV"),
                row("판넬 공기청정 WIFI", "", "SP_PANEL_DIST", "EA", "", "100,000", "", "80,000", "SS_360_UV")
        ));
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품 명", "모델명", "단위", "비고", "출고가", "비고", "납품가", "고정DC"),
                row("DVM S2 프라임 8HP 실외기", "AM080AXVHHH1_DIST", "대", "", "8,012,400", "", "4,406,820", ""),
                row("DUCT 고정압 실내기", "AM120BNHDCH1_DIST", "EA", "", "1,000,000", "", "700,000", "0"),
                row("상업용 전열교환기", "ERV_COMM_DIST", "EA", "", "2,000,000", "", "1,400,000", ""),
                row("분기관 세트", "COMM_BRANCH_DIST", "EA", "", "80,000", "", "60,000", "")
        ));
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티 구성_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "모델명", "단위", "출고가", "수량", "납품가", "소계", "비고", "세트", "고정DC"),
                row("분기관 세트", "COMM_PART_BRANCH_DIST", "EA", "80,000", "", "60,000", "-", "", "AM080AXVHHH1_DIST", ""),
                row("DUCT 고정압 실내기", "COMM_PART_DUCT_DIST", "EA", "1,000,000", "", "700,000", "-", "", "AM080AXVHHH1_DIST", "0")
        ));

        syncService.syncAll();

        Map<ProductCategory, Long> expectedNullCatLCounts = Map.of(
                ProductCategory.HOME_MULTI, 0L,
                ProductCategory.SINGLE_SET, 0L,
                ProductCategory.SINGLE_PART, 0L,
                ProductCategory.COMMERCIAL_MULTI, 0L,
                ProductCategory.COMMERCIAL_PART, 0L);
        expectedNullCatLCounts.forEach((category, expected) -> {
            long actual = productRepository.findByProductCategoryAndIsDeletedFalse(category).stream()
                    .filter(product -> product.getCatL() == null)
                    .count();
            assertThat(actual)
                    .as("%s GAS catL IS NULL(0-분류) 분포", category)
                    .isEqualTo(expected);
        });
    }

    /**
     * V14 수동 override 해제(DELETE /usage) 후 행 내용 무변경 상태로
     * sync 재실행 시 시트 기준으로 재분류되어야 한다 (지적 [2], PR-B 2026-06-11).
     *
     * <p>시나리오:
     * 1차 sync → insert(BOTH). 수동 PARTNER_ORDER 토글 → override 해제. 2차 sync(행 무변경)
     * → 현재 DB 값과 시트 기준이 달라 update 경로 진입 → BOTH 재분류.
     */
    @Test
    void sync_수동override_해제_후_행무변경_sync_시트기준_재분류() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        List<List<Object>> sameRows = homeMultiRows(
                row("Hi-Multi EvictTest", "EVICT_MODEL", "", "1,500,000", "", "1,200,000")
        );
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(sameRows);

        // 1차 sync — insert (BOTH)
        syncService.syncAll();
        Product p = productRepository.findByModelCodeAndIsDeletedFalse("EVICT_MODEL").orElseThrow();
        assertThat(p.getUsageScope()).isEqualTo(com.samhanair.logis.product.domain.UsageScope.BOTH);

        // 수동 override: PARTNER_ORDER 로 변경
        p.markUsageManual(com.samhanair.logis.product.domain.UsageScope.PARTNER_ORDER);
        productRepository.save(p);
        assertThat(p.isUsageScopeManual()).isTrue();

        // clearUsageManual (DELETE /usage 경로와 동일)
        p.clearUsageManual();
        productRepository.save(p);

        // 2차 sync — 시트 행 내용 무변경 (동일 sameRows)
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(sameRows);
        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();

        // DB 직접 비교에서 usageScope 차이를 발견 → update 경로 진입 → BOTH 재분류
        ProductSheetSyncService.TabSyncResult homeTab = summary.byTab.get("홈멀티");
        assertThat(homeTab.updatedRows)
                .as("override 해제 후 DB 직접 비교로 행 무변경에도 update 경로 진입")
                .isEqualTo(1);

        Product after = productRepository.findByModelCodeAndIsDeletedFalse("EVICT_MODEL").orElseThrow();
        assertThat(after.getUsageScope())
                .as("시트 기준(BOTH) 재분류 복원")
                .isEqualTo(com.samhanair.logis.product.domain.UsageScope.BOTH);
        assertThat(after.isUsageScopeManual()).isFalse();
    }

    /**
     * V14 soft-delete 가드 — usageScopeManual=true 인 품목은 시트 부재 시에도 삭제 보호 (지적 [4]).
     */
    @Test
    void sync_수동override_품목은_시트_부재시_softDelete_제외() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi Manual", "MANUAL_NOSHEET", "", "1,500,000", "", "1,200,000")
        ));
        syncService.syncAll();

        // 수동 override 설정
        Product p = productRepository.findByModelCodeAndIsDeletedFalse("MANUAL_NOSHEET").orElseThrow();
        p.markUsageManual(com.samhanair.logis.product.domain.UsageScope.PARTNER_ORDER);
        productRepository.save(p);

        // 2차 sync — 시트에서 해당 row 제거 (빈 응답)
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows());
        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();

        // manual=true 이므로 soft-delete 제외 — 여전히 활성
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("MANUAL_NOSHEET"))
                .as("usageScopeManual=true 품목 — 시트 부재 시에도 soft-delete 보호")
                .isPresent();
        // softDeletedProductRows=0, preservedManualProductOccurrences=1, skippedOccurrences=0 (파싱 skip 없음) — 사이클2 지적 P3-6 카운터 분리
        ProductSheetSyncService.TabSyncResult homeTab = summary.byTab.get("홈멀티");
        assertThat(homeTab.softDeletedProductRows).isZero();
        assertThat(homeTab.preservedManualProductOccurrences).isEqualTo(1);
        assertThat(homeTab.skippedOccurrences).isZero();
    }

    @Test
    void sync_실외기_신규품목은_OUTDOOR_카테고리로_생성한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("실외기", "CATEGORY_OUTDOOR_NEW", "", "1,500,000", "", "1,200,000")
        ));

        syncService.syncAll();

        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("CATEGORY_OUTDOOR_NEW").orElseThrow()
                .getCategory().getCode()).isEqualTo("OUTDOOR");
    }

    @Test
    void sync_미일치_신규품목은_UNCLASSIFIED_카테고리로_생성한다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("AM180NXVUHH1", "CATEGORY_UNCLASSIFIED_NEW", "", "1,500,000", "", "1,200,000")
        ));

        syncService.syncAll();

        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("CATEGORY_UNCLASSIFIED_NEW").orElseThrow()
                .getCategory().getCode()).isEqualTo("UNCLASSIFIED");
    }

    @Test
    void sync_softDelete후_재등장한_수동카테고리품목은_기존카테고리를_보존한다() throws Exception {
        Category outdoor = categoryRepository.findByCode("OUTDOOR").orElseThrow();
        Product deleted = productRepository.saveAndFlush(Product.seedFromSheet(
                "수동 분류 품목", "CATEGORY_REAPPEAR", outdoor,
                new BigDecimal("1000000"), new BigDecimal("800000"),
                ProductType.SINGLE, ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI));
        jdbcTemplate.update("UPDATE products SET classification_manual = TRUE WHERE id = ?", deleted.getId());
        deleted.markDeleted("test-soft-delete");
        productRepository.saveAndFlush(deleted);
        entityManager.clear();

        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("수동 분류 품목", "CATEGORY_REAPPEAR", "", "1,500,000", "", "1,200,000")
        ));

        syncService.syncAll();

        Product restored = productRepository.findByModelCodeAndIsDeletedFalse("CATEGORY_REAPPEAR").orElseThrow();
        assertThat(restored.getId()).isEqualTo(deleted.getId());
        assertThat(restored.getCategory().getCode()).isEqualTo("OUTDOOR");
    }

    /** 홈멀티 시트 헤더 + data row 를 ValueRange.values() 형태로 생성. */
    @SafeVarargs
    private static List<List<Object>> homeMultiRows(List<Object>... dataRows) {
        java.util.List<java.util.List<Object>> all = new java.util.ArrayList<>();
        // 헤더 row — col0 에 "품" + "명" 포함 (findHeaderRow 가 인식)
        all.add(List.of("품 명", "모델명", "비고", "출고가", "비고", "납품가"));
        for (List<Object> r : dataRows) all.add(r);
        return all;
    }

    private static List<List<Object>> singleSetSpecRows(String pipeDiameter, String efficiencyGrade) {
        java.util.List<java.util.List<Object>> all = new java.util.ArrayList<>();
        all.add(List.of("품 명", "평형", "모델명", "비고", "출고가", "비고", "비고", "납품가",
                "성능(kcal/h)(최소/정격/최대)", "성능(kW)(최소/정격/최대)",
                "소비전력(kW)(최소/정격/최대)", "배관경", "등급(냉방/난방)"));
        all.add(List.of("Spec counter", "1", "SPEC_COUNTER_MODEL", "", "1,000,000", "", "", "900,000",
                "100|200|300", "10|20|30", "5|6|7", pipeDiameter, efficiencyGrade));
        return all;
    }

    @SafeVarargs
    private static List<List<Object>> rows(List<Object>... rows) {
        return List.of(rows);
    }

    private Integer exposureOrder(String modelCode, EstimateCategory category) {
        Product product = productRepository.findByModelCodeAndIsDeletedFalse(modelCode).orElseThrow();
        return exposureRepository.findByProductIdAndEstimateCategoryAndIsDeletedFalse(product.getId(), category)
                .orElseThrow()
                .getDisplayOrder();
    }

    private void assertSingleClassification(String modelCode, String catL, String catM) {
        Product product = productRepository.findByModelCodeAndIsDeletedFalse(modelCode).orElseThrow();
        assertThat(product.getCatL()).extracting(Classification::getName).isEqualTo(catL);
        if (catM == null || catM.isBlank()) {
            assertThat(product.getCatM()).isNull();
        } else {
            assertThat(product.getCatM()).extracting(Classification::getName).isEqualTo(catM);
        }
        assertThat(product.getCatS()).isNull();
    }

    private static List<Object> row(Object... vals) {
        return List.of(vals);
    }
}
