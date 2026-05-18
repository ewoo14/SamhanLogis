package com.samhanair.logis.accounting.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * KFTC 오픈뱅킹 입금 거래 조회 client 구현체 (SP-09-4).
 *
 * <p>전송 방식 분기 우선순위:
 *
 * <ol>
 *   <li>{@code fetchDeposits(..., submitMethod)} 파라미터가 null 이 아닌 경우 파라미터 우선</li>
 *   <li>파라미터가 null/blank 이면 ENV {@code KFTC_SUBMIT_METHOD} (기본값 {@code DRY_RUN}) fallback</li>
 * </ol>
 *
 * <ul>
 *   <li>{@code DRY_RUN} (기본) — 실제 API 호출 없이 mock 5건 즉시 반환.
 *       입금자명 / 금액 / 거래일 / 거래일시 / 계좌번호 포함.</li>
 *   <li>{@code KFTC} — KFTC 오픈뱅킹 실 API 호출. ENV {@code KFTC_API_KEY} /
 *       {@code KFTC_CLIENT_ID} / {@code KFTC_CLIENT_SECRET} 3개 키 모두 검증.
 *       placeholder 4 키워드 case-insensitive 차단. 실 API 미구현 → {@code KFTC_SUBMIT_FAILED} 발생.</li>
 * </ul>
 *
 * <p>placeholder 차단 키워드 (대소문자 무시): {@code placeholder_dev_only}, {@code changeme},
 * {@code dummy}, {@code test}. ETaxClientImpl 답습 + {@code test} 추가.
 *
 * <p>IT 격리: {@code @MockBean KftcClient} 로 격리 의무
 * (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 */
@Component
public class KftcClientImpl implements KftcClient {

    private static final Logger log = LoggerFactory.getLogger(KftcClientImpl.class);

    /** 전송 방식 서버 기본값 — DRY_RUN | KFTC. 기본값 DRY_RUN (Phase 11 이전). */
    @Value("${kftc.submit-method:DRY_RUN}")
    private String defaultSubmitMethod;

    /** KFTC API 키 — KFTC 모드 전용. DRY_RUN 시 미사용. */
    @Value("${kftc.api-key:}")
    private String kftcApiKey;

    /** KFTC Client ID — KFTC 모드 전용. DRY_RUN 시 미사용. */
    @Value("${kftc.client-id:}")
    private String kftcClientId;

    /** KFTC Client Secret — KFTC 모드 전용. DRY_RUN 시 미사용. */
    @Value("${kftc.client-secret:}")
    private String kftcClientSecret;

    /** KFTC API Base URL — KFTC 모드 전용. */
    @Value("${kftc.base-url:https://testapi.openbanking.or.kr}")
    private String kftcBaseUrl;

    /**
     * 입금 거래 내역을 조회한다.
     *
     * <p>전송 방식 결정 순서: {@code submitMethod} 파라미터 우선, null/blank 이면 서버 property fallback.
     *
     * @param from         조회 시작 일자
     * @param to           조회 종료 일자
     * @param accountFinNo 계좌 금융기관 코드 (선택)
     * @param submitMethod 요청 전송 방식 ("DRY_RUN" | "KFTC"). null/blank 이면 서버 property 사용.
     * @return 입금 거래 목록
     * @throws BusinessException(KFTC_SUBMIT_FAILED) KFTC 모드 자격증명 오류 또는 API 실패 시
     */
    @Override
    public List<KftcDepositRecord> fetchDeposits(LocalDate from, LocalDate to,
                                                  String accountFinNo, String submitMethod) {
        String effectiveMethod = (submitMethod != null && !submitMethod.isBlank())
                ? submitMethod
                : defaultSubmitMethod;

        if ("DRY_RUN".equalsIgnoreCase(effectiveMethod)) {
            return fetchDryRun(from, accountFinNo);
        } else if ("KFTC".equalsIgnoreCase(effectiveMethod)) {
            return fetchKftc(from, to, accountFinNo);
        } else {
            log.warn("[SP-09-4] 알 수 없는 submit-method={} — DRY_RUN 으로 fallback", effectiveMethod);
            return fetchDryRun(from, accountFinNo);
        }
    }

    /**
     * DRY_RUN 모드 — mock 5건 즉시 반환.
     *
     * <p>입금자명은 거래처명 매칭 검증용 샘플 데이터 포함.
     * 모든 mock transactionId 는 비즈니스 식별자 형식 ("DRY-yyyyMMdd-N").
     *
     * @param from         조회 시작 일자 (mock 거래일 기준)
     * @param accountFinNo 계좌 금융기관 코드 (mock 데이터에 그대로 반영)
     * @return mock 5건 입금 거래 목록
     */
    private List<KftcDepositRecord> fetchDryRun(LocalDate from, String accountFinNo) {
        LocalDate baseDate = (from != null) ? from : LocalDate.now();
        String account = (accountFinNo != null && !accountFinNo.isBlank())
                ? accountFinNo : "***-****-0001";
        log.info("[SP-09-4] DRY_RUN fetchDeposits — baseDate={} accountFinNo={}", baseDate, account);
        return List.of(
                new KftcDepositRecord(
                        "(주)삼성상사",
                        new BigDecimal("1100000.00"),
                        baseDate,
                        "091523",
                        account,
                        "5월 운임 입금",
                        "DRY-" + baseDate + "-001"
                ),
                new KftcDepositRecord(
                        "한국물류(주)",
                        new BigDecimal("550000.00"),
                        baseDate,
                        "101045",
                        account,
                        "운임 정산",
                        "DRY-" + baseDate + "-002"
                ),
                new KftcDepositRecord(
                        "대한유통",
                        new BigDecimal("3300000.00"),
                        baseDate.plusDays(1),
                        "140230",
                        account,
                        "세금계산서 결제",
                        "DRY-" + baseDate.plusDays(1) + "-001"
                ),
                new KftcDepositRecord(
                        "미래운송",
                        new BigDecimal("220000.00"),
                        baseDate.plusDays(1),
                        "153510",
                        account,
                        "",
                        "DRY-" + baseDate.plusDays(1) + "-002"
                ),
                new KftcDepositRecord(
                        "알수없는입금자",
                        new BigDecimal("99000.00"),
                        baseDate.plusDays(2),
                        "090000",
                        account,
                        "미상 입금",
                        "DRY-" + baseDate.plusDays(2) + "-001"
                )
        );
    }

    /**
     * KFTC 실 API 전송 — Phase 11 sandbox + 운영 PC .env 에서 활성화.
     * 현 슬라이스는 구조만 준비 — 실 호출 로직은 Phase 11 구현 예정.
     *
     * <p>런타임 guard (3개 키 모두 검증):
     * <ul>
     *   <li>{@code kftcApiKey} — blank 또는 placeholder 이면 즉시 KFTC_SUBMIT_FAILED</li>
     *   <li>{@code kftcClientId} — blank 또는 placeholder 이면 즉시 KFTC_SUBMIT_FAILED</li>
     *   <li>{@code kftcClientSecret} — blank 또는 placeholder 이면 즉시 KFTC_SUBMIT_FAILED</li>
     * </ul>
     *
     * @throws BusinessException(KFTC_SUBMIT_FAILED) API 키 미설정·placeholder·API 호출 실패 시
     */
    private List<KftcDepositRecord> fetchKftc(LocalDate from, LocalDate to, String accountFinNo) {
        // KFTC_API_KEY 검증
        if (kftcApiKey == null || kftcApiKey.isBlank()) {
            throw new BusinessException(ErrorCode.KFTC_SUBMIT_FAILED,
                    "KFTC_API_KEY 미설정 — kftc.api-key 환경변수를 확인하세요");
        }
        if (isPlaceholderKey(kftcApiKey)) {
            throw new BusinessException(ErrorCode.KFTC_SUBMIT_FAILED,
                    "KFTC_API_KEY 가 placeholder 입니다. 실 sandbox 키 설정 필요.");
        }
        // KFTC_CLIENT_ID 검증
        if (kftcClientId == null || kftcClientId.isBlank()) {
            throw new BusinessException(ErrorCode.KFTC_SUBMIT_FAILED,
                    "KFTC_CLIENT_ID 미설정 — kftc.client-id 환경변수를 확인하세요");
        }
        if (isPlaceholderKey(kftcClientId)) {
            throw new BusinessException(ErrorCode.KFTC_SUBMIT_FAILED,
                    "KFTC_CLIENT_ID 가 placeholder 입니다. 실 sandbox 키 설정 필요.");
        }
        // KFTC_CLIENT_SECRET 검증
        if (kftcClientSecret == null || kftcClientSecret.isBlank()) {
            throw new BusinessException(ErrorCode.KFTC_SUBMIT_FAILED,
                    "KFTC_CLIENT_SECRET 미설정 — kftc.client-secret 환경변수를 확인하세요");
        }
        if (isPlaceholderKey(kftcClientSecret)) {
            throw new BusinessException(ErrorCode.KFTC_SUBMIT_FAILED,
                    "KFTC_CLIENT_SECRET 이 placeholder 입니다. 실 sandbox 키 설정 필요.");
        }
        // TODO(Phase 11): RestClient 를 이용한 KFTC 오픈뱅킹 실 API 호출 구현.
        // 현재는 구조만 준비 — 실 호출 시 BusinessException(KFTC_SUBMIT_FAILED) 로 surface.
        log.warn("[SP-09-4] KFTC 실 API 호출 미구현 — Phase 11 sandbox 연동 예정. from={} to={}",
                from, to);
        throw new BusinessException(ErrorCode.KFTC_SUBMIT_FAILED,
                "KFTC 실 API 호출은 Phase 11 에서 구현 예정입니다.");
    }

    /**
     * 알려진 placeholder 키 판별 — 4 키워드 case-insensitive 비교.
     *
     * <p>신규 placeholder 추가 시 이 메서드만 수정.
     *
     * @param key 검사할 키 값
     * @return placeholder 이면 true
     */
    private boolean isPlaceholderKey(String key) {
        String lower = key.toLowerCase(Locale.ROOT);
        return lower.equals("placeholder_dev_only")
                || lower.equals("changeme")
                || lower.equals("dummy")
                || lower.equals("test");
    }
}
