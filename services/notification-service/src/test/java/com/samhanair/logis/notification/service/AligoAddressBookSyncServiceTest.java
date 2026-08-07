package com.samhanair.logis.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.notification.client.AligoAddressBookClient;
import com.samhanair.logis.notification.client.AligoAddressBookClient.AligoContact;
import com.samhanair.logis.notification.client.AligoAddressBookClient.UploadResult;
import com.samhanair.logis.notification.client.AligoCsvSourceClient;
import com.samhanair.logis.notification.dto.AligoAddressBookDeliveryStatus;
import com.samhanair.logis.notification.dto.AligoAddressBookSyncResponse;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * Phase 10 PR-F1 BE-1 — {@link AligoAddressBookSyncService} 단위 테스트.
 *
 * <p>커버 4 case:
 * <ol>
 *   <li>chunk 50 분할 — 120 contact → 3 chunk (50/50/20) 호출 검증</li>
 *   <li>429 응답 시 exponential backoff 재시도 + 최종 성공</li>
 *   <li>partial fail — 일부 chunk 5xx 시 다른 chunk 는 성공 누적, failed 메시지 누적</li>
 *   <li>mock client (CsvSource fetch 빈 결과) 호출 시 sync skip + 빈 응답 반환</li>
 * </ol>
 *
 * <p>JPA / Spring 부팅 없음 (한글 경로 + JDK 17 호환). {@code AligoAddressBookSyncService.sleep}
 * 는 test subclass 로 override (실 sleep 회피로 테스트 즉시 완료).
 */
@ExtendWith(MockitoExtension.class)
class AligoAddressBookSyncServiceTest {

    @Mock
    private AligoCsvSourceClient csvSourceClient;

    @Mock
    private AligoAddressBookClient aligoClient;

    /** 실 sleep 회피 — test 가 backoff 시간만큼 대기하지 않도록 override. */
    private AligoAddressBookSyncService newServiceWithoutSleep() {
        return new AligoAddressBookSyncService(csvSourceClient, aligoClient) {
            @Override
            void sleep(long millis) {
                // no-op
            }
        };
    }

    private List<AligoContact> generateContacts(int count) {
        List<AligoContact> contacts = new ArrayList<>(count);
        for (int i = 1; i <= count; i++) {
            contacts.add(new AligoContact("VIP거래처", "거래처" + i,
                    String.format("0101234%04d", i), "[P-2026-" + String.format("%04d", i) + "]"));
        }
        return contacts;
    }

    @Test
    void sync_120contacts_splitsIntoThreeChunks_50_50_20() {
        // chunk 50 분할 검증 — 120 contact → 50 + 50 + 20 = 3회 uploadChunk 호출.
        when(csvSourceClient.fetchContacts()).thenReturn(generateContacts(120));
        when(aligoClient.uploadChunk(anyList())).thenAnswer(inv -> {
            List<?> chunk = inv.getArgument(0);
            return UploadResult.success(chunk.size());
        });

        AligoAddressBookSyncService service = newServiceWithoutSleep();
        AligoAddressBookSyncResponse response = service.sync();

        assertThat(response.added()).isEqualTo(120);
        assertThat(response.updated()).isZero();
        assertThat(response.skipped()).isZero();
        assertThat(response.failed()).isEmpty();
        assertThat(response.deliveryStatus()).isEqualTo(AligoAddressBookDeliveryStatus.DELIVERED);

        // chunk 호출 횟수 + 각 chunk size 검증
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<AligoContact>> captor = ArgumentCaptor.forClass(List.class);
        verify(aligoClient, times(3)).uploadChunk(captor.capture());
        List<List<AligoContact>> allChunks = captor.getAllValues();
        assertThat(allChunks.get(0)).hasSize(50);
        assertThat(allChunks.get(1)).hasSize(50);
        assertThat(allChunks.get(2)).hasSize(20);
    }

    @Test
    void sync_429ResponseTwiceThenSuccess_retriesWithBackoff() {
        // 429 응답 → backoff → 재시도. 첫 chunk: 429 / 429 / success(50). 추가 chunk 없음.
        when(csvSourceClient.fetchContacts()).thenReturn(generateContacts(50));
        when(aligoClient.uploadChunk(anyList()))
                .thenReturn(UploadResult.rateLimited())
                .thenReturn(UploadResult.rateLimited())
                .thenReturn(UploadResult.success(50));

        AligoAddressBookSyncService service = newServiceWithoutSleep();
        AligoAddressBookSyncResponse response = service.sync();

        // 최종 success 으로 added=50, failed empty
        assertThat(response.added()).isEqualTo(50);
        assertThat(response.failed()).isEmpty();
        assertThat(response.deliveryStatus()).isEqualTo(AligoAddressBookDeliveryStatus.DELIVERED);
        // uploadChunk 3회 호출 (429 2번 + 성공 1번)
        verify(aligoClient, times(3)).uploadChunk(anyList());
    }

