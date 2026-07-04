package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.AccountInfo;
import com.samhanair.logis.accounting.client.CardInfo;
import com.samhanair.logis.accounting.client.LoanInfo;
import com.samhanair.logis.accounting.client.codef.EasyCodefClient;
import com.samhanair.logis.accounting.client.codef.dto.CodefRegisterCommand;
import com.samhanair.logis.accounting.client.codef.dto.CodefRegisterResult;
import com.samhanair.logis.accounting.domain.codef.CodefBusinessType;
import com.samhanair.logis.accounting.domain.codef.CodefConnection;
import com.samhanair.logis.accounting.domain.codef.CodefConnectionStatus;
import com.samhanair.logis.accounting.domain.codef.CodefInstitutionStatus;
import com.samhanair.logis.accounting.domain.codef.CodefRegisteredInstitution;
import com.samhanair.logis.accounting.repository.CodefConnectionRepository;
import com.samhanair.logis.accounting.repository.CodefRegisteredInstitutionRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * CODEF connectedId 등록과 목록 검증을 오케스트레이션한다.
 *
 * <p>로그인 자격은 {@link CodefRegisterCommand} 지역 값으로만 전달하고, 엔티티에는 connectedId와
 * 기관 메타만 저장한다.
 */
@Service
@RequiredArgsConstructor
public class CodefConnectionService {

    private final Optional<EasyCodefClient> easyCodefClient;
    private final CodefConnectionRepository connectionRepository;
    private final CodefRegisteredInstitutionRepository institutionRepository;

    /**
     * 금융기관을 CODEF connectedId에 등록한다.
     *
     * @param command 등록 명령
     * @return 등록 기관 표시 정보
     */
    @Transactional
    public RegisteredInstitutionView registerInstitution(CodefRegisterCommand command) {
        validateCommand(command);
        connectionRepository.lockRegistration();
        Optional<CodefConnection> active = activeConnectionOptional();
        String existingConnectedId = active.map(CodefConnection::getConnectedId).filter(CodefConnectionService::hasText)
                .orElse(null);
        Map<String, String> credentials = command.credentials() == null ? Map.of() : Map.copyOf(command.credentials());

        CodefRegisterResult result = requireEasyCodefClient().registerInstitution(new CodefRegisterCommand(
                existingConnectedId,
                command.businessType(),
                command.organization(),
                command.loginType(),
                credentials));

        String effectiveConnectedId = firstText(result.connectedId(), existingConnectedId);
        CodefInstitutionStatus institutionStatus = institutionStatusOf(result.status());
        CodefConnectionStatus connectionStatus = institutionStatus == CodefInstitutionStatus.ERROR
                ? CodefConnectionStatus.ERROR
                : CodefConnectionStatus.ACTIVE;
        if (connectionStatus == CodefConnectionStatus.ACTIVE && !hasText(effectiveConnectedId)) {
            throw notRegistered();
        }
        CodefConnection connection = connectionRepository.findFirstByIsDeletedFalseOrderByCreatedAtAsc()
                .orElseGet(() -> CodefConnection.create(effectiveConnectedId, connectionStatus));
        connection.update(effectiveConnectedId, connectionStatus);
        CodefConnection savedConnection = saveConnection(connection);

        // 멱등 등록: 동일 자연키(connection+businessType+organizationCode)의 활성 행이 있으면 재사용해
        // 활성 중복을 만들지 않는다(자연키 해제의 대상 모호성 차단). lockRegistration() 하에서 직렬화됨.
        CodefBusinessType businessType = businessTypeOf(command.businessType());
        CodefRegisteredInstitution institution = institutionRepository
                .findFirstByConnectionAndBusinessTypeAndOrganizationCodeAndIsDeletedFalseOrderByRegisteredAtDesc(
                        savedConnection, businessType, command.organization().trim())
                .map(existing -> existing.reregister(institutionStatus))
                .orElseGet(() -> CodefRegisteredInstitution.create(
                        savedConnection,
                        businessType,
                        command.organization(),
                        null,
                        null,
                        institutionStatus));
        CodefRegisteredInstitution savedInstitution = institutionRepository.save(institution);
        return RegisteredInstitutionView.from(savedInstitution, result.message());
    }

    /**
     * 등록된 CODEF 기관 목록을 조회한다.
     *
     * @return 기관 목록
     */
    @Transactional(readOnly = true)
    public List<RegisteredInstitutionView> listRegistered() {
        CodefConnection connection = storedConnection();
        return institutionRepository.findByConnectionAndIsDeletedFalseOrderByRegisteredAtDesc(connection).stream()
                .map(institution -> RegisteredInstitutionView.from(institution, null))
                .toList();
    }

