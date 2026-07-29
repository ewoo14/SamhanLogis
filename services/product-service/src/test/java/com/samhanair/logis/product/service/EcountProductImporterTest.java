package com.samhanair.logis.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.web.dto.EcountProductImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** MIG-2 품목 importer RED 가드: alias main 선정 + placeholder narrow. */
@ExtendWith(MockitoExtension.class)
class EcountProductImporterTest {

    private static final UUID PRODUCT_ID = UUID.fromString("00000000-0000-0000-0000-000000000201");

    @Mock
    private NamedParameterJdbcTemplate jdbcTemplate;

    @InjectMocks
    private EcountProductImporter importer;

    @BeforeEach
    void setUp() {
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(PRODUCT_ID);
        lenient().when(jdbcTemplate.queryForList(anyString(), any(SqlParameterSource.class), eq(String.class)))
                .thenReturn(List.of());
        lenient().when(jdbcTemplate.queryForList(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenAnswer(invocation -> {
                    String sql = invocation.getArgument(0);
                    if (sql.contains("is_deleted = TRUE")) {
                        return List.of();
                    }
                    return sql.contains("SELECT id") ? List.of(PRODUCT_ID) : List.of();
                });
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
    }

    @Test
    void importCsv_품목관계_alias를_mainProduct로_매핑한다() {
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "MAIN-001\t","AC060BN4DBC1\t","100,000","70,000","","","0","0","","","[상품]\t","BN디럭스\t","YES\t"
                "ALIAS-001\t","AC060BN4DBC1\t","100,000","70,000","","","0","0","","","[상품]\t","BN디럭스\t","YES\t"
                """;
        String relationCsv = """
                "데이터관리>품목관계-Excel다운로드"
                "대표품목코드\t","대표품목명\t","대표품목단위\t","연결품목코드\t","연결품목명\t","연결품목단위\t","연결품목 환산수량\t","대표품목 환산수량\t","수량관리기준\t"
                "MAIN-001\t","AC060BN4DBC1\t","\t","ALIAS-001\t","AC060BN4DBC1\t","\t","1","1","대표품목\t"
                """;
        String groupCsv = """
                "데이터관리>품목계층그룹-Excel다운로드"
                "그룹단계\t","[그룹코드]그룹명\t","품목코드\t","품목명\t"
                "1단계\t","[CAC] 싱글\t","MAIN-001\t","AC060BN4DBC1\t"
                """;

        EcountProductImportResult result = importer.importCsv(
                stream(itemCsv), stream(relationCsv), stream(groupCsv), "tester");

        assertThat(result.totalRows()).isEqualTo(2);
        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.aliasImported()).isEqualTo(2);
        assertThat(result.skippedRelationOrphan()).isZero();
    }

    @Test
    void importCsv_0만있는코드는_placeholder지만_0001은_정상코드다() {
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "0000\t","placeholder\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                "0001\t","정상품목\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                """;

        EcountProductImportResult result = importer.importCsv(stream(itemCsv), null, null, "tester");

        assertThat(result.totalRows()).isEqualTo(2);
        assertThat(result.skippedPlaceholder()).isEqualTo(1);
        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void importCsv_품목명_빈값은_REJECT_NAME_NULL로_거부한다() {
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "P-001\t","\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                """;

        EcountProductImportResult result = importer.importCsv(stream(itemCsv), null, null, "tester");

        assertThat(result.rejectedNullName()).isEqualTo(1);
        assertThat(result.rejectedSample()).extracting(EcountProductImportResult.RejectedRow::reason)
                .containsExactly("REJECT_NAME_NULL");
    }

    @Test
    void importCsv_같은_alias_code가_두_main으로_나오면_MIG2_ALIAS_DUPLICATE로_실패한다() {
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "MAIN-001\t","제품A\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                "MAIN-002\t","제품B\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                "ALIAS-001\t","별칭\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                """;
        String relationCsv = """
                "데이터관리>품목관계-Excel다운로드"
                "대표품목코드\t","대표품목명\t","대표품목단위\t","연결품목코드\t","연결품목명\t","연결품목단위\t","연결품목 환산수량\t","대표품목 환산수량\t","수량관리기준\t"
                "MAIN-001\t","제품A\t","\t","ALIAS-001\t","별칭\t","\t","1","1","대표품목\t"
                "MAIN-002\t","제품B\t","\t","ALIAS-001\t","별칭\t","\t","1","1","대표품목\t"
                """;

        assertThatThrownBy(() -> importer.importCsv(stream(itemCsv), stream(relationCsv), null, "tester"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG2_ALIAS_DUPLICATE))
                .hasMessageContaining("sourceRowNo=2");
    }

    @Test
    void importCsv_같은_main에_여러_alias를_매핑한다() {
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "MAIN-001\t","제품A\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                "ALIAS-001\t","제품A\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                "ALIAS-002\t","제품A\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                """;
        String relationCsv = """
                "데이터관리>품목관계-Excel다운로드"
                "대표품목코드\t","대표품목명\t","대표품목단위\t","연결품목코드\t","연결품목명\t","연결품목단위\t","연결품목 환산수량\t","대표품목 환산수량\t","수량관리기준\t"
                "MAIN-001\t","제품A\t","\t","ALIAS-001\t","제품A\t","\t","1","1","대표품목\t"
                "MAIN-001\t","제품A\t","\t","ALIAS-002\t","제품A\t","\t","1","1","대표품목\t"
                """;

        EcountProductImportResult result = importer.importCsv(stream(itemCsv), stream(relationCsv), null, "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.aliasImported()).isEqualTo(3);
    }

    @Test
    void importCsv_relation_main이_raw에_없어도_DB_active_product가_있으면_alias만_매핑한다() {
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "ALIAS-001\t","AC060BN4DBC1\t","100,000","70,000","","","0","0","","","[상품]\t","BN디럭스\t","YES\t"
                """;
        String relationCsv = """
                "데이터관리>품목관계-Excel다운로드"
                "대표품목코드\t","대표품목명\t","대표품목단위\t","연결품목코드\t","연결품목명\t","연결품목단위\t","연결품목 환산수량\t","대표품목 환산수량\t","수량관리기준\t"
                "MAIN-DB\t","AC060BN4DBC1\t","\t","ALIAS-001\t","AC060BN4DBC1\t","\t","1","1","대표품목\t"
                """;

        EcountProductImportResult result = importer.importCsv(stream(itemCsv), stream(relationCsv), null, "tester");

        assertThat(result.imported()).isZero();
        assertThat(result.aliasImported()).isEqualTo(1);
        assertThat(result.skippedRelationOrphan()).isZero();
    }

    @Test
    void importCsv_DB_name_fallback은_ACTIVE_단일건만_허용하고_status_필터를_사용한다() {
        when(jdbcTemplate.queryForList(anyString(), any(SqlParameterSource.class), eq(String.class)))
                .thenReturn(List.of("DB-OLD"));
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "ALIAS-001\t","동명제품\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                """;
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);

        importer.importCsv(stream(itemCsv), null, null, "tester");

        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).queryForList(
                sql.capture(), any(SqlParameterSource.class), eq(String.class));
        assertThat(sql.getAllValues())
                .anySatisfy(value -> assertThat(value).contains("status = 'ACTIVE'"));
    }

    @Test
    void importCsv_DB_name_fallback이_ACTIVE_2건이면_MIG2_NO_MAIN_CANDIDATE로_실패한다() {
        when(jdbcTemplate.queryForList(anyString(), any(SqlParameterSource.class), eq(String.class)))
                .thenReturn(List.of("DB-001", "DB-002"));
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "ALIAS-001\t","동명제품\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                """;

        assertThatThrownBy(() -> importer.importCsv(stream(itemCsv), null, null, "tester"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG2_NO_MAIN_CANDIDATE))
                .hasMessageContaining("DB-001")
                .hasMessageContaining("DB-002");
    }

    @Test
    void importCsv_UTF8_BOM으로_시작해도_헤더를_인식한다() {
        String itemCsv = "\uFEFF" + """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "P-001\t","제품A\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                """;

        EcountProductImportResult result = importer.importCsv(stream(itemCsv), null, null, "tester");

        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void importCsv_source_row_no는_데이터행_기준_1부터_증가한다() {
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "P-001\t","제품A\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                "P-002\t","제품B\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                "P-003\t","제품C\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                """;
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);

        importer.importCsv(stream(itemCsv), null, null, "tester");

        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(anyString(), params.capture());
        List<Integer> sourceRows = params.getAllValues().stream()
                .filter(p -> p.hasValue("row"))
                .map(p -> (Integer) p.getValue("row"))
                .distinct()
                .toList();
        assertThat(sourceRows).containsExactly(1, 2, 3);
    }

    @Test
    void importCsv_product_aliases_조건부_upsert가_0row면_MIG2_ALIAS_DUPLICATE로_실패한다() {
        when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            return sql.contains("INSERT INTO product_aliases") ? 0 : 1;
        });
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "P-001\t","제품A\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                """;

        assertThatThrownBy(() -> importer.importCsv(stream(itemCsv), null, null, "tester"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG2_ALIAS_DUPLICATE));
    }

