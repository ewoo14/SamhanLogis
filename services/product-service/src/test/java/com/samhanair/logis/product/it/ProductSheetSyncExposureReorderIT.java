package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.service.ProductSheetSyncService;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.annotation.DirtiesContext;

/**
 * ProductSheetSyncService exposure 표시순서 재정렬 IT.
 *
 * <p>기존 {@link ProductSheetSyncServiceIT} 는 class-level {@code @Transactional} 로 실행되어
 * 영속성 컨텍스트 dirty checking 이 {@code upsertSheetExposure} update 분기의 save 누락을
 * 가릴 수 있다. 본 클래스는 테스트 메서드를 비트랜잭션으로 두고, sync self-invocation 운영
 * 경로와 동일하게 커밋된 DB 상태를 repository fresh 조회로 검증한다.
 */
@SpringBootTest(properties = {
        "app.scheduling.enabled=false",
        "google.sheets.sheet-id=test-sheet-id",
        "google.sheets.endpoint-override=http://localhost:0"
})
@DirtiesContext
@WithMockUser(username = "test-sync-reorder")
class ProductSheetSyncExposureReorderIT extends AbstractPostgresIT {

    private static final String MODEL_A = "REORDER_EXPOSURE_A";
    private static final String MODEL_B = "REORDER_EXPOSURE_B";

    @MockBean
    private GoogleSheetsClient sheetsClient;

    @Autowired
    private ProductSheetSyncService syncService;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductEstimateExposureRepository exposureRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        cleanupRows();
        lenient().doNothing().when(sheetsClient).invalidateCache();
    }

    @AfterEach
    void tearDown() {
        cleanupRows();
    }

    @Test
    void sync_비트랜잭션_재실행시_노출_displayOrder_재정렬이_DB에_영속된다() throws Exception {
        when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi A", MODEL_A, "", "1,000,000", "", "900,000"),
                row("Hi-Multi B", MODEL_B, "", "1,100,000", "", "950,000")
        ));

        syncService.syncAll();

        assertThat(exposureOrder(MODEL_A)).isEqualTo(1);
        assertThat(exposureOrder(MODEL_B)).isEqualTo(2);

        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("Hi-Multi B 변경", MODEL_B, "", "1,110,000", "", "960,000"),
                row("Hi-Multi A 변경", MODEL_A, "", "1,010,000", "", "910,000")
        ));

        syncService.syncAll();

        assertThat(exposureOrder(MODEL_B))
                .as("비트랜잭션 sync 재실행 후 B가 1번으로 커밋되어야 한다")
                .isEqualTo(1);
        assertThat(exposureOrder(MODEL_A))
                .as("비트랜잭션 sync 재실행 후 A가 2번으로 커밋되어야 한다")
                .isEqualTo(2);
    }

    private Integer exposureOrder(String modelCode) {
        Product product = productRepository.findByModelCodeAndIsDeletedFalse(modelCode).orElseThrow();
        return exposureRepository.findByProductIdAndEstimateCategoryAndIsDeletedFalse(
                        product.getId(), EstimateCategory.HOME_MULTI)
                .orElseThrow()
                .getDisplayOrder();
    }

    /** 홈멀티 시트 헤더 + data row 를 ValueRange.values() 형태로 생성한다. */
    @SafeVarargs
    private static List<List<Object>> homeMultiRows(List<Object>... dataRows) {
        java.util.List<java.util.List<Object>> all = new java.util.ArrayList<>();
        all.add(List.of("품 명", "모델명", "비고", "출고가", "비고", "납품가"));
        for (List<Object> row : dataRows) {
            all.add(row);
        }
        return all;
    }

    private static List<Object> row(Object... values) {
        return List.of(values);
    }

    private void cleanupRows() {
        String modelCodes = "'" + MODEL_A + "','" + MODEL_B + "'";
        jdbcTemplate.update("""
                UPDATE product_estimate_exposure e
                   SET is_deleted = TRUE, deleted_at = now(), deleted_by = 'test-cleanup'
                  FROM products p
                 WHERE e.product_id = p.id
                   AND p.model_code IN (%s)
                   AND e.is_deleted = FALSE
                """.formatted(modelCodes));
        jdbcTemplate.update("""
                UPDATE price_history ph
                   SET is_deleted = TRUE, deleted_at = now(), deleted_by = 'test-cleanup'
                  FROM products p
                 WHERE ph.product_id = p.id
                   AND p.model_code IN (%s)
                   AND ph.is_deleted = FALSE
                """.formatted(modelCodes));
        jdbcTemplate.update("""
                UPDATE product_spec ps
                   SET is_deleted = TRUE, deleted_at = now(), deleted_by = 'test-cleanup'
                  FROM products p
                 WHERE ps.product_id = p.id
                   AND p.model_code IN (%s)
                   AND ps.is_deleted = FALSE
                """.formatted(modelCodes));
        jdbcTemplate.update("""
                UPDATE products
                   SET is_deleted = TRUE, deleted_at = now(), deleted_by = 'test-cleanup'
                 WHERE model_code IN (%s)
                   AND is_deleted = FALSE
                """.formatted(modelCodes));
    }
}
