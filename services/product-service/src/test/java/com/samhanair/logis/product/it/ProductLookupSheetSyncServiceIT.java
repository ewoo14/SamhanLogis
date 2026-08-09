package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
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
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * lookup 3종 시트 sync IT — 외부 GoogleSheetsClient 는 {@code @MockBean} 으로 격리한다.
 *
 * <p>검증 범위:
 * <ul>
 *     <li>3탭 insert — material/odu/branch natural key 기준 신규 적재</li>
 *     <li>rowHash 동일 재실행 — update 없이 unchangedRows 처리</li>
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
class ProductLookupSheetSyncServiceIT extends AbstractPostgresIT {

    @MockBean
    private GoogleSheetsClient sheetsClient;

    @Autowired
    private ProductLookupSheetSyncService syncService;

    @Autowired
    private MaterialPriceRepository materialPriceRepository;

    @SpyBean
    private MaterialPriceRepository materialPriceRepositorySpy;

    @Autowired
    private OduRecommendationLookupRepository oduRepository;

    @Autowired
    private BranchPipeLookupRepository branchRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @BeforeEach
    void resetState() throws Exception {
        jdbcTemplate.update("DELETE FROM material_price");
        jdbcTemplate.update("DELETE FROM odu_recommendation_lookup");
        jdbcTemplate.update("DELETE FROM branch_pipe_lookup");
        entityManager.clear();
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
                        row("컬러유선리모컨", "75,000", "", ""),
                        row("블랙판넬", "50,000", "판넬선택", "블랙"),
                        row("", "", "", ""),
                        row("", "", "", ""),
                        row("", "", "", ""),
                        row("", "", "", ""),
                        row("FPH-1412XS3", "130,000", "사이드블록아님", "무시값"),
                        row("가격누락자재", "", "", "")
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
        entityManager.clear();

        // then: insert + null 계약
        assertThat(first.totalInsertedRows).isEqualTo(9);
        assertThat(first.totalUpdatedRows).isZero();
        assertThat(first.totalSoftDeletedLookupRows).isZero();
        assertThat(first.byTab.get("싱글 자재가격").skippedOccurrences).isEqualTo(5);

        MaterialPrice d2 = materialPriceRepository.findByMaterialKey("D2").orElseThrow();
        assertThat(d2.getName()).isEqualTo("유선리모컨");
        assertThat(d2.getPrice()).isEqualByComparingTo(new BigDecimal("40000"));
        assertThat(d2.getOptionLabel()).isEqualTo("유선선택");
        assertThat(d2.getComputedFormula()).isEqualTo("0");

        MaterialPrice d3 = materialPriceRepository.findByMaterialKey("D3").orElseThrow();
        assertThat(d3.getOptionLabel()).isNull();
        assertThat(d3.getComputedFormula()).isNull();

        MaterialPrice d9 = materialPriceRepository.findByMaterialKey("D9").orElseThrow();
        assertThat(d9.getName()).isEqualTo("FPH-1412XS3");
        assertThat(d9.getOptionLabel()).isNull();
        assertThat(d9.getComputedFormula()).isNull();
        assertThat(materialPriceRepository.findByMaterialKey("D10")).isEmpty();

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
        entityManager.clear();

        // then: unchangedRows 만 증가
        assertThat(second.totalInsertedRows).isZero();
        assertThat(second.totalUpdatedRows).isZero();
        assertThat(second.totalSoftDeletedLookupRows).isZero();
        assertThat(second.totalUnchangedRows).isEqualTo(9);

        // given: material 가격 변경 + branch 2512 제거
        stubLookupSheets(
                materialRows(
                        row("품 명", "가격", "옵션", "계산값"),
                        row("유선리모컨", "45,000", "유선선택", "0"),
                        row("컬러유선리모컨", "75,000", "", ""),
                        row("블랙판넬", "50,000", "판넬선택", "블랙"),
                        row("", "", "", ""),
                        row("", "", "", ""),
                        row("", "", "", ""),
                        row("", "", "", ""),
                        row("FPH-1412XS3", "130,000", "사이드블록아님", "무시값")
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
        entityManager.clear();

        // then: update + soft-delete
        assertThat(third.byTab.get("싱글 자재가격").updatedRows).isEqualTo(1);
        assertThat(third.byTab.get("분기계산").softDeletedLookupRows).isEqualTo(1);
        assertThat(materialPriceRepository.findByMaterialKey("D2").orElseThrow().getPrice())
                .isEqualByComparingTo(new BigDecimal("45000"));
        assertThat(branchRepository.findByBranchCode("2512")).isEmpty();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT is_deleted FROM branch_pipe_lookup WHERE branch_code = '2512'", Boolean.class))
                .isTrue();
    }

    /**
     * Sheets API 일시 빈 응답은 시트 전체 삭제 의도가 아니므로 active row 를 보존한다.
     */
    @Test
    void syncAll_빈_시트_응답은_softDelete_하지_않는다() throws Exception {
        stubLookupSheets(
                materialRows(row("품 명", "가격", "옵션", "계산값"), row("유선리모컨", "40,000", "", "")),
                oduRows(row("멀티 냉난방", "", "홈멀티", "", ""), row("실내기", "마력", "실내기", "실내기", "마력"), row("5.5", "4HP", "", "", "")),
                branchRows(row("전체 분기관 개수", "수동추가"), row("1509", "0"))
        );
        syncService.syncAll();
        entityManager.clear();

        stubLookupSheets(List.of(), List.of(), List.of());

        ProductLookupSheetSyncService.SyncSummary emptyRead = syncService.syncAll();
        entityManager.clear();

        assertThat(emptyRead.totalSoftDeletedLookupRows).isZero();
        assertThat(materialPriceRepository.findByMaterialKey("D2")).isPresent();
        assertThat(oduRepository.findActiveByNaturalKey(
                RecommendationType.MULTI_HEATING_COOLING, new BigDecimal("5.5"), null, "4HP"))
                .isPresent();
        assertThat(branchRepository.findByBranchCode("1509")).isPresent();
    }

    /**
     * 자재 row 제거는 soft-delete 로 남기고, 시트 재등장 시 같은 id 를 복구한다.
     */
    @Test
    void syncMaterialPricesTab_softDelete와_restore는_동일_row_id를_보존한다() throws Exception {
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 자재가격!A1:D"))
                .thenReturn(materialRows(
                        row("품 명", "가격", "옵션", "계산값"),
                        row("유선리모컨", "40,000", "", ""),
                        row("컬러유선리모컨", "75,000", "", "")
                ));
        syncService.syncMaterialPricesTab();
        entityManager.clear();
        UUID d3Id = materialPriceRepository.findByMaterialKey("D3").orElseThrow().getId();

        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 자재가격!A1:D"))
                .thenReturn(materialRows(
                        row("품 명", "가격", "옵션", "계산값"),
                        row("유선리모컨", "40,000", "", "")
                ));
        syncService.syncMaterialPricesTab();
        entityManager.clear();

        assertThat(materialPriceRepository.findByMaterialKey("D3")).isEmpty();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT is_deleted FROM material_price WHERE id = ?", Boolean.class, d3Id))
                .isTrue();

        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 자재가격!A1:D"))
                .thenReturn(materialRows(
                        row("품 명", "가격", "옵션", "계산값"),
                        row("유선리모컨", "40,000", "", ""),
                        row("컬러유선리모컨", "75,000", "", "")
                ));
        syncService.syncMaterialPricesTab();
        entityManager.clear();

        MaterialPrice restored = materialPriceRepository.findByMaterialKey("D3").orElseThrow();
        assertThat(restored.getId()).isEqualTo(d3Id);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT is_deleted FROM material_price WHERE id = ?", Boolean.class, d3Id))
                .isFalse();
    }

    /**
     * 자재 탭 저장 실패로 트랜잭션이 롤백되면, 먼저 처리된 행의 hash도 캐시에 남지 않아야 한다.
     *
     * <p>첫 행 저장은 성공시키고 둘째 행 저장에서 실제 런타임 예외를 주입한다. 그러면 첫 행의
     * DB 변경은 롤백되어야 하며, 다음 성공 sync에서는 첫 행도 {@code unchangedRows}가 아니라
     * {@code updatedRows}로 다시 처리되어야 한다.
     */
    @Test
    void syncMaterialPricesTab_저장실패_롤백시_앞서갱신한_hash도_재처리된다() throws Exception {
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 자재가격!A1:D"))
                .thenReturn(materialRows(
                        row("품 명", "가격", "옵션", "계산값"),
                        row("유선리모컨", "40,000", "", ""),
                        row("컬러유선리모컨", "75,000", "", "")
                ));
        syncService.syncMaterialPricesTab();
        entityManager.clear();

        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 자재가격!A1:D"))
                .thenReturn(materialRows(
                        row("품 명", "가격", "옵션", "계산값"),
                        row("유선리모컨", "45,000", "", ""),
                        row("컬러유선리모컨", "80,000", "", "")
                ));
        doAnswer(invocation -> {
            MaterialPrice row = invocation.getArgument(0);
            if ("컬러유선리모컨".equals(row.getName())) {
                throw new IllegalStateException("injected material price save failure");
            }
            return row;
        }).when(materialPriceRepositorySpy).save(any(MaterialPrice.class));

        assertThatThrownBy(() -> syncService.syncMaterialPricesTab())
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("injected material price save failure");
        entityManager.clear();

        assertThat(materialPriceRepository.findByMaterialKey("D2").orElseThrow().getPrice())
                .isEqualByComparingTo(new BigDecimal("40000"));

        assertThatThrownBy(() -> syncService.syncMaterialPricesTab())
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("injected material price save failure");
        entityManager.clear();
        assertThat(materialPriceRepository.findByMaterialKey("D2").orElseThrow().getPrice())
                .isEqualByComparingTo(new BigDecimal("40000"));

        doAnswer(invocation -> invocation.getArgument(0))
                .when(materialPriceRepositorySpy).save(any(MaterialPrice.class));
        ProductLookupSheetSyncService.TabSyncResult retry = syncService.syncMaterialPricesTab();
        entityManager.clear();

        assertThat(retry.updatedRows).isEqualTo(2);
        assertThat(retry.unchangedRows).isZero();
        assertThat(materialPriceRepository.findByMaterialKey("D2").orElseThrow().getPrice())
                .isEqualByComparingTo(new BigDecimal("45000"));
    }

    /** 한 탭의 rollback은 다른 두 탭의 commit된 hash를 무효화하지 않는다. */
    @Test
    void syncAll_한탭_롤백시_나머지두탭_hash는_커밋된다() throws Exception {
        stubLookupSheets(
                materialRows(
                        row("품 명", "가격", "옵션", "계산값"),
                        row("유선리모컨", "40,000", "", ""),
                        row("컬러유선리모컨", "75,000", "", "")
                ),
                oduRows(
                        row("멀티 냉난방", "", "홈멀티", "", ""),
                        row("실내기", "마력", "실내기", "실내기", "마력"),
                        row("5.5", "4HP", "", "", "")
                ),
                branchRows(row("전체 분기관 개수", "수동추가"), row("1509", "0"))
        );
        syncService.syncAll();

        stubLookupSheets(
                materialRows(
                        row("품 명", "가격", "옵션", "계산값"),
                        row("유선리모컨", "45,000", "", ""),
                        row("컬러유선리모컨", "80,000", "", "")
                ),
                oduRows(
                        row("멀티 냉난방", "", "홈멀티", "", ""),
                        row("실내기", "마력", "실내기", "실내기", "마력"),
                        row("5.5", "4HP", "", "", "")
                ),
                branchRows(row("전체 분기관 개수", "수동추가"), row("1509", "0"))
        );
        doAnswer(invocation -> {
            MaterialPrice row = invocation.getArgument(0);
            if ("컬러유선리모컨".equals(row.getName())) {
                throw new IllegalStateException("injected material price save failure");
            }
            return row;
        }).when(materialPriceRepositorySpy).save(any(MaterialPrice.class));

        ProductLookupSheetSyncService.SyncSummary failed = syncService.syncAll();

        assertThat(failed.failedTabs).isEqualTo(1);
        assertThat(failed.successfulTabs).isEqualTo(2);
        assertThat(failed.byTab.get("싱글 자재가격").error)
                .isEqualTo("injected material price save failure");
        assertThat(failed.byTab.get("추천실외기").unchangedRows).isEqualTo(1);
        assertThat(failed.byTab.get("분기계산").unchangedRows).isEqualTo(1);

        doAnswer(invocation -> invocation.getArgument(0))
                .when(materialPriceRepositorySpy).save(any(MaterialPrice.class));
        ProductLookupSheetSyncService.SyncSummary retry = syncService.syncAll();

        assertThat(retry.byTab.get("싱글 자재가격").updatedRows).isEqualTo(2);
        assertThat(retry.byTab.get("추천실외기").unchangedRows).isEqualTo(1);
        assertThat(retry.byTab.get("분기계산").unchangedRows).isEqualTo(1);
    }

    /**
     * DB commit 순서와 afterCompletion 순서가 역전되어도 다음 sync가 DB를 기준으로 재처리한다.
     *
     * <p>T1의 DB commit 뒤 서비스 cache callback 직전에 멈추고, T2가 50,000을 commit/callback
     * 한 다음 T1 callback을 재개한다. 캐시를 기준으로 판정하면 마지막 입력 45,000이 unchangedRows가
     * 되어 DB의 50,000을 영구히 유지하지만, DB 행 해시를 기준으로 판정하면 45,000으로 갱신된다.
     */
    @Test
    void concurrent_commit과_afterCompletion_순서가_엇갈려도_다음_sync는_DB를_기준으로_재처리한다()
            throws Exception {
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 자재가격!A1:D"))
                .thenReturn(materialRows(
                        row("품 명", "가격", "옵션", "계산값"),
                        row("유선리모컨", "40,000", "", "")));
        syncService.syncMaterialPricesTab();
        entityManager.clear();

        CountDownLatch t1CallbackEntered = new CountDownLatch(1);
        CountDownLatch releaseT1Callback = new CountDownLatch(1);
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 자재가격!A1:D"))
                .thenAnswer(invocation -> {
                    String threadName = Thread.currentThread().getName();
                    String price = threadName.contains("t1") ? "45,000" : "50,000";
                    return materialRows(
                            row("품 명", "가격", "옵션", "계산값"),
                            row("유선리모컨", price, "", ""));
                });

        ExecutorService executor = Executors.newFixedThreadPool(2, runnable -> {
            Thread thread = new Thread(runnable);
            thread.setName("lookup-sync-" + thread.getId());
            return thread;
        });
        try {
            Future<ProductLookupSheetSyncService.TabSyncResult> t1 = executor.submit(() -> {
                Thread.currentThread().setName("lookup-sync-t1");
                TransactionTemplate template = new TransactionTemplate(transactionManager);
                return template.execute(status -> {
                    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                        @Override
                        public void afterCompletion(int completionStatus) {
                            t1CallbackEntered.countDown();
                            try {
                                releaseT1Callback.await();
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                                throw new IllegalStateException(e);
                            }
                        }
                    });
                    try {
                        return syncService.syncMaterialPricesTab();
                    } catch (Exception e) {
                        throw new IllegalStateException(e);
                    }
                });
            });

            assertThat(t1CallbackEntered.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();

            Future<ProductLookupSheetSyncService.TabSyncResult> t2 = executor.submit(
                    () -> syncService.syncMaterialPricesTab());
            ProductLookupSheetSyncService.TabSyncResult t2Result = t2.get();
            assertThat(t2Result.updatedRows).isEqualTo(1);

            releaseT1Callback.countDown();
            assertThat(t1.get().updatedRows).isEqualTo(1);
        } finally {
            releaseT1Callback.countDown();
            executor.shutdownNow();
        }

        entityManager.clear();
        assertThat(materialPriceRepository.findByMaterialKey("D2").orElseThrow().getPrice())
                .isEqualByComparingTo(new BigDecimal("50000"));

        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 자재가격!A1:D"))
                .thenReturn(materialRows(
                        row("품 명", "가격", "옵션", "계산값"),
                        row("유선리모컨", "45,000", "", "")));
        ProductLookupSheetSyncService.TabSyncResult next = syncService.syncMaterialPricesTab();
        entityManager.clear();

        assertThat(next.updatedRows).isEqualTo(1);
        assertThat(next.unchangedRows).isZero();
        assertThat(materialPriceRepository.findByMaterialKey("D2").orElseThrow().getPrice())
                .isEqualByComparingTo(new BigDecimal("45000"));
    }

    /**
     * ODU 는 전 컬럼이 natural key 이므로 값 변경 update 분기가 사실상 죽어 있다.
     * 대신 사라진 key soft-delete 후 같은 key 재등장 시 기존 row id 복구를 보장한다.
     */
    @Test
    void syncOduRecommendationsTab_key_변경과_재등장은_softDelete_restore로_처리한다() throws Exception {
        when(sheetsClient.readSheetDisplay("test-sheet-id", "추천실외기!A1:E"))
                .thenReturn(oduRows(
                        row("멀티 냉난방", "", "홈멀티", "", ""),
                        row("실내기", "마력", "실내기", "실내기", "마력"),
                        row("5.5", "4HP", "", "", "")
                ));
        syncService.syncOduRecommendationsTab();
        entityManager.clear();
        UUID originalId = oduRepository.findActiveByNaturalKey(
                RecommendationType.MULTI_HEATING_COOLING, new BigDecimal("5.5"), null, "4HP")
                .orElseThrow()
                .getId();

        when(sheetsClient.readSheetDisplay("test-sheet-id", "추천실외기!A1:E"))
                .thenReturn(oduRows(
                        row("멀티 냉난방", "", "홈멀티", "", ""),
                        row("실내기", "마력", "실내기", "실내기", "마력"),
                        row("5.5", "5HP", "", "", "")
                ));
        syncService.syncOduRecommendationsTab();
        entityManager.clear();

        assertThat(jdbcTemplate.queryForObject(
                "SELECT is_deleted FROM odu_recommendation_lookup WHERE id = ?", Boolean.class, originalId))
                .isTrue();

        when(sheetsClient.readSheetDisplay("test-sheet-id", "추천실외기!A1:E"))
                .thenReturn(oduRows(
                        row("멀티 냉난방", "", "홈멀티", "", ""),
                        row("실내기", "마력", "실내기", "실내기", "마력"),
                        row("5.5", "4HP", "", "", "")
                ));
        syncService.syncOduRecommendationsTab();
        entityManager.clear();

        OduRecommendationLookup restored = oduRepository.findActiveByNaturalKey(
                RecommendationType.MULTI_HEATING_COOLING, new BigDecimal("5.5"), null, "4HP")
                .orElseThrow();
        assertThat(restored.getId()).isEqualTo(originalId);
    }

    /**
     * 같은 ODU natural key 가 다른 시트 row 에 반복되면 원천 이상으로 기록하고 skip 한다.
     */
    @Test
    void syncOduRecommendationsTab_다른_row의_natural_key_중복은_skip_error로_기록한다() throws Exception {
        when(sheetsClient.readSheetDisplay("test-sheet-id", "추천실외기!A1:E"))
                .thenReturn(oduRows(
                        row("멀티 냉난방", "", "홈멀티", "", ""),
                        row("실내기", "마력", "실내기", "실내기", "마력"),
                        row("5.5", "4HP", "", "", ""),
                        row("5.5", "4HP", "", "", "")
                ));

        ProductLookupSheetSyncService.TabSyncResult result = syncService.syncOduRecommendationsTab();

        assertThat(result.insertedRows).isEqualTo(1);
        assertThat(result.skippedOccurrences).isEqualTo(1);
        assertThat(result.error).contains("추천실외기 natural key 중복");
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
