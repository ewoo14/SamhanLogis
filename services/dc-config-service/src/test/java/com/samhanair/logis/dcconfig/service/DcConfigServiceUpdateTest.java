package com.samhanair.logis.dcconfig.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.DcConfigSource;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.domain.PartnerGroup;
import com.samhanair.logis.dcconfig.dto.UpdatePartnerDcConfigRequest;
import com.samhanair.logis.dcconfig.audit.service.DcConfigAuditLogService;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 4b 백로그 — 거래처 DC 설정 인라인 PATCH 파서 회귀 테스트.
 *
 * <p>외부 표시 문자열 ("46%", "₩70,000", "Yes/No") ↔ 내부 BigDecimal/Boolean 변환 검증.
 */
@ExtendWith(MockitoExtension.class)
class DcConfigServiceUpdateTest {

    @Mock
    private DcConfigRepository dcConfigRepository;
    @Mock
    private PartnerService partnerService;
    @Mock
    private DcConfigAuditLogService dcConfigAuditLogService;
    @Captor
    private org.mockito.ArgumentCaptor<List<ChangeEntry>> changesCaptor;

    @InjectMocks
    private DcConfigService dcConfigService;

    private Partner partner;
    private DcConfig existing;

    @BeforeEach
    void setUp() {
        partner = Partner.create("BIZ-1", "1234567890", "테스트 거래처", "주소", "010",
                "담당", PartnerGroup.UNCLASSIFIED, BigDecimal.ZERO, "");
        existing = DcConfig.create(partner, DcConfigSource.ADMIN_EDIT);
        when(partnerService.getByPartnerCode("BIZ-1")).thenReturn(partner);
    }

    @Test
    void parsesPercent_46percent_to_0_46() {
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.of(existing));
        UpdatePartnerDcConfigRequest req = new UpdatePartnerDcConfigRequest(
                "46%", "47%", null, null, null, null, null, null, null, null, null);

        DcConfig result = dcConfigService.updatePartnerDcConfig("BIZ-1", req);

        assertThat(result.getHomeDiscountRate()).isEqualByComparingTo("0.46");
        assertThat(result.getCommercialDiscountRate()).isEqualByComparingTo("0.47");
    }

    @Test
    void parsesWon_with_currency_and_comma() {
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.of(existing));
        UpdatePartnerDcConfigRequest req = new UpdatePartnerDcConfigRequest(
                null, null, null, "₩70,000", "₩50,000", "₩30,000", "30000", "10,000", "20000",
                null, null);

        DcConfig result = dcConfigService.updatePartnerDcConfig("BIZ-1", req);

        assertThat(result.getDiscount360Amount()).isEqualByComparingTo("70000");
        assertThat(result.getDiscount4WayAmount()).isEqualByComparingTo("50000");
        assertThat(result.getDiscount1WayAmount()).isEqualByComparingTo("30000");
        assertThat(result.getDiscountStandAmount()).isEqualByComparingTo("30000");
        assertThat(result.getDiscountDeluxeAmount()).isEqualByComparingTo("10000");
        assertThat(result.getDiscountFirstGradeAmount()).isEqualByComparingTo("20000");
    }

    @Test
    void parsesYesNo_caseInsensitive() {
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.of(existing));
        UpdatePartnerDcConfigRequest req = new UpdatePartnerDcConfigRequest(
                null, null, "Yes", null, null, null, null, null, null, "no", null);

        DcConfig result = dcConfigService.updatePartnerDcConfig("BIZ-1", req);

        assertThat(result.getShowIHose()).isTrue();
        assertThat(result.getUnitProcessingEnabled()).isFalse();
    }

    @Test
    void nullFields_areNoOp_preservingPriorValues() {
        existing.changeRates(new BigDecimal("0.20"), new BigDecimal("0.30"));
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.of(existing));
        UpdatePartnerDcConfigRequest req = new UpdatePartnerDcConfigRequest(
                null, null, null, null, null, null, null, null, null, null, null);

        DcConfig result = dcConfigService.updatePartnerDcConfig("BIZ-1", req);

        assertThat(result.getHomeDiscountRate()).isEqualByComparingTo("0.20");
        assertThat(result.getCommercialDiscountRate()).isEqualByComparingTo("0.30");
    }

    @Test
    void emDash_treatedAsNoOp() {
        existing.changeRates(new BigDecimal("0.10"), new BigDecimal("0.10"));
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.of(existing));
        UpdatePartnerDcConfigRequest req = new UpdatePartnerDcConfigRequest(
                "—", "—", null, null, null, null, null, null, null, null, null);

        DcConfig result = dcConfigService.updatePartnerDcConfig("BIZ-1", req);

        assertThat(result.getHomeDiscountRate()).isEqualByComparingTo("0.10");
    }

    @Test
    void remark_blank_clearsToNull() {
        existing.changeNote("기존 메모");
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.of(existing));
        UpdatePartnerDcConfigRequest req = new UpdatePartnerDcConfigRequest(
                null, null, null, null, null, null, null, null, null, null, "");

        DcConfig result = dcConfigService.updatePartnerDcConfig("BIZ-1", req);

        assertThat(result.getNote()).isNull();
    }

    @Test
    void invalidPercent_throws_INVALID_INPUT() {
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.of(existing));
        UpdatePartnerDcConfigRequest req = new UpdatePartnerDcConfigRequest(
                "abc", null, null, null, null, null, null, null, null, null, null);

        assertThatThrownBy(() -> dcConfigService.updatePartnerDcConfig("BIZ-1", req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("DC율 형식 오류");
    }

    @Test
    void autoCreatesDcConfig_whenAbsent() {
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.empty());
        when(dcConfigRepository.save(any(DcConfig.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        UpdatePartnerDcConfigRequest req = new UpdatePartnerDcConfigRequest(
                "10%", null, null, null, null, null, null, null, null, null, null);

        DcConfig result = dcConfigService.updatePartnerDcConfig("BIZ-1", req);

        assertThat(result.getHomeDiscountRate()).isEqualByComparingTo("0.10");
        assertThat(result.getSource()).isEqualTo(DcConfigSource.ADMIN_EDIT);
    }

    @Test
    void patchRecordsOnlyActualChangedFields() {
        existing.changeNote("기존 메모");
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.of(existing));
        UpdatePartnerDcConfigRequest req = new UpdatePartnerDcConfigRequest(
                null, null, null, null, null, null, null, null, null, null, "새 메모");

        dcConfigService.updatePartnerDcConfig("BIZ-1", req);

        verify(dcConfigAuditLogService).recordBatch(
                any(), any(), org.mockito.ArgumentMatchers.eq("system"),
                org.mockito.ArgumentMatchers.isNull(), changesCaptor.capture());
        assertThat(changesCaptor.getValue()).singleElement().extracting(
                ChangeEntry::fieldName, ChangeEntry::oldValue, ChangeEntry::newValue)
                .containsExactly("remark", "기존 메모", "새 메모");
    }

    @Test
    void identicalPatchDoesNotRecordAudit() {
        existing.changeNote("같은 메모");
        when(dcConfigRepository.findByPartner_Id(any())).thenReturn(Optional.of(existing));
        UpdatePartnerDcConfigRequest req = new UpdatePartnerDcConfigRequest(
                null, null, null, null, null, null, null, null, null, null, "같은 메모");

        dcConfigService.updatePartnerDcConfig("BIZ-1", req);

        verify(dcConfigAuditLogService, never()).recordBatch(any(), any(), any(), any(), any());
    }
}
