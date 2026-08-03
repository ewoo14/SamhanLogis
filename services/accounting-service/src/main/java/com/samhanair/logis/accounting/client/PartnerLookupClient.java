package com.samhanair.logis.accounting.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.math.BigDecimal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * partner-service internal endpoint 호출 client (PR-E2 BE-A8/A9/A10 의존).
 *
 * <p>{@code GET /internal/partners/{partnerCode}} 호출 → PartnerSummary 반환.
 * notification-service 의 {@code RestClientPartnerLookupClient} 를 답습하되,
 * V32(MIG-12) 이후 401/403 응답은 fail-fast ({@code MIG12_INTERNAL_AUTH_MISS})로 격상한다.
 * 404 / 5xx / 네트워크 오류는 empty 반환 (caller 가 fallback 처리).
 *
 * <p>인증 = X-Internal-Token (env {@code SAMHAN_INTERNAL_TOKEN}).
 *
 * <p>본 client 는 IT 에서 {@code @MockBean} 격리 의무 (memory feedback_it_mockbean_external_clients).
 */
@Component
public class PartnerLookupClient {

    /** 외부 거래처 조회 결과를 미존재와 일시 장애로 구분한다. */
    public enum LookupStatus { FOUND, NOT_FOUND, UNAVAILABLE }

    /** 조회 상태와 성공 시 거래처 요약을 함께 전달한다. */
    public record LookupResult(LookupStatus status, PartnerSummary partner) {
        public static LookupResult found(PartnerSummary partner) {
            return new LookupResult(LookupStatus.FOUND, partner);
        }

        public static LookupResult notFound() {
            return new LookupResult(LookupStatus.NOT_FOUND, null);
        }

        public static LookupResult unavailable() {
            return new LookupResult(LookupStatus.UNAVAILABLE, null);
        }

        public boolean isFound() { return status == LookupStatus.FOUND && partner != null; }
        public boolean isNotFound() { return status == LookupStatus.NOT_FOUND; }
        public boolean isUnavailable() { return status == LookupStatus.UNAVAILABLE; }
    }

    /**
     * partnerId batch 조회 결과 — 부분 성공과 전면 장애를 구분한다.
     *
     * <p>조회한 partnerId 중 일부가 결과에 없는 것(삭제/미존재 거래처 혼재)은 partner-service 가
     * 정상 응답했다는 뜻이므로 {@code FOUND}(부분 맵, 심지어 빈 맵)이다. 5xx/timeout/네트워크
     * 오류 및 구조적으로 손상된 응답만 {@code UNAVAILABLE} 로 승격해, 호출부가 "조용한 0건"과
     * "장애"를 구별할 수 있게 한다(#831 B군).
     */
    public record BatchLookupResult(LookupStatus status, Map<UUID, PartnerSummary> partners) {
        public BatchLookupResult {
            partners = partners == null ? Map.of() : Map.copyOf(partners);
        }

        public static BatchLookupResult found(Map<UUID, PartnerSummary> partners) {
            return new BatchLookupResult(LookupStatus.FOUND, partners);
        }

        public static BatchLookupResult unavailable() {
            return new BatchLookupResult(LookupStatus.UNAVAILABLE, Map.of());
        }

        public boolean isUnavailable() { return status == LookupStatus.UNAVAILABLE; }
    }

    /** directory 목록 조회 결과도 미존재와 partner-service 장애를 구분한다. */
    public record DirectoryLookupResult(LookupStatus status, List<PartnerSummary> partners) {
        public DirectoryLookupResult {
            partners = partners == null ? List.of() : List.copyOf(partners);
        }

        public static DirectoryLookupResult found(List<PartnerSummary> partners) {
            return new DirectoryLookupResult(LookupStatus.FOUND, partners);
        }

        public static DirectoryLookupResult notFound() {
            return new DirectoryLookupResult(LookupStatus.NOT_FOUND, List.of());
        }

        public static DirectoryLookupResult unavailable() {
            return new DirectoryLookupResult(LookupStatus.UNAVAILABLE, List.of());
        }

        public boolean isFound() { return status == LookupStatus.FOUND; }
        public boolean isNotFound() { return status == LookupStatus.NOT_FOUND; }
        public boolean isUnavailable() { return status == LookupStatus.UNAVAILABLE; }
    }

