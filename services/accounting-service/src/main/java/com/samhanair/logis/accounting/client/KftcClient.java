package com.samhanair.logis.accounting.client;

import java.time.LocalDate;
import java.util.List;

/**
 * KFTC 오픈뱅킹 입금 거래 조회 client interface (SP-09-4).
 *
 * <p>전송 방식:
 *
 * <ul>
 *   <li>{@code DRY_RUN} (기본) — 즉시 mock 5건 응답. 실 API 호출 없음.
 *       Phase 11 sandbox 연동 전 기본 동작.</li>
 *   <li>{@code KFTC} — KFTC 오픈뱅킹 실 API 호출. ENV {@code KFTC_API_KEY} /
 *       {@code KFTC_CLIENT_ID} / {@code KFTC_CLIENT_SECRET} 3개 키 필요.
 *       Phase 11 sandbox 연동 시 활성화. 현 슬라이스는 구조만 준비 → {@code KFTC_SUBMIT_FAILED} 발생.</li>
 * </ul>
 *
 * <p>구현체: {@link KftcClientImpl}. IT 에서는 {@code @MockBean} 격리 의무
 * (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 */
public interface KftcClient {

    /**
     * 지정 계좌의 입금 거래 내역을 조회한다.
     *
     * <p>DRY_RUN 모드: mock 5건 즉시 반환.
     * KFTC 모드: 실 API 호출 — 현 슬라이스 미구현 → {@code KFTC_SUBMIT_FAILED} 예외.
     *
     * @param from          조회 시작 일자 (포함)
     * @param to            조회 종료 일자 (포함)
     * @param accountFinNo  계좌 금융기관 코드 (선택, null 허용)
     * @param submitMethod  전송 방식 ("DRY_RUN" | "KFTC"). null/blank 이면 서버 property fallback.
     * @return 입금 거래 목록 (DRY_RUN: 5건, KFTC: API 응답)
     * @throws com.samhanair.logis.common.exception.BusinessException(KFTC_SUBMIT_FAILED)
     *         KFTC 모드에서 API 키 미설정, placeholder 사용, 또는 API 호출 실패 시
     */
    List<KftcDepositRecord> fetchDeposits(LocalDate from, LocalDate to,
                                          String accountFinNo, String submitMethod);
}
