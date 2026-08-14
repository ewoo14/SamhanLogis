package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.domain.SlipNumberSequence;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipNumberSequenceRepository;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 전표번호 채번 — {@code yyyy/MM/dd-N} 형식. 날짜 + 전표 유형별 {@link SlipNumberSequence} 를
 * 트랜잭션 안에서 조회/생성/증가시키고 {@code yyyy/MM/dd-N} 문자열로 포맷한다.
 *
 * <p>동시 충돌은 {@code slips(slip_type, slip_no) WHERE is_deleted=false} 의 partial
 * unique 인덱스가 백업 — 호출 측이 충돌 시 재시도 정책 결정.
 */
@Service
@RequiredArgsConstructor
public class SlipNumberService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    private final SlipNumberSequenceRepository sequenceRepository;

    /**
     * 다음 출고 전표번호를 채번한다. 기존 호출자 호환용이며 신규 코드는 {@link #next(LocalDate, SlipType)} 를 사용한다.
     *
     * @param slipDate 채번 기준 날짜
     * @return {@code yyyy/MM/dd-N} 형식 전표번호 문자열
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public String next(LocalDate slipDate) {
        return next(slipDate, SlipType.OUTBOUND);
    }

    /**
     * 다음 전표번호를 채번한다 — 시퀀스 조회 → 없으면 새로 생성 → next() → {@code yyyy/MM/dd-N} 포맷.
     *
     * <p>호출 트랜잭션이 있으면 합류, 없으면 새로 시작 (REQUIRED). 같은 트랜잭션 안에서 호출되면
     * lastSeq 갱신은 같은 영속성 컨텍스트에서 일어난다.
     *
     * @param slipDate 채번 기준 날짜
     * @param slipType 판매/입고 전표 유형. 유형별로 같은 날짜의 순번이 독립 증가한다.
     * @return {@code yyyy/MM/dd-N} 형식 전표번호 문자열
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public String next(LocalDate slipDate, SlipType slipType) {
        SlipNumberSequence seq = loadOrCreateLockedSequence(slipDate, slipType);
        int seqNo = seq.next();
        return slipDate.format(DATE_FMT) + "-" + seqNo;
    }

    /**
     * 날짜 + 전표 유형별 채번 row 를 배타 잠금으로 확보한다.
     *
     * <p>기존 구현은 row 조회 후 같은 lastSeq 를 여러 트랜잭션이 동시에 증가시킬 수 있어 실제
     * 슬립 INSERT 시 {@code ux_slips_slip_type_no_active} 중복으로 500 이 발생했다. 기존 DB
     * 보조 테이블을 그대로 사용하되 row-level lock 으로 채번 자체를 직렬화한다. 최초 row 생성
     * 경합은 {@code INSERT ... ON CONFLICT DO NOTHING} 으로 예외 없이 수렴시킨 뒤 잠금 조회한다.
     *
     * @param slipDate 채번 기준 날짜
     * @param slipType 판매/입고 전표 유형
     * @return 잠금이 확보된 채번 row
     */
    private SlipNumberSequence loadOrCreateLockedSequence(LocalDate slipDate, SlipType slipType) {
        sequenceRepository.insertIfAbsent(UUID.randomUUID(), slipDate, slipType.name());
        return sequenceRepository.findLockedBySlipDateAndSlipType(slipDate, slipType)
                .orElseThrow(() -> new IllegalStateException("전표번호 시퀀스 생성 실패"));
    }

    /**
     * {@link #next} 의 결과 문자열에서 순번 부분만 분리해 반환 — 도메인의 {@code seqNo} 컬럼 채움용.
     *
     * @param slipNo {@link #next} 가 반환한 문자열
     * @return 순번 정수 (1, 2, 3, ...)
     */
    public int extractSeqNo(String slipNo) {
        int dashIdx = slipNo.lastIndexOf('-');
        return Integer.parseInt(slipNo.substring(dashIdx + 1));
    }
}
