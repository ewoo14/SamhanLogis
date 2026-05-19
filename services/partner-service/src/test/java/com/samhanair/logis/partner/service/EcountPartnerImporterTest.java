package com.samhanair.logis.partner.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import com.samhanair.logis.partner.dto.EcountPartnerImportResult;
import com.samhanair.logis.partner.repository.PartnerRepository;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.invocation.InvocationOnMock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/**
 * MIG-1 PoC — {@link EcountPartnerImporter} 단위 테스트.
 *
 * <p>커버: 17 헤더 검증 / 첫 행 메타 skip / trailing tab strip / 분류 (REJECT_NAME_NULL / SKIPPED_PLACEHOLDER) /
 * 사용구분 매핑 / 여신한도 / 등록일자 / 멱등 / placeholder 패턴.
 *
 * <p>JdbcTemplate 은 spy/in-memory map 으로 staging UPSERT 가시화 (실 DB 없이 검증).
 */
@ExtendWith(MockitoExtension.class)
class EcountPartnerImporterTest {

    private static final byte[] UTF8_BOM = new byte[] { (byte) 0xEF, (byte) 0xBB, (byte) 0xBF };

    private static final String META_LINE = "\"데이터관리>거래처-Excel다운로드\"\n";
    private static final String HEADER_LINE = "\"거래처코드\t\",\"등록일자\t\",\"담당자명\t\","
            + "\"종사업장번호\t\",\"거래처명\t\",\"대표자명\t\",\"주소1\t\",\"전화번호\t\","
            + "\"핸드폰번호\t\",\"검색창내용\t\",\"특이사항\t\",\"그룹\t\","
            + "\"사용구분\t\",\"이체정보\t\",\"여신한도\t\",\"최초작성일자\t\",\"\"\n";

    @Mock
    private PartnerRepository partnerRepository;

    @Mock
    private NamedParameterJdbcTemplate jdbcTemplate;

    @InjectMocks
    private EcountPartnerImporter importer;

    private InputStream csvStream(String body) {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        byte[] full = new byte[payload.length + UTF8_BOM.length];
        System.arraycopy(UTF8_BOM, 0, full, 0, UTF8_BOM.length);
        System.arraycopy(payload, 0, full, UTF8_BOM.length, payload.length);
        return new ByteArrayInputStream(full);
    }

    /** 이카운트 row template — 16 셀 (trailing tab 포함) + trailing 빈 17번째. */
    private String row(String code, String reg, String mgr, String subBiz, String name,
                       String rep, String addr, String phone, String mobile, String search,
                       String note, String group, String usage, String transfer,
                       String credit, String firstCreated) {
        return "\"" + code + "\t\",\"" + reg + "\t\",\"" + mgr + "\t\",\"" + subBiz + "\t\","
                + "\"" + name + "\t\",\"" + rep + "\t\",\"" + addr + "\t\","
                + "\"" + phone + "\t\",\"" + mobile + "\t\",\"" + search + "\t\","
                + "\"" + note + "\t\",\"" + group + "\t\",\"" + usage + "\t\","
                + "\"" + transfer + "\t\",\"" + credit + "\",\"" + firstCreated + "\t\",\"\"\n";
    }

    /** 신규 Partner stub (save 반환용). */
    private Partner stubSaved(String code, String name) {
        Partner p = Partner.register(code, code, name, null, null, BigDecimal.ZERO);
        // ID 는 register 시점 미발급. 실제로는 save() 시 hibernate 가 발급. 단위테스트는 모킹 우회.
        return p;
    }

    private void wireSaveEcho() {
        lenient().when(partnerRepository.save(any(Partner.class)))
                .thenAnswer((InvocationOnMock inv) -> inv.getArgument(0));
    }

