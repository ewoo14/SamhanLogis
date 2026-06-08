package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.domain.BranchPipeLookup;
import com.samhanair.logis.product.domain.MaterialPrice;
import com.samhanair.logis.product.domain.OduRecommendationLookup;
import com.samhanair.logis.product.domain.OduRecommendationLookup.RecommendationType;
import com.samhanair.logis.product.repository.BranchPipeLookupRepository;
import com.samhanair.logis.product.repository.MaterialPriceRepository;
import com.samhanair.logis.product.repository.OduRecommendationLookupRepository;
import com.samhanair.logis.product.service.ProductLookupSheetSyncService;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

/**
 * lookup 3종 시트 sync IT — 외부 GoogleSheetsClient 는 {@code @MockBean} 으로 격리한다.
 *
 * <p>검증 범위:
 * <ul>
 *     <li>3탭 insert — material/odu/branch natural key 기준 신규 적재</li>
 *     <li>rowHash 동일 재실행 — update 없이 unchanged 처리</li>
 *     <li>시트 값 변경 — active row update</li>
 *     <li>시트 row 제거 — hard delete 없이 soft-delete</li>
 *     <li>시트 무값 컬럼 — branch description/summaryQty, HOME_MULTI indoorCapacity null 보존</li>
 * </ul>
 */
@SpringBootTest(properties = {
        "app.scheduling.enabled=false",
        "google.sheets.sheet-id=test-sheet-id",
        "google.sheets.endpoint-override=http://localhost:0"
})
@DirtiesContext
@WithMockUser(username = "lookup-sync-test")
@Transactional
class ProductLookupSheetSyncServiceIT extends AbstractPostgresIT {

    @MockBean
    private GoogleSheetsClient sheetsClient;

    @Autowired
    private ProductLookupSheetSyncService syncService;

    @Autowired
    private MaterialPriceRepository materialPriceRepository;

    @Autowired
    private OduRecommendationLookupRepository oduRepository;

    @Autowired
    private BranchPipeLookupRepository branchRepository;

    @BeforeEach
    void resetState() throws Exception {
        syncService.clearHashCacheForTest();
        lenient().doNothing().when(sheetsClient).invalidateCache();
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
    }