    /**
     * 등록된 CODEF 기관을 업무구분+기관코드 자연키로 해제한다.
     *
     * @param businessType 업무 구분(BANK/CARD/LOAN)
     * @param organizationCode 기관 코드
     * @param actor 해제 수행자 식별자
     * @return 해제된 기관 표시 정보
     */
    @Transactional
    public RegisteredInstitutionView unregisterInstitution(
            String businessType,
            String organizationCode,
            String actor) {
        connectionRepository.lockRegistration();
        CodefConnection connection = storedConnection();
        CodefBusinessType type = businessTypeOf(businessType);
        if (!hasText(organizationCode)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "기관 코드는 필수입니다");
        }
        CodefRegisteredInstitution institution = institutionRepository
                .findFirstByConnectionAndBusinessTypeAndOrganizationCodeAndIsDeletedFalseOrderByRegisteredAtDesc(
                        connection,
                        type,
                        organizationCode.trim())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "등록된 CODEF 기관을 찾을 수 없습니다."));
        institution.unregister(actor);
        return RegisteredInstitutionView.from(institutionRepository.saveAndFlush(institution), null);
    }

    /**
     * CODEF 은행계좌 목록을 조회한다.
     *
     * @return 은행계좌 목록
     */
    @Transactional(readOnly = true)
    public List<AccountInfo> listAccounts() {
        return requireEasyCodefClient().listBankAccounts(activeConnectedId());
    }

    /**
     * CODEF 카드 목록을 조회한다.
     *
     * @return 카드 목록
     */
    @Transactional(readOnly = true)
    public List<CardInfo> listCards() {
        return requireEasyCodefClient().listCards(activeConnectedId());
    }

    /**
     * CODEF 대출 목록을 조회한다.
     *
     * @return 대출 목록
     */
    @Transactional(readOnly = true)
    public List<LoanInfo> listLoans() {
        return requireEasyCodefClient().listLoans(activeConnectedId());
    }

    private CodefConnection activeConnection() {
        return activeConnectionOptional()
                .orElseThrow(CodefConnectionService::notRegistered);
    }

    private CodefConnection storedConnection() {
        return connectionRepository.findFirstByIsDeletedFalseOrderByCreatedAtAsc()
                .orElseThrow(CodefConnectionService::notRegistered);
    }

    private String activeConnectedId() {
        String connectedId = activeConnection().getConnectedId();
        if (!hasText(connectedId)) {
            throw notRegistered();
        }
        return connectedId;
    }

    private Optional<CodefConnection> activeConnectionOptional() {
        return connectionRepository
                .findFirstByStatusAndConnectedIdIsNotNullAndIsDeletedFalseOrderByCreatedAtAsc(
                        CodefConnectionStatus.ACTIVE)
                .filter(connection -> hasText(connection.getConnectedId()));
    }

    private CodefConnection saveConnection(CodefConnection connection) {
        // 등록 경로는 registerInstitution() 의 lockRegistration()(pg_advisory_xact_lock) 으로 직렬화되고,
        // 기존 connection 은 in-place 갱신(findFirstByIsDeletedFalse → update)하므로
        // uq_codef_connection_single_active 동시 INSERT 경합이 발생하지 않는다.
        // 과거 DataIntegrityViolationException catch 후 재조회는 같은 트랜잭션이 PostgreSQL 에서 abort 되어
        // ("current transaction is aborted") 무효였다(소급 0수렴 재리뷰 적발) → 제거하고 위반은 그대로 전파한다.
        return connectionRepository.saveAndFlush(connection);
    }

    private EasyCodefClient requireEasyCodefClient() {
        return easyCodefClient.orElseThrow(() -> new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                "CODEF SDK 구현이 아직 연결되지 않았습니다. 관리자에게 문의하세요."));
    }

    private static void validateCommand(CodefRegisterCommand command) {
        if (command == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "등록 요청은 필수입니다");
        }
        businessTypeOf(command.businessType());
        if (!hasText(command.organization())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "기관 코드는 필수입니다");
        }
        if (!hasText(command.loginType())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "로그인 방식은 필수입니다");
        }
        if (command.credentials() == null || command.credentials().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "기관 로그인 자격은 필수입니다");
        }
    }

    private static CodefBusinessType businessTypeOf(String value) {
        try {
            return CodefBusinessType.valueOf(value == null ? "" : value.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "기관 업무 구분 값이 올바르지 않습니다", ex);
        }
    }

    private static CodefInstitutionStatus institutionStatusOf(String value) {
        try {
            return CodefInstitutionStatus.valueOf(value == null ? "ERROR" : value.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            return CodefInstitutionStatus.ERROR;
        }
    }

    private static BusinessException notRegistered() {
        return new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                "CODEF 연결 등록이 필요합니다. 먼저 금융기관을 등록하세요.");
    }

    private static String firstText(String primary, String fallback) {
        return hasText(primary) ? primary.trim() : fallback;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    /**
     * 등록 기관 API 표시 정보. 내부 UUID와 connectedId는 포함하지 않는다.
     *
     * @param businessType      업무 구분
     * @param organizationCode  기관 코드
     * @param accountIdentifier 마스킹된 계좌·카드 식별자
     * @param nickname          별칭
     * @param status            등록 상태
     * @param registeredAt      등록 시각
     * @param lastVerifiedAt    마지막 검증 시각
     * @param message           CODEF 안내 메시지
     */
    public record RegisteredInstitutionView(
            CodefBusinessType businessType,
            String organizationCode,
            String accountIdentifier,
            String nickname,
            CodefInstitutionStatus status,
            LocalDateTime registeredAt,
            LocalDateTime lastVerifiedAt,
            String message
    ) {
        public static RegisteredInstitutionView from(CodefRegisteredInstitution institution, String message) {
            return new RegisteredInstitutionView(
                    institution.getBusinessType(),
                    institution.getOrganizationCode(),
                    institution.getAccountIdentifier(),
                    institution.getNickname(),
                    institution.getStatus(),
                    institution.getRegisteredAt(),
                    institution.getLastVerifiedAt(),
                    message);
        }
    }
}
