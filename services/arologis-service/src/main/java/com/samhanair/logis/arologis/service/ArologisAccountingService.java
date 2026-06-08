package com.samhanair.logis.arologis.service;

import com.samhanair.logis.arologis.domain.AccountType;
import com.samhanair.logis.arologis.domain.ArologisCashTxn;
import com.samhanair.logis.arologis.domain.ArologisSimpleAccount;
import com.samhanair.logis.arologis.domain.CashTxnType;
import com.samhanair.logis.arologis.repository.ArologisCashTxnRepository;
import com.samhanair.logis.arologis.repository.ArologisSimpleAccountRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 아로로지스 간이 회계 서비스(단식부기).
 *
 * <p>현금 수입/지출 1건 단위로 기록하고 기간/월별로 합계를 집계한다. 분개/차변·대변/마감/세금계산서
 * 개념은 일절 없으며, 잔액은 단순히 (수입 합 − 지출 합) 으로 계산한다. 모든 금액은 {@link BigDecimal}
 * 로 정확히 계산한다.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ArologisAccountingService {

    private final ArologisCashTxnRepository cashTxnRepository;
    private final ArologisSimpleAccountRepository simpleAccountRepository;

    /**
     * 현금 거래 등록.
     *
     * <p>accountCode 존재 + 거래 유형과 계정 유형 정합성을 검증한다. 금액 양수 검증은 도메인에서 한다.
     *
     * @param actor 감사자는 {@code AuditorAware} 가 created_by 에 기록하므로 본 메서드에서 actor 는
     *     미사용이다(컨트롤러 시그니처 정합 유지 목적). 삭제(soft-delete)만 actor 를 직접 사용한다.
     */
    public CashTxnView create(CreateCashTxnCommand command, String actor) {
        ArologisSimpleAccount account = findAccount(command.accountCode());
        assertTypeMatches(command.type(), account);
        ArologisCashTxn txn = cashTxnRepository.save(ArologisCashTxn.create(
                command.txnDate(),
                command.type(),
                command.partnerName(),
                command.amount(),
                command.accountCode(),
                command.description()));
        return CashTxnView.from(txn, account.getName());
    }

    /**
     * 현금 거래 수정. soft-delete 된 거래는 조회되지 않아 자동 차단된다.
     *
     * @param actor 감사자는 {@code AuditorAware} 가 modified_by 에 기록하므로 본 메서드에서 actor 는
     *     미사용이다(컨트롤러 시그니처 정합 유지 목적). 삭제(soft-delete)만 actor 를 직접 사용한다.
     */
    public CashTxnView update(UUID id, CreateCashTxnCommand command, String actor) {
        ArologisCashTxn txn = findTxn(id);
        ArologisSimpleAccount account = findAccount(command.accountCode());
        assertTypeMatches(command.type(), account);
        txn.update(
                command.txnDate(),
                command.type(),
                command.partnerName(),
                command.amount(),
                command.accountCode(),
                command.description());
        return CashTxnView.from(txn, account.getName());
    }

    /** 현금 거래 삭제(soft-delete). hard delete 금지. */
    public void delete(UUID id, String actor) {
        ArologisCashTxn txn = findTxn(id);
        txn.markDeleted(actorOrSystem(actor));
    }

    /** 단건 조회. */
    @Transactional(readOnly = true)
    public CashTxnView get(UUID id) {
        ArologisCashTxn txn = findTxn(id);
        return CashTxnView.from(txn, accountName(txn.getAccountCode()));
    }

    /**
     * 기간(from~to) + 선택적 유형 필터 거래 목록.
     *
     * @param type null 이면 수입/지출 모두 조회
     */
    @Transactional(readOnly = true)
    public List<CashTxnView> list(LocalDate from, LocalDate to, CashTxnType type) {
        assertPeriod(from, to);
        // 계정과목명은 거래마다 단건 조회(N+1)하지 않고, 진입 시 활성 계정 일괄 조회로 code→name Map 을
        // 1회 구성해 in-memory lookup 한다. 미존재 code 는 null 로 동작이 동일하다.
        Map<String, String> accountNames = accountNameMap();
        return cashTxnRepository.searchPeriod(from, to, type).stream()
                .map(txn -> CashTxnView.from(txn, accountNames.get(txn.getAccountCode())))
                .toList();
    }

    /**
     * 기간 집계. 수입 합/지출 합/잔액(수입−지출)을 {@link BigDecimal} 로 정확히 계산한다.
     *
     * @param from 시작일(포함)
     * @param to 종료일(포함)
     */
    @Transactional(readOnly = true)
    public CashSummaryView summary(LocalDate from, LocalDate to) {
        assertPeriod(from, to);
        List<ArologisCashTxn> txns = cashTxnRepository.searchPeriod(from, to, null);
        BigDecimal incomeTotal = BigDecimal.ZERO;
        BigDecimal expenseTotal = BigDecimal.ZERO;
        for (ArologisCashTxn txn : txns) {
            if (txn.getType() == CashTxnType.INCOME) {
                incomeTotal = incomeTotal.add(txn.getAmount());
            } else {
                expenseTotal = expenseTotal.add(txn.getAmount());
            }
        }
        return new CashSummaryView(
                from, to, incomeTotal, expenseTotal, incomeTotal.subtract(expenseTotal), txns.size());
    }

    /**
     * 연-월 단위 월별 집계. 해당 월 1일~말일을 기간으로 환산해 {@link #summary(LocalDate, LocalDate)} 를
     * 호출한다.
     */
    @Transactional(readOnly = true)
    public CashSummaryView monthlySummary(int year, int month) {
        YearMonth ym = YearMonth.of(year, month);
        return summary(ym.atDay(1), ym.atEndOfMonth());
    }

    /** 활성 + 사용가능 계정과목 목록. */
    @Transactional(readOnly = true)
    public List<SimpleAccountView> listAccounts() {
        return simpleAccountRepository.findAllByIsDeletedFalseAndActiveTrueOrderByDisplayOrderAscCodeAsc().stream()
                .map(SimpleAccountView::from)
                .toList();
    }

    private ArologisCashTxn findTxn(UUID id) {
        return cashTxnRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "거래를 찾을 수 없습니다."));
    }

    private ArologisSimpleAccount findAccount(String accountCode) {
        return simpleAccountRepository.findByCodeAndIsDeletedFalse(accountCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "계정과목을 찾을 수 없습니다."));
    }

    private String accountName(String accountCode) {
        return simpleAccountRepository.findByCodeAndIsDeletedFalse(accountCode)
                .map(ArologisSimpleAccount::getName)
                .orElse(null);
    }

    /**
     * 활성(미삭제) 계정과목 전체를 1회 조회해 code→name Map 으로 구성한다.
     *
     * <p>거래 목록 조회 시 거래당 계정명 단건 조회(N+1)를 피하기 위해 사용한다. 삭제되지 않은 계정만
     * 포함하므로, 단건 조회용 {@link #accountName(String)}(findByCodeAndIsDeletedFalse)과 동일한
     * 가시성을 가진다.
     */
    private Map<String, String> accountNameMap() {
        return simpleAccountRepository.findAllByIsDeletedFalseOrderByDisplayOrderAscCodeAsc().stream()
                .collect(Collectors.toMap(
                        ArologisSimpleAccount::getCode,
                        ArologisSimpleAccount::getName,
                        (existing, duplicate) -> existing));
    }

    /**
     * 거래 유형과 계정 유형 정합성 검증.
     *
     * <p>수입 거래는 INCOME/ASSET/LIABILITY 계정, 지출 거래는 EXPENSE/ASSET/LIABILITY 계정에만 허용한다.
     * 단식부기 특성상 현금/예금 등 자산·부채 계정은 양쪽에서 모두 쓰일 수 있으므로 수입에 EXPENSE 계정,
     * 지출에 INCOME 계정을 쓰는 명백한 불일치만 거부한다.
     */
    private static void assertTypeMatches(CashTxnType txnType, ArologisSimpleAccount account) {
        AccountType accountType = account.getType();
        if (txnType == CashTxnType.INCOME && accountType == AccountType.EXPENSE) {
            throw new BusinessException(ErrorCode.CONFLICT, "수입 거래에 지출 계정과목은 사용할 수 없습니다.");
        }
        if (txnType == CashTxnType.EXPENSE && accountType == AccountType.INCOME) {
            throw new BusinessException(ErrorCode.CONFLICT, "지출 거래에 수입 계정과목은 사용할 수 없습니다.");
        }
    }

    private static void assertPeriod(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회 기간(from/to)은 필수입니다.");
        }
        if (from.isAfter(to)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "시작일은 종료일보다 늦을 수 없습니다.");
        }
    }

    private static String actorOrSystem(String actor) {
        return actor == null || actor.isBlank() ? "system" : actor;
    }

    /** 현금 거래 등록/수정 command. */
    public record CreateCashTxnCommand(
            LocalDate txnDate,
            CashTxnType type,
            String partnerName,
            BigDecimal amount,
            String accountCode,
            String description) {
    }

    /** UUID 화면 routing 한정 노출 거래 응답. */
    public record CashTxnView(
            UUID id,
            LocalDate txnDate,
            CashTxnType type,
            String partnerName,
            BigDecimal amount,
            String accountCode,
            String accountName,
            String description) {

        public static CashTxnView from(ArologisCashTxn txn, String accountName) {
            return new CashTxnView(
                    txn.getId(),
                    txn.getTxnDate(),
                    txn.getType(),
                    txn.getPartnerName(),
                    txn.getAmount(),
                    txn.getAccountCode(),
                    accountName,
                    txn.getDescription());
        }
    }

    /** 기간/월별 집계 응답. */
    public record CashSummaryView(
            LocalDate from,
            LocalDate to,
            BigDecimal incomeTotal,
            BigDecimal expenseTotal,
            BigDecimal balance,
            int count) {
    }

    /** 계정과목 응답. UUID 없음(code 가 식별자). */
    public record SimpleAccountView(String code, String name, AccountType type, int displayOrder) {
        public static SimpleAccountView from(ArologisSimpleAccount account) {
            return new SimpleAccountView(
                    account.getCode(), account.getName(), account.getType(), account.getDisplayOrder());
        }
    }
}
