package com.samhanair.logis.accounting.client.codef;

import com.samhanair.logis.accounting.client.AccountInfo;
import com.samhanair.logis.accounting.client.CardInfo;
import com.samhanair.logis.accounting.client.LoanInfo;
import com.samhanair.logis.accounting.client.codef.dto.CodefRegisterCommand;
import com.samhanair.logis.accounting.client.codef.dto.CodefRegisterResult;
import java.util.List;

/**
 * easyCodef 공식 SDK를 감싸는 얇은 포트.
 *
 * <p>실 SDK 구현은 후속 Task 6에서 제공한다. 본 포트는 서비스/컨트롤러/IT가 실 CODEF
 * 네트워크를 호출하지 않고 connectedId 등록 흐름을 검증할 수 있게 분리한다.
 */
public interface EasyCodefClient {

    /**
     * 기관 자격을 CODEF에 등록하거나 기존 connectedId에 추가한다.
     *
     * @param command 등록 명령. {@code connectedId}가 없으면 create, 있으면 add 경로로 해석한다.
     * @return CODEF 등록 결과
     */
    CodefRegisterResult registerInstitution(CodefRegisterCommand command);

    /**
     * connectedId에 등록된 은행계좌 표시 목록을 조회한다.
     *
     * @param connectedId CODEF 연결 식별자
     * @return 은행계좌 목록
     */
    List<AccountInfo> listBankAccounts(String connectedId);

    /**
     * connectedId에 등록된 카드 표시 목록을 조회한다.
     *
     * @param connectedId CODEF 연결 식별자
     * @return 카드 목록
     */
    List<CardInfo> listCards(String connectedId);

    /**
     * connectedId에 등록된 대출 표시 목록을 조회한다.
     *
     * @param connectedId CODEF 연결 식별자
     * @return 대출 목록
     */
    List<LoanInfo> listLoans(String connectedId);
}
