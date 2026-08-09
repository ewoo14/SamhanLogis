package com.samhanair.logis.partner.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import com.samhanair.logis.partner.dto.EcountPartnerImportResult;
import com.samhanair.logis.partner.realtime.PartnerListRealtime;
import com.samhanair.logis.partner.repository.PartnerRepository;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.io.ByteArrayOutputStream;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.invocation.InvocationOnMock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

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

    @Mock
    private CollectionRealtimePublisher collectionRealtimePublisher;

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
        verify(collectionRealtimePublisher).publishChange(
                eq(PartnerListRealtime.CHANNEL_ID),
                eq(PartnerListRealtime.EVENT_CHANGED),
                eq(Map.of("changeType", "BULK_UPDATED")));
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
        // narrow placeholder 패턴 (cycle 1 정정): "-", "0+", "0+-?0+-?0+" 만
        String csv = META_LINE + HEADER_LINE
                + row("-", "임시", "장영구", "", "임시거래처1", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "")
                + row("00", "임시", "장영구", "", "임시거래처2", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "")
                + row("0000", "임시", "장영구", "", "임시거래처3", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "")
                + row("000-00-00000", "임시", "장영구", "", "임시거래처4", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "")
                + row("000000000", "임시", "장영구", "", "임시거래처5", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "");

        EcountPartnerImportResult result = importer.importCsv(csvStream(csv), "tester");

        assertThat(result.totalRows()).isEqualTo(5);
        assertThat(result.skippedPlaceholder()).isEqualTo(5);
        assertThat(result.imported()).isEqualTo(0);
        assertThat(result.rejectedSample()).hasSize(5);
        assertThat(result.rejectedSample()).allSatisfy(r ->
                assertThat(r.reason()).isEqualTo("SKIPPED_PLACEHOLDER"));
    }

    /**
     * 5-team 리뷰 cycle 1 회귀 가드 (2026-05-19) — narrow 정규식 적용 후
     * 1~4자리 숫자/운영 코드 8건이 IMPORTED 로 처리되는지 검증.
     * 실 적재 발견: `0004` 정효림-개인, `01` 국민건강보험공단,
     * `1` 세금계산서 카드매출중복용, `1123` 대덕구 건강검진센터,
     * `1212` 수석공장, `7002` 김초연 잡급, `7006` 윤경식, `7251` (주)에이치에스에이치.
     */
    @Test
    void classify_단기숫자코드_정상Imported_placeholder오판방지() {
        String csv = META_LINE + HEADER_LINE
                + row("0004", "20230814", "이성미", "", "정효림-개인", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "")
                + row("01", "20230814", "이성미", "", "국민건강보험공단", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "")
                + row("1", "20230814", "이성미", "", "세금계산서 카드매출중복용", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "")
                + row("1123", "20230814", "이성미", "", "대덕구 건강검진센터", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "")
                + row("1212", "20230814", "이성미", "", "수석공장", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "")
                + row("7002", "20230814", "이성미", "", "김초연 잡급", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "")
                + row("7006", "20230814", "이성미", "", "윤경식", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "")
                + row("7251", "20230814", "이성미", "", "(주)에이치에스에이치", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "");
        when(partnerRepository.findByPartnerCode(anyString())).thenReturn(Optional.empty());
        wireSaveEcho();

        EcountPartnerImportResult result = importer.importCsv(csvStream(csv), "tester");

        assertThat(result.totalRows()).isEqualTo(8);
        assertThat(result.imported()).isEqualTo(8);
        assertThat(result.skippedPlaceholder()).isEqualTo(0);
        assertThat(result.rejectedNullName()).isEqualTo(0);
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
        assertThat(EcountPartnerImporter.parseCreditLimit("")).isNull();
        assertThat(EcountPartnerImporter.parseCreditLimit(null)).isNull();
        assertThat(EcountPartnerImporter.parseCreditLimit("-")).isNull();
        assertThat(EcountPartnerImporter.parseCreditLimit("1000000")).isEqualByComparingTo(new BigDecimal("1000000"));
        assertThat(EcountPartnerImporter.parseCreditLimit("1,000,000")).isEqualByComparingTo(new BigDecimal("1000000"));
        assertThat(EcountPartnerImporter.parseCreditLimit("1,000,000원")).isEqualByComparingTo(new BigDecimal("1000000"));
        assertThat(EcountPartnerImporter.parseCreditLimit("invalid")).isNull();
    }

    @Test
    void parseRegistrationDate_지원_형식과_실패는_null() {
        assertThat(EcountPartnerImporter.parseRegistrationDate("20230814"))
                .isEqualTo(LocalDate.of(2023, 8, 14));
        assertThat(EcountPartnerImporter.parseRegistrationDate("2023-08-14"))
                .isEqualTo(LocalDate.of(2023, 8, 14));
        assertThat(EcountPartnerImporter.parseRegistrationDate("2023.08.14"))
                .isEqualTo(LocalDate.of(2023, 8, 14));
        assertThat(EcountPartnerImporter.parseRegistrationDate("23.08.14"))
                .isEqualTo(LocalDate.of(2023, 8, 14));
        assertThat(EcountPartnerImporter.parseRegistrationDate("230814"))
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
    void 기존_status는_파일이_YES여도_되살리지_않고_credit_limit_빈칸은_null() {
        Partner existing = Partner.register("CODE001", "CODE001", "기존거래처", null, null,
                new BigDecimal("1000000"));
        existing.suspend();
        when(partnerRepository.findByPartnerCode("CODE001")).thenReturn(Optional.of(existing));
        wireSaveEcho();

        importer.importCsv(csvStream(META_LINE + HEADER_LINE
                + row("CODE001", "20230814", "이성미", "", "기존거래처", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "", "")), "tester");

        assertThat(existing.getStatus()).isEqualTo(PartnerStatus.SUSPENDED);
        assertThat(existing.getCreditLimit()).isNull();
    }

    @Test
    void 최초작성일자_오전오후_파싱규칙을_검증한다() {
        assertThat(EcountPartnerImporter.parseFirstCreated("2023/08/17  오전 10:34:00"))
                .isEqualTo(java.time.LocalDateTime.of(2023, 8, 17, 10, 34));
        assertThat(EcountPartnerImporter.parseFirstCreated("2023/08/17 오후 1:05:00"))
                .isEqualTo(java.time.LocalDateTime.of(2023, 8, 17, 13, 5));
        assertThatThrownBy(() -> EcountPartnerImporter.parseFirstCreated("날짜 아님"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void xlsx_정본_적재는_trailer를_제외하고_실패행을_보류한다() throws Exception {
        Partner existing = Partner.register("CODE001", "CODE001", "기존", null, null,
                new BigDecimal("1000000"));
        existing.suspend();
        when(partnerRepository.findByPartnerCode("CODE001")).thenReturn(Optional.of(existing));
        wireSaveEcho();

        String[][] rows = {
                {"CODE001", "20230814", "담당", "", "기존", "대표", "주소", "", "", "", "", "일반업체", "YES", "등록", "", "2023/08/17  오전 10:34:00"},
                {"CODE002", "bad-date", "담당", "", "신규", "대표", "주소", "", "", "", "", "일반업체", "YES", "등록", "", ""},
                {"2026/08/09 오후 12:59:06", "", "", "", "", "", "", "", "", "", "", "", "", "", ""}
        };
        byte[] xlsx;
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("거래처등록");
            writeXlsxRow(sheet.createRow(0), new String[]{"회사명 : (주)삼한공조시스템"});
            writeXlsxRow(sheet.createRow(1), new String[]{"거래처코드", "등록일자", "담당자명", "종사업장번호", "거래처명", "대표자명", "주소1", "전화번호", "핸드폰번호", "검색창내용", "특이사항", "그룹", "사용구분", "이체정보", "여신한도", "최초작성일자"});
            for (int i = 0; i < rows.length; i++) writeXlsxRow(sheet.createRow(i + 2), rows[i]);
            workbook.write(out);
            xlsx = out.toByteArray();
        }

        EcountPartnerImportResult result = importer.importXlsx(new ByteArrayInputStream(xlsx), "tester");

        assertThat(result.totalRows()).isEqualTo(2);
        assertThat(result.updated()).isEqualTo(1);
        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.registrationDateNullRows()).isEqualTo(1);
        assertThat(result.heldParseFailureRows()).isZero();
        assertThat(result.excludedTrailerRows()).isEqualTo(1);
        assertThat(existing.getStatus()).isEqualTo(PartnerStatus.SUSPENDED);
    }

    private static void writeXlsxRow(Row row, String[] values) {
        for (int i = 0; i < values.length; i++) row.createCell(i).setCellValue(values[i]);
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

    @Test
    void importedAfterPartialSuccess_예외가나도_BulkUpdatedSse를발화한다() {
        String csv = META_LINE + HEADER_LINE
                + row("CODE001", "20230814", "이성미", "", "테스트", "", "", "", "",
                "", "", "일반업체", "YES", "등록", "0", "");
        when(partnerRepository.findByPartnerCode("CODE001")).thenReturn(Optional.empty());
        wireSaveEcho();
        when(jdbcTemplate.update(anyString(), any(org.springframework.jdbc.core.namedparam.SqlParameterSource.class)))
                .thenAnswer(inv -> {
                    String sql = inv.getArgument(0);
                    if (sql.stripLeading().startsWith("UPDATE staging.ecount_partner_raw")) {
                        throw new RuntimeException("staging update failed");
                    }
                    return 1;
                });

        assertThatThrownBy(() -> importer.importCsv(csvStream(csv), "tester"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("staging update failed");

        verify(collectionRealtimePublisher).publishChange(
                eq(PartnerListRealtime.CHANNEL_ID),
                eq(PartnerListRealtime.EVENT_CHANGED),
                eq(Map.of("changeType", "BULK_UPDATED")));
    }
}
