package com.samhanair.logis.accounting.client.codef;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.client.AccountInfo;
import com.samhanair.logis.accounting.client.CardInfo;
import com.samhanair.logis.accounting.client.LoanInfo;
import com.samhanair.logis.accounting.client.codef.dto.CodefRegisterCommand;
import com.samhanair.logis.accounting.client.codef.dto.CodefRegisterResult;
import com.samhanair.logis.accounting.config.CodefProperties;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import io.codef.api.EasyCodef;
import io.codef.api.EasyCodefServiceType;
import io.codef.api.EasyCodefUtil;
import java.io.UnsupportedEncodingException;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** easyCodef 공식 SDK를 사용하는 CODEF 샌드박스 클라이언트 구현체. */
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "codef.submit-method", havingValue = "CODEF")
public class EasyCodefClientImpl implements EasyCodefClient {

    static final String BANK_ACCOUNT_PRODUCT_URL = "/v1/kr/bank/b/account/account-list";
    static final String CARD_PRODUCT_URL = "/v1/kr/card/p/account/card-list";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final EasyCodefServiceType SERVICE_TYPE = EasyCodefServiceType.SANDBOX;
    private static final String SUCCESS_CODE = "CF-00000";
    private static final String ADDITIONAL_AUTH_CODE = "CF-03002";

    private final EasyCodef easyCodef;
    private final CodefProperties properties;

    /**
     * 금융기관 자격을 CODEF connectedId에 등록한다.
     *
     * @param command 등록 명령
     * @return 등록 결과
     */
    @Override
    public CodefRegisterResult registerInstitution(CodefRegisterCommand command) {
        validatePublicKey();
        HashMap<String, Object> parameterMap = registerParameter(command);
        String response = invokeSdk(() -> hasText(command.connectedId())
                ? easyCodef.addAccount(SERVICE_TYPE, parameterMap)
                : easyCodef.createAccount(SERVICE_TYPE, parameterMap));
        return parseRegisterResult(response);
    }

    /**
     * connectedId에 등록된 은행 보유계좌를 조회한다.
     *
     * @param connectedId CODEF 연결 식별자
     * @return 은행계좌 목록
     */
    @Override
    public List<AccountInfo> listBankAccounts(String connectedId) {
        validateConnectedId(connectedId);
        return registeredOrganizations(connectedId, "BK").stream()
                .flatMap(organization -> parseBankAccounts(
                        requestProduct(BANK_ACCOUNT_PRODUCT_URL, productParameter(connectedId, organization.code())),
                        organization.displayName()).stream())
                .toList();
    }

    /**
     * connectedId에 등록된 카드 목록을 조회한다.
     *
     * @param connectedId CODEF 연결 식별자
     * @return 카드 목록
     */
    @Override
    public List<CardInfo> listCards(String connectedId) {
        validateConnectedId(connectedId);
        return registeredOrganizations(connectedId, "CD").stream()
                .flatMap(organization -> parseCards(
                        requestProduct(CARD_PRODUCT_URL, productParameter(connectedId, organization.code())),
                        organization.displayName()).stream())
                .toList();
    }

    /**
     * connectedId에 등록된 대출 표시 목록을 조회한다.
     *
     * <p>CODEF 은행 보유계좌 응답의 {@code resLoan} 배열을 대출 목록으로 사용한다.
     *
     * @param connectedId CODEF 연결 식별자
     * @return 대출 목록
     */
    @Override
    public List<LoanInfo> listLoans(String connectedId) {
        validateConnectedId(connectedId);
        return registeredOrganizations(connectedId, "BK").stream()
                .flatMap(organization -> parseLoans(
                        requestProduct(BANK_ACCOUNT_PRODUCT_URL, productParameter(connectedId, organization.code())),
                        organization.displayName()).stream())
                .toList();
    }

    /**
     * 등록 응답 JSON을 서비스 결과 DTO로 변환한다.
     *
     * @param json CODEF 응답 JSON
     * @return 등록 결과
     */
    static CodefRegisterResult parseRegisterResult(String json) {
        JsonNode root = readTree(json);
        JsonNode result = root.path("result");
        String code = text(result, "code");
        String message = firstText(text(result, "message"), text(result, "extraMessage"),
                "CODEF 등록 응답을 처리했습니다.");
        if (SUCCESS_CODE.equals(code)) {
            return new CodefRegisterResult(text(root.path("data"), "connectedId"), "ACTIVE", message);
        }
        if (ADDITIONAL_AUTH_CODE.equals(code)) {
            return new CodefRegisterResult(null, "ADDITIONAL_AUTH", message);
        }
        return new CodefRegisterResult(null, "ERROR", message);
    }

