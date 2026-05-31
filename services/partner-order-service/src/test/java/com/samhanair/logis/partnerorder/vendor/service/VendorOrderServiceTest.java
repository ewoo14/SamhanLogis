package com.samhanair.logis.partnerorder.vendor.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerSummary;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient.CatalogEntry;
import com.samhanair.logis.partnerorder.vendor.ocr.MockOcrEngine;
import com.samhanair.logis.partnerorder.vendor.ocr.OcrEngine;
import com.samhanair.logis.partnerorder.vendor.parser.AirDesignerOrderParser;
import com.samhanair.logis.partnerorder.vendor.parser.JSystemOrderParser;
import com.samhanair.logis.partnerorder.vendor.parser.VendorParserRegistry;
import com.samhanair.logis.partnerorder.vendor.web.dto.VendorOrderConfirmRequest;
import com.samhanair.logis.partnerorder.vendor.web.dto.VendorOrderConfirmResponse;
import com.samhanair.logis.partnerorder.vendor.web.dto.VendorOrderUploadResponse;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.ObjectProvider;

/**
 * VendorOrderService 단위 테스트 — OCR + parser + 단가 lookup + DC 적용 + confirm.
 *
 * <p>외부 client (PartnerLookup / ProductCatalog / DcConfig) Mockito.mock + ObjectProvider 로
 * OcrEngine MockOcrEngine 주입.
 */
class VendorOrderServiceTest {

    private MockOcrEngine ocrEngine;
    private VendorOrderService service;
    private ProductCatalogLookupClient catalogClient;
    private PartnerLookupClient partnerLookupClient;
    private DcConfigClient dcConfigClient;

    @BeforeEach
    void setUp() {
        ocrEngine = new MockOcrEngine();
        catalogClient = Mockito.mock(ProductCatalogLookupClient.class);
        partnerLookupClient = Mockito.mock(PartnerLookupClient.class);
        dcConfigClient = Mockito.mock(DcConfigClient.class);

        VendorParserRegistry registry = new VendorParserRegistry(List.of(
                new AirDesignerOrderParser(), new JSystemOrderParser()));

        @SuppressWarnings("unchecked")
        ObjectProvider<OcrEngine> provider = Mockito.mock(ObjectProvider.class);
        Mockito.when(provider.getIfAvailable()).thenReturn(ocrEngine);

        service = new VendorOrderService(
                provider, registry, catalogClient, partnerLookupClient, dcConfigClient);
    }

    @Test
    void upload_air_designer_with_catalog_lookup_and_dc() {
        ocrEngine.setPresetText("AIRD", """
                에어디자이너 발주서
                거래처: P-A001
                1. 헬로멀티 5kW [HM-5000] 2개 1,000,000원
                합계: 2,000,000원
                """);
        Mockito.when(catalogClient.findByModelCodes(Mockito.anyList()))
                .thenReturn(Map.of("HM-5000",
                        new CatalogEntry("HM-5000", "헬로멀티 5kW (시트)", new BigDecimal("950000"))));
        Mockito.when(partnerLookupClient.findByPartnerCode("P-A001"))
                .thenReturn(Optional.of(new PartnerSummary(
                        UUID.randomUUID(), "P-A001", "에어디자이너", "1234567890")));
        byte[] bytes = "AIRD".getBytes(StandardCharsets.UTF_8);
        VendorOrderUploadResponse resp = service.upload(bytes, "image/png", null, null);

        assertThat(resp.vendorName()).isEqualTo("에어디자이너");
        assertThat(resp.partnerCode()).isEqualTo("P-A001");
        assertThat(resp.parsedLines()).hasSize(1);
        VendorOrderUploadResponse.PreviewLine line = resp.parsedLines().get(0);
        // vendor preview: dcRate=0 (DC 적용은 confirm 단계 price-calc 에서 수행)
        // 시트 단가 950000 * (1 - 0) = 950000
        assertThat(line.unitPrice()).isEqualByComparingTo("950000");
        assertThat(line.dcRate()).isEqualByComparingTo("0");
        assertThat(line.finalPrice()).isEqualByComparingTo("950000");
        assertThat(line.subtotal()).isEqualByComparingTo("1900000");
        assertThat(line.source()).isEqualTo("CATALOG");
        // OCR 합계 (2000000) 와 라인 합산 (1900000) 불일치 → suggestion 추가
        assertThat(resp.suggestions()).anyMatch(s -> s.contains("불일치"));
    }

