package com.samhanair.logis.accounting.client;

import java.time.LocalDate;
import java.util.List;

/**
 * CODEF 은행·카드 거래내역 조회 client interface (BC1).
 *
 * <p>전송 방식:
 * <ul>
 *   <li>{@code DRY_RUN} — 실 API 호출 없이 결정적 mock 데이터 반환</li>
 *   <li>{@code CODEF} — 회사 명의 계약·인증키 발급 후 활성. 현 BC1 에서는 placeholder guard 후 미구현 예외</li>
 * </ul>
 */
public interface CodefClient {

    /**
     * 지정 계좌의 CODEF 은행 거래내역을 조회한다.
     *
     * @param from         조회 시작 일자
     * @param to           조회 종료 일자
     * @param accountRef   계좌 표시 식별자
     * @param submitMethod 전송 방식. null/blank 이면 서버 property fallback
     * @return 은행 거래 목록
     */
    List<CodefTxn> fetchBankTransactions(LocalDate from, LocalDate to, String accountRef, String submitMethod);

    /**
     * 지정 카드의 CODEF 카드 승인내역을 조회한다.
     *
     * @param from         조회 시작 일자
     * @param to           조회 종료 일자
     * @param cardRef      카드 표시 식별자
     * @param submitMethod 전송 방식. null/blank 이면 서버 property fallback
     * @return 카드 승인 거래 목록
     */
    List<CodefTxn> fetchCardTransactions(LocalDate from, LocalDate to, String cardRef, String submitMethod);
}