    /**
     * Samhan 업무 구분을 CODEF 업무 코드로 변환한다.
     *
     * @param businessType BANK/CARD/LOAN
     * @return BK/CD
     */
    static String toCodefBusinessType(String businessType) {
        String normalized = businessType == null ? "" : businessType.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "BANK", "LOAN" -> "BK";
            case "CARD" -> "CD";
            default -> throw new BusinessException(ErrorCode.INVALID_INPUT, "기관 업무 구분 값이 올바르지 않습니다");
        };
    }

    /**
     * 은행 보유계좌 응답을 표시 DTO로 변환한다.
     *
     * @param json        CODEF 응답 JSON
     * @param defaultBank 기본 기관명
     * @return 은행계좌 목록
     */
    static List<AccountInfo> parseBankAccounts(String json, String defaultBank) {
        JsonNode root = assertSuccess(json);
        JsonNode data = root.path("data");
        List<AccountInfo> accounts = new ArrayList<>();
        for (String field : List.of("resDepositTrust", "resForeignCurrency", "resFund", "resInsurance")) {
            for (JsonNode node : nodes(data.path(field))) {
                String account = firstText(text(node, "resAccount"), text(node, "resAccountDisplay"));
                if (!hasText(account)) {
                    continue;
                }
                String display = firstText(text(node, "resAccountDisplay"), account);
                String name = firstText(text(node, "resAccountNickName"), text(node, "resAccountName"), display);
                String bankName = firstText(text(node, "resBankName"), defaultBank);
                accounts.add(new AccountInfo(account, name, bankName, display));
            }
        }
        return accounts;
    }

    /**
     * 카드 보유카드 응답을 표시 DTO로 변환한다.
     *
     * @param json          CODEF 응답 JSON
     * @param defaultIssuer 기본 카드사명
     * @return 카드 목록
     */
    static List<CardInfo> parseCards(String json, String defaultIssuer) {
        JsonNode root = assertSuccess(json);
        List<CardInfo> cards = new ArrayList<>();
        for (JsonNode node : nodes(root.path("data"))) {
            String cardNo = firstText(text(node, "resCardNo"), text(node, "resCardNumber"));
            if (!hasText(cardNo)) {
                continue;
            }
            String name = firstText(text(node, "resCardName"), text(node, "resCardType"), cardNo);
            // CODEF 카드 응답엔 발급사 필드가 없어(README: resCardName/resCardNo/resCardType 만 제공) 등록 기관명을 발급사로 사용.
            String issuer = defaultIssuer;
            cards.add(new CardInfo(cardNo, name, issuer, cardNo));
        }
        return cards;
    }

    /**
     * 은행 보유계좌 응답의 대출 배열을 표시 DTO로 변환한다.
     *
     * @param json          CODEF 응답 JSON
     * @param defaultLender 기본 금융기관명
     * @return 대출 목록
     */
    static List<LoanInfo> parseLoans(String json, String defaultLender) {
        JsonNode root = assertSuccess(json);
        List<LoanInfo> loans = new ArrayList<>();
        for (JsonNode node : nodes(root.path("data").path("resLoan"))) {
            String account = firstText(text(node, "resAccount"), text(node, "resAccountDisplay"));
            if (!hasText(account)) {
                continue;
            }
            String name = firstText(text(node, "resAccountName"), text(node, "resAccountDisplay"), account);
            String lender = firstText(text(node, "resBankName"), defaultLender);
            // 대출 유형 = 가독 상품명(resAccountName). resAccountDeposit 은 예금분류 코드("40" 등)라 유형명이 아님(BE 리뷰 적발).
            // resLoan 정확 필드는 SDK README 미수록 → 라이브 QA(샌드박스 실응답)로 확정한다.
            String loanType = name;
            loans.add(new LoanInfo(account, name, lender, loanType));
        }
        return loans;
    }

    private HashMap<String, Object> registerParameter(CodefRegisterCommand command) {
        if (command == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "등록 요청은 필수입니다");
        }
        HashMap<String, Object> account = new HashMap<>();
        account.put("countryCode", "KR");
        account.put("businessType", toCodefBusinessType(command.businessType()));
        account.put("clientType", "P");  // P=개인 기본. 법인(B)은 후속 슬라이스에서 CodefRegisterCommand 로 수용.
        account.put("organization", requireText(command.organization(), "기관 코드는 필수입니다"));
        account.put("loginType", requireText(command.loginType(), "로그인 방식은 필수입니다"));
        if (command.credentials() != null) {
            command.credentials().forEach((key, value) -> putCredential(account, key, value));
        }

        HashMap<String, Object> parameterMap = new HashMap<>();
        if (hasText(command.connectedId())) {
            parameterMap.put("connectedId", command.connectedId().trim());
        }
        parameterMap.put("accountList", List.of(account));
        return parameterMap;
    }

    private void putCredential(HashMap<String, Object> account, String key, String value) {
        if (!hasText(key) || value == null) {
            return;
        }
        account.put(key, shouldEncrypt(key) ? encrypt(value) : value);
    }

    private String encrypt(String plainText) {
        try {
            return EasyCodefUtil.encryptRSA(plainText, properties.getPublicKey().trim());
        } catch (GeneralSecurityException ex) {
            throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                    "CODEF 공개키 암호화에 실패했습니다. 관리자에게 문의하세요.", ex);
        }
    }

    private List<RegisteredOrganization> registeredOrganizations(String connectedId, String businessType) {
        HashMap<String, Object> parameterMap = new HashMap<>();
        parameterMap.put("connectedId", connectedId.trim());
        String response = invokeSdk(() -> easyCodef.getAccountList(SERVICE_TYPE, parameterMap));
        return parseRegisteredOrganizations(response, businessType);
    }

    private String requestProduct(String productUrl, HashMap<String, Object> parameterMap) {
        validatePublicKey();
        return invokeSdk(() -> easyCodef.requestProduct(productUrl, SERVICE_TYPE, parameterMap));
    }

    private HashMap<String, Object> productParameter(String connectedId, String organization) {
        HashMap<String, Object> parameterMap = new HashMap<>();
        parameterMap.put("connectedId", connectedId.trim());
        if (hasText(organization)) {
            parameterMap.put("organization", organization.trim());
        }
        return parameterMap;
    }

    private static List<RegisteredOrganization> parseRegisteredOrganizations(String json, String businessType) {
        JsonNode root = assertSuccess(json);
        JsonNode accountList = root.path("data").path("accountList");
        List<RegisteredOrganization> organizations = new ArrayList<>();
        for (JsonNode node : nodes(accountList)) {
            if (!businessType.equalsIgnoreCase(text(node, "businessType"))) {
                continue;
            }
            String organization = text(node, "organization");
            if (hasText(organization)) {
                organizations.add(new RegisteredOrganization(
                        organization, firstText(text(node, "organizationName"), organization)));
            }
        }
        return organizations;
    }

    private static JsonNode assertSuccess(String json) {
        JsonNode root = readTree(json);
        JsonNode result = root.path("result");
        String code = text(result, "code");
        if (!SUCCESS_CODE.equals(code)) {
            String message = firstText(text(result, "message"), text(result, "extraMessage"),
                    "CODEF 응답이 정상 처리되지 않았습니다.");
            throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED, message);
        }
        return root;
    }

    private static JsonNode readTree(String json) {
        try {
            return OBJECT_MAPPER.readTree(json);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                    "CODEF 응답을 해석하지 못했습니다.", ex);
        }
    }

    private static List<JsonNode> nodes(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return List.of();
        }
        if (node.isArray()) {
            List<JsonNode> values = new ArrayList<>();
            node.forEach(values::add);
            return values;
        }
        return List.of(node);
    }

    private static boolean shouldEncrypt(String key) {
        String lower = key.toLowerCase(Locale.ROOT);
        return lower.contains("password") || lower.endsWith("pwd") || lower.contains("passwd");
    }

    private void validatePublicKey() {
        if (!hasText(properties.getPublicKey())) {
            throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                    "CODEF 공개키 설정이 완료되지 않았습니다. 관리자에게 문의하세요.");
        }
    }

    private static void validateConnectedId(String connectedId) {
        if (!hasText(connectedId)) {
            throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                    "CODEF 연결 등록이 필요합니다. 먼저 금융기관을 등록하세요.");
        }
    }

    private static String requireText(String value, String message) {
        if (!hasText(value)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, message);
        }
        return value.trim();
    }

    private static String text(JsonNode node, String fieldName) {
        JsonNode value = node.path(fieldName);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String text = value.asText();
        return hasText(text) ? text.trim() : null;
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static String invokeSdk(SdkCall call) {
        try {
            return call.execute();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                    "CODEF 요청이 중단되었습니다. 잠시 후 다시 시도해주세요.", ex);
        } catch (UnsupportedEncodingException | JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.CODEF_SUBMIT_FAILED,
                    "CODEF 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", ex);
        }
    }

    @FunctionalInterface
    private interface SdkCall {
        String execute() throws UnsupportedEncodingException, JsonProcessingException, InterruptedException;
    }

    private record RegisteredOrganization(String code, String displayName) {
    }
}
