package com.samhanair.logis.accounting.client.codef;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.AccountInfo;
import com.samhanair.logis.accounting.client.CardInfo;
import com.samhanair.logis.accounting.client.LoanInfo;
import com.samhanair.logis.accounting.client.codef.dto.CodefRegisterCommand;
import com.samhanair.logis.accounting.client.codef.dto.CodefRegisterResult;
import com.samhanair.logis.accounting.config.CodefProperties;
import com.samhanair.logis.common.exception.BusinessException;
import io.codef.api.EasyCodef;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** EasyCodef 응답 파싱과 순수 매핑 로직 단위 테스트. */
class EasyCodefClientImplTest {

    @Test
    @DisplayName("CF-00000 등록 응답은 ACTIVE와 connectedId로 매핑한다")
    void parseRegisterResult_success() {
        String json = """
                {
                  "result": {"code": "CF-00000", "message": "정상"},
                  "data": {"connectedId": "conn-001", "successList": []}
                }
                """;

        CodefRegisterResult result = EasyCodefClientImpl.parseRegisterResult(json);

        assertThat(result.connectedId()).isEqualTo("conn-001");
        assertThat(result.status()).isEqualTo("ACTIVE");
        assertThat(result.message()).isEqualTo("정상");
    }

    @Test
    @DisplayName("CF-03002 등록 응답은 ADDITIONAL_AUTH로 매핑한다")
    void parseRegisterResult_additionalAuth() {
        String json = """
                {
                  "result": {"code": "CF-03002", "message": "추가 인증 필요"},
                  "data": {"continue2Way": true}
                }
                """;

        CodefRegisterResult result = EasyCodefClientImpl.parseRegisterResult(json);

        assertThat(result.connectedId()).isNull();
        assertThat(result.status()).isEqualTo("ADDITIONAL_AUTH");
        assertThat(result.message()).isEqualTo("추가 인증 필요");
    }

    @Test
    @DisplayName("오류 등록 응답은 ERROR와 CODEF 메시지로 매핑한다")
    void parseRegisterResult_error() {
        String json = """
                {
                  "result": {"code": "CF-99999", "message": "기관 오류"}
                }
                """;

        CodefRegisterResult result = EasyCodefClientImpl.parseRegisterResult(json);

        assertThat(result.connectedId()).isNull();
        assertThat(result.status()).isEqualTo("ERROR");
        assertThat(result.message()).isEqualTo("기관 오류");
    }

    @Test
    @DisplayName("BANK/CARD 업무 구분은 CODEF BK/CD 값으로 매핑한다")
    void businessTypeToCodefValue() {
        assertThat(EasyCodefClientImpl.toCodefBusinessType("BANK")).isEqualTo("BK");
        assertThat(EasyCodefClientImpl.toCodefBusinessType("CARD")).isEqualTo("CD");
        assertThat(EasyCodefClientImpl.toCodefBusinessType("LOAN")).isEqualTo("BK");
    }

    @Test
    @DisplayName("SANDBOX 마스킹 보유계좌 응답의 예금·대출 배열을 AccountInfo와 LoanInfo로 매핑한다")
    void parseBankAccountsAndLoans() {
        String json = """
                {
                  "result": {"code": "****", "message": "****"},
                  "data": {
                    "resDepositTrust": [{
                      "resAccount": "06170204000000",
                      "resAccountDisplay": "061702-04-000000",
                      "resAccountName": "저축예금",
                      "resAccountNickName": "급여통장"
                    }],
                    "resLoan": [{
                      "resAccount": "75260904000000",
                      "resAccountDisplay": "752609-04-000000",
                      "resAccountName": "운전자금대출"
                    }]
                  }
                }
                """;

        List<AccountInfo> accounts = EasyCodefClientImpl.parseBankAccounts(json, "국민은행");
        List<LoanInfo> loans = EasyCodefClientImpl.parseLoans(json, "국민은행");

        assertThat(accounts).containsExactly(
                new AccountInfo("06170204000000", "급여통장", "국민은행", "061702-04-000000"));
        assertThat(loans).containsExactly(
                new LoanInfo("75260904000000", "운전자금대출", "국민은행", "운전자금대출"));
    }

