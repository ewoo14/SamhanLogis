# Codex CODEF Task6 Live QA (2026-06-29)

- SDK: io.codef.api:easycodef-java:1.0.6
- ServiceType: SANDBOX
- createAccount(BANK): org=0004, loginType=5, status=ACTIVE, connectedId=[REDACTED]
- addAccount(CARD on bank connectedId): org=0301, loginType=5, status=ACTIVE
- createAccount(CARD): org=0301, loginType=5, status=ACTIVE, connectedId=[REDACTED]
- bank connectedId getAccountList: result.code=CF-00000, BK=2, CD=0, organizationCode.present=true
- card connectedId getAccountList: result.code=CF-00000, BK=2, CD=0
- EasyCodefClientImpl.listCards(bank connectedId): PASS count=3; first.cardNumber=6056********0000, issuerName=국민카드
- EasyCodefClientImpl.listCards(card connectedId): PASS count=3
- direct card requestProduct(org=0301): result.code=CF-00000, rawCards=3
- direct bank requestProduct(org=0004): result.code=**** (SANDBOX masks bank product result.code), client.listBankAccounts=PASS count=10
- client.listLoans=PASS count=0
- note: SANDBOX getAccountList returns fixed BK-only rows even after CARD registration; listCards uses 0301 sandbox fallback.
- credentials and connectedId are redacted; transactionId is redacted in JSON artifacts.