    private static final Logger log = LoggerFactory.getLogger(PartnerLookupClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String PARTNER_SERVICE_BASE = "http://partner-service";

    /**
     * 연결/응답 제한시간(#831 R-6) — partner-service 가 응답하지 않을 때(docker pause 라이브 실측:
     * 40초 무응답) {@code CashReceiptService}/{@code JournalService} 의 클래스 레벨
     * {@code @Transactional} write 오퍼레이션이 열린 DB 커넥션을 붙든 채 무한 대기하는 것을 막는다.
     * 같은 패키지 형제 client 인 {@link ApprovalLineAuthorizeClient}·{@link AuthAccountLookupClient}
     * 가 이미 이 값(connect 2s/read 3s)으로 오탐 없이 운용 중이라 동일 값을 채택했다 — partner-service
     * 단건/배치 조회 모두 단순 indexed 조회이고, 배치 대상도 저널/입금보고서 1건에 실제 등장하는
     * 거래처 수(보통 한 자릿수~수십)라 형제 client 의 단건 조회와 응답 생성 복잡도가 크게 다르지 않다.
     */
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(2);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(3);

    /**
     * URI path 세그먼트가 실어 나를 수 없는 예약 문자 (#929 재수렴 4차 D1·D2).
     *
     * <p>인코딩 후 각각 {@code %25}·{@code %2F}·{@code %5C}·{@code %3B} 가 되며,
     * partner-service 의 Spring Security {@code StrictHttpFirewall} 기본 설정이 이 4종을
     * 모두 거부한다 (라이브 실측 {@code :8095} — {@code '%'}·{@code ';'} 는 403,
     * {@code '/'}·{@code '\'} 는 400).
     */
    private static final String PATH_SEGMENT_RESERVED = "%/\\;";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    @Autowired
    public PartnerLookupClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                               InternalAuthProperties internalAuthProperties,
                               ObjectMapper objectMapper) {
        this.restClient = builder.baseUrl(PARTNER_SERVICE_BASE)
                .requestFactory(timeoutRequestFactory())
                .build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * 테스트 전용 생성자 — MockRestServiceServer/실 소켓에 바인딩된 RestClient 를 직접 주입한다.
     *
     * <p>public — {@code report}/{@code service} 패키지의 기존 테스트(PartnerAgingServiceTest 등)가
     * client 패키지 밖에서도 이 생성자로 실 client + MockRestServiceServer 조합을 구성해야 한다.
     * 프로덕션 DI 경로는 위의 {@code @Autowired} 생성자만 사용한다.
     */
    public PartnerLookupClient(RestClient restClient, InternalAuthProperties internalAuthProperties,
                               ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * {@link #CONNECT_TIMEOUT}/{@link #READ_TIMEOUT} 를 적용한 요청 factory.
     *
     * <p>package-private static 로 분리해 테스트가 프로덕션 생성자와 동일한 제한시간 설정을
     * 재사용할 수 있게 한다(중복 정의 방지 — {@code PartnerLookupClientTimeoutTest}).
     */
    static SimpleClientHttpRequestFactory timeoutRequestFactory() {
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout((int) CONNECT_TIMEOUT.toMillis());
        rf.setReadTimeout((int) READ_TIMEOUT.toMillis());
        return rf;
    }

    /**
     * partnerCode 로 거래처 단건 조회. 401/403 은 fail-fast, 404/5xx 는 empty 반환.
     *
     * @param partnerCode 거래처코드 (필수, 사용자 노출 식별자)
     * @return PartnerSummary (성공) 또는 empty (실패)
     */
    public Optional<PartnerSummary> findByPartnerCode(String partnerCode) {
        LookupResult result = findByPartnerCodeResult(partnerCode);
        return result == null || !result.isFound() ? Optional.empty() : Optional.of(result.partner());
    }

    /**
     * partnerCode 를 {@code /internal/partners/{partnerCode}} 의 path 세그먼트로 실어 보낼 수
     * 있는지 판정한다 (#929 재수렴 4차 D1·D2).
     *
     * <p><b>왜 client 인가</b> — partnerCode 를 path 세그먼트로 쓰는 것은 이 메서드의 계약이고,
     * accounting 의 16개 호출부(일마감 목록/실행/역마감, 원장, 거래처원장 집계·인쇄, 받을어음,
     * 수금계획, 입금보고서, 분개현황, 세금계산서 batch/inbound, 통장거래, CODEF import,
     * 입금 자동매칭, 입금자 매핑, 이카운트 전표·세금계산서 import)가 전부 이 한 지점을 지난다.
     * 세그먼트가 partner-service 의 {@code StrictHttpFirewall} 을 통과하지 못하면 4xx/5xx 가
     * 돌아오고 아래 catch 절이 그것을 {@code MIG12_INTERNAL_AUTH_MISS}(503 fail-fast) 또는
     * {@code UNAVAILABLE}(502 격상)로 승격시킨다 — 사용자 입력 오타 하나가 "시스템 장애" 화면이
     * 된다. 호출부마다 가드를 두면 하나만 빠져도 그 화면이 깨지므로(#929 재수렴 3차가 실제로
     * 그랬다: {@code DailyClosingService.list()} 한 곳만 막고 15곳을 남김) 계약이 있는 곳에서 막는다.
     *
     * <p><b>판정 기준은 열거가 아니라 전달 가능성이다.</b> 아래 세 부류만 거부한다:
     * <ol>
     *   <li>{@link #PATH_SEGMENT_RESERVED} — 인코딩 결과 자체가 firewall 차단 대상인 4종</li>
     *   <li>정규화되지 않는 단독 {@code "."}/{@code ".."} 세그먼트 (경로순회로 간주 — 실측 500)</li>
     *   <li>제어(Cc)·행분리(Zl)·문단분리(Zp)·비정상 서로게이트 문자 — {@code StrictHttpFirewall}
     *       의 decoded blocklist 가 NUL/LF/CR/U+2028/U+2029 를 담고 있다. 문자 하나씩 열거하면
     *       또 빠진다(리뷰의 printable ASCII 95자 스윕은 비ASCII 인 U+2028/U+2029 에 구조적으로
     *       도달하지 못했다) — 유니코드 카테고리로 판정해 같은 부류 전체를 덮는다.</li>
     * </ol>
     *
     * <p><b>과차단하지 않는다.</b> 거절된 값은 어차피 이 전송로로 조회가 불가능하므로 "지금
     * 성공하는 조회"를 하나도 잃지 않는다 — 실 DB {@code partners} 전수에 {@code [^A-Za-z0-9_-]}
     * 매치는 0행이고, 위 3부류 밖의 자유입력(한글·공백·{@code & # + ? < >}·전각 ％·이모지)은
     * 그대로 partner-service 까지 전달된다(실측 200/404). query 파라미터를 쓰는 형제 메서드
     * ({@code findByPartnerNameResult}·{@code searchDirectoryResult})는 같은 문자에도 정상
     * 응답하므로(실측) 이 <i>문자</i> 판정을 적용하지 않는다 — 다만 <b>빈 값 판정은 세 메서드가
     * 모두 필요하다</b>. 셋 다 {@code trim()} 한 값을 실어 보내므로, 판정을 원본에 걸면
     * {@code q=}·{@code name=} 이 비어 나가 각각 거래처 전량 200·400 이 돌아온다
     * (#929 재수렴 6차 D-RC6-1, 라이브 실측).
     *
     * <p><b>전제 — 세그먼트는 비어 있지 않다</b> (#929 재수렴 6차 D-RC6-1). 이 판정은 문자를
     * 하나씩 돌며 거부 사유를 찾는 구조라 <b>빈 문자열에서는 루프가 0회 실행되어 무조건
     * {@code true}</b> 가 된다 — 어떤 문자 판정도 적용되지 않는다. 그런데 빈 문자열이야말로
     * path 세그먼트로 전달 불가능한 값이다({@code GET /internal/partners/} → 실측 500).
     * 그 구간은 호출부가 <b>전송할 값({@code trimmed})으로</b> 빈 값 검사를 먼저 해서 닫는다 —
     * 원본으로 검사하면 {@code Character.isWhitespace} 가 false 인 제어문자 23종
     * (U+0000–U+0008 · U+000E–U+001B)이 그 검사를 통과한 뒤 {@code trim()} 에서 사라져
     * 여기로 빈 문자열이 흘러든다.
     *
     * @param segment {@code trim()} 된 <b>비어 있지 않은</b> partnerCode (호출부가 보장)
     * @return path 세그먼트로 전달 가능하면 true
     */
    static boolean isAddressableAsPathSegment(String segment) {
        if (segment.equals(".") || segment.equals("..")) {
            return false;
        }
        for (int i = 0; i < segment.length(); ) {
            int cp = segment.codePointAt(i);
            i += Character.charCount(cp);
            if (cp < 0x80 && PATH_SEGMENT_RESERVED.indexOf(cp) >= 0) {
                return false;
            }
            int type = Character.getType(cp);
            if (type == Character.CONTROL || type == Character.LINE_SEPARATOR
                    || type == Character.PARAGRAPH_SEPARATOR || type == Character.SURROGATE) {
                return false;
            }
        }
        return true;
    }

    /**
     * 응답 상태코드가 "요청이 자원을 지정하지 못했다"는 부류인지 판정한다 (#929 재수렴 5차 D-RC5-1).
     *
     * <p>{@code GET /internal/partners/{partnerCode}} 요청에서 사용자가 정하는 부분은 코드
     * 세그먼트 하나뿐이다(경로 템플릿·토큰 헤더는 고정). 그러므로 이 호출이 4xx 로 거절됐다는
     * 것은 <b>그 입력으로는 거래처 자원을 지정할 수 없다</b>는 뜻이고, partner-service 가 아픈
     * 것이 아니다 — 미존재(NOT_FOUND)와 같은 결말로 성사시켜야 화면이 깨지지 않는다.
     * 형제 라우트 {@code /by-name} 의 400(필수 파라미터 누락), firewall 의 400, 404, 409,
     * 405/410/414/415 가 모두 여기에 해당한다.
     *
     * <p><b>왜 열거가 아닌가</b> — 막아야 할 대상인 형제 라우트는 앞으로도 늘어나는 열린 집합이라
     * 이름으로 열거하면 다음 라우트에서 다시 샌다. 반면 HTTP 상태코드는 표준이 정한 닫힌 집합이고
     * 여기서 쓰는 것은 "4xx = 클라이언트 오류"라는 <i>부류</i>다.
     *
     * <p><b>예외 두 개</b> — 401/403 은 호출부가 이 메서드에 닿기 전에 MIG-12 fail-fast 로
     * 분기하므로 여기 오지 않는다(내부 토큰 오설정은 조용히 삼키면 안 된다).
     * 408(Request Timeout)/429(Too Many Requests)는 RFC 9110 이 "잠시 후 재시도"로 정의한
     * <b>서버 사정</b>이므로 4xx 이지만 UNAVAILABLE 로 남긴다 — 미존재로 삼키면 과부하/타임아웃이
     * "없는 거래처"로 위장된다.
     *
     * @param status partner-service 응답 상태코드 (401/403 은 앞에서 이미 분기됨)
     * @return 입력이 자원을 지정하지 못한 부류면 true
     */
    private static boolean isAddressingFailure(int status) {
        if (status == 408 || status == 429) return false;
        return status >= 400 && status < 500;
    }

    /**
     * 거래처 코드 조회의 FOUND/NOT_FOUND/UNAVAILABLE 결과를 보존한다.
     *
     * <p><b>[#929 재수렴 5차 D-RC5-1] 응답이 "내가 지정한 자원"을 기술하는지 확인한다.</b>
     * {@code trimmed} 는 {@code /internal/partners/{partnerCode}} 의 path 세그먼트가 되는데,
     * partner-service 에는 같은 자리에 형제 라우트가 있다 — {@code /internal/partners/list} 는
     * 거래처 <b>배열</b>을 200 으로, {@code /internal/partners/by-name} 은 필수 파라미터 누락으로
     * 400 을 돌려준다(라이브 실측). 그래서 사용자가 거래처 코드 필터에 {@code "list"} 를 치면
     * 전송은 성공했는데 응답이 내 거래처가 아니라서 {@code UNAVAILABLE} → 게이트웨이 502 가 됐다.
     *
     * <p>이 누출은 {@link #isAddressableAsPathSegment} 로는 원리적으로 막을 수 없다 —
     * {@code "list"} 는 소문자 ASCII 4자라 어떤 문자 판정도 통과한다. 문제는 값의 <i>문자
     * 부류</i>가 아니라 값이 <i>어느 자원을 가리키는가</i>이고, 그 답은 요청을 보내기 전이 아니라
     * <b>응답을 받은 뒤</b>에만 알 수 있다. 그리고 형제 라우트 이름을 열거해 거부하는 방식은
     * 라우트가 열린 집합이라 다음 라우트에서 다시 샌다(이 PR 이 같은 방식으로 세 번 샜다).
     *
     * <p>따라서 판정은 <b>응답 쪽</b>에서, 신원으로 한다:
     * <ol>
     *   <li>2xx 응답이 "내가 지정한 그 partnerCode" 를 스스로 밝히지 않으면 그것은 내 자원이
     *       아니다 → {@code NOT_FOUND}. 배열이든 낯선 객체든 다른 거래처든 결론이 같고,
     *       아직 존재하지 않는 라우트에도 그대로 적용된다 ({@link #parseSummaryResult}).</li>
     *   <li>4xx 는 "요청이 이 자원을 지정하지 못했다"는 뜻이다. 이 요청에서 사용자가 정하는
     *       부분은 코드 세그먼트뿐이므로 4xx 의 원인은 그 입력이다 → {@code NOT_FOUND}
     *       ({@link #isAddressingFailure}).</li>
     * </ol>
     * 반대로 <b>5xx·네트워크 오류·재시도 지시(408/429)</b> 는 서버 사정이므로 {@code UNAVAILABLE}
     * 을 유지하고, <b>401/403</b> 은 MIG-12 fail-fast 를 유지한다 — "서버가 아프다"와 "입력이
     * 자원을 못 가리킨다"는 다른 상황이고, 전자를 미존재로 삼키면 장애가 조용히 위장된다.
     */
    public LookupResult findByPartnerCodeResult(String partnerCode) {
        // [#929 재수렴 6차 D-RC6-1] 판정은 전송할 값으로 한다 — 아래 판정들과 실제 요청이 모두
        // trimmed 를 쓰므로, 빈 값 검사도 원본이 아니라 trimmed 에 건다.
        String trimmed = partnerCode == null ? "" : partnerCode.trim();
        if (trimmed.isBlank()) return LookupResult.notFound();
        if (!isAddressableAsPathSegment(trimmed)) {
            // [#929 재수렴 4차 D1·D2] 이 전송로로는 도달 자체가 불가능한 값 — 실존 partnerCode 일
            // 수 없으므로 네트워크 호출을 생략하고 미존재로 성사시킨다. null/blank 가 이미 토큰
            // 검사 앞에서 notFound 로 빠지는 것과 같은 자리·같은 이유다(주소 지정 불가한 입력).
            log.debug("PartnerLookupClient — partnerCode 가 path 세그먼트로 전달 불가 (NOT_FOUND 처리, len={})",
                    trimmed.length());
            return LookupResult.notFound();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) throw internalAuthMiss("partnerCode", partnerCode, 0);
        try {
            String body = restClient.get().uri("/internal/partners/{partnerCode}", trimmed)
                    .header(INTERNAL_TOKEN_HEADER, token).retrieve().body(String.class);
            return parseSummaryResult(body, trimmed);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 401 || status == 403) throw internalAuthMiss("partnerCode", partnerCode, status);
            if (isAddressingFailure(status)) {
                // [#929 재수렴 5차 D-RC5-1] 404/409 를 포함한 addressing 계열 4xx — 요청이 거래처
                // 자원을 지정하지 못했다. 이 요청에서 사용자가 정하는 부분은 코드 세그먼트뿐이다.
                log.debug("PartnerLookupClient — partnerCode 가 거래처를 지정하지 못함 (status={}, NOT_FOUND 처리)",
                        status);
                return LookupResult.notFound();
            }
            log.warn("PartnerLookupClient — partnerCode={} status={} (일시 장애)", partnerCode, status);
            return LookupResult.unavailable();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient 호출 실패 — partnerCode={}, msg={}", partnerCode, ex.getMessage());
            return LookupResult.unavailable();
        }
    }

    /**
     * partnerId(UUID) → PartnerSummary fail-soft — SP-08-FU2 P2-3 실 구현.
     *
     * <p>partner-service {@code GET /internal/partners/{id}/summary} 호출.
     * 성공 시 PartnerSummary (partnerCode + name 포함) 반환.
     * 401/403 은 fail-fast, 404 / 5xx / 네트워크 오류는 empty 반환 (caller 가 fallback 처리).
     *
     * <p>인증 = X-Internal-Token (env {@code SAMHAN_INTERNAL_TOKEN}).
     *
     * @param partnerId 거래처 UUID (필수)
     * @return PartnerSummary (성공) 또는 empty (실패)
     */
    public Optional<PartnerSummary> findByPartnerId(UUID partnerId) {
        LookupResult result = findByPartnerIdResult(partnerId);
        return result == null || !result.isFound() ? Optional.empty() : Optional.of(result.partner());
    }

    /** 거래처 UUID 조회의 FOUND/NOT_FOUND/UNAVAILABLE 결과를 보존한다. */
    public LookupResult findByPartnerIdResult(UUID partnerId) {
        if (partnerId == null) return LookupResult.notFound();
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) throw internalAuthMiss("partnerId", partnerId, 0);
        try {
            String body = restClient.get().uri("/internal/partners/{partnerId}/summary", partnerId)
                    .header(INTERNAL_TOKEN_HEADER, token).retrieve().body(String.class);
            return parseSummaryResult(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 404 || status == 409) return LookupResult.notFound();
            if (status == 401 || status == 403) throw internalAuthMiss("partnerId", partnerId, status);
            log.warn("PartnerLookupClient — partnerId={} status={} (일시 장애)", partnerId, status);
            return LookupResult.unavailable();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient partnerId 호출 실패 — partnerId={}, msg={}", partnerId, ex.getMessage());
            return LookupResult.unavailable();
        }
    }

    /**
     * partnerId 목록 → PartnerSummary batch lookup. 401/403 은 fail-fast, 5xx/network 는 빈 Map 반환.
     *
     * <p>partner-service {@code POST /internal/partners/lookup-by-ids} 호출. 응답은
     * {@code data.partners[].id/partnerCode/name} 또는 wrapper 없는
     * {@code partners[].id/partnerCode/name} 을 모두 허용한다.
     *
     * @param partnerIds 조회할 거래처 UUID 목록
     * @return partnerId → PartnerSummary Map
     */
    public Map<UUID, PartnerSummary> findByPartnerIdsBatch(List<UUID> partnerIds) {
        BatchLookupResult result = findByPartnerIdsBatchResult(partnerIds);
        if (result == null || result.isUnavailable()) {
            // 구 Map API도 장애 상태를 빈 맵으로 위장하지 않는다. 이 API는 표시명
            // enrichment 전용 소비처 12곳이 공통으로 사용하므로 502 fail-closed가 맞다.
            throw PartnerLookupSupport.unavailable();
        }
        return result.partners();
    }

    /**
     * partnerId batch 조회의 FOUND(부분 성공 포함)/UNAVAILABLE 결과를 보존한다 (#831 B군).
     *
     * <p>요청한 id 중 일부가 매칭되지 않는 것은 partner-service 가 정상 응답한 것이므로
     * FOUND(부분 맵)이다. 5xx/timeout/네트워크 오류 및 구조 손상 응답만 UNAVAILABLE 로 승격한다.
     *
     * @param partnerIds 조회할 거래처 UUID 목록
     * @return FOUND(부분 성공 포함) 또는 UNAVAILABLE
     */
    public BatchLookupResult findByPartnerIdsBatchResult(List<UUID> partnerIds) {
        if (partnerIds == null || partnerIds.isEmpty()) {
            return BatchLookupResult.found(Map.of());
        }
        LinkedHashSet<UUID> distinct = new LinkedHashSet<>(partnerIds);
        distinct.removeIf(java.util.Objects::isNull);
        if (distinct.isEmpty()) {
            return BatchLookupResult.found(Map.of());
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw internalAuthMiss("partnerIds", distinct.size(), 0);
        }
        try {
            String body = restClient.post()
                    .uri("/internal/partners/lookup-by-ids")
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .body(Map.of("ids", distinct))
                    .retrieve()
                    .body(String.class);
            return parsePartnerSummariesResult(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 401 || status == 403) {
                throw internalAuthMiss("partnerIds", distinct.size(), status);
            }
            log.warn("PartnerLookupClient batch — count={} status={} (일시 장애)",
                    distinct.size(), status);
            return BatchLookupResult.unavailable();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient batch 호출 실패 — count={}, msg={}",
                    distinct.size(), ex.getMessage());
            return BatchLookupResult.unavailable();
        }
    }

