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
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.service.ProductSheetSyncService;
import java.math.BigDecimal;
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
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티!A1:Z")).thenReturn(homeMultiRows(
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
    void sync_재실행_rowHash_동일이면_update_없음() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        List<List<Object>> homeMulti = homeMultiRows(
                row("Hi-Multi", "MODEL_HASH_TEST", "", "1,000,000", "", "900,000")
        );
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티!A1:Z")).thenReturn(homeMulti);

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
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi", "PRICE_CHANGE_MODEL", "", "1,000,000", "", "900,000")
        ));
        syncService.syncAll();

        // 가격 변경 시트 응답으로 swap
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티!A1:Z")).thenReturn(homeMultiRows(
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
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi", "WILL_VANISH", "", "1,000,000", "", "900,000")
        ));
        syncService.syncAll();
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("WILL_VANISH")).isPresent();

        // 시트에서 해당 row 제거 — 빈 응답
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티!A1:Z")).thenReturn(homeMultiRows());
        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();

        ProductSheetSyncService.TabSyncResult homeTab = summary.byTab.get("홈멀티");
        assertThat(homeTab.softDeleted).isEqualTo(1);
        // soft delete 후 active 조회 X
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("WILL_VANISH")).isEmpty();
    }

    @Test
    void sync_싱글세트는_구글시트_C열_모델명과_H열_납품가를_그대로_읽는다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 세트!A1:Z")).thenReturn(rows(
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
        when(sheetsClient.readSheetDisplay("test-sheet-id", "상업멀티 구성!A1:Z")).thenReturn(rows(
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
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi", "RENDER_MODE_GUARD", "", "1,000,000", "", "900,000")
        ));

        syncService.syncAll();

        // 6 tab 전체에 대해 readSheetDisplay 가 호출되어야 함 (FORMATTED — legacy getDisplayValues 1:1)
        verify(sheetsClient, times(6)).readSheetDisplay(eq("test-sheet-id"), anyString());
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
