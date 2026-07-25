package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

/**
 * #831 R-6 — 다운스트림(partner-service)이 TCP 접속은 받아들이되 응답을 영원히 보내지 않을 때
 * (docker pause 라이브 실측: 40초 무응답 / PM 재실측: 검색 endpoint 30초 hang 으로 입금보고서
 * 편집화면 자체가 렌더되지 않음) accounting 의 write 트랜잭션이 무한 대기하지 않는지 검증한다.
 *
 * <p>실 {@link ServerSocket} 으로 "접속은 되지만 응답 없음" 상태를 재현한다 —
 * {@link org.springframework.test.web.client.MockRestServiceServer} 는 실제 소켓 I/O 를 우회하므로
 * (요청/응답을 메모리에서 직접 매칭) read timeout 자체를 재현할 수 없다(계약 검증 전용).
 *
 * <p>{@link PartnerLookupClient} 의 프로덕션(@Autowired) 생성자는 base URL 이
 * {@code http://partner-service} 로 고정돼 있어 테스트에서 로컬 소켓으로 재지정할 수 없다.
 * 대신 테스트 전용 생성자로 로컬 포트를 가리키는 {@link RestClient} 를 직접 구성하되, request
 * factory 는 프로덕션 생성자가 실제로 호출하는 {@link PartnerLookupClient#timeoutRequestFactory()}
 * 를 그대로 재사용해 "같은 제한시간 설정이 실제로 유한 시간 안에 끝나는지"를 검증한다.
 */
class PartnerLookupClientTimeoutTest {

    private static final UUID PARTNER_ID = UUID.randomUUID();

    /** read timeout(3s) 보다 한참 긴 서버측 무응답 지속시간 — 클라이언트가 서버 응답이 아니라 자체 timeout 으로 끝났음을 보장한다. */
    private static final long SERVER_HANG_MILLIS = 15_000;

    @Test
    @DisplayName("findByPartnerIdsBatchResult — 다운스트림이 TCP 는 받아들이되 응답을 영원히 보내지 않아도 "
            + "유한 시간 안에 UNAVAILABLE 로 끝난다 (#831 R-6)")
    void batchLookupFinishesWithinBoundedTimeWhenDownstreamHangs() throws Exception {
        try (ServerSocket serverSocket = new ServerSocket(0)) {
            int port = serverSocket.getLocalPort();
            Thread acceptor = acceptAndHang(serverSocket);
            acceptor.start();

            PartnerLookupClient client = clientPointedAt(port);

            long startNanos = System.nanoTime();
            PartnerLookupClient.BatchLookupResult result =
                    client.findByPartnerIdsBatchResult(List.of(PARTNER_ID));
            long elapsedMs = (System.nanoTime() - startNanos) / 1_000_000;

            assertThat(result.status()).isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
            // read timeout(3s) 근처에서 끝나야 한다 — 서버가 붙들고 있는 15초보다 한참 짧아야
            // "서버가 결국 응답/종료해서" 가 아니라 "클라이언트 자체 timeout" 으로 끝났다고 확신할 수 있다.
            assertThat(elapsedMs)
                    .as("connect(2s)+read(3s) timeout 근처에서 끝나야 한다 — 실측 %dms", elapsedMs)
                    .isLessThan(10_000);
        }
    }

    private static Thread acceptAndHang(ServerSocket serverSocket) {
        Thread thread = new Thread(() -> {
            try (Socket ignored = serverSocket.accept()) {
                // TCP 는 accept 하되 HTTP 응답은 SERVER_HANG_MILLIS 동안 절대 쓰지 않는다
                // — docker pause 로 재현된 "연결은 되는데 응답이 없는" 라이브 장애와 동일한 모양.
                Thread.sleep(SERVER_HANG_MILLIS);
            } catch (Exception ignored) {
                // 테스트 종료(try-with-resources 로 serverSocket close)로 인한 예외는 무시한다.
            }
        });
        thread.setDaemon(true);
        return thread;
    }

    private static PartnerLookupClient clientPointedAt(int port) {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken("test-token");
        RestClient restClient = RestClient.builder()
                .baseUrl("http://localhost:" + port)
                .requestFactory(PartnerLookupClient.timeoutRequestFactory())
                .build();
        return new PartnerLookupClient(restClient, props, new ObjectMapper());
    }
}
