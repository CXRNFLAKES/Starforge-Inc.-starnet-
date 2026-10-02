# StarForge Testing Variant

The testing variant is a deliberately isolated governance environment.

It is designed for:
- authority tests
- simulated approvals/denials
- Board/PA/CEO workflow tests
- failure-mode tests
- future UI demo scenarios

Safety properties:
- in-memory state
- no provider calls
- no real-money movement
- no production ledger writes
- no external side effects

Run:

`npm run test:governance`

The broader suite remains available through the repository's existing test commands.
