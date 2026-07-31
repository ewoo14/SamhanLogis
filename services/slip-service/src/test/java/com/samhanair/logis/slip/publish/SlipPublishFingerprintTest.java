package com.samhanair.logis.slip.publish;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SlipPublishFingerprintTest {

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

    private static PublishFromPartnerOrderRequest request(String shippingAddress) {
        return new PublishFromPartnerOrderRequest(
                "PO-FINGERPRINT-1", "20260731", "P-001", "거래처", "EMP-001",
                "WH-001", UUID.randomUUID().toString(), shippingAddress, null, "010-0000-0000",
                "메모", "월말", "할인", "2026-07-31T10:00:00Z",
                List.of(new PublishLineRequest(1, "PROD-001", "상품", "규격", "1",
                        BigDecimal.ONE, BigDecimal.TEN, BigDecimal.TEN, BigDecimal.ONE, "비고", null)));
    }
}
