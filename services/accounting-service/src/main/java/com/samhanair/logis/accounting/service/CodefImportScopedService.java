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
     * <p>해석 규칙(#825 슬5 R1 정정 — spec §0 표 ③ "선택 리스트 {@code []} = 전체" 는 실측 오류였다.
     * 실제 전체 materialize 는 세 ref 배열이 모두 {@code null}(필드 자체 부재)일 때이며,
     * 저장된 선택의 ref 가 {@code []} 인 것은 그 자체로 '전체'를 뜻하지 않는다 — 반드시
     * {@link UserCodefImportScope#getScopeMode()} 로 판별해야 한다):
     * <ul>
     *     <li>{@code type=ALL} 이고 세 ref 배열이 모두 explicit 빈 배열이면 저장된 선택을 사용한다.
     *         저장된 scope 의 {@code scopeMode=ALL} 이면 (refs 는 설계상 비어 있으므로) 서버 목록
     *         전체를 열거하고, {@code scopeMode=SELECTED} 면 저장된 ref 목록을 사용한다.</li>
     *     <li>세 ref 배열이 모두 {@code null}(필드 부재)이면 서버 목록 전체를 열거한다(진짜 전체).</li>
     *     <li>하나라도 배열이 지정되면 지정된 ref 만 사용한다.</li>
     * </ul>
     *
     * <p>#825 슬5 R1 BLOCKING#1 fix — 종전에는 저장된 scope 의 scopeMode 를 보지 않고 ref 가
     * 비어 있으면 무조건 "저장된 선택이 비어 있습니다" 400 을 던져, ALL 로 저장한 직후 가져오기가
     * 자기모순적으로 실패했다(저장은 성공·직후 가져오기는 400).
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
            if ("ALL".equals(scope.getScopeMode())) {
                // #825 슬5 R1 BLOCKING#1 — 저장 당시 '전체'(scopeMode=ALL)였다면 refs 는 설계상
                // 비어 있다(D-S5-02). 이를 "저장 선택이 없음"으로 오판해 거부하지 않고, 진짜 전체
                // 열거로 materialize한다 — ALL 저장 직후 가져오기가 자기모순으로 400 나던 결함의 근본 fix.
                return listAllFromCodef(type, connectedId, submitMethod);
            }
            List<String> savedAccountRefs = CodefRefNormalizer.normalizeRefs(scope.getAccountRefSelections());
            List<String> savedCardRefs = CodefRefNormalizer.normalizeRefs(scope.getCardRefSelections());
            List<String> savedLoanRefs = CodefRefNormalizer.normalizeRefs(scope.getLoanRefSelections());
            if (savedAccountRefs.isEmpty() && savedCardRefs.isEmpty() && savedLoanRefs.isEmpty()) {
                // scopeMode=SELECTED 는 저장 시점에 선택 목록이 비면 400 으로 거부되므로(D-S5-02)
                // 정상 경로로는 도달하지 않는다 — 방어적 가드로 유지.
                throw new BusinessException(ErrorCode.INVALID_INPUT, EMPTY_SAVED_SCOPE_MESSAGE);
            }
            return new ResolvedRefs(
                    savedAccountRefs,
                    savedCardRefs,
                    savedLoanRefs);
        }

        boolean anyExplicit = accountRefs != null || cardRefs != null || loanRefs != null;
        if (!anyExplicit) {
            return listAllFromCodef(type, connectedId, submitMethod);
        }

        return new ResolvedRefs(
                accountRefs == null ? List.of() : CodefRefNormalizer.normalizeRefs(accountRefs),
                cardRefs == null ? List.of() : CodefRefNormalizer.normalizeRefs(cardRefs),
                loanRefs == null ? List.of() : CodefRefNormalizer.normalizeRefs(loanRefs));
    }

    /** CODEF 서버 목록 전체를 열거해 진짜 '전체' 를 materialize한다(진짜 ALL — null 필드 부재 의미). */
    private ResolvedRefs listAllFromCodef(CodefImportType type, String connectedId, String submitMethod) {
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

    private static boolean shouldImport(CodefImportType requestedType, CodefImportType candidateType) {
        return requestedType == CodefImportType.ALL || requestedType == candidateType;
    }

    private static boolean isExplicitEmpty(List<String> refs) {
        return refs != null && refs.isEmpty();
    }

    private static void validateConnectedId(String connectedId) {
        if (connectedId == null || connectedId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "연결 식별자는 필수입니다.");
        }
    }

    private record ResolvedRefs(List<String> accountRefs, List<String> cardRefs, List<String> loanRefs) {
    }
}