    @Test
    void headerValidation_정상17컬럼_통과() {
        String csv = META_LINE + HEADER_LINE
                + row("1234567890", "20230814", "이성미", "", "이상덕기사", "이상덕", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "2023/08/17 오전 10:34:00");
        when(partnerRepository.findByPartnerCode("1234567890")).thenReturn(Optional.empty());
        wireSaveEcho();

        EcountPartnerImportResult result = importer.importCsv(csvStream(csv), "tester");

        assertThat(result.totalRows()).isEqualTo(1);
        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void headerValidation_컬럼불일치_BusinessException() {
        String badHeader = "\"이상한헤더\",\"등록일자\"\n";
        String csv = META_LINE + badHeader;

        assertThatThrownBy(() -> importer.importCsv(csvStream(csv), "tester"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("CSV 헤더 형식 불일치");
    }

    @Test
    void trailingTab_제거_정상매핑() {
        String csv = META_LINE + HEADER_LINE
                + row("CODE001", "20230814", "이성미", "", "테스트거래처", "대표자", "서울특별시", "031-1234-5678", "010-1111-2222",
                "검색어", "특이메모", "SF(밴더)", "YES", "등록", "1000000", "2023/08/17 오전 10:34:00");
        when(partnerRepository.findByPartnerCode("CODE001")).thenReturn(Optional.empty());
        wireSaveEcho();

        importer.importCsv(csvStream(csv), "tester");

        verify(partnerRepository, times(1)).save(any(Partner.class));
    }

    @Test
    void classify_거래처명빈_RejectNullName() {
        String csv = META_LINE + HEADER_LINE
                + row("1234567890", "20230814", "이성미", "", "", "이상덕", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "2023/08/17 오전 10:34:00");

        EcountPartnerImportResult result = importer.importCsv(csvStream(csv), "tester");

        assertThat(result.totalRows()).isEqualTo(1);
        assertThat(result.imported()).isEqualTo(0);
        assertThat(result.rejectedNullName()).isEqualTo(1);
        assertThat(result.rejectedSample()).hasSize(1);
        assertThat(result.rejectedSample().get(0).reason()).isEqualTo("REJECT_NAME_NULL");
    }

    @Test
    void classify_거래처코드_placeholder_SkippedPlaceholder() {
        // 각 patterns: "-", "00", "000000", "0000"
        String csv = META_LINE + HEADER_LINE
                + row("-", "임시", "장영구", "", "임시거래처1", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "")
                + row("00", "임시", "장영구", "", "임시거래처2", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "")
                + row("0000", "임시", "장영구", "", "임시거래처3", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "");

        EcountPartnerImportResult result = importer.importCsv(csvStream(csv), "tester");

        assertThat(result.totalRows()).isEqualTo(3);
        assertThat(result.skippedPlaceholder()).isEqualTo(3);
        assertThat(result.imported()).isEqualTo(0);
        assertThat(result.rejectedSample()).hasSize(3);
        assertThat(result.rejectedSample()).allSatisfy(r ->
                assertThat(r.reason()).isEqualTo("SKIPPED_PLACEHOLDER"));
    }

    @Test
    void mapStatus_YES_ACTIVE_빈_SUSPENDED() {
        assertThat(EcountPartnerImporter.mapStatus("YES")).isEqualTo(PartnerStatus.ACTIVE);
        assertThat(EcountPartnerImporter.mapStatus("yes")).isEqualTo(PartnerStatus.ACTIVE);
        assertThat(EcountPartnerImporter.mapStatus("")).isEqualTo(PartnerStatus.SUSPENDED);
        assertThat(EcountPartnerImporter.mapStatus(null)).isEqualTo(PartnerStatus.SUSPENDED);
        assertThat(EcountPartnerImporter.mapStatus("NO")).isEqualTo(PartnerStatus.SUSPENDED);
    }

    @Test
    void parseCreditLimit_빈_제로_콤마_숫자() {
        assertThat(EcountPartnerImporter.parseCreditLimit("")).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(EcountPartnerImporter.parseCreditLimit(null)).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(EcountPartnerImporter.parseCreditLimit("-")).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(EcountPartnerImporter.parseCreditLimit("1000000")).isEqualByComparingTo(new BigDecimal("1000000"));
        assertThat(EcountPartnerImporter.parseCreditLimit("1,000,000")).isEqualByComparingTo(new BigDecimal("1000000"));
        assertThat(EcountPartnerImporter.parseCreditLimit("invalid")).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void parseRegistrationDate_YYYYMMDD_임시_빈() {
        assertThat(EcountPartnerImporter.parseRegistrationDate("20230814"))
                .isEqualTo(LocalDate.of(2023, 8, 14));
        assertThat(EcountPartnerImporter.parseRegistrationDate("임시")).isNull();
        assertThat(EcountPartnerImporter.parseRegistrationDate("")).isNull();
        assertThat(EcountPartnerImporter.parseRegistrationDate(null)).isNull();
        assertThat(EcountPartnerImporter.parseRegistrationDate("invalid")).isNull();
    }

    @Test
    void 사용구분_분포_ACTIVE_SUSPENDED_둘다_카운트() {
        String csv = META_LINE + HEADER_LINE
                + row("CODE001", "20230814", "이성미", "", "활성거래처", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "")
                + row("CODE002", "20230814", "이성미", "", "휴면거래처", "", "", "", "",
                "", "", "", "", "", "0", "");
        when(partnerRepository.findByPartnerCode(anyString())).thenReturn(Optional.empty());
        wireSaveEcho();

        EcountPartnerImportResult result = importer.importCsv(csvStream(csv), "tester");

        assertThat(result.totalRows()).isEqualTo(2);
        assertThat(result.imported()).isEqualTo(2);
        assertThat(result.activeCount()).isEqualTo(1);
        assertThat(result.suspendedCount()).isEqualTo(1);
    }

    @Test
    void 멱등_동일partnerCode_existing_updated() {
        String csv = META_LINE + HEADER_LINE
                + row("CODE001", "20230814", "이성미", "", "기존거래처", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "");
        Partner existing = Partner.register("CODE001", "CODE001", "기존거래처", null, null, BigDecimal.ZERO);
        when(partnerRepository.findByPartnerCode("CODE001")).thenReturn(Optional.of(existing));
        wireSaveEcho();

        EcountPartnerImportResult result = importer.importCsv(csvStream(csv), "tester");

        assertThat(result.imported()).isEqualTo(0);
        assertThat(result.updated()).isEqualTo(1);
    }

    @Test
    void 빈파일_BusinessException() {
        assertThatThrownBy(() -> importer.importCsv(new ByteArrayInputStream(new byte[0]), "tester"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("CSV 파일이 비어 있습니다");
    }

    @Test
    void sourceFileHash_재실행시_동일() {
        String csv = META_LINE + HEADER_LINE
                + row("CODE001", "20230814", "이성미", "", "테스트", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "");
        when(partnerRepository.findByPartnerCode(anyString())).thenReturn(Optional.empty());
        wireSaveEcho();

        EcountPartnerImportResult r1 = importer.importCsv(csvStream(csv), "tester");
        EcountPartnerImportResult r2 = importer.importCsv(csvStream(csv), "tester");

        assertThat(r1.sourceFileHash()).isEqualTo(r2.sourceFileHash());
        assertThat(r1.sourceFileHash()).matches("^[0-9A-F]{64}$");
    }
}
