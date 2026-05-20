package com.samhanair.logis.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class Mig6UserFixtureHeaderCrossCheckTest {

    @Test
    void employee_fixture_BOM과_회사명_meta_header를_검증한다() throws Exception {
        byte[] bytes = assertFixture("/fixtures/mig6-employee.csv", EcountEmployeeImporter.HEADERS, true);
        assertFivePlaceholderEmployees(bytes);
    }

    @Test
    void employeeCard_fixture_BOM과_PII_placeholder를_검증한다() throws Exception {
        byte[] bytes = assertFixture("/fixtures/mig6-employee-card.csv", EcountEmployeeCardImporter.HEADERS, true);
        String text = new String(bytes, StandardCharsets.UTF_8);
        assertThat(text).contains("XXXXXX-XXXXXXX");
        assertThat(text).doesNotContain("740114-1030932");
        assertFivePlaceholderEmployees(bytes);
    }

    @Test
    void payrollEmployee_fixture_BOM과_회사명_meta_header를_검증한다() throws Exception {
        byte[] bytes = assertFixture("/fixtures/mig6-payroll-employee.csv", EcountPayrollEmployeeImporter.HEADERS, true);
        assertFivePlaceholderEmployees(bytes);
    }

    private static byte[] assertFixture(String path, String[] expectedHeaders, boolean companyMeta) throws Exception {
        try (InputStream input = Mig6UserFixtureHeaderCrossCheckTest.class.getResourceAsStream(path)) {
            assertThat(input).isNotNull();
            byte[] bytes = input.readAllBytes();
            assertThat(bytes).startsWith((byte) 0xEF, (byte) 0xBB, (byte) 0xBF);
            String text = new String(bytes, StandardCharsets.UTF_8);
            if (companyMeta) {
                assertThat(text).contains("회사명 :");
            }
            EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(bytes);
            EcountCsvSupport.validateHeader(parsed.header(), expectedHeaders);
            return bytes;
        }
    }

    private static void assertFivePlaceholderEmployees(byte[] bytes) {
        String text = new String(bytes, StandardCharsets.UTF_8);
        assertThat(text).contains("사원A", "사원B", "사원C", "사원D", "사원E");
        assertThat(EcountCsvSupport.parse(bytes).dataRows()).hasSize(5);
    }
}
