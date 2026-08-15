package com.samhanair.logis.dcconfig.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.DcConfigSource;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.domain.PartnerGroup;
import com.samhanair.logis.dcconfig.dto.DcConfigImportResult;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import com.samhanair.logis.dcconfig.repository.PartnerRepository;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * PR-D Part 2-2 — DC 거래처 할인 정보 CSV import 단위 테스트.
 *
 * <p>검증 시나리오:
 * <ul>
 *   <li>정상 import (insert + update upsert)</li>
 *   <li>partner_code 부재 → reject</li>
 *   <li>partner_code 미존재 → CSV 최소 거래처 자동 생성 후 import</li>
 *   <li>형식 변환 ("46%" / "₩20,000" / "Yes" / 빈 문자열)</li>
 *   <li>UTF-8 BOM 처리</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class DcConfigImportServiceTest {

    @Mock
    private PartnerRepository partnerRepository;
    @Mock
    private DcConfigRepository dcConfigRepository;

    @InjectMocks
    private DcConfigImportService service;

    private Partner partner;

    @BeforeEach
    void setUp() {
        partner = Partner.create("6260403108", "1234567890", "(주)예전",
                "서울시", "010-0000-0000", "홍길동", PartnerGroup.UNCLASSIFIED,
                BigDecimal.ZERO, "");
    }

    @Test
    @DisplayName("정상 row → DcConfig insert + 모든 필드 매핑")
    void importNormalRow_inserts() {
        String csv = "업체명,1way,1등급,360,4way,거래처코드,단위처리,디럭스,상업멀티DC,스탠드,유연호스I형,특이사항,홈멀티DC\n"
                + "(주)예전,\"₩30,000\",,\"₩20,000\",\"₩25,000\",6260403108,Yes,\"₩5,000\",47%,\"₩10,000\",No,비고메모,46%\n";

        when(partnerRepository.findByPartnerCode("6260403108")).thenReturn(Optional.of(partner));
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.empty());

        DcConfigImportResult result = service.importCsv(toStream(csv));

        assertThat(result.inserted()).isEqualTo(1);
        assertThat(result.updated()).isZero();
        assertThat(result.rejected()).isEmpty();

        ArgumentCaptor<DcConfig> captor = ArgumentCaptor.forClass(DcConfig.class);
        verify(dcConfigRepository).save(captor.capture());
        DcConfig saved = captor.getValue();
        assertThat(saved.getHomeDiscountRate()).isEqualByComparingTo(new BigDecimal("0.4600"));
        assertThat(saved.getCommercialDiscountRate()).isEqualByComparingTo(new BigDecimal("0.4700"));
        assertThat(saved.getDiscount360Amount()).isEqualByComparingTo("20000.00");
        assertThat(saved.getDiscount4WayAmount()).isEqualByComparingTo("25000.00");
        assertThat(saved.getDiscount1WayAmount()).isEqualByComparingTo("30000.00");
        assertThat(saved.getDiscountStandAmount()).isEqualByComparingTo("10000.00");
        assertThat(saved.getDiscountDeluxeAmount()).isEqualByComparingTo("5000.00");
        assertThat(saved.getDiscountFirstGradeAmount()).isNull();
        assertThat(saved.getShowIHose()).isFalse();
        assertThat(saved.getUnitProcessingEnabled()).isTrue();
        assertThat(saved.getNote()).isEqualTo("비고메모");
        assertThat(saved.getSource()).isEqualTo(DcConfigSource.LEGACY_CSV);
    }

    @Test
    @DisplayName("기존 DcConfig 존재 → update (insert 0, updated 1)")
    void importExisting_updates() {
        String csv = "업체명,1way,1등급,360,4way,거래처코드,단위처리,디럭스,상업멀티DC,스탠드,유연호스I형,특이사항,홈멀티DC\n"
                + "(주)예전,,,,,6260403108,No,,50%,,Yes,,40%\n";

        DcConfig existing = DcConfig.create(partner, DcConfigSource.ADMIN_EDIT);
        when(partnerRepository.findByPartnerCode("6260403108")).thenReturn(Optional.of(partner));
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.of(existing));

        DcConfigImportResult result = service.importCsv(toStream(csv));

        assertThat(result.inserted()).isZero();
        assertThat(result.updated()).isEqualTo(1);
        assertThat(result.rejected()).isEmpty();
        assertThat(existing.getHomeDiscountRate()).isEqualByComparingTo(new BigDecimal("0.4000"));
        assertThat(existing.getCommercialDiscountRate()).isEqualByComparingTo(new BigDecimal("0.5000"));
        assertThat(existing.getShowIHose()).isTrue();
        assertThat(existing.getUnitProcessingEnabled()).isFalse();
        assertThat(existing.getSource()).isEqualTo(DcConfigSource.LEGACY_CSV);
    }

    @Test
    @DisplayName("#29 단위처리 select 9종 — '100원 반올림' → enabled + roundTo/roundMode 보존")
    void importUnitProcessingSelect_preservesRounding() {
        String csv = "업체명,1way,1등급,360,4way,거래처코드,단위처리,디럭스,상업멀티DC,스탠드,유연호스I형,특이사항,홈멀티DC\n"
                + "(주)예전,,,,,6260403108,100원 반올림,,47%,,No,,46%\n";

        when(partnerRepository.findByPartnerCode("6260403108")).thenReturn(Optional.of(partner));
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.empty());

        DcConfigImportResult result = service.importCsv(toStream(csv));

        assertThat(result.inserted()).isEqualTo(1);
        assertThat(result.rejected()).isEmpty();
        ArgumentCaptor<DcConfig> captor = ArgumentCaptor.forClass(DcConfig.class);
        verify(dcConfigRepository).save(captor.capture());
        DcConfig saved = captor.getValue();
        assertThat(saved.getUnitProcessingEnabled()).isTrue();
        assertThat(saved.getUnitRoundTo()).isEqualTo(100);
        assertThat(saved.getUnitRoundMode()).isEqualTo(com.samhanair.logis.dcconfig.domain.UnitRoundMode.ROUND);
    }

    @Test
    @DisplayName("#29 구형 'Yes'/'No' update — 기존 rounding 정책 보존 (toggle 만 갱신)")
    void importYesNo_preservesExistingRounding() {
        String csv = "업체명,1way,1등급,360,4way,거래처코드,단위처리,디럭스,상업멀티DC,스탠드,유연호스I형,특이사항,홈멀티DC\n"
                + "(주)예전,,,,,6260403108,No,,50%,,Yes,,40%\n";

        DcConfig existing = DcConfig.create(partner, DcConfigSource.ADMIN_EDIT);
        existing.changeRounding(1000, com.samhanair.logis.dcconfig.domain.UnitRoundMode.CEIL);
        when(partnerRepository.findByPartnerCode("6260403108")).thenReturn(Optional.of(partner));
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.of(existing));

        service.importCsv(toStream(csv));

        // 'No' = 활성 토글만 끔 — 기존 반올림 정책(1000원 올림)은 유지
        assertThat(existing.getUnitProcessingEnabled()).isFalse();
        assertThat(existing.getUnitRoundTo()).isEqualTo(1000);
        assertThat(existing.getUnitRoundMode()).isEqualTo(com.samhanair.logis.dcconfig.domain.UnitRoundMode.CEIL);
    }

    @Test
    @DisplayName("#29 단위처리 비인식 값 → reject (silent 유실 금지)")
    void rejectUnknownUnitProcessing() {
        String csv = "업체명,1way,1등급,360,4way,거래처코드,단위처리,디럭스,상업멀티DC,스탠드,유연호스I형,특이사항,홈멀티DC\n"
                + "(주)예전,,,,,6260403108,오천원 막올림,,47%,,No,,46%\n";

        when(partnerRepository.findByPartnerCode("6260403108")).thenReturn(Optional.of(partner));
        // 단위처리 파싱이 findByPartner_Id 도달 전에 reject — 해당 stub 불필요

        DcConfigImportResult result = service.importCsv(toStream(csv));

        assertThat(result.inserted()).isZero();
        assertThat(result.rejected()).hasSize(1);
        assertThat(result.rejected().get(0).reason()).contains("단위처리");
    }

    @Test
    @DisplayName("#29 parseUnitProcessing — select 9종/Yes·No 호환/빈값")
    void parseUnitProcessingMatrix() {
        var ceil10 = DcConfigImportService.parseUnitProcessing("10원 올림");
        assertThat(ceil10.enabled()).isTrue();
        assertThat(ceil10.roundTo()).isEqualTo(10);
        assertThat(ceil10.roundMode()).isEqualTo(com.samhanair.logis.dcconfig.domain.UnitRoundMode.CEIL);

        var floor1000 = DcConfigImportService.parseUnitProcessing("1000원 내림");
        assertThat(floor1000.roundTo()).isEqualTo(1000);
        assertThat(floor1000.roundMode()).isEqualTo(com.samhanair.logis.dcconfig.domain.UnitRoundMode.FLOOR);

        var round100 = DcConfigImportService.parseUnitProcessing("100원반올림");
        assertThat(round100.roundTo()).isEqualTo(100);
        assertThat(round100.roundMode()).isEqualTo(com.samhanair.logis.dcconfig.domain.UnitRoundMode.ROUND);

        var yes = DcConfigImportService.parseUnitProcessing("Yes");
        assertThat(yes.enabled()).isTrue();
        assertThat(yes.roundTo()).isNull();

        var blank = DcConfigImportService.parseUnitProcessing("  ");
        assertThat(blank.enabled()).isFalse();
        assertThat(blank.roundTo()).isNull();

        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> DcConfigImportService.parseUnitProcessing("5000원 올림"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("partner_code 부재 → reject (거래처코드 부재)")
    void rejectWhenPartnerCodeMissing() {
        String csv = "업체명,1way,1등급,360,4way,거래처코드,단위처리,디럭스,상업멀티DC,스탠드,유연호스I형,특이사항,홈멀티DC\n"
                + "어떤거래처,,,,,,,,,,,,\n";

        DcConfigImportResult result = service.importCsv(toStream(csv));

        assertThat(result.inserted()).isZero();
        assertThat(result.rejected()).hasSize(1);
        assertThat(result.rejected().get(0).reason()).contains("거래처코드 부재");
    }

    @Test
    @DisplayName("Notion export trailing row — 거래처코드/업체명 없이 No만 있으면 skip")
    void skipsNotionTrailingBlankLikeRow() {
        String csv = "업체명,1way,1등급,360,4way,거래처코드,단위처리,디럭스,상업멀티DC,스탠드,유연호스I형,특이사항,홈멀티DC\n"
                + ",,,,,,,,,,No,,\n";

        DcConfigImportResult result = service.importCsv(toStream(csv));

        assertThat(result.inserted()).isZero();
        assertThat(result.skipped()).isEqualTo(1);
        assertThat(result.rejected()).isEmpty();
    }

    @Test
    @DisplayName("partner_code DB 미존재 → CSV 최소 거래처 자동 생성 후 import")
    void createsPartnerWhenPartnerNotFound() {
        String csv = "업체명,1way,1등급,360,4way,거래처코드,단위처리,디럭스,상업멀티DC,스탠드,유연호스I형,특이사항,홈멀티DC\n"
                + "신규거래처,,,,,9999999999,,,,,,,\n";

        when(partnerRepository.findByPartnerCode("9999999999")).thenReturn(Optional.empty());
        when(partnerRepository.save(any(Partner.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.empty());

        DcConfigImportResult result = service.importCsv(toStream(csv));

        assertThat(result.inserted()).isEqualTo(1);
        assertThat(result.rejected()).isEmpty();
        verify(partnerRepository).save(any(Partner.class));
    }

    @Test
    @DisplayName("UTF-8 BOM 처리 — 헤더에 BOM 이 붙어도 정상 파싱")
    void handlesBom() {
        String csvBody = "업체명,1way,1등급,360,4way,거래처코드,단위처리,디럭스,상업멀티DC,스탠드,유연호스I형,특이사항,홈멀티DC\n"
                + "(주)예전,,,,,6260403108,,,,,,,46%\n";
        byte[] bom = new byte[] { (byte) 0xEF, (byte) 0xBB, (byte) 0xBF };
        byte[] body = csvBody.getBytes(StandardCharsets.UTF_8);
        byte[] withBom = new byte[bom.length + body.length];
        System.arraycopy(bom, 0, withBom, 0, bom.length);
        System.arraycopy(body, 0, withBom, bom.length, body.length);

        when(partnerRepository.findByPartnerCode("6260403108")).thenReturn(Optional.of(partner));
        lenient().when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.empty());

        DcConfigImportResult result = service.importCsv(new ByteArrayInputStream(withBom));

        assertThat(result.inserted()).isEqualTo(1);
        assertThat(result.rejected()).isEmpty();
    }

    @Test
    @DisplayName("필수 컬럼 누락 → BusinessException")
    void rejectsMissingRequiredColumns() {
        String csv = "업체명,1way,1등급\n(주)예전,,,\n";
        assertThatThrownBy(() -> service.importCsv(toStream(csv)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("거래처코드");
    }

    @Test
    @DisplayName("형식 변환 — parsePercent / parseCurrency / parseYesNo")
    void formatHelpers() {
        // parsePercent
        assertThat(DcConfigImportService.parsePercent("46%"))
                .isEqualByComparingTo(new BigDecimal("0.4600"));
        assertThat(DcConfigImportService.parsePercent("47%"))
                .isEqualByComparingTo(new BigDecimal("0.4700"));
        assertThat(DcConfigImportService.parsePercent("")).isNull();
        assertThat(DcConfigImportService.parsePercent(null)).isNull();
        assertThatThrownBy(() -> DcConfigImportService.parsePercent("abc%"))
                .isInstanceOf(IllegalArgumentException.class);

        // 실제 2026-07-28 원천 DC CSV의 fraction 표기: 0.45는 0.45여야 한다.
        assertThat(DcConfigImportService.parsePercent("0.45"))
                .isEqualByComparingTo(new BigDecimal("0.4500"));
        assertThatThrownBy(() -> DcConfigImportService.parsePercent("46"))
                .isInstanceOf(IllegalArgumentException.class);

        // parseCurrency
        assertThat(DcConfigImportService.parseCurrency("₩20,000"))
                .isEqualByComparingTo("20000.00");
        assertThat(DcConfigImportService.parseCurrency("30000원"))
                .isEqualByComparingTo("30000.00");
        assertThat(DcConfigImportService.parseCurrency(""))
                .isNull();
        assertThat(DcConfigImportService.parseCurrency(null))
                .isNull();
        assertThatThrownBy(() -> DcConfigImportService.parseCurrency("abc"))
                .isInstanceOf(IllegalArgumentException.class);

        // parseYesNo
        assertThat(DcConfigImportService.parseYesNo("Yes")).isTrue();
        assertThat(DcConfigImportService.parseYesNo("yes")).isTrue();
        assertThat(DcConfigImportService.parseYesNo("YES")).isTrue();
        assertThat(DcConfigImportService.parseYesNo("No")).isFalse();
        assertThat(DcConfigImportService.parseYesNo("")).isFalse();
        assertThat(DcConfigImportService.parseYesNo(null)).isFalse();
    }

    @Test
    @DisplayName("빈 line → skip 카운터 증가")
    void blankRowSkipped() {
        String csv = "업체명,1way,1등급,360,4way,거래처코드,단위처리,디럭스,상업멀티DC,스탠드,유연호스I형,특이사항,홈멀티DC\n"
                + ",,,,,,,,,,,,\n"
                + "(주)예전,,,,,6260403108,,,,,,,46%\n";

        when(partnerRepository.findByPartnerCode("6260403108")).thenReturn(Optional.of(partner));
        lenient().when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.empty());

        DcConfigImportResult result = service.importCsv(toStream(csv));

        assertThat(result.inserted()).isEqualTo(1);
        assertThat(result.skipped()).isEqualTo(1);
        assertThat(result.rejected()).isEmpty();
    }

    private static InputStream toStream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }
}
