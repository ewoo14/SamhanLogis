package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.client.GoogleSheetsClient.ValueRenderMode;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.PriceHistory;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.PriceHistoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.ProductSpecRepository;
import com.samhanair.logis.product.service.ProductSheetSyncService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

/**
 * ProductSheetSyncService IT — 외부 GoogleSheetsClient {@code @MockBean} 격리
 * (memory feedback_it_mockbean_external_clients.md 가드).
 *
 * <p>테스트 시나리오:
 * <ul>
 *     <li>1) 첫 sync: insert 만 발생, DB row 수 = 시트 row 수</li>
 *     <li>2) 동일 시트 재 sync: rowHash 일치 → unchanged 만 (update X)</li>
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
    private ProductRepository productRepository;

    @Autowired
    private PriceHistoryRepository priceHistoryRepository;

    @Autowired
    private BundleComponentRepository bundleComponentRepository;

    @Autowired
    private ProductSpecRepository productSpecRepository;

    @BeforeEach
    void resetState() {
        // 메모리 hash 캐시 초기화 — 테스트 간 격리 (Spring 싱글턴 bean 의 in-memory state)
        syncService.clearHashCacheForTest();
        // 캐시 invalidate mock — 호출 검증용
        lenient().doNothing().when(sheetsClient).invalidateCache();
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
        assertThat(summary.totalInserted).isEqualTo(1);
        assertThat(summary.totalUpdated).isZero();
        assertThat(summary.totalSoftDeleted).isZero();

        Optional<Product> p = productRepository.findByModelCodeAndIsDeletedFalse("AJ040RXH4BC1");
        assertThat(p).isPresent();
        assertThat(p.get().getProductCategory()).isEqualTo(ProductCategory.HOME_MULTI);
        // BigDecimal 비교는 compareTo 로 — Hibernate scale (NUMERIC(12,2)) 무관
        assertThat(p.get().getReleasePrice()).isEqualByComparingTo(new BigDecimal("1500000"));
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
        assertThat(homeTab.inserted).isEqualTo(1);
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
    void sync_재실행_rowHash_동일이면_update_없음() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        List<List<Object>> homeMulti = homeMultiRows(
                row("Hi-Multi", "MODEL_HASH_TEST", "", "1,000,000", "", "900,000")
        );
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMulti);

        // 1차 sync — insert
        syncService.syncAll();
        // 2차 sync — 동일 데이터
        ProductSheetSyncService.SyncSummary second = syncService.syncAll();

        // hash 일치 → updated=0 (해당 tab 만)
        ProductSheetSyncService.TabSyncResult homeTab = second.byTab.get("홈멀티");
        assertThat(homeTab).isNotNull();
        assertThat(homeTab.updated).isZero();
        assertThat(homeTab.unchanged).isEqualTo(1);
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
        assertThat(homeTab.updated).isEqualTo(1);
        Optional<Product> p = productRepository.findByModelCodeAndIsDeletedFalse("PRICE_CHANGE_MODEL");
        assertThat(p).isPresent();
        assertThat(p.get().getReleasePrice()).isEqualByComparingTo(new BigDecimal("1100000"));
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
        assertThat(homeTab.softDeleted).isEqualTo(1);
        // soft delete 후 active 조회 X
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("WILL_VANISH")).isEmpty();
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
        assertThat(singleSet.inserted).isEqualTo(1);
        Optional<Product> product = productRepository.findByModelCodeAndIsDeletedFalse("AC060CS6PBH1SY");
        assertThat(product).isPresent();
        assertThat(product.get().getProductCategory()).isEqualTo(ProductCategory.SINGLE_SET);
        assertThat(product.get().getReleasePrice()).isEqualByComparingTo(new BigDecimal("2488200"));
        assertThat(product.get().getDeliveryPrice()).isEqualByComparingTo(new BigDecimal("1490000"));
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
        assertThat(commercialPart.inserted).isEqualTo(1);
        Optional<Product> product = productRepository.findByModelCodeAndIsDeletedFalse("AM080AXVHHH1");
        assertThat(product).isPresent();
        assertThat(product.get().getProductCategory()).isEqualTo(ProductCategory.COMMERCIAL_PART);
        assertThat(product.get().getReleasePrice()).isEqualByComparingTo(new BigDecimal("8012400"));
        assertThat(product.get().getDeliveryPrice()).isEqualByComparingTo(new BigDecimal("4406820"));
    }

    /**
     * legacy 1:1 보존 가드 (개발책임자 정정 2026-05-05) — sync 가
     * {@link GoogleSheetsClient#readSheetDisplay} 만 호출 (legacy {@code getDisplayValues()} 동등)
     * 하고, raw {@link GoogleSheetsClient#readSheet(String, String)}
     * (legacy {@code getValues()}) 는 사용 X.
     */
    @Test
    void sync_시트read는_readSheetDisplay만_호출한다_legacy_getDisplayValues_1to1() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi", "RENDER_MODE_GUARD", "", "1,000,000", "", "900,000")
        ));

        syncService.syncAll();

        // 6 current tab + 홈멀티 base tab(인상 전 단가 PriceHistory) + 구성품 2 tab(싱글/상업 BUNDLE 적재) read.
        verify(sheetsClient, times(9)).readSheetDisplay(eq("test-sheet-id"), anyString());
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
        assertThat(summary.totalComponentsLinked).isEqualTo(3);
        assertThat(summary.totalBundlesMarked).isEqualTo(2);

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
                .satisfies(c -> assertThat(c.getComponentKind()).isEqualTo(BundleComponent.ComponentKind.OUTDOOR));

        // 자식 parentBundleSetModel
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("IN_360_A").orElseThrow()
                .getParentBundleSetModel()).isEqualTo("AC060CS6PBH1SY");

        // KEEP 부모(발통세트)
        Product keepSet = productRepository.findByModelCodeAndIsDeletedFalse("FOOT_SET_001").orElseThrow();
        assertThat(keepSet.getProductType()).isEqualTo(ProductType.BUNDLE);
        assertThat(keepSet.getBundleMode()).isEqualTo(BundleMode.KEEP);
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
        assertThat(third.byComponentTab.get("싱글 구성품_단가인상").softDeleted).isEqualTo(1);
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
        assertThat(summary.byTab.get("홈멀티").specsLinked).isEqualTo(4);

        Product p = productRepository.findByModelCodeAndIsDeletedFalse("HM_SPEC_1").orElseThrow();
        List<ProductSpec> specs = productSpecRepository.findByProductIdOrderByDisplayOrderAsc(p.getId());
        assertThat(specs).extracting(ProductSpec::getSpecKey)
                .containsExactlyInAnyOrder("배관경", "냉매가스", "에너지소비효율", "제품중량");
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

    /** 홈멀티 시트 헤더 + data row 를 ValueRange.values() 형태로 생성. */
    @SafeVarargs
    private static List<List<Object>> homeMultiRows(List<Object>... dataRows) {
        java.util.List<java.util.List<Object>> all = new java.util.ArrayList<>();
        // 헤더 row — col0 에 "품" + "명" 포함 (findHeaderRow 가 인식)
        all.add(List.of("품 명", "모델명", "비고", "출고가", "비고", "납품가"));
        for (List<Object> r : dataRows) all.add(r);
        return all;
    }

    @SafeVarargs
    private static List<List<Object>> rows(List<Object>... rows) {
        return List.of(rows);
    }

    private static List<Object> row(Object... vals) {
        return List.of(vals);
    }
}