    @Test
    @DisplayName("SANDBOX 마스킹 코드라도 data가 null이면 오류 처리한다(빈 목록 오반환 방지 — Opus 라운드2)")
    void parseBankAccounts_maskedCodeWithNullData_throws() {
        String json = """
                {"result": {"code": "****", "message": "****"}, "data": null}
                """;

        assertThatThrownBy(() -> EasyCodefClientImpl.parseBankAccounts(json, "국민은행"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("보유카드 응답 배열을 CardInfo로 매핑한다")
    void parseCards() {
        String json = """
                {
                  "result": {"code": "CF-00000", "message": "성공"},
                  "data": [{
                    "resCardName": "할인카드",
                    "resCardNo": "6253********0000",
                    "resCardType": "신용/본인"
                  }]
                }
                """;

        List<CardInfo> cards = EasyCodefClientImpl.parseCards(json, "우리카드");

        assertThat(cards).containsExactly(
                new CardInfo("6253********0000", "할인카드", "우리카드", "6253********0000"));
    }

    @Test
    @DisplayName("getAccountList 등록기관은 organizationCode 필드로 파싱한다(라이브 QA 회귀 박제)")
    void parseRegisteredOrganizations_usesOrganizationCodeField() {
        // 실 CODEF SANDBOX getAccountList 응답 스키마: data.accountList[].organizationCode ("organization" 아님)
        String json = """
                {
                  "result": {"code": "CF-00000", "message": "성공"},
                  "data": {"accountList": [
                    {"businessType": "BK", "organizationCode": "0004", "countryCode": "KR"},
                    {"businessType": "CD", "organizationCode": "0301", "countryCode": "KR"}
                  ]}
                }
                """;

        var banks = EasyCodefClientImpl.parseRegisteredOrganizations(json, "BK");
        var cards = EasyCodefClientImpl.parseRegisteredOrganizations(json, "CD");

        assertThat(banks).hasSize(1);
        assertThat(banks.get(0).code()).isEqualTo("0004");
        assertThat(cards).hasSize(1);
        assertThat(cards.get(0).code()).isEqualTo("0301");
    }

    @Test
    @DisplayName("구 필드명 organization 만 있는 응답은 빈 목록(필드명 회귀 가드)")
    void parseRegisteredOrganizations_ignoresLegacyOrganizationField() {
        // organizationCode 가 없고 구 "organization" 만 있으면 매칭 안 됨 → CODEF 모드 list 공란 회귀 차단.
        String json = """
                {
                  "result": {"code": "CF-00000", "message": "성공"},
                  "data": {"accountList": [{"businessType": "BK", "organization": "0004"}]}
                }
                """;

        assertThat(EasyCodefClientImpl.parseRegisteredOrganizations(json, "BK")).isEmpty();
    }

    @Test
    @DisplayName("기관 등록 SDK 경로도 placeholder 공개키를 차단한다")
    void registerInstitution_blocksPlaceholderPublicKey() {
        CodefProperties properties = new CodefProperties();
        ReflectionTestUtils.setField(properties, "publicKey", "CHANGE_ME_LOCAL_ONLY");
        EasyCodefClientImpl client = new EasyCodefClientImpl(mock(EasyCodef.class), properties);

        assertThatThrownBy(() -> client.registerInstitution(new CodefRegisterCommand(
                null,
                "BANK",
                "0004",
                "5",
                Map.of("id", "sandbox"))))
                .isInstanceOf(BusinessException.class)
                .hasMessage("CODEF 공개키 설정 값이 올바르지 않습니다. 관리자에게 문의하세요.");
    }

    @Test
    @DisplayName("SANDBOX getAccountList가 CD를 누락해도 카드 검증 목록은 0301 fallback으로 조회한다")
    void listCards_usesSandboxFallbackWhenAccountListOmitsCards() throws Exception {
        CodefProperties properties = new CodefProperties();
        ReflectionTestUtils.setField(properties, "publicKey", "real-codef-public-key");
        EasyCodef easyCodef = mock(EasyCodef.class);
        when(easyCodef.getAccountList(any(), any())).thenReturn("""
                {
                  "result": {"code": "CF-00000", "message": "성공"},
                  "data": {"accountList": [
                    {"businessType": "BK", "organizationCode": "0004", "countryCode": "KR"}
                  ]}
                }
                """);
        when(easyCodef.requestProduct(eq(EasyCodefClientImpl.CARD_PRODUCT_URL), any(), any())).thenReturn("""
                {
                  "result": {"code": "CF-00000", "message": "성공"},
                  "data": [{"resCardName": "할인카드", "resCardNo": "6253********0000"}]
                }
                """);
        EasyCodefClientImpl client = new EasyCodefClientImpl(easyCodef, properties);

        List<CardInfo> cards = client.listCards("conn-001");

        assertThat(cards).containsExactly(
                new CardInfo("6253********0000", "할인카드", "국민카드", "6253********0000"));
    }
}
