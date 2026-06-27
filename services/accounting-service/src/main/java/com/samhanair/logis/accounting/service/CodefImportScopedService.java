package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.CodefClient;
import com.samhanair.logis.accounting.domain.UserCodefImportScope;
import com.samhanair.logis.accounting.util.CodefRefNormalizer;
import com.samhanair.logis.accounting.web.dto.CodefImportResponse;
import com.samhanair.logis.accounting.web.dto.CodefImportType;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** BC3 다중 ref/저장 선택 기반 거래내역 import 서비스. */
@Service
@RequiredArgsConstructor
public class CodefImportScopedService {

    private static final String EMPTY_SAVED_SCOPE_MESSAGE =
            "저장된 가져오기 선택이 비어 있습니다. 먼저 계좌/카드/대출을 선택해 저장하세요.";

    private final CodefClient codefClient;
    private final CodefImportService codefImportService;
    private final UserCodefImportScopeService scopeService;

    /**
     * 다중 ref, 전체 목록, 저장 선택 중 요청 의미에 맞는 ref 집합을 해석한 뒤 거래내역을 가져온다.
     *
     * <p>해석 규칙:
     * <ul>
     *     <li>{@code type=ALL} 이고 세 ref 배열이 모두 빈 배열이면 저장된 선택을 사용한다.</li>
     *     <li>세 ref 배열이 모두 {@code null} 이면 서버 목록 전체를 열거한다.</li>
     *     <li>하나라도 배열이 지정되면 지정된 ref 만 사용한다.</li>
     * </ul>
     */
    @Transactional
    public CodefImportResponse importTransactionsWithScope(LocalDate from, LocalDate to,
                                                           CodefImportType type,
                                                           String connectedId,
                                                           List<String> accountRefs,
                                                           List<String> cardRefs,
                                                           List<String> loanRefs,
                                                           String submitMethod,
                                                           UUID userId) {
        if (userId == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "인증 사용자 정보가 필요합니다.");
        }
        validateConnectedId(connectedId);
        CodefImportType effectiveType = type != null ? type : CodefImportType.ALL;
        ResolvedRefs refs = resolveRefs(effectiveType, connectedId.trim(), accountRefs, cardRefs, loanRefs,
                submitMethod, userId);
        return codefImportService.importTransactionsForRefs(
                from,
                to,
                effectiveType,
                refs.accountRefs(),
                refs.cardRefs(),
                refs.loanRefs(),
                submitMethod);
    }

    private ResolvedRefs resolveRefs(CodefImportType type, String connectedId,
                                     List<String> accountRefs, List<String> cardRefs, List<String> loanRefs,
                                     String submitMethod, UUID userId) {
        if (type == CodefImportType.ALL
                && isExplicitEmpty(accountRefs)
                && isExplicitEmpty(cardRefs)
                && isExplicitEmpty(loanRefs)) {
            UserCodefImportScope scope = scopeService.getRequired(userId, connectedId);
            List<String> savedAccountRefs = CodefRefNormalizer.normalizeRefs(scope.getAccountRefSelections());
            List<String> savedCardRefs = CodefRefNormalizer.normalizeRefs(scope.getCardRefSelections());
            List<String> savedLoanRefs = CodefRefNormalizer.normalizeRefs(scope.getLoanRefSelections());
            if (savedAccountRefs.isEmpty() && savedCardRefs.isEmpty() && savedLoanRefs.isEmpty()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, EMPTY_SAVED_SCOPE_MESSAGE);
            }
            return new ResolvedRefs(
                    savedAccountRefs,
                    savedCardRefs,
                    savedLoanRefs);
        }

        boolean anyExplicit = accountRefs != null || cardRefs != null || loanRefs != null;
        if (!anyExplicit) {
            return new ResolvedRefs(
                    shouldImport(type, CodefImportType.BANK)
                            ? codefClient.listBankAccounts(connectedId, submitMethod).stream()
                                    .map(account -> account.ref())
                                    .toList()
                            : List.of(),
                    shouldImport(type, CodefImportType.CARD)
                            ? codefClient.listCards(connectedId, submitMethod).stream()
                                    .map(card -> card.ref())
                                    .toList()
                            : List.of(),
                    shouldImport(type, CodefImportType.LOAN)
                            ? codefClient.listLoans(connectedId, submitMethod).stream()
                                    .map(loan -> loan.ref())
                                    .toList()
                            : List.of());
        }

        return new ResolvedRefs(
                accountRefs == null ? List.of() : CodefRefNormalizer.normalizeRefs(accountRefs),
                cardRefs == null ? List.of() : CodefRefNormalizer.normalizeRefs(cardRefs),
                loanRefs == null ? List.of() : CodefRefNormalizer.normalizeRefs(loanRefs));
    }

    private static boolean shouldImport(CodefImportType requestedType, CodefImportType candidateType) {
        return requestedType == CodefImportType.ALL || requestedType == candidateType;
    }

    private static boolean isExplicitEmpty(List<String> refs) {
        return refs != null && refs.isEmpty();
    }

    private static void validateConnectedId(String connectedId) {
        if (connectedId == null || connectedId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "connectedId 는 필수입니다.");
        }
    }

    private record ResolvedRefs(List<String> accountRefs, List<String> cardRefs, List<String> loanRefs) {
    }
}
