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
    public List<AccountInfo> listBankAccounts(String connectedId, String submitMethod) {
        String effectiveMethod = effectiveMethod(submitMethod);
        if ("DRY_RUN".equalsIgnoreCase(effectiveMethod)) {
            return listDryRunBankAccounts();
        }
        if ("CODEF".equalsIgnoreCase(effectiveMethod)) {
            return listCodefBankAccounts();
        }
        log.warn("[BC3] 알 수 없는 submit-method={} — DRY_RUN 목록으로 fallback", effectiveMethod);
        return listDryRunBankAccounts();
    }

    @Override
    public List<CardInfo> listCards(String connectedId, String submitMethod) {
        String effectiveMethod = effectiveMethod(submitMethod);
        if ("DRY_RUN".equalsIgnoreCase(effectiveMethod)) {
            return listDryRunCards();
        }
        if ("CODEF".equalsIgnoreCase(effectiveMethod)) {
            return listCodefCards();
        }
        log.warn("[BC3] 알 수 없는 submit-method={} — DRY_RUN 목록으로 fallback", effectiveMethod);
        return listDryRunCards();
    }

    @Override
    public List<LoanInfo> listLoans(String connectedId, String submitMethod) {
        String effectiveMethod = effectiveMethod(submitMethod);
        if ("DRY_RUN".equalsIgnoreCase(effectiveMethod)) {
            return listDryRunLoans();
        }
        if ("CODEF".equalsIgnoreCase(effectiveMethod)) {
            return listCodefLoans();
        }
        log.warn("[BC3] 알 수 없는 submit-method={} — DRY_RUN 목록으로 fallback", effectiveMethod);
        return listDryRunLoans();
    }

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
                        baseDate, "091523", account, "운임 입금",
                        "BANK-" + baseDate + "-001", null, null),
                new CodefTxn("한국물류(주)", BankTxnType.DEPOSIT, new BigDecimal("550000.00"),
                        baseDate, "101045", account, "운임 정산",
                        "BANK-" + baseDate + "-002", null, null),
                new CodefTxn("국민은행", BankTxnType.WITHDRAWAL, new BigDecimal("3500.00"),
                        baseDate.plusDays(1), "110012", account, "이체 수수료",
                        "BANK-" + baseDate.plusDays(1) + "-001", null, null),
                new CodefTxn("대한유통", BankTxnType.DEPOSIT, new BigDecimal("3300000.00"),
                        baseDate.plusDays(1), "140230", account, "세금계산서 결제",
                        "BANK-" + baseDate.plusDays(1) + "-002", null, null),
                new CodefTxn("알수없는입금자", BankTxnType.DEPOSIT, new BigDecimal("99000.00"),
                        baseDate.plusDays(2), "090000", account, "미상 입금",
                        "BANK-" + baseDate.plusDays(2) + "-001", null, null)
        );
    }

    /** DRY_RUN 은행계좌 목록 mock 4건. */
    private List<AccountInfo> listDryRunBankAccounts() {
        return List.of(
                new AccountInfo("국민 123456-78-901234", "국민 주거래 계좌", "국민은행", "123456-78-901234"),
                new AccountInfo("신한 987654-32-109876", "신한 운임 정산 계좌", "신한은행", "987654-32-109876"),
                new AccountInfo("우리 222222-33-444444", "우리 세금계산서 입금 계좌", "우리은행", "222222-33-444444"),
                new AccountInfo("하나 555555-66-777777", "하나 예비 계좌", "하나은행", "555555-66-777777")
        );
    }

    /** DRY_RUN 카드 목록 mock 3건. */
    private List<CardInfo> listDryRunCards() {
        return List.of(
                new CardInfo("삼한 법인카드 1111", "삼한 법인카드 주유", "국민카드", "****-****-****-1111"),
                new CardInfo("삼한 법인카드 2222", "삼한 법인카드 물류", "신한카드", "****-****-****-2222"),
                new CardInfo("삼한 법인카드 3333", "삼한 법인카드 일반", "현대카드", "****-****-****-3333")
        );
    }

    /** DRY_RUN 대출 목록 mock 2건. */
    private List<LoanInfo> listDryRunLoans() {
        return List.of(
                new LoanInfo("기업운전자금대출-001", "운전자금 대출", "국민은행", "기업운전자금"),
                new LoanInfo("시설자금대출-002", "시설자금 대출", "신한은행", "시설자금")
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
                "CARD-" + date + "-" + suffix,
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
                "LOAN-" + date + "-" + suffix,
                null,
                null,
                "기업운전자금대출");
    }

    /** CODEF 은행 실 API stub — Phase 11 계약·키 발급 후 구현. */
    private List<CodefTxn> fetchCodefBank(LocalDate from, LocalDate to, String accountRef) {
        validateCredentials();
        log.warn("[BC1] CODEF 은행 실 API 호출 미구현 — Phase 11/키발급 후 구현. from={} to={}", from, to);
        throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                "금융기관 직접 연동 기능은 현재 준비 중입니다. 관리자에게 문의하세요.");
    }

    /** CODEF 카드 실 API stub — Phase 11 계약·키 발급 후 구현. */
    private List<CodefTxn> fetchCodefCard(LocalDate from, LocalDate to, String cardRef) {
        validateCredentials();
        log.warn("[BC1] CODEF 카드 실 API 호출 미구현 — Phase 11/키발급 후 구현. from={} to={}", from, to);
        throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                "금융기관 직접 연동 기능은 현재 준비 중입니다. 관리자에게 문의하세요.");
    }

    /** CODEF 대출 실 API stub — Phase 11 계약·키 발급 후 구현. */
    private List<CodefTxn> fetchCodefLoan(LocalDate from, LocalDate to, String loanRef) {
        validateCredentials();
        log.warn("[BC1] CODEF 대출 실 API 호출 미구현 — Phase 11/키발급 후 구현. from={} to={}", from, to);
        throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                "금융기관 직접 연동 기능은 현재 준비 중입니다. 관리자에게 문의하세요.");
    }

    /** 실 은행계좌 목록 API stub — Phase 11 계약·키 발급 후 구현. */
    private List<AccountInfo> listCodefBankAccounts() {
        validateCredentials();
        throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                "금융기관 직접 연동 기능은 현재 준비 중입니다. 관리자에게 문의하세요.");
    }

    /** 실 카드 목록 API stub — Phase 11 계약·키 발급 후 구현. */
    private List<CardInfo> listCodefCards() {
        validateCredentials();
        throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                "금융기관 직접 연동 기능은 현재 준비 중입니다. 관리자에게 문의하세요.");
    }

    /** 실 대출 목록 API stub — Phase 11 계약·키 발급 후 구현. */
    private List<LoanInfo> listCodefLoans() {
        validateCredentials();
        throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                "금융기관 직접 연동 기능은 현재 준비 중입니다. 관리자에게 문의하세요.");
    }

    private void validateCredentials() {
        requireCredential(properties.getApiKey(), "CODEF_API_KEY");
        requireCredential(properties.getClientId(), "CODEF_CLIENT_ID");
        requireCredential(properties.getClientSecret(), "CODEF_CLIENT_SECRET");
    }

    private void requireCredential(String value, String name) {
        if (!hasText(value)) {
            throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                    "금융기관 연동 설정이 완료되지 않았습니다. 관리자에게 문의하세요.");
        }
        if (isPlaceholderKey(value)) {
            throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                    "금융기관 연동 설정 값이 올바르지 않습니다. 관리자에게 문의하세요.");
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
