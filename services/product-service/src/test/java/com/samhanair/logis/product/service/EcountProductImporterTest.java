package com.samhanair.logis.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.product.web.dto.EcountProductImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
    }

    @Test
    void importCsv_품목관계_alias를_mainProduct로_매핑한다() {
        String itemCsv = """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t",""
                "MAIN-001\t","AC060BN4DBC1\t","100,000","70,000","","","0","0","","","[상품]\t","BN디럭스\t","YES\t",""
                "ALIAS-001\t","AC060BN4DBC1\t","100,000","70,000","","","0","0","","","[상품]\t","BN디럭스\t","YES\t",""
                """;
        String relationCsv = """
                "데이터관리>품목관계-Excel다운로드"
                "대표품목코드\t","대표품목명\t","대표품목단위\t","연결품목코드\t","연결품목명\t","연결품목단위\t","연결품목 환산수량\t","대표품목 환산수량\t","수량관리기준\t",""
                "MAIN-001\t","AC060BN4DBC1\t","\t","ALIAS-001\t","AC060BN4DBC1\t","\t","1","1","대표품목\t",""
                """;
        String groupCsv = """
                "데이터관리>품목계층그룹-Excel다운로드"
                "그룹단계\t","[그룹코드]그룹명\t","품목코드\t","품목명\t",""
                "1단계\t","[CAC] 싱글\t","MAIN-001\t","AC060BN4DBC1\t",""
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
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t",""
                "0000\t","placeholder\t","0","0","","","0","0","","","[상품]\t","\t","YES\t",""
                "0001\t","정상품목\t","0","0","","","0","0","","","[상품]\t","\t","YES\t",""
                """;

        EcountProductImportResult result = importer.importCsv(stream(itemCsv), null, null, "tester");

        assertThat(result.totalRows()).isEqualTo(2);
        assertThat(result.skippedPlaceholder()).isEqualTo(1);
        assertThat(result.imported()).isEqualTo(1);
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }
}