    @Test
    void importCsv_staging_alias_lookup이_같은_main이면_통과하고_다른_main이면_MIG2_ALIAS_DUPLICATE로_실패한다() {
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "P-001\t","제품A\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                """;

        importer.importCsv(stream(itemCsv), null, null, "tester");

        when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            return sql.contains("staging.ecount_item_alias") ? 0 : 1;
        });
        assertThatThrownBy(() -> importer.importCsv(stream(itemCsv), null, null, "tester"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG2_ALIAS_DUPLICATE));
    }

    @Test
    void importCsv_동명_복수_raw에_DB_main도_relation도_없으면_MIG2_NO_MAIN_CANDIDATE로_실패한다() {
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "P-001\t","제품A\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                "P-002\t","제품A\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                """;

        assertThatThrownBy(() -> importer.importCsv(stream(itemCsv), null, null, "tester"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG2_NO_MAIN_CANDIDATE));
    }

    @Test
    void importCsv_product_code가_100자를_초과하면_MIG2_CODE_OUT_OF_RANGE로_거부한다() {
        String longCode = "P".repeat(101);
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "__LONG_CODE__\t","제품A\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                """.replace("__LONG_CODE__", longCode);

        assertThatThrownBy(() -> importer.importCsv(stream(itemCsv), null, null, "tester"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG2_CODE_OUT_OF_RANGE))
                .hasMessageContaining("length=101");
    }

    @Test
    void importCsv_soft_deleted_product_code는_기존_UUID를_복구하고_INSERT를_skip한다() {
        when(jdbcTemplate.queryForList(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenAnswer(invocation -> {
                    String sql = invocation.getArgument(0);
                    if (sql.contains("p.model_name = :code")) {
                        return List.of();
                    }
                    return sql.contains("UPDATE products") ? List.of(PRODUCT_ID) : List.of();
                });
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "P-001\t","제품A\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                """;
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);

        EcountProductImportResult result = importer.importCsv(stream(itemCsv), null, null, "tester");

        assertThat(result.imported()).isZero();
        assertThat(result.updated()).isEqualTo(1);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce())
                .queryForList(sql.capture(), any(SqlParameterSource.class), eq(UUID.class));
        assertThat(sql.getAllValues())
                .anySatisfy(value -> assertThat(value)
                        .contains("UPDATE products")
                        .contains("WHERE product_code = :code AND is_deleted = TRUE")
                        .contains("RETURNING p.id"));
        verify(jdbcTemplate, never())
                .queryForObject(org.mockito.ArgumentMatchers.contains("INSERT INTO products"),
                        any(SqlParameterSource.class), eq(UUID.class));
    }

    @Test
    void importCsv_categoryGroup은_100자_productGroup1은_50자로_각각_truncate한다() {
        String longGroup = "가".repeat(120);
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "P-001\t","제품A\t","0","0","","","0","0","","","[상품]\t","\t","YES\t"
                """;
        String groupCsv = """
                "데이터관리>품목계층그룹-Excel다운로드"
                "그룹단계\t","[그룹코드]그룹명\t","품목코드\t","품목명\t"
                "1단계\t","%s\t","P-001\t","제품A\t"
                """.formatted(longGroup);
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);

        importer.importCsv(stream(itemCsv), null, stream(groupCsv), "tester");

        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce())
                .queryForObject(anyString(), params.capture(), eq(UUID.class));
        SqlParameterSource productParams = params.getAllValues().stream()
                .filter(p -> p.hasValue("categoryGroup"))
                .findFirst()
                .orElseThrow();
        assertThat((String) productParams.getValue("categoryGroup")).hasSize(100);
        assertThat((String) productParams.getValue("productGroup1")).hasSize(50);
    }

    @Test
    void rawHeaderCrossCheck() throws Exception {
        assertRawHeader("/ecount-raw-fixtures/product-item.csv",
                EcountProductImporter.ITEM_HEADERS);
        assertRawHeader("/ecount-raw-fixtures/product-relation.csv",
                EcountProductImporter.RELATION_HEADERS);
        assertRawHeader("/ecount-raw-fixtures/product-group.csv",
                EcountProductImporter.GROUP_HEADERS);
    }

    private static void assertRawHeader(String resourcePath, String[] expectedHeaders) throws Exception {
        try (InputStream fixture = EcountProductImporterTest.class.getResourceAsStream(resourcePath)) {
            assertThat(fixture).as(resourcePath).isNotNull();
            EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(fixture.readAllBytes());

            EcountCsvSupport.validateHeader(parsed.header(), expectedHeaders);
        }
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }
}
