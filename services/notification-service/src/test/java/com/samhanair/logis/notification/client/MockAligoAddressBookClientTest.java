package com.samhanair.logis.notification.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.notification.client.AligoAddressBookClient.AligoContact;
import com.samhanair.logis.notification.dto.AligoAddressBookDeliveryStatus;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * 주소록 실 client 가 없는 동안 mock 경로가 외부 전달 성공으로 오인되지 않는지 검증한다.
 */
class MockAligoAddressBookClientTest {

    @Test
    void mockClient_returnsNotDeliveredWithoutPositiveCounts() {
        AligoAddressBookClient client = new MockAligoAddressBookClient()
                .mockAligoAddressBookClientBean();

        AligoAddressBookClient.UploadResult result = client.uploadChunk(List.of(
                new AligoContact("일반거래처", "테스트 거래처", "REDACTED_PHONE", "[검증용]")));

        assertThat(result.deliveryStatus()).isEqualTo(AligoAddressBookDeliveryStatus.NOT_DELIVERED);
        assertThat(result.added()).isZero();
        assertThat(result.updated()).isZero();
        assertThat(result.skipped()).isZero();
    }
}
