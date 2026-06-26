package com.samhanair.logis.accounting.client;

import com.samhanair.logis.accounting.config.CodefProperties;
import com.samhanair.logis.accounting.domain.BankTxnType;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * CODEF 은행·카드 거래내역 조회 client 구현체 (BC1).
 *
 * <p>KFTC client 와 동일하게 DRY_RUN 을 기본 경로로 두고, 실 CODEF 경로는 Phase 11 계약·키 발급 후 구현한다.
 * CODEF 모드에서는 api-key/client-id/client-secret 3개 키의 blank 및 placeholder 4키워드를 차단한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CodefClientImpl implements CodefClient {

    private final CodefProperties properties;

    @Override
    public List<CodefTxn> fetchBankTransactions(LocalDate from, LocalDate to, String accountRef, String submitMethod) {
        String effectiveMethod = effectiveMethod(submitMethod);
        if ("DRY_RUN".equalsIgnoreCase(effectiveMethod)) {
            return fetchDryRunBank(from, accountRef);
        }
        if ("CODEF".equalsIgnoreCase(effectiveMethod)) {
            return fetchCodefBank(from, to, accountRef);
        }
        log.warn("[BC1] 알 수 없는 CODEF submit-method={} — DRY_RUN 으로 fallback", effectiveMethod);
        return fetchDryRunBank(from, accountRef);
    }

    @Override
    public List<CodefTxn> fetchCardTransactions(LocalDate from, LocalDate to, String cardRef, String submitMethod) {
        String effectiveMethod = effectiveMethod(submitMethod);
        if ("DRY_RUN".equalsIgnoreCase(effectiveMethod)) {
            return fetchDryRunCard(from, cardRef);
        }
        if ("CODEF".equalsIgnoreCase(effectiveMethod)) {
            return fetchCodefCard(from, to, cardRef);
        }
        log.warn("[BC1] 알 수 없는 CODEF submit-method={} — DRY_RUN 으로 fallback", effectiveMethod);
        return fetchDryRunCard(from, cardRef);
    }

    @Override
    public List<CodefTxn> fetchLoanTransactions(LocalDate from, LocalDate to, String loanRef, String submitMethod) {
        String effectiveMethod = effectiveMethod(submitMethod);
        if ("DRY_RUN".equalsIgnoreCase(effectiveMethod)) {
            return fetchDryRunLoan(from, loanRef);
        }
        if ("CODEF".equalsIgnoreCase(effectiveMethod)) {
            return fetchCodefLoan(from, to, loanRef);
        }
        log.warn("[BC1] 알 수 없는 CODEF submit-method={} — DRY_RUN 으로 fallback", effectiveMethod);
        return fetchDryRunLoan(from, loanRef);
    }

    /** DRY_RUN 은행 거래 mock 5건. */
    private List<CodefTxn> fetchDryRunBank(LocalDate from, String accountRef) {
        LocalDate baseDate = from != null ? from : LocalDate.now();
        String account = hasText(accountRef) ? accountRef.trim() : "국민 123-456";
        log.info("[BC1] CODEF DRY_RUN 은행 거래 조회 — baseDate={} accountRef={}", baseDate, account);
        return List.of(
                new CodefTxn("(주)삼성상사", BankTxnType.DEPOSIT, new BigDecimal("1100000.00"),
                        baseDate, "091523", account, "CODEF 운임 입금",
                        "CODEF-BANK-" + baseDate + "-001", null, null),
                new CodefTxn("한국물류(주)", BankTxnType.DEPOSIT, new BigDecimal("550000.00"),
                        baseDate, "101045", account, "CODEF 운임 정산",
                        "CODEF-BANK-" + baseDate + "-002", null, null),
                new CodefTxn("국민은행", BankTxnType.WITHDRAWAL, new BigDecimal("3500.00"),
                        baseDate.plusDays(1), "110012", account, "이체 수수료",
                        "CODEF-BANK-" + baseDate.plusDays(1) + "-001", null, null),
                new CodefTxn("대한유통", BankTxnType.DEPOSIT, new BigDecimal("3300000.00"),
                        baseDate.plusDays(1), "140230", account, "세금계산서 결제",
                        "CODEF-BANK-" + baseDate.plusDays(1) + "-002", null, null),
                new CodefTxn("알수없는입금자", BankTxnType.DEPOSIT, new BigDecimal("99000.00"),
                        baseDate.plusDays(2), "090000", account, "미상 입금",
                        "CODEF-BANK-" + baseDate.plusDays(2) + "-001", null, null)
        );
    }

    /** DRY_RUN 카드 승인 mock 5건. 카드 거래는 매입/지출 방향으로 적재한다. */
    private List<CodefTxn> fetchDryRunCard(LocalDate from, String cardRef) {
        LocalDate baseDate = from != null ? from : LocalDate.now();
        String card = hasText(cardRef) ? cardRef.trim() : "법인카드-001";
        log.info("[BC1] CODEF DRY_RUN 카드 승인 조회 — baseDate={} cardRef={}", baseDate, card);
        return List.of(
                cardTxn("서울주유소", "120000.00", baseDate, "081500", card, "업무 차량 주유",
                        "001", "APP-" + baseDate + "-001"),
                cardTxn("고속도로통행료", "24500.00", baseDate, "093000", card, "하이패스 통행료",
                        "002", "APP-" + baseDate + "-002"),
                cardTxn("문구도매", "88000.00", baseDate.plusDays(1), "132000", card, "사무용품",
                        "001", "APP-" + baseDate.plusDays(1) + "-001"),
                cardTxn("택배운임", "43000.00", baseDate.plusDays(1), "164512", card, "택배비",
                        "002", "APP-" + baseDate.plusDays(1) + "-002"),
                cardTxn("식대", "77000.00", baseDate.plusDays(2), "121000", card, "외근 식대",
                        "001", "APP-" + baseDate.plusDays(2) + "-001")
        );
    }

    private CodefTxn cardTxn(String merchant, String amount, LocalDate date, String time, String cardRef,
                             String memo, String suffix, String approvalId) {
        return new CodefTxn(
                merchant,
                BankTxnType.WITHDRAWAL,
                new BigDecimal(amount),
                date,
                time,
                cardRef,
                memo,
                "CODEF-CARD-" + date + "-" + suffix,
                "삼한 법인카드",
                approvalId);
    }

    /** DRY_RUN 대출 거래 mock 5건. 대출 상환/이자 지급은 출금 방향으로 적재한다. */
    private List<CodefTxn> fetchDryRunLoan(LocalDate from, String loanRef) {
        LocalDate baseDate = from != null ? from : LocalDate.now();
        String loan = hasText(loanRef) ? loanRef.trim() : "기업운전자금대출-001";
        log.info("[BC1] CODEF DRY_RUN 대출 거래 조회 — baseDate={} loanRef={}", baseDate, loan);
        return List.of(
                loanTxn("국민은행", "500000.00", baseDate, "100000", loan, "대출 원금 상환",
                        "001"),
                loanTxn("국민은행", "87500.00", baseDate, "100001", loan, "대출 이자 납입",
                        "002"),
                loanTxn("국민은행", "500000.00", baseDate.plusDays(1), "100000", loan, "대출 원금 상환",
                        "001"),
                loanTxn("국민은행", "86300.00", baseDate.plusDays(1), "100001", loan, "대출 이자 납입",
                        "002"),
                loanTxn("국민은행", "12000.00", baseDate.plusDays(2), "100000", loan, "중도상환 수수료",
                        "001")
        );
    }

    private CodefTxn loanTxn(String lender, String amount, LocalDate date, String time, String loanRef,
                             String memo, String suffix) {
        return new CodefTxn(
                lender,
                BankTxnType.WITHDRAWAL,
                new BigDecimal(amount),
                date,
                time,
                loanRef,
                memo,
                "CODEF-LOAN-" + date + "-" + suffix,
                null,
                null,
                "기업운전자금대출");
    }

    /** CODEF 은행 실 API stub — Phase 11 계약·키 발급 후 구현. */
    private List<CodefTxn> fetchCodefBank(LocalDate from, LocalDate to, String accountRef) {
        validateCredentials();
        log.warn("[BC1] CODEF 은행 실 API 호출 미구현 — Phase 11/키발급 후 구현. from={} to={}", from, to);
        throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                "CODEF 은행 실 API 호출은 Phase 11/키발급 후 구현 예정입니다.");
    }

    /** CODEF 카드 실 API stub — Phase 11 계약·키 발급 후 구현. */
    private List<CodefTxn> fetchCodefCard(LocalDate from, LocalDate to, String cardRef) {
        validateCredentials();
        log.warn("[BC1] CODEF 카드 실 API 호출 미구현 — Phase 11/키발급 후 구현. from={} to={}", from, to);
        throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                "CODEF 카드 실 API 호출은 Phase 11/키발급 후 구현 예정입니다.");
    }

    /** CODEF 대출 실 API stub — Phase 11 계약·키 발급 후 구현. */
    private List<CodefTxn> fetchCodefLoan(LocalDate from, LocalDate to, String loanRef) {
        validateCredentials();
        log.warn("[BC1] CODEF 대출 실 API 호출 미구현 — Phase 11/키발급 후 구현. from={} to={}", from, to);
        throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                "CODEF 대출 실 API 호출은 Phase 11/키발급 후 구현 예정입니다.");
    }

    private void validateCredentials() {
        requireCredential(properties.getApiKey(), "CODEF_API_KEY");
        requireCredential(properties.getClientId(), "CODEF_CLIENT_ID");
        requireCredential(properties.getClientSecret(), "CODEF_CLIENT_SECRET");
    }

    private void requireCredential(String value, String name) {
        if (!hasText(value)) {
            throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                    name + " 미설정 — codef.* 환경변수를 확인하세요");
        }
        if (isPlaceholderKey(value)) {
            throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                    name + " 가 placeholder 입니다. CODEF 실 키 설정 필요.");
        }
    }

    private String effectiveMethod(String submitMethod) {
        return hasText(submitMethod) ? submitMethod.trim() : properties.getSubmitMethod();
    }

    /**
     * 알려진 placeholder 키 판별 — 4 키워드 case-insensitive 정확 일치.
     *
     * <p>정책 키워드: PLACEHOLDER_DEV_ONLY, CHANGE_ME_LOCAL_ONLY, changeme, dummy.
     */
    private boolean isPlaceholderKey(String key) {
        String lower = key.toLowerCase(Locale.ROOT);
        return lower.equals("placeholder_dev_only")
                || lower.equals("change_me_local_only")
                || lower.equals("changeme")
                || lower.equals("dummy");
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
