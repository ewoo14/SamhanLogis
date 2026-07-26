package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * [#929 재수렴 4차 D1·D2] {@code partnerCode} 가 URI path 세그먼트로 전달 불가능한 값일 때,
 * {@link PartnerLookupClient#findByPartnerCodeResult} 가 네트워크 호출 없이 NOT_FOUND 로
 * 성사하는지 고정한다 — 이 client 를 쓰는 accounting 의 모든 호출부(16곳)가 공유하는 계약이다.
 *
 * <p><b>왜 client 인가</b> — partnerCode 는 {@code /internal/partners/{partnerCode}} 의 path
 * 세그먼트로 치환된다. 그 세그먼트가 partner-service 의 Spring Security StrictHttpFirewall 을
 * 통과하지 못하면 4xx/5xx 가 돌아오고 client 는 그것을 {@code MIG12_INTERNAL_AUTH_MISS}(503
 * fail-fast) 또는 {@code UNAVAILABLE}(502 격상)로 승격한다 — "필터 입력 오타 하나가 페이지
 * 전체를 깨뜨린다". 이전 fix(#929 재수렴 3차 V1)는 {@code DailyClosingService.list()} 한 곳에만
 * 가드를 두어 (a) 같은 계약을 쓰는 나머지 15곳은 그대로 깨졌고 (b) 그 가드가 문자 5종만 열거해
 * 자기 화면에서도 {@code ';'} 로 우회됐다. 계약이 client 에 있으므로 가드도 client 에 둔다.
 *
 * <p><b>거부 집합은 열거가 아니라 실측이다</b> — 라이브 partner-service({@code :8095}) 직접 호출:
 * <pre>
 *   /internal/partners/P-2026-0001   -&gt; 200   (정상)
 *   .../…%3B  (';')                  -&gt; 403   -&gt; client 503 MIG12_INTERNAL_AUTH_MISS
 *   .../50%25 ('%')                  -&gt; 403   -&gt; client 503
 *   .../P%2F2026 ('/')               -&gt; 400   -&gt; client 502 UNAVAILABLE
 *   .../P%5C2026 ('\')               -&gt; 400   -&gt; client 502
 *   .../P%E2%80%A8X (U+2028)         -&gt; 403   -&gt; client 503
 *   .../P%E2%80%A9X (U+2029)         -&gt; 403   -&gt; client 503
 *   .../P%00X (NUL)                  -&gt; 400   -&gt; client 502
 *   .../.     (단독 점 세그먼트)      -&gt; 500   -&gt; client 502
 * </pre>
 * 반대로 query 파라미터 경로({@code /internal/partners/by-name?name=}, {@code …/list?q=})는
 * 같은 문자에도 200/404 로 정상 응답한다(실측) — 그래서 {@code findByPartnerNameResult}/
 * {@code searchDirectoryResult} 에는 이 가드를 걸지 않는다(과차단 방지).
 */
class PartnerLookupCodeTransportGuardTest {

    private static final String TOKEN = "test-token";

    private MockRestServiceServer server;
    private PartnerLookupClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://partner-service");
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new PartnerLookupClient(builder.build(), props, new ObjectMapper());
    }

    /**
     * 전달 불가 입력 — 기대 요청을 하나도 등록하지 않은 {@link MockRestServiceServer} 이므로
     * 호출이 발생하면 "No further requests expected: HTTP GET …" AssertionError 로 즉시 드러난다.
     * 이 테스트는 "NOT_FOUND 를 돌려준다"와 "네트워크를 타지 않는다"를 함께 고정한다.
     */
    @ParameterizedTest(name = "[{0}] 는 partner-service 호출 없이 NOT_FOUND")
    @ValueSource(strings = {
            // ── 실측 거부 문자 4종 (path 예약) ──
            "50%",              // '%'  -> 403
            "P-2026-0001%",
            "P/2026",           // '/'  -> 400
            "P\\2026",          // '\'  -> 400
            "P-2026-0001;",     // ';'  -> 403  ← 3차 가드가 놓쳐 자기 화면에서 우회된 문자
            ";",
            // ── 경로 정규화 거부 ──
            ".",                // 단독 점 세그먼트 -> 500
            "..",
            "  ..  ",           // client 가 trim 해서 보내므로 trim 후 '..' 도 동일 거부
    })
    @DisplayName("D1·D2 RED — path 세그먼트로 전달 불가한 partnerCode 는 호출 없이 NOT_FOUND")
    void untransportableCode_shortCircuitsToNotFoundWithoutNetworkCall(String code) {
        assertShortCircuitsToNotFound(code);
    }

    /**
     * 제어·분리 문자 — 리뷰의 "printable ASCII 95자 전수" 스윕이 구조적으로 도달할 수 없는
     * 표면이다(U+2028/U+2029 는 ASCII 가 아니다). 소스 인코딩 사고를 피하려고 코드포인트로 만든다.
     */
    static Stream<Arguments> untransportableControlCharacters() {
        return Stream.of(
                Arguments.of("U+2028 LINE SEPARATOR", "P" + (char) 0x2028 + "X"),
                Arguments.of("U+2029 PARAGRAPH SEPARATOR", "P" + (char) 0x2029 + "X"),
                Arguments.of("U+0000 NUL", "P" + (char) 0x00 + "X"),
                Arguments.of("U+000A LF", "P" + (char) 0x0A + "X"),
                Arguments.of("U+000D CR", "P" + (char) 0x0D + "X"),
                Arguments.of("U+0085 NEL", "P" + (char) 0x85 + "X"),
                Arguments.of("U+007F DEL", "P" + (char) 0x7F + "X"));
    }

    @ParameterizedTest(name = "{0} 를 담은 partnerCode 는 호출 없이 NOT_FOUND")
    @MethodSource("untransportableControlCharacters")
    @DisplayName("D1·D2 RED — 제어/분리 문자를 담은 partnerCode 도 호출 없이 NOT_FOUND")
    void untransportableControlCharacter_shortCircuitsToNotFound(String label, String code) {
        assertShortCircuitsToNotFound(code);
    }

    private void assertShortCircuitsToNotFound(String code) {
        PartnerLookupClient.LookupResult result = client.findByPartnerCodeResult(code);

        assertThat(result).isNotNull();
        assertThat(result.isNotFound())
                .as("[%s] 가 NOT_FOUND 가 아니라 %s — 호출부가 502/503 으로 승격시켜 화면이 깨진다",
                        code, result.status())
                .isTrue();
        server.verify();
    }

    /**
     * 과차단 방지 — 특수문자를 포함해도 path 세그먼트로 실제 전달되는 값은 그대로 조회로 넘어간다.
     * 실 DB {@code partners} 전수에 {@code [^A-Za-z0-9_-]} 매치가 0행이므로 아래 값들이 지금
     * 성공하는 조회는 아니지만, 가드가 전달 가능 범위를 넘어 좁히지 않았음을 고정한다.
     */
    @ParameterizedTest(name = "[{0}] 는 여전히 partner-service 로 전달된다(과차단 아님)")
    @ValueSource(strings = {
            "P-2026-0001",      // 실 DB 형식
            "A&B",
            "서울에어컨",
            "a b",
            "#123",
            "P+2026",
            "P?x",
            "<script>",
            "P...9",            // 단독 점 세그먼트가 아니면 정상 (실측 404)
            "a..b",
    })
    @DisplayName("D1·D2 — 전달 가능한 자유입력은 과차단되지 않는다")
    void transportableCode_stillReachesPartnerService(String code) {
        server.expect(ExpectedCount.once(), request -> { })
                .andRespond(withSuccess("{\"data\":null}", MediaType.APPLICATION_JSON));

        client.findByPartnerCodeResult(code);

        server.verify();
    }

    /** 전각 ％(U+FF05)·이모지는 '%' 가 아니며 전달 가능하다 — 코드포인트로 구성해 인코딩 사고를 배제한다. */
    static Stream<Arguments> transportableNonAsciiCharacters() {
        return Stream.of(
                Arguments.of("전각 ％ U+FF05", "P" + (char) 0xFF05 + "9"),
                Arguments.of("이모지 U+1F600", "P" + new String(Character.toChars(0x1F600)) + "9"));
    }

    @ParameterizedTest(name = "{0} 는 여전히 전달된다(과차단 아님)")
    @MethodSource("transportableNonAsciiCharacters")
    @DisplayName("D1·D2 — 비ASCII 자유입력도 과차단되지 않는다")
    void transportableNonAsciiCode_stillReachesPartnerService(String label, String code) {
        server.expect(ExpectedCount.once(), request -> { })
                .andRespond(withSuccess("{\"data\":null}", MediaType.APPLICATION_JSON));

        client.findByPartnerCodeResult(code);

        server.verify();
    }
}
