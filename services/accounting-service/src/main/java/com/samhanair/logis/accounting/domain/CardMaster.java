package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** MIG-2 이카운트 통장계좌/카드 마스터. */
@Entity
@Getter
@Table(name = "card_master")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class CardMaster extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "card_code", nullable = false, length = 50)
    private String cardCode;

    @Column(name = "card_name", nullable = false, length = 100)
    private String cardName;

    @Enumerated(EnumType.STRING)
    @Column(name = "card_type", nullable = false, length = 20)
    private CardType cardType;

    @Column(name = "account_number", length = 50)
    private String accountNumber;

    @Column(name = "linked_account_code", length = 10)
    private String linkedAccountCode;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    private CardMaster(String cardCode, String cardName, CardType cardType,
                       String accountNumber, String linkedAccountCode, String note) {
        this.cardCode = cardCode;
        this.cardName = cardName;
        this.cardType = cardType;
        this.accountNumber = accountNumber;
        this.linkedAccountCode = linkedAccountCode;
        this.note = note;
    }

    public static CardMaster create(String cardCode, String cardName, CardType cardType,
                                    String accountNumber, String linkedAccountCode, String note) {
        return new CardMaster(cardCode, cardName,
                cardType == null ? CardType.BANK_ACCOUNT : cardType,
                accountNumber, linkedAccountCode, note);
    }

    public void updateFromEcount(String cardName, CardType cardType,
                                 String accountNumber, String linkedAccountCode, String note) {
        this.cardName = cardName;
        this.cardType = cardType == null ? CardType.BANK_ACCOUNT : cardType;
        this.accountNumber = accountNumber;
        this.linkedAccountCode = linkedAccountCode;
        this.note = note;
    }
}
