package com.samhanair.logis.slip.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SlipPublishFingerprintTest {

    @Test
    void 구_저장_규약의_VAT포함단가도_동일_재시도로_판정한다() throws Exception {
        SlipPublishService service = service();
        Slip existing = mock(Slip.class);
        SlipLine stored = mock(SlipLine.class);
        when(existing.getLines()).thenReturn(List.of(stored));
        when(stored.getProductName()).thenReturn("상품");
        when(stored.getQuantity()).thenReturn(1);
        when(stored.getUnitPrice()).thenReturn(new BigDecimal("10"));
        when(stored.getUnitPriceWithVat()).thenReturn(new BigDecimal("11"));
        when(stored.getSpecification()).thenReturn("규격");
        when(stored.getNote()).thenReturn("비고");
        when(stored.getSourceOrderLineId()).thenReturn(null);
        when(stored.getCategoryKey()).thenReturn(null);

        Method method = SlipPublishService.class.getDeclaredMethod(
                "linesMatch", Slip.class, List.class);
        method.setAccessible(true);

        assertThat(method.invoke(service, existing, request("서울 강남구 1", null).lines()))
                .isEqualTo(true);
    }

    @Test
    void 단건_배송주소가_다르면_멱등지문도_달라야_한다() throws Exception {
        SlipPublishService service = new SlipPublishService(
                null, null, null, null, null, null, null, null,
                new ObjectMapper(), null, null, Clock.systemUTC());
        Method method = SlipPublishService.class.getDeclaredMethod(
                "computeFingerprint", PublishFromPartnerOrderRequest.class);
        method.setAccessible(true);

        PublishFromPartnerOrderRequest first = request("서울시 강남구 1");
        PublishFromPartnerOrderRequest second = request("서울시 강남구 2");

        String firstFingerprint = (String) method.invoke(service, first);
        String secondFingerprint = (String) method.invoke(service, second);

        assertThat(firstFingerprint).isNotEqualTo(secondFingerprint);
    }

    @Test
    void 현행_단건_지문은_발행결과를바꾸는_categoryKey를_구분한다() throws Exception {
        SlipPublishService service = service();
        Method method = SlipPublishService.class.getDeclaredMethod(
                "computeFingerprint", PublishFromPartnerOrderRequest.class);
        method.setAccessible(true);

        assertThat(fingerprint(method, service, request("서울시 강남구 1", "singleSets")))
                .isNotEqualTo(fingerprint(method, service, request("서울시 강남구 1", "homeMulti")));
    }

    @Test
    void legacy_단건_지문은_당시_없던_categoryKey를_구분하지_않는다() throws Exception {
        SlipPublishService service = service();
        Method method = SlipPublishService.class.getDeclaredMethod(
                "computeLegacyFingerprint", PublishFromPartnerOrderRequest.class);
        method.setAccessible(true);

        assertThat(fingerprint(method, service, request("서울시 강남구 1", "singleSets")))
                .isEqualTo(fingerprint(method, service, request("서울시 강남구 1", "homeMulti")));
    }

    @Test
    void merge_fingerprint_distinguishes_source_and_line_order_that_changes_publish_result() throws Exception {
        SlipPublishService service = service();
        Method method = SlipPublishService.class.getDeclaredMethod(
                "computeMergeFingerprint", PublishFromOrdersMergeRequest.class);
        method.setAccessible(true);

        PublishLineRequest firstLine = line(1, "PROD-001", UUID.fromString("00000000-0000-0000-0000-000000000001"));
        PublishLineRequest secondLine = line(2, "PROD-002", UUID.fromString("00000000-0000-0000-0000-000000000002"));
        SourceOrderRef firstOrder = new SourceOrderRef("ORDER-1", "SO-1");
        SourceOrderRef secondOrder = new SourceOrderRef("ORDER-2", "SO-2");

        PublishFromOrdersMergeRequest first = mergeRequest(
                List.of(firstOrder, secondOrder), List.of(firstLine, secondLine));
        PublishFromOrdersMergeRequest reordered = mergeRequest(
                List.of(secondOrder, firstOrder), List.of(secondLine, firstLine));

        assertThat(fingerprint(method, service, first))
                .isNotEqualTo(fingerprint(method, service, reordered));
    }

    @Test
    void fingerprint_treats_null_and_empty_string_as_the_same_published_value() throws Exception {
        SlipPublishService service = service();
        Method method = SlipPublishService.class.getDeclaredMethod(
                "computeFingerprint", PublishFromPartnerOrderRequest.class);
        method.setAccessible(true);

        assertThat(fingerprint(method, service, requestWithMemo(null)))
                .isEqualTo(fingerprint(method, service, requestWithMemo("")));
    }

    @Test
    void line_number_does_not_change_the_fingerprint() throws Exception {
        SlipPublishService service = service();
        Method method = SlipPublishService.class.getDeclaredMethod(
                "computeFingerprint", PublishFromPartnerOrderRequest.class);
        method.setAccessible(true);

        assertThat(fingerprint(method, service, requestWithLineNo(1)))
                .isEqualTo(fingerprint(method, service, requestWithLineNo(99)));
    }

    private static SlipPublishService service() {
        return new SlipPublishService(
                null, null, null, null, null, null, null, null,
                new ObjectMapper(), null, null, Clock.systemUTC());
    }

    private static String fingerprint(Method method, SlipPublishService service, Object request)
            throws Exception {
        return (String) method.invoke(service, request);
    }

    private static PublishFromPartnerOrderRequest requestWithMemo(String memo) {
        return new PublishFromPartnerOrderRequest(
                "PO-FINGERPRINT-1", "20260731", "P-001", "거래처", "EMP-001",
                "WH-001", "00000000-0000-0000-0000-000000000010", "서울 강남구 1", null,
                "010-0000-0000", memo, "결제", "할인", "2026-07-31T10:00:00Z",
                List.of(line(1, "PROD-001", null)));
    }

    private static PublishFromPartnerOrderRequest requestWithLineNo(Integer lineNo) {
        return new PublishFromPartnerOrderRequest(
                "PO-FINGERPRINT-1", "20260731", "P-001", "거래처", "EMP-001",
                "WH-001", "00000000-0000-0000-0000-000000000010", "서울 강남구 1", null,
                "010-0000-0000", "메모", "결제", "할인", "2026-07-31T10:00:00Z",
                List.of(line(lineNo, "PROD-001", null)));
    }

    private static PublishFromOrdersMergeRequest mergeRequest(
            List<SourceOrderRef> sourceOrders, List<PublishLineRequest> lines) {
        return new PublishFromOrdersMergeRequest(
                sourceOrders, "20260731", UUID.fromString("00000000-0000-0000-0000-000000000020"),
                "P-001", "거래처", "EMP-001", "WH-001",
                "00000000-0000-0000-0000-000000000010", "서울 강남구 1", null,
                "010-0000-0000", "메모", "결제", "할인", lines);
    }

    private static PublishLineRequest line(Integer lineNo, String productCode, UUID sourceLineId) {
        return new PublishLineRequest(lineNo, productCode, "상품", "규격", "1",
                BigDecimal.ONE, BigDecimal.TEN, BigDecimal.TEN, BigDecimal.ONE, "비고", sourceLineId,
                "fingerprint-test");
    }

    private static PublishFromPartnerOrderRequest request(String shippingAddress) {
        return request(shippingAddress, "fingerprint-test");
    }

    private static PublishFromPartnerOrderRequest request(String shippingAddress, String categoryKey) {
        return new PublishFromPartnerOrderRequest(
                "PO-FINGERPRINT-1", "20260731", "P-001", "거래처", "EMP-001",
                "WH-001", UUID.randomUUID().toString(), shippingAddress, null, "010-0000-0000",
                "메모", "월말", "할인", "2026-07-31T10:00:00Z",
                List.of(new PublishLineRequest(1, "PROD-001", "상품", "규격", "1",
                        BigDecimal.ONE, BigDecimal.TEN, BigDecimal.TEN, BigDecimal.ONE, "비고", null,
                        categoryKey)));
    }
}