    @Test
    void upload_falls_back_to_ocr_price_when_catalog_missing() {
        ocrEngine.setPresetText("AIRD", """
                에어디자이너 발주서
                1. 헬로멀티 [UNKNOWN-CODE] 1개 800,000원
                """);
        Mockito.when(catalogClient.findByModelCodes(Mockito.anyList()))
                .thenReturn(Map.of());

        byte[] bytes = "AIRD".getBytes(StandardCharsets.UTF_8);
        VendorOrderUploadResponse resp = service.upload(bytes, "image/png", "에어디자이너", "P-A002");

        assertThat(resp.parsedLines()).hasSize(1);
        VendorOrderUploadResponse.PreviewLine line = resp.parsedLines().get(0);
        assertThat(line.source()).isEqualTo("OCR");
        assertThat(line.unitPrice()).isEqualByComparingTo("800000");
        assertThat(resp.suggestions()).anyMatch(s -> s.contains("UNKNOWN-CODE"));
    }

    @Test
    void upload_jsystem_auto_detected() {
        ocrEngine.setPresetText("JSYS", """
                JSYSTEM order
                Partner: P-J001
                HM-7000 헬로멀티 7kW 2 EA 1,500,000
                TOTAL 3,000,000
                """);
        Mockito.when(catalogClient.findByModelCodes(Mockito.anyList()))
                .thenReturn(Map.of("HM-7000",
                        new CatalogEntry("HM-7000", "헬로멀티 7kW", new BigDecimal("1500000"))));
        Mockito.when(partnerLookupClient.findByPartnerCode("P-J001"))
                .thenReturn(Optional.of(new PartnerSummary(
                        UUID.randomUUID(), "P-J001", "제이시스템", "9876543210")));

        byte[] bytes = "JSYS".getBytes(StandardCharsets.UTF_8);
        VendorOrderUploadResponse resp = service.upload(bytes, "image/png", null, null);

        assertThat(resp.vendorName()).isEqualTo("제이시스템");
        assertThat(resp.partnerCode()).isEqualTo("P-J001");
    }

    @Test
    void upload_throws_when_vendor_not_detected() {
        ocrEngine.setDefaultText("랜덤 텍스트 vendor 식별 불가");
        byte[] bytes = "RAND".getBytes(StandardCharsets.UTF_8);
        assertThatThrownBy(() -> service.upload(bytes, "image/png", null, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("vendor 식별 실패");
    }

    @Test
    void upload_throws_when_empty_bytes() {
        assertThatThrownBy(() -> service.upload(new byte[0], "image/png", null, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("비어있음");
    }

    @Test
    void confirm_registers_new_order_when_partner_exists() {
        Mockito.when(partnerLookupClient.findByPartnerCode("P-J001"))
                .thenReturn(Optional.of(new PartnerSummary(
                        UUID.randomUUID(), "P-J001", "제이시스템", "9876543210")));
        VendorOrderConfirmRequest req = new VendorOrderConfirmRequest(
                "제이시스템", "P-J001",
                List.of(new VendorOrderConfirmRequest.ConfirmLine(
                        "HM-7000", "헬로멀티 7kW", 2, new BigDecimal("1350000"))));
        VendorOrderConfirmResponse resp = service.confirm(req, "tester");
        assertThat(resp.status()).isEqualTo("REGISTERED");
        assertThat(resp.totalAmount()).isEqualByComparingTo("2700000");
        assertThat(resp.orderNo()).matches(
                LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM/dd")) + "-\\d+");
    }

    @Test
    void confirm_throws_404_when_partner_missing() {
        Mockito.when(partnerLookupClient.findByPartnerCode("P-NONE"))
                .thenReturn(Optional.empty());
        VendorOrderConfirmRequest req = new VendorOrderConfirmRequest(
                "제이시스템", "P-NONE",
                List.of(new VendorOrderConfirmRequest.ConfirmLine(
                        "HM-7000", "헬로멀티 7kW", 1, new BigDecimal("1500000"))));
        assertThatThrownBy(() -> service.confirm(req, "tester"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("거래처 미발견");
    }
}
