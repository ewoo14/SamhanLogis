package com.samhanair.logis.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doThrow;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.notification.adapter.NotificationGatewayResult;
import com.samhanair.logis.notification.client.BlockedPartnerLookupClient;
import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.NotificationRequest;
import com.samhanair.logis.notification.domain.NotificationStatus;
import com.samhanair.logis.notification.domain.RecipientType;
import com.samhanair.logis.notification.service.NotificationService.SendResult;
import com.samhanair.logis.notification.dto.DispatchBatchSendRequest;
import com.samhanair.logis.notification.dto.DispatchBatchSendRequest.SendEntry;
import com.samhanair.logis.notification.dto.DispatchBatchSendResponse;
import com.samhanair.logis.notification.dto.NotificationSendRequest;
import com.samhanair.logis.notification.web.dto.DispatchSmsSaveHistoryRequest;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * {@link DispatchBatchSendService} 단위 테스트 — PR-E1 BE-4 (4 case) + SP-09-2 send_audit 검증.
 *
 * <ol>
 *   <li>send 정상 — 모든 entry SmsAdapter 호출 후 status=SENT 누적</li>
 *   <li>send blocked 제외 — BLOCKED 거래처 자동 skip + blocked 카운트</li>
 *   <li>send 실패 (게이트웨이 예외) — 1건 실패가 전체 배치 중단하지 않음 + failed 카운트</li>
 *   <li>send 부분 성공 — sent + failed 혼합 결과 정확 카운트</li>
 * </ol>
 *
 * <p>SP-09-2: {@link DispatchSmsSaveHistoryService#save} 가 SEND_AUDIT mode 로 호출되는지 검증.
 */
class DispatchBatchSendServiceTest {

    private BlockedPartnerLookupClient blockedPartnerLookupClient;
    private NotificationService notificationService;
    private DispatchSmsSaveHistoryService dispatchSmsSaveHistoryService;
    private DispatchBatchSendService service;

    @BeforeEach
    void setUp() {
        blockedPartnerLookupClient = mock(BlockedPartnerLookupClient.class);
        notificationService = mock(NotificationService.class);
        dispatchSmsSaveHistoryService = mock(DispatchSmsSaveHistoryService.class);
        service = new DispatchBatchSendService(
                blockedPartnerLookupClient,
                notificationService,
                dispatchSmsSaveHistoryService,
                new ObjectMapper());
        lenient().when(blockedPartnerLookupClient.isBlocked(anyString())).thenReturn(false);
    }

    @Test
    @DisplayName("정상 — 2건 모두 SENT + SEND_AUDIT 자동 저장 호출")
    void send_allOk_returnsSentCount() {
        when(notificationService.sendWithGatewayResult(any(NotificationSendRequest.class)))
                .thenAnswer(inv -> stubSentResult());

        DispatchBatchSendRequest req = new DispatchBatchSendRequest(
                LocalDate.of(2026, 5, 10),
                List.of(
                        new SendEntry("P-001", "01011112222", "[배차안내] 본문 1", "방A"),
                        new SendEntry("P-002", "01033334444", "[배차안내] 본문 2", "방A")));

        DispatchBatchSendResponse resp = service.send(req, "test-user");

        assertThat(resp.sent()).isEqualTo(2);
        assertThat(resp.failed()).isZero();
        assertThat(resp.blocked()).isZero();
        assertThat(resp.details()).hasSize(2);
        assertThat(resp.details()).allMatch(d -> "SENT".equals(d.status()));

        // SmsAdapter 호출 검증 — channel=SMS, recipientType=EXTERNAL_PHONE, 메시지 본문 그대로 전달
        ArgumentCaptor<NotificationSendRequest> captor =
                ArgumentCaptor.forClass(NotificationSendRequest.class);
        verify(notificationService, org.mockito.Mockito.times(2)).sendWithGatewayResult(captor.capture());
        NotificationSendRequest first = captor.getAllValues().get(0);
        assertThat(first.channel()).isEqualTo(NotificationChannel.SMS);
        assertThat(first.recipientType()).isEqualTo(RecipientType.EXTERNAL_PHONE);
        assertThat(first.recipientAddress()).isEqualTo("01011112222");
        assertThat(first.body()).isEqualTo("[배차안내] 본문 1");
        assertThat(first.templateCode()).isEqualTo("DISPATCH_BATCH");

        // SP-09-2 — SEND_AUDIT 저장 서비스 호출 검증
        ArgumentCaptor<DispatchSmsSaveHistoryRequest> auditCaptor =
                ArgumentCaptor.forClass(DispatchSmsSaveHistoryRequest.class);
        verify(dispatchSmsSaveHistoryService).save(auditCaptor.capture(), anyString());
        assertThat(auditCaptor.getValue().saveMode().name()).isEqualTo("SEND_AUDIT");
    }

    @Test
    @DisplayName("blocked 제외 — BLOCKED 거래처 SmsAdapter 호출 skip + blocked 카운트")
    void send_blockedPartner_skipsAndCountsBlocked() {
        when(blockedPartnerLookupClient.isBlocked("P-BLK")).thenReturn(true);

        DispatchBatchSendRequest req = new DispatchBatchSendRequest(
                LocalDate.of(2026, 5, 10),
                List.of(new SendEntry("P-BLK", "01099998888", "본문", "방X")));

        DispatchBatchSendResponse resp = service.send(req, "test-user");

        assertThat(resp.sent()).isZero();
        assertThat(resp.failed()).isZero();
        assertThat(resp.blocked()).isEqualTo(1);
        assertThat(resp.details()).hasSize(1);
        assertThat(resp.details().get(0).status()).isEqualTo("BLOCKED");
        // notificationService.send 미호출 검증
        verifyNoInteractions(notificationService);
    }

    @Test
    @DisplayName("blocked 조회 실패 — 정상 대상은 차단하지 않고 SMS adapter에 도달한다")
    void send_blockedLookupFailure_defersDecisionAndSends() {
        doThrow(new IllegalStateException("partner-service unavailable"))
                .when(blockedPartnerLookupClient).isBlocked("P-LOOKUP-FAIL");

        DispatchBatchSendRequest req = new DispatchBatchSendRequest(
                LocalDate.of(2026, 5, 10),
                List.of(new SendEntry("P-LOOKUP-FAIL", "01099998888", "본문", "방X")));

        when(notificationService.sendWithGatewayResult(any(NotificationSendRequest.class)))
                .thenReturn(stubSentResult());
        DispatchBatchSendResponse resp = service.send(req, "test-user");

        assertThat(resp.sent()).isEqualTo(1);
        assertThat(resp.blocked()).isZero();
        assertThat(resp.failed()).isZero();
        assertThat(resp.details().get(0).status()).isEqualTo("SENT");
        verify(notificationService).sendWithGatewayResult(any(NotificationSendRequest.class));
    }

    @Test
    @DisplayName("게이트웨이 예외 — 1건 실패가 배치 중단 X, failed 카운트 누적")
    void send_gatewayException_continuesAndCountsFailed() {
        when(notificationService.sendWithGatewayResult(any(NotificationSendRequest.class)))
                .thenThrow(new RuntimeException("Aligo timeout"));

        DispatchBatchSendRequest req = new DispatchBatchSendRequest(
                LocalDate.of(2026, 5, 10),
                List.of(
                        new SendEntry("P-001", "01011112222", "본문", "방A"),
                        new SendEntry("P-002", "01033334444", "본문", "방A")));

        DispatchBatchSendResponse resp = service.send(req, "test-user");

        assertThat(resp.sent()).isZero();
        assertThat(resp.failed()).isEqualTo(2);
        assertThat(resp.blocked()).isZero();
        assertThat(resp.details()).hasSize(2);
        assertThat(resp.details()).allMatch(d -> "FAILED".equals(d.status())
                && d.reason() != null && d.reason().contains("Aligo timeout"));
    }

    @Test
    @DisplayName("부분 성공 — 1 SENT + 1 FAILED + 1 BLOCKED 혼합 결과 정확 카운트")
    void send_partial_mixedResults() {
        when(blockedPartnerLookupClient.isBlocked("P-BLK")).thenReturn(true);
        // P-001 → SENT, P-002 → FAILED
        when(notificationService.sendWithGatewayResult(any(NotificationSendRequest.class)))
                .thenAnswer(inv -> {
                    NotificationSendRequest r = inv.getArgument(0);
                    if ("01033334444".equals(r.recipientAddress())) {
                        return stubFailedResult();
                    }
                    return stubSentResult();
                });

        DispatchBatchSendRequest req = new DispatchBatchSendRequest(
                LocalDate.of(2026, 5, 10),
                List.of(
                        new SendEntry("P-001", "01011112222", "본문 1", "방A"),
                        new SendEntry("P-002", "01033334444", "본문 2", "방A"),
                        new SendEntry("P-BLK", "01099998888", "본문 3", "방B")));

        DispatchBatchSendResponse resp = service.send(req, "test-user");

        assertThat(resp.sent()).isEqualTo(1);
        assertThat(resp.failed()).isEqualTo(1);
        assertThat(resp.blocked()).isEqualTo(1);
        assertThat(resp.details()).extracting(d -> d.status())
                .containsExactly("SENT", "FAILED", "BLOCKED");
        assertThat(resp.details().get(1).reason())
                .contains("실패")
                .doesNotContain("FAILED");
    }

    @Test
    @DisplayName("단톡방 이름은 SMS 수신자로 전달하지 않고 전송 실패로 남긴다")
    void send_chatRoomName_neverSendsAsSmsPhone() {
        DispatchBatchSendRequest req = new DispatchBatchSendRequest(
                LocalDate.of(2026, 5, 10),
                List.of(new SendEntry("P-ROOM", "room:발주방", "본문", "발주방")));

        DispatchBatchSendResponse resp = service.send(req, "test-user");

        assertThat(resp.sent()).isZero();
        assertThat(resp.failed()).isEqualTo(1);
        assertThat(resp.details().get(0).status()).isEqualTo("FAILED");
        assertThat(resp.details().get(0).reason()).contains("단톡방");
        verifyNoInteractions(notificationService);
    }

    /** SENT 상태 stub NotificationRequest. */
    private NotificationRequest stubSentRequest() {
        NotificationRequest r = NotificationRequest.open(
                RecipientType.EXTERNAL_PHONE, null, "01000000000",
                NotificationChannel.SMS, "DISPATCH_BATCH", null, "x", null);
        r.markSent();
        return r;
    }

    /** FAILED 상태 stub (status != SENT). */
    private NotificationRequest stubFailedRequest() {
        NotificationRequest r = NotificationRequest.open(
                RecipientType.EXTERNAL_PHONE, null, "01000000000",
                NotificationChannel.SMS, "DISPATCH_BATCH", null, "x", null);
        r.markFailed(false);
        assertThat(r.getStatus()).isEqualTo(NotificationStatus.FAILED);
        return r;
    }

    /** SP-09-2: SENT SendResult stub — msgId / gatewayRaw 포함. */
    private SendResult stubSentResult() {
        return new SendResult(
                stubSentRequest(),
                NotificationGatewayResult.success("aligo-stub-msgid-001", "{\"result_code\":1}"));
    }

    /** SP-09-2: FAILED SendResult stub. */
    private SendResult stubFailedResult() {
        return new SendResult(
                stubFailedRequest(),
                NotificationGatewayResult.failure("FAILURE_ALIGO_-101", "{\"result_code\":-101}"));
    }
}
