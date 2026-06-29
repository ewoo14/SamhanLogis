package com.samhanair.logis.accounting.client.codef;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.client.AccountInfo;
import com.samhanair.logis.accounting.client.CardInfo;
import com.samhanair.logis.accounting.client.LoanInfo;
import com.samhanair.logis.accounting.client.codef.dto.CodefRegisterResult;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

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
    @DisplayName("보유계좌 응답의 예금·대출 배열을 AccountInfo와 LoanInfo로 매핑한다")
    void parseBankAccountsAndLoans() {
        String json = """
                {
                  "result": {"code": "CF-00000", "message": "성공"},
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
}