    /**
     * partnerCode/name/bizNo 부분일치 directory 조회.
     *
     * <p>partner-service {@code GET /internal/partners/list?q=&limit=&page=0} 호출.
     * G-1 받을어음 등록 화면의 bizNo 단독 resolve 에 사용한다. 응답에 포함된 partnerId 는
     * 회계 DB 저장용 내부 키이며 API 응답에는 노출하지 않는다.
     *
     * @param query partnerCode/name/bizNo 검색어
     * @param limit 최대 조회 건수
     * @return 매칭된 거래처 요약 목록. 실패 시 빈 목록
     */
    public List<PartnerSummary> searchDirectory(String query, int limit) {
        DirectoryLookupResult result = searchDirectoryResult(query, limit);
        return result.isFound() ? result.partners() : List.of();
    }

    /** directory 목록 조회의 FOUND/NOT_FOUND/UNAVAILABLE 결과를 보존한다. */
    public DirectoryLookupResult searchDirectoryResult(String query, int limit) {
        // [#929 재수렴 6차 D-RC6-1] 판정은 전송할 값으로 한다 — 실제 요청이 query.trim() 을 싣는다.
        String trimmedQuery = query == null ? "" : query.trim();
        if (trimmedQuery.isBlank()) {
            return DirectoryLookupResult.notFound();
        }
        String directoryQuery = formatBusinessNumberForDirectory(trimmedQuery);
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw internalAuthMiss("partnerDirectory", query, 0);
        }
        try {
            String body = restClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/internal/partners/list")
                            .queryParam("q", directoryQuery)
                            .queryParam("limit", Math.max(1, limit))
                            .queryParam("page", 0)
                            .build())
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseSummaryListResult(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 401 || status == 403) {
                throw internalAuthMiss("partnerDirectory", query, status);
            }
            if (status == 404 || status == 409) {
                return DirectoryLookupResult.notFound();
            }
            log.warn("PartnerLookupClient directory — q={} status={} (예외)", query, status);
            return DirectoryLookupResult.unavailable();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient directory 호출 실패 — q={}, msg={}", query, ex.getMessage());
            return DirectoryLookupResult.unavailable();
        }
    }

    /** directory의 bizNo가 XXX-XX-XXXXX로 저장된 환경에서도 숫자 입력을 조회한다. */
    private static String formatBusinessNumberForDirectory(String value) {
        if (value.matches("\\d{10}")) {
            return value.substring(0, 3) + "-" + value.substring(3, 5) + "-" + value.substring(5);
        }
        return value;
    }

    /**
     * 거래처명 → PartnerSummary fail-soft — MIG-3 이카운트 전표 import 의 거래처명 lookup.
     *
     * <p>partner-service {@code GET /internal/partners/by-name?name=} 호출.
     * 401/403 은 fail-fast, 404/409/5xx/network 는 empty 로 반환하고,
     * importer 가 {@code MIG3_LOOKUP_MISS} reject 로 명시 보고한다.
     *
     * @param partnerName 이카운트 raw 거래처명
     * @return PartnerSummary (성공) 또는 empty (실패)
     */
    public Optional<PartnerSummary> findByPartnerName(String partnerName) {
        LookupResult result = findByPartnerNameResult(partnerName);
        return result == null || !result.isFound() ? Optional.empty() : Optional.of(result.partner());
    }

    /** 거래처명 조회의 FOUND/NOT_FOUND/UNAVAILABLE 결과를 보존한다. */
    public LookupResult findByPartnerNameResult(String partnerName) {
        return findByPartnerNameResult(partnerName, false);
    }

    /**
     * MIG-3 import 전용 strict 거래처명 lookup.
     *
     * <p>partner-service 가 409 을 반환하면 운영자가 "미등록"이 아니라 "중복/모호"로 조치할 수 있도록
     * {@code MIG3_LOOKUP_AMBIGUOUS} 를 throw 한다. 401/403 은 fail-fast,
     * 404/네트워크 실패는 기존 fail-soft miss 로 둔다.
     */
    public Optional<PartnerSummary> findByPartnerNameStrict(String partnerName) {
        LookupResult result = findByPartnerNameResult(partnerName, true);
        return result == null || !result.isFound() ? Optional.empty() : Optional.of(result.partner());
    }

    private LookupResult findByPartnerNameResult(String partnerName, boolean strictAmbiguous) {
        // [#929 재수렴 6차 D-RC6-1] 판정은 전송할 값으로 한다 — 실제 요청이 partnerName.trim() 을 싣는다.
        String trimmedName = partnerName == null ? "" : partnerName.trim();
        if (trimmedName.isBlank()) {
            return LookupResult.notFound();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw internalAuthMiss("partnerName", partnerName, 0);
        }
        try {
            String body = restClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/internal/partners/by-name")
                            .queryParam("name", trimmedName)
                            .build())
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseSummaryResult(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 409 && strictAmbiguous) {
                throw new BusinessException(ErrorCode.MIG3_LOOKUP_AMBIGUOUS,
                        "거래처명 lookup ambiguous: " + partnerName);
            }
            if (status == 401 || status == 403) {
                throw internalAuthMiss("partnerName", partnerName, status);
            }
            if (status == 404 || status == 409) {
                log.debug("PartnerLookupClient — partnerName={} status={} (lookup miss/ambiguous)",
                        partnerName, status);
                return LookupResult.notFound();
            }
            log.warn("PartnerLookupClient — partnerName={} status={} (예외)", partnerName, status);
            return LookupResult.unavailable();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient partnerName 호출 실패 — partnerName={}, msg={}",
                    partnerName, ex.getMessage());
            return LookupResult.unavailable();
        }
    }

    /** ApiResponse wrapper 의 data 필드 → PartnerSummary 변환. */
    private Optional<PartnerSummary> parseSummary(String body) {
        LookupResult result = parseSummaryResult(body);
        return result == null || !result.isFound() ? Optional.empty() : Optional.of(result.partner());
    }

    private LookupResult parseSummaryResult(String body) {
        return parseSummaryResult(body, null);
    }

    /**
     * ApiResponse wrapper 의 data 필드를 PartnerSummary 로 해석하되, 요청이 지정한 자원을 기술한
     * 응답인지 확인한다 (#929 재수렴 5차 D-RC5-1).
     *
     * <p><b>신원 확인의 판정 순서</b> — "FOUND 가 아니다" 안에서 "내 자원이 아니다(NOT_FOUND)" 와
     * "내 자원인데 응답이 손상됐다(UNAVAILABLE)" 를 가른다:
     * <ol>
     *   <li>본문 자체가 파싱 불가 → {@code UNAVAILABLE}. 직렬화/전송이 깨진 것이지 입력 탓이 아니다.</li>
     *   <li>{@code data} 가 단일 객체가 아님(배열·스칼라·null) → 단건 거래처 표현이 아니므로 내
     *       자원이 아니다 → {@code NOT_FOUND}. 형제 라우트 {@code /list} 가 여기에 걸린다
     *       (거래처 50건 배열 200) — 선두 원소를 내 거래처로 채택하면 전 화면이 엉뚱한 거래처를
     *       보여주게 되므로, 배열은 반드시 미존재로 성사시킨다.</li>
     *   <li>객체지만 스스로 밝힌 {@code partnerCode} 가 내가 지정한 코드와 다르거나 아예 없음 →
     *       내 자원이 아니다 → {@code NOT_FOUND}. 아직 없는 형제 라우트가 낯선 객체를 돌려줘도
     *       같은 결론이라, 라우트가 늘어나도 다시 새지 않는다.</li>
     *   <li>내 코드를 밝힌 객체인데 {@code partnerId} 가 누락/형식오류 → {@code UNAVAILABLE}
     *       (#810 R3-CODEX 그대로 — 부분배포/응답손상은 재시도 대상이며, 결손 요약이 매칭 경로로
     *       흐르면 안 된다).</li>
     * </ol>
     *
     * <p>partner-service 의 조회는 {@code partner_code} 완전 일치({@code varchar(100)},
     * 표준 collation)이므로 성공 응답의 {@code partnerCode} 는 보낸 값과 문자 단위로 같다 —
     * 이 확인이 지금 성공하는 조회를 하나도 잃지 않는다(실 DB 56행 전수 재측정으로 고정).
     *
     * @param body partner-service 응답 본문
     * @param addressedPartnerCode 이 응답이 기술해야 할 거래처 코드. {@code null} 이면 신원 확인을
     *        생략한다 — 호출 경로의 path 세그먼트가 UUID({@code /{partnerId}/summary})라 형제
     *        라우트 이름과 충돌할 수 없는 경우로, 그 경로의 판정은 #810 그대로 둔다.
     */
    private LookupResult parseSummaryResult(String body, String addressedPartnerCode) {
        if (body == null || body.isBlank()) {
            return LookupResult.unavailable();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull() || !data.isObject()) {
                return addressedPartnerCode == null
                        ? LookupResult.unavailable()
                        : notAddressedPartner(addressedPartnerCode, "단건 거래처 객체가 아닌 응답");
            }
            UUID partnerId = parseUuid(data, "partnerId", "id");
            String partnerCode = textOrNull(data, "partnerCode");
            if (addressedPartnerCode != null && !addressedPartnerCode.equals(partnerCode)) {
                return notAddressedPartner(addressedPartnerCode, "응답이 밝힌 partnerCode 가 다름");
            }
            String name = textOrNull(data, "name", "partnerName", "businessName");
            String businessNo = textOrNull(data, "bizNo", "businessNo", "businessRegistrationNumber");
            String address = textOrNull(data, "address");
            BigDecimal creditLimit = decimalOrNull(data, "creditLimit");
            String status = textOrNull(data, "status");
            // #810 R3-CODEX (S1-M2): partnerId·partnerCode 는 둘 다 구조적 필수다.
            // 200 응답에 partnerId 가 누락/형식오류인데 partnerCode 만으로 FOUND 를 반환하면
            // 부분배포/응답손상 시 partnerId=null 요약이 매칭 경로로 흘러 오매칭을 유발한다.
            // 하나라도 결손이면 FOUND 가 아니라 UNAVAILABLE(재시도 대상)로 격리한다.
            if (partnerId == null || partnerCode == null || partnerCode.isBlank()) {
                log.warn("PartnerLookupClient response 구조 결손 — partnerId={} partnerCode={} (UNAVAILABLE 격리)",
                        partnerId == null ? "누락/형식오류" : "ok",
                        partnerCode == null || partnerCode.isBlank() ? "누락" : "ok");
                return LookupResult.unavailable();
            }
            return LookupResult.found(new PartnerSummary(partnerId, partnerCode, name, businessNo, address,
                    creditLimit, status));
        } catch (Exception ex) {
            log.warn("PartnerLookupClient response 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            return LookupResult.unavailable();
        }
    }

    /**
     * "응답은 왔지만 내가 지정한 거래처가 아니다" 를 미존재로 성사시킨다 (#929 재수렴 5차 D-RC5-1).
     *
     * <p>{@code UNAVAILABLE}(502 "일시 장애") 과 구별해야 하는 상황이다 — partner-service 는
     * 정상이고, 사용자가 친 값이 거래처를 가리키지 못했을 뿐이다. 로그는 debug 로 남긴다:
     * 사용자 입력 오타는 운영 경보 대상이 아니다.
     */
    private static LookupResult notAddressedPartner(String addressedPartnerCode, String reason) {
        log.debug("PartnerLookupClient — 응답이 지정한 거래처를 기술하지 않음 (code={}, 사유={}, NOT_FOUND 처리)",
                addressedPartnerCode, reason);
        return LookupResult.notFound();
    }

    /** ApiResponse wrapper 의 data.partners 또는 root.partners → partnerId/summary Map 변환. */
    private BatchLookupResult parsePartnerSummariesResult(String body) {
        if (body == null || body.isBlank()) {
            // 200 인데 body 가 비었다는 것은 구조적으로 손상된 응답 — 장애로 승격한다.
            return BatchLookupResult.unavailable();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            JsonNode partners = data == null ? null : data.get("partners");
            if (partners == null || !partners.isArray()) {
                // partners 필드 자체가 없는 것(빈 배열과 다름)은 응답 계약 위반 — 장애로 승격한다.
                return BatchLookupResult.unavailable();
            }
            Map<UUID, PartnerSummary> result = new LinkedHashMap<>();
            for (JsonNode partner : partners) {
                UUID id = parseUuid(partner, "id", "partnerId");
                String partnerCode = textOrNull(partner, "partnerCode");
                String name = textOrNull(partner, "name", "partnerName", "businessName");
                String businessNo = textOrNull(partner, "bizNo", "businessNo", "businessRegistrationNumber");
                String address = textOrNull(partner, "address");
                BigDecimal creditLimit = decimalOrNull(partner, "creditLimit");
                String status = textOrNull(partner, "status");
                if (id == null || (partnerCode == null && name == null)) {
                    // 배열에 원소가 존재하는데 필수 식별/표시 필드가 손상된 것은 정상
                    // 미존재(요청 id가 배열에서 누락)와 다르다. 전체 응답을 장애로 승격한다.
                    log.warn("PartnerLookupClient batch response 구조손상 — 필수 partner 필드 누락");
                    return BatchLookupResult.unavailable();
                }
                result.put(id, new PartnerSummary(id, partnerCode, name, businessNo, address,
                        creditLimit, status));
            }
            // partners 가 빈 배열([])인 것은 요청한 id 가 하나도 매칭되지 않은 정상 응답이다
            // (삭제/미존재 거래처 혼재) — UNAVAILABLE 이 아니라 FOUND(부분/빈 맵)로 유지한다.
            return BatchLookupResult.found(result);
        } catch (Exception ex) {
            log.warn("PartnerLookupClient batch response 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            return BatchLookupResult.unavailable();
        }
    }

    /** ApiResponse wrapper 의 data 배열 → PartnerSummary 목록 변환. */
    private List<PartnerSummary> parseSummaryList(String body) {
        DirectoryLookupResult result = parseSummaryListResult(body);
        return result.isFound() ? result.partners() : List.of();
    }

    private DirectoryLookupResult parseSummaryListResult(String body) {
        if (body == null || body.isBlank()) {
            return DirectoryLookupResult.unavailable();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || !data.isArray()) {
                return DirectoryLookupResult.unavailable();
            }
            java.util.ArrayList<PartnerSummary> result = new java.util.ArrayList<>();
            for (JsonNode partner : data) {
                UUID id = parseUuid(partner, "partnerId", "id");
                String partnerCode = textOrNull(partner, "partnerCode");
                String name = textOrNull(partner, "name", "partnerName", "businessName");
                String businessNo = textOrNull(partner, "bizNo", "businessNo", "businessRegistrationNumber");
                String address = textOrNull(partner, "address");
                BigDecimal creditLimit = decimalOrNull(partner, "creditLimit");
                String status = textOrNull(partner, "status");
                if (id != null && partnerCode != null && !partnerCode.isBlank()) {
                    result.add(new PartnerSummary(id, partnerCode, name, businessNo, address,
                            creditLimit, status));
                }
            }
            return result.isEmpty()
                    ? DirectoryLookupResult.notFound()
                    : DirectoryLookupResult.found(result);
        } catch (Exception ex) {
            log.warn("PartnerLookupClient directory response 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            return DirectoryLookupResult.unavailable();
        }
    }

    private static String textOrNull(JsonNode node, String... keys) {
        for (String k : keys) {
            JsonNode n = node.get(k);
            if (n != null && !n.isNull() && !n.asText().isBlank()) {
                return n.asText();
            }
        }
        return null;
    }

    private static BigDecimal decimalOrNull(JsonNode node, String... keys) {
        for (String k : keys) {
            JsonNode n = node.get(k);
            if (n != null && !n.isNull() && !n.asText().isBlank()) {
                try {
                    return n.isNumber() ? n.decimalValue() : new BigDecimal(n.asText());
                } catch (NumberFormatException ignore) {
                    return null;
                }
            }
        }
        return null;
    }

    private static UUID parseUuid(JsonNode node, String... keys) {
        for (String k : keys) {
            JsonNode n = node.get(k);
            if (n != null && !n.isNull() && !n.asText().isBlank()) {
                try {
                    return UUID.fromString(n.asText());
                } catch (IllegalArgumentException ignore) {
                    return null;
                }
            }
        }
        return null;
    }

    private BusinessException internalAuthMiss(String key, Object value, int status) {
        if (status == 0) {
            log.error("PartnerLookupClient — X-Internal-Token 미설정 ({}={})", key, value);
            return new BusinessException(ErrorCode.MIG12_INTERNAL_AUTH_MISS,
                    "PartnerLookupClient 내부 인증 토큰 미설정");
        }
        log.error("PartnerLookupClient — {}={} status={} (내부 인증 실패)", key, value, status);
        return new BusinessException(ErrorCode.MIG12_INTERNAL_AUTH_MISS,
                "PartnerLookupClient 내부 인증 실패: status=" + status);
    }
}
