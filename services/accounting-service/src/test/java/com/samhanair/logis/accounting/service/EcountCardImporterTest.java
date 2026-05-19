package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.accounting.web.dto.EcountCardImportResult;
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

/** MIG-2 카드/계좌 importer RED 가드. */
@ExtendWith(MockitoExtension.class)
class EcountCardImporterTest {

    @Mock
    private NamedParameterJdbcTemplate jdbcTemplate;

    @InjectMocks
    private EcountCardImporter importer;

    @BeforeEach
    void setUp() {
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000501"));
    }

    @Test
    void importCsv_통장계좌를_cardMaster로_분류한다() {
        String csv = """
                "데이터관리>통장계좌-Excel다운로드"
                "계좌코드\t","계좌명\t","계정명(계정코드)\t\t","검색창내용\t","적요\t","외화통장\t","사용\t",""
                "079815326474401\t","국민예금\t","정기예.적금(1059)\t","\t","\t","미사용\t","YES\t",""
                "0000\t","placeholder\t","현금(1019)\t","\t","\t","미사용\t","YES\t",""
                """;

        EcountCardImportResult result = importer.importCsv(stream(csv), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.skippedPlaceholder()).isEqualTo(1);
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }
}
