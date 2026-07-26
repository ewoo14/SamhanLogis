package com.samhanair.logis.slip.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 전표 라인 단가의 권위 도메인 — #937 재수렴 6차, 개발책임자 결정 A안 (2026-07-27).
 *
 * <p>전표 라인은 단가 컬럼을 두 개 갖는다({@code unit_price} = VAT 제외, {@code unit_price_with_vat}
 * = VAT 포함). 그중 <b>어느 쪽이 사용자가 입력한 값이고 어느 쪽이 BE 파생값인지</b>는 저장하는
 * 순간에만 알 수 있는데, 그 정보를 남기지 않아 표시 계층이 "저장값 × 수량이 어느 총액과
 * 맞아떨어지는가"로 <b>추측</b>해 왔다. 그 판정은 원리적으로 닫히지 않는다 — 같은 행
 * {@code 100000|100000|200000|20000|2} 에 대해 "구 BE 오염"이라면 유도(110,000)가, 2026-07-25
 * 결정 P4("단가는 결코 역산되지 않는다")라면 보존(100,000)이 정답인데 두 경우의 저장 상태가
 * 완전히 같기 때문이다.
 *
 * <p>따라서 판정식을 다시 고치는 대신 <b>저장 시점에 도메인을 기록</b>한다. 이 값이 있는 행은
 * 휴리스틱 판정이 아예 불필요하고, 값이 없는 legacy 행({@code null})만 현행 휴리스틱으로 해석한다.
 *
 * <p>🚨 <b>이 enum 은 화면에 표시하지 않는다</b> — 저장 계약을 기록하는 기술 식별자다.
 * 값 집합은 {@code V59__add_slip_line_unit_price_domain.sql} 의 CHECK 제약과 1:1 이므로,
 * 상수를 추가하려면 CHECK 제약 마이그레이션을 반드시 동반해야 한다.
 */
@Getter
@RequiredArgsConstructor
public enum UnitPriceDomain {

    /**
     * {@code unit_price_with_vat} 가 이 라인의 VAT 포함 단가다 — 2026-06-09 개발책임자 확정으로
     * 화면 "단가"는 부가세 포함이므로, 사용자 입력을 받는 모든 경로가 이 도메인이다.
     * {@code unit_price} 는 권위 공급가액에서 유도한 파생 컬럼({@code S ÷ Q})이다.
     */
    VAT_INCLUSIVE("VAT 포함 단가"),

    /**
     * {@code unit_price} 가 이 라인의 VAT 제외 공급 단가다 — 평문 생성 팩토리
     * ({@link SlipLine#create}) 경로. {@code unit_price_with_vat} 는 그로부터 파생된
     * 값({@code 단가 × 1.1})이다.
     */
    SUPPLY("VAT 제외 공급 단가");

    private final String displayName;
}