    @Test
    void sync_429ExhaustedAllRetries_recordsFailed() {
        // backoff 소진 시 failed 누적 검증.
        when(csvSourceClient.fetchContacts()).thenReturn(generateContacts(10));
        when(aligoClient.uploadChunk(anyList())).thenReturn(UploadResult.rateLimited());

        AligoAddressBookSyncService service = newServiceWithoutSleep();
        AligoAddressBookSyncResponse response = service.sync();

        assertThat(response.added()).isZero();
        assertThat(response.failed()).hasSize(1);
        assertThat(response.failed().get(0)).contains("chunk#1");
        assertThat(response.failed().get(0)).contains("429");
        // 최초 1회 + retries 3회 = 총 4회 호출
        verify(aligoClient, times(1 + AligoAddressBookSyncService.BACKOFF_MAX_RETRIES))
                .uploadChunk(anyList());
    }

    @Test
    void sync_partialFailure_chunkSucceedsAndChunkFails_accumulatesBoth() {
        // 60 contact → 2 chunk (50 + 10). 첫 chunk 성공, 둘째 chunk HTTP 500 실패.
        when(csvSourceClient.fetchContacts()).thenReturn(generateContacts(60));
        when(aligoClient.uploadChunk(anyList()))
                .thenReturn(UploadResult.success(50))
                .thenReturn(new UploadResult(0, 0, 0, 500, "internal-server-error",
                        AligoAddressBookDeliveryStatus.NOT_DELIVERED));

        AligoAddressBookSyncService service = newServiceWithoutSleep();
        AligoAddressBookSyncResponse response = service.sync();

        assertThat(response.added()).isEqualTo(50);
        assertThat(response.failed()).hasSize(1);
        assertThat(response.failed().get(0)).contains("chunk#2");
        assertThat(response.failed().get(0)).contains("HTTP 500");
        assertThat(response.deliveryStatus()).isEqualTo(AligoAddressBookDeliveryStatus.PARTIALLY_DELIVERED);
        // sample memo (chunk 의 첫 contact 의 memo) 가 포함되어야 함 — 51번째 = P-2026-0051
        assertThat(response.failed().get(0)).contains("P-2026-0051");
    }

    @Test
    void sync_mockClient_emptyCsv_returnsEmptyResponseWithoutInvoking() {
        // CsvSource 가 빈 리스트 반환 시 → uploadChunk 호출 X + 빈 응답.
        when(csvSourceClient.fetchContacts()).thenReturn(List.of());

        AligoAddressBookSyncService service = newServiceWithoutSleep();
        AligoAddressBookSyncResponse response = service.sync();

        assertThat(response.added()).isZero();
        assertThat(response.updated()).isZero();
        assertThat(response.skipped()).isZero();
        assertThat(response.failed()).isEmpty();
        assertThat(response.deliveryStatus()).isEqualTo(AligoAddressBookDeliveryStatus.NOT_DELIVERED);
        verify(aligoClient, times(0)).uploadChunk(anyList());
    }

    @Test
    void sync_mockClient_notDeliveredResponse_hasNoPositiveCounts() {
        // mock dryRun 응답의 입력 size 가 added 로 오염되지 않고 외부 미전달로 보존되는지 검증.
        when(csvSourceClient.fetchContacts()).thenReturn(generateContacts(7));
        when(aligoClient.uploadChunk(anyList())).thenAnswer(inv -> {
            List<?> chunk = inv.getArgument(0);
            return new UploadResult(chunk.size(), 0, 0, 200, "dry-run-not-delivered",
                    AligoAddressBookDeliveryStatus.NOT_DELIVERED);
        });

        AligoAddressBookSyncService service = newServiceWithoutSleep();
        AligoAddressBookSyncResponse response = service.sync();

        assertThat(response.added()).isZero();
        assertThat(response.updated()).isZero();
        assertThat(response.skipped()).isZero();
        assertThat(response.failed()).isEmpty();
        assertThat(response.deliveryStatus()).isEqualTo(AligoAddressBookDeliveryStatus.NOT_DELIVERED);
        // 7 ≤ 50 → 1 chunk 만 호출
        verify(aligoClient, times(1)).uploadChunk(anyList());
    }
}
