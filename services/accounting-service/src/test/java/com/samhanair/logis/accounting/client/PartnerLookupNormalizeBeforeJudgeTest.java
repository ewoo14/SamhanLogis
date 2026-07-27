package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * [#929 재수렴 6차 D-RC6-1] <b>판정은 전송할 값으로 한다.</b>
 *
 * <p><b>닫는 결함</b> — {@link PartnerLookupClient#findByPartnerCodeResult} 가
 * {@code isBlank()} 는 <b>원본</b>으로, 뒤이은 전달가능성 판정은 <b>{@code trim()} 결과</b>로
 * 했다. 두 값이 갈리는 구간이 존재한다:
 * <pre>
 *   Character.isWhitespace(0x02) = false   →  isBlank() 통과 (원본 판정)
 *   String.trim() 은 &lt;= U+0020 전부 제거  →  trimmed = ""      (전송 값)
 *   isAddressableAsPathSegment("") 는 for 루프가 0회 실행 → 어떤 문자 판정도 적용 안 됨 → true
 *   ⟹ GET /internal/partners/  (빈 세그먼트) → partner-service 500 → UNAVAILABLE → 화면 502
 * </pre>
 *
 * <p><b>트리거 집합은 열거가 아니라 정의다</b> — {@code c <= 0x20 && !Character.isWhitespace(c)}
 * = U+0000–U+0008 · U+000E–U+001B 의 <b>23종</b>. 손으로 적으면 또 빠지므로 조건식으로 만든다
 * (4차 리뷰의 "printable ASCII 95자 열거"가 U+2028 에 도달하지 못했던 것과 같은 실패를 배제).
 * 바코드 스캐너의 STX/ETX, 고정폭 리포트·CSV 복사가 현실 경로다.
 *
 * <p><b>같은 형태가 이 client 안에 셋 있다</b> — 세 메서드 모두 {@code isBlank()} 를 원본에,
 * {@code trim()} 을 전송 값에 적용했다. 라이브 실측(partner-service {@code :8095}):
 * <pre>
 *   findByPartnerCodeResult  → GET /internal/partners/            → 500  → 502 화면 붕괴
 *   searchDirectoryResult    → GET …/list?q=                      → 200 + <b>거래처 전량</b>
 *                              (게이트웨이 실측: 분개 거래처 검색이 0행 대신 20행을 돌려줬다)
 *   findByPartnerNameResult  → GET …/by-name?name=                → 400  → UNAVAILABLE
 * </pre>
 * 그래서 세 메서드를 같은 축으로 한 번에 고정한다 — 하나만 고치면 나머지가 다음 라운드의 누출이 된다.
 */
class PartnerLookupNormalizeBeforeJudgeTest {

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

    /** Java {@code Character.isWhitespace} 가 true 인 C0 코드포인트 — 트리거 집합에서 제외된다. */
    private static boolean javaWhitespace(int cp) {
        return Character.isWhitespace(cp);
    }

    /** {@code trim()} 은 지우지만 {@code isBlank()} 는 못 보는 코드포인트 전수(23종). */
    static List<Integer> triggerCodePoints() {
        return IntStream.rangeClosed(0x00, 0x20)
                .filter(cp -> !javaWhitespace(cp))
                .boxed()
                .toList();
    }

    static Stream<Arguments> triggerCodePointArguments() {
        return triggerCodePoints().stream()
                .map(cp -> Arguments.of(String.format("U+%04X", cp), String.valueOf((char) cp.intValue())));
    }

    /** 트리거 문자를 공백과 섞어도 {@code trim()} 결과는 여전히 빈 문자열이다. */
    static Stream<Arguments> triggerMixedWithWhitespaceArguments() {
        return triggerCodePoints().stream()
                .map(cp -> {
                    char c = (char) cp.intValue();
                    return Arguments.of(String.format("U+%04X + 공백", cp), " " + c + "\t");
                });
    }

    // ────────────────────────────────────────────────────────────────────────
    // D-RC6-1 ① partnerCode — path 세그먼트가 빈 문자열이 되어 화면이 502 로 깨졌다
    // ────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("D-RC6-1 전제 — 트리거 집합은 정확히 23종이다 (U+0000–U+0008 · U+000E–U+001B)")
    void triggerSetIsExactlyTwentyThreeCodePoints() {
        List<Integer> triggers = triggerCodePoints();

        assertThat(triggers).hasSize(23);
        assertThat(triggers).allSatisfy(cp -> {
            assertThat(String.valueOf((char) cp.intValue()).trim())
                    .as("U+%04X 는 trim 되어 사라져야 트리거다", cp)
                    .isEmpty();
            assertThat(String.valueOf((char) cp.intValue()).isBlank())
                    .as("U+%04X 가 isBlank 로도 잡히면 트리거가 아니다", cp)
                    .isFalse();
        });
    }

    @ParameterizedTest(name = "{0} 단독 partnerCode 는 호출 없이 NOT_FOUND")
    @MethodSource("triggerCodePointArguments")
    @DisplayName("D-RC6-1 RED — trim 후 빈 문자열이 되는 partnerCode 는 네트워크 호출 없이 NOT_FOUND")
    void trimToEmptyPartnerCode_shortCircuitsToNotFound(String label, String code) {
        assertCodeShortCircuits(label, code);
    }

    @ParameterizedTest(name = "{0} 도 호출 없이 NOT_FOUND")
    @MethodSource("triggerMixedWithWhitespaceArguments")
    @DisplayName("D-RC6-1 RED — 트리거 문자를 공백과 섞어도 결과는 같다")
    void trimToEmptyPartnerCodeWithWhitespace_shortCircuitsToNotFound(String label, String code) {
        assertCodeShortCircuits(label, code);
    }

    /**
     * 기대 요청을 하나도 등록하지 않은 {@link MockRestServiceServer} 라, 호출이 나가면
     * {@code AssertionError("No further requests expected: HTTP GET …")} 가 던져진다.
     * {@code AssertionError} 는 {@code Error} 라서 client 의 {@code catch (Exception)} 에
     * 삼켜지지 않고 그대로 테스트를 깬다 — "NOT_FOUND 를 돌려준다"와 "네트워크를 타지 않는다"를
     * 한 단언으로 함께 고정한다.
     */
    private void assertCodeShortCircuits(String label, String code) {
        PartnerLookupClient.LookupResult result = client.findByPartnerCodeResult(code);

        assertThat(result).isNotNull();
        assertThat(result.isNotFound())
                .as("[%s] 가 NOT_FOUND 가 아니라 %s — 호출부가 502 로 승격시켜 화면이 깨진다",
                        label, result.status())
                .isTrue();
        server.verify();
    }

    // ────────────────────────────────────────────────────────────────────────
    // D-RC6-1 ② directory 검색 — q= 가 비어 거래처 "전량"이 매칭으로 돌아왔다
    // ────────────────────────────────────────────────────────────────────────

    @ParameterizedTest(name = "{0} 단독 검색어는 호출 없이 NOT_FOUND")
    @MethodSource("triggerCodePointArguments")
    @DisplayName("D-RC6-1 RED — trim 후 빈 문자열이 되는 검색어는 q= 로 전송되지 않는다")
    void trimToEmptyDirectoryQuery_shortCircuitsToNotFound(String label, String query) {
        PartnerLookupClient.DirectoryLookupResult result = client.searchDirectoryResult(query, 20);

        assertThat(result).isNotNull();
        assertThat(result.isNotFound())
                .as("[%s] 가 NOT_FOUND 가 아니라 %s — 빈 q= 는 거래처 전량을 매칭으로 돌려준다(실측 20행)",
                        label, result.status())
                .isTrue();
        assertThat(result.partners())
                .as("[%s] 검색 결과에 거래처가 섞여 나왔다", label)
                .isEmpty();
        server.verify();
    }

    // ────────────────────────────────────────────────────────────────────────
    // D-RC6-1 ③ 거래처명 조회 — name= 가 비어 400 → UNAVAILABLE 로 승격됐다
    // ────────────────────────────────────────────────────────────────────────

    @ParameterizedTest(name = "{0} 단독 거래처명은 호출 없이 NOT_FOUND")
    @MethodSource("triggerCodePointArguments")
    @DisplayName("D-RC6-1 RED — trim 후 빈 문자열이 되는 거래처명은 name= 으로 전송되지 않는다")
    void trimToEmptyPartnerName_shortCircuitsToNotFound(String label, String partnerName) {
        PartnerLookupClient.LookupResult result = client.findByPartnerNameResult(partnerName);

        assertThat(result).isNotNull();
        assertThat(result.isNotFound())
                .as("[%s] 가 NOT_FOUND 가 아니라 %s — 빈 name= 은 400 을 받아 UNAVAILABLE 로 승격된다",
                        label, result.status())
                .isTrue();
        server.verify();
    }

    // ────────────────────────────────────────────────────────────────────────
    // 무회귀 — 과차단하지 않는다 / 이전 라운드가 확보한 축을 깨지 않는다
    // ────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("과차단 아님 — 실존 형식 partnerCode 는 그대로 전송된다")
    void realPartnerCode_stillReachesPartnerService() {
        server.expect(ExpectedCount.once(), requestTo("http://partner-service/internal/partners/P-2026-0001"))
                .andRespond(withSuccess("{\"data\":null}", MediaType.APPLICATION_JSON));

        client.findByPartnerCodeResult("P-2026-0001");

        server.verify();
    }

    @Test
    @DisplayName("과차단 아님 — 트리거 문자를 앞뒤에 붙여도 실존 코드는 같은 URI 로 전송된다")
    void realPartnerCodeWithSurroundingControlCharacters_stillReachesSameUri() {
        server.expect(ExpectedCount.once(), requestTo("http://partner-service/internal/partners/P-2026-0001"))
                .andRespond(withSuccess("{\"data\":null}", MediaType.APPLICATION_JSON));

        client.findByPartnerCodeResult((char) 0x02 + "P-2026-0001" + (char) 0x03);

        server.verify();
    }

    /** {@code ?…&키=&…} / {@code ?…&키=} (값이 빈 파라미터)를 잡아내는 정규식. */
    private static void assertParamNotEmpty(String uri, String key) {
        assertThat(uri)
                .as("%s 파라미터가 빈 값으로 전송됐다 — uri=%s", key, uri)
                .doesNotContainPattern("[?&]" + key + "=(&|$)");
        assertThat(uri).as("%s 파라미터가 아예 없다 — uri=%s", key, uri).contains(key + "=");
    }

    @Test
    @DisplayName("과차단 아님 — 자유입력 검색어/거래처명은 빈 값이 아닌 채로 그대로 전송된다")
    void freeTextQueryAndName_stillReachPartnerService() {
        server.expect(ExpectedCount.once(),
                        request -> assertParamNotEmpty(request.getURI().toString(), "q"))
                .andRespond(withSuccess("{\"data\":[]}", MediaType.APPLICATION_JSON));
        server.expect(ExpectedCount.once(),
                        request -> assertParamNotEmpty(request.getURI().toString(), "name"))
                .andRespond(withSuccess("{\"data\":null}", MediaType.APPLICATION_JSON));

        client.searchDirectoryResult("  서울  ", 20);
        client.findByPartnerNameResult("  서울  ");

        server.verify();
    }

    @Test
    @DisplayName("무회귀 — 4차 문자 축: 제어문자가 글자 사이에 있으면 여전히 호출 없이 NOT_FOUND")
    void controlCharacterBetweenLetters_stillShortCircuits() {
        assertCodeShortCircuits("P<STX>X", "P" + (char) 0x02 + "X");
        assertCodeShortCircuits("P<U+2028>X", "P" + (char) 0x2028 + "X");
    }

    @Test
    @DisplayName("무회귀 — null/공백/U+2028 단독은 예전 그대로 호출 없이 NOT_FOUND")
    void nullBlankAndUnicodeSeparators_stillShortCircuit() {
        List<String> blanks = new ArrayList<>();
        blanks.add(null);
        blanks.add("");
        blanks.add("   ");
        blanks.add("\t\n");
        blanks.add(String.valueOf((char) 0x2028));
        blanks.add(String.valueOf((char) 0x2029));

        for (String value : blanks) {
            assertThat(client.findByPartnerCodeResult(value).isNotFound())
                    .as("partnerCode=[%s] 회귀", value)
                    .isTrue();
            assertThat(client.searchDirectoryResult(value, 20).isNotFound())
                    .as("query=[%s] 회귀", value)
                    .isTrue();
            assertThat(client.findByPartnerNameResult(value).isNotFound())
                    .as("partnerName=[%s] 회귀", value)
                    .isTrue();
        }
        server.verify();
    }
}