    /**
     * lookup 3탭 sync 의 핵심 4-way 분기와 null 정직성 계약을 한 시나리오에서 검증한다.
     */
    @Test
    void syncAll_3탭_insert_unchanged_update_softDelete와_null_정직성을_보장한다() throws Exception {
        // given: 3탭 최초 시트 상태
        stubLookupSheets(
                materialRows(
                        row("품 명", "가격", "옵션", "계산값"),
                        row("유선리모컨", "40,000", "유선선택", "0"),
                        row("FPH-1412XS3", "130,000", "", "")
                ),
                oduRows(
                        row("멀티 냉난방", "", "홈멀티", "", ""),
                        row("실내기", "마력", "실내기", "실내기", "마력"),
                        row("5.5", "4HP", "7", "8", "2.5HP")
                ),
                branchRows(
                        row("전체 분기관 개수", "수동추가"),
                        row("1509", "0"),
                        row("2512", "0")
                )
        );

        // when: 1차 sync
        ProductLookupSheetSyncService.SyncSummary first = syncService.syncAll();

        // then: insert + null 계약
        assertThat(first.totalInserted).isEqualTo(7);
        assertThat(first.totalUpdated).isZero();
        assertThat(first.totalSoftDeleted).isZero();

        MaterialPrice d2 = materialPriceRepository.findByMaterialKey("D2").orElseThrow();
        assertThat(d2.getName()).isEqualTo("유선리모컨");
        assertThat(d2.getPrice()).isEqualByComparingTo(new BigDecimal("40000"));
        assertThat(d2.getOptionLabel()).isEqualTo("유선선택");
        assertThat(d2.getComputedFormula()).isEqualTo("0");

        MaterialPrice d3 = materialPriceRepository.findByMaterialKey("D3").orElseThrow();
        assertThat(d3.getOptionLabel()).isNull();
        assertThat(d3.getComputedFormula()).isNull();

        List<OduRecommendationLookup> oduRows = oduRepository.findAll();
        assertThat(oduRows).hasSize(3);
        assertThat(oduRows)
                .filteredOn(row -> row.getRecommendationType() == RecommendationType.HOME_MULTI)
                .allSatisfy(row -> assertThat(row.getIndoorCapacity()).isNull());
        assertThat(oduRows)
                .filteredOn(row -> row.getRecommendationType() == RecommendationType.MULTI_HEATING_COOLING)
                .singleElement()
                .satisfies(row -> {
                    assertThat(row.getIndoorCapacity()).isEqualByComparingTo(new BigDecimal("5.5"));
                    assertThat(row.getIndoorCount()).isNull();
                    assertThat(row.getOutdoorHp()).isEqualTo("4HP");
                });

        BranchPipeLookup branch1509 = branchRepository.findByBranchCode("1509").orElseThrow();
        assertThat(branch1509.getDescription()).isNull();
        assertThat(branch1509.getSummaryQty()).isNull();

        // when: 2차 sync — 동일 rowHash
        ProductLookupSheetSyncService.SyncSummary second = syncService.syncAll();

        // then: unchanged 만 증가
        assertThat(second.totalInserted).isZero();
        assertThat(second.totalUpdated).isZero();
        assertThat(second.totalSoftDeleted).isZero();
        assertThat(second.totalUnchanged).isEqualTo(7);

        // given: material 가격 변경 + branch 2512 제거
        stubLookupSheets(
                materialRows(
                        row("품 명", "가격", "옵션", "계산값"),
                        row("유선리모컨", "45,000", "유선선택", "0"),
                        row("FPH-1412XS3", "130,000", "", "")
                ),
                oduRows(
                        row("멀티 냉난방", "", "홈멀티", "", ""),
                        row("실내기", "마력", "실내기", "실내기", "마력"),
                        row("5.5", "4HP", "7", "8", "2.5HP")
                ),
                branchRows(
                        row("전체 분기관 개수", "수동추가"),
                        row("1509", "0")
                )
        );

        // when
        ProductLookupSheetSyncService.SyncSummary third = syncService.syncAll();

        // then: update + soft-delete
        assertThat(third.byTab.get("싱글 자재가격").updated).isEqualTo(1);
        assertThat(third.byTab.get("분기계산").softDeleted).isEqualTo(1);
        assertThat(materialPriceRepository.findByMaterialKey("D2").orElseThrow().getPrice())
                .isEqualByComparingTo(new BigDecimal("45000"));
        assertThat(branchRepository.findByBranchCode("2512")).isEmpty();
    }

    /**
     * lookup 3탭 readSheetDisplay 응답을 한 번에 교체한다.
     */
    private void stubLookupSheets(List<List<Object>> materialRows,
                                  List<List<Object>> oduRows,
                                  List<List<Object>> branchRows) throws Exception {
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 자재가격!A1:D"))
                .thenReturn(materialRows);
        when(sheetsClient.readSheetDisplay("test-sheet-id", "추천실외기!A1:E"))
                .thenReturn(oduRows);
        when(sheetsClient.readSheetDisplay("test-sheet-id", "분기계산!A1:Z"))
                .thenReturn(branchRows);
    }

    /** 자재가격 시트 rows fixture. */
    @SafeVarargs
    private static List<List<Object>> materialRows(List<Object>... rows) {
        return List.of(rows);
    }

    /** 추천실외기 시트 rows fixture. */
    @SafeVarargs
    private static List<List<Object>> oduRows(List<Object>... rows) {
        return List.of(rows);
    }

    /** 분기계산 시트 rows fixture. */
    @SafeVarargs
    private static List<List<Object>> branchRows(List<Object>... rows) {
        return List.of(rows);
    }

    /** row fixture helper. */
    private static List<Object> row(Object... vals) {
        return List.of(vals);
    }
}
