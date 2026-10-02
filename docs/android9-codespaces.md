## 📱 StarForge Android 9 Test Lab

Run the governance kernel from an Android 9 phone without a PC by using GitHub Codespaces.

[![Open StarForge Android 9 Test Lab](https://github.com/codespaces/badge.svg)](https://codespaces.new/CXRNFLAKES/Starforge-Inc.-starnet-?branch=starforge%2Fgovernance-kernel)

**One tap:** open the button above on your phone, create the Codespace, then open the forwarded **StarForge Android 9 Test Lab** port.

The repository includes a dedicated .devcontainer configuration that installs Node.js, runs npm ci, forwards port 8799, and starts the isolated mobile test server automatically.

Manual command:
npm run starforge:mobile-test

Safety: this test mode is an isolated governance simulation. It does not use production money, production ledger state, AI providers, or external side effects.
