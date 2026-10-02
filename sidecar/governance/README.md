# StarForge Governance Kernel

The governance kernel establishes the company's constitutional control layer.

## Authority

Human CHO is the final decision-maker. AI roles are operational or advisory unless an explicit delegated action exists.

- CHO: final human authority.
- Main Overseer / PA: direct CHO interface, independent review, investigation, and escalation.
- Board: strategy, governance, oversight, and delegated decisions.
- CEO / Sub-Overseer: operational execution and delegation.
- Accountant/CFO: financial records and management.
- Risk: independent risk assessment.
- Executives/workers: delegated execution.

## Security rules

1. Role identity never implies unrestricted authority.
2. Authorization is enforced server-side.
3. UI text, prompts, model output, and agent claims are never authorization.
4. CHO-reserved actions require the CHO role.
5. Governance state can be persisted through the injected save/load hooks.
6. Existing StarNet permissions, consent, budgets, ledgers, checkpoints, memory, events, and agent runtime remain the execution substrate.

## Testing

Run the governance tests with the repository's existing test runner. The tests are intentionally isolated from the full runtime so the constitutional layer can be verified before integration.
