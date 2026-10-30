# Dashcam app implementation plan

## Repository baseline

- Bare React Native CLI application, React Native 0.75.5 and TypeScript 5.0.4.
- Android and iOS native projects are present; the only JavaScript screen is the untouched starter screen.
- There is no app navigation, camera implementation, persistence layer, provider integration, or feature test coverage.
- Initial `npm test` failed because Windows `ComSpec` was unset. Setting `ComSpec` for the npm invocation allows the Jest suite to run.

## Phases and completion gates

1. **Foundation and dashboard** — Implemented: replaced the starter with a dark automotive shell, five-tab navigation, reusable presentation components, typed feature boundaries, capability/status reporting, and focused UI tests. TypeScript, lint, and Jest gates pass.
2. **Camera recording** — Single-camera segmented capture, local finalization, SQLite metadata, playback, runtime format selection, and state tests are implemented. An Android best-effort dual-camera mode checks Camera2 concurrent camera IDs and saves separate front/rear clips; iOS remains single-camera. Physical-device dual-camera and capture testing remain outstanding.
3. **Storage, protection, GPS, and diagnostics** — Partially implemented: free-space monitoring, 512 MB pre-segment stop, opt-in oldest-first cleanup with protected/queued/transferring clip exclusions, guarded manual deletion, user-started foreground GPS trips, accuracy-filtered speed/distance estimates, segment location metadata, and diagnostics. Route visualization/export remains outstanding. Gate: unit tests cover cleanup policy and GPS reliability; database and device interruption tests remain outstanding.
4. **Provider and export workflows** — Incomplete. A provider contract and secure Keychain token vault exist; OAuth, upload adapters/queues, transfer verification, Drive, OneDrive, Dropbox, and direct Android SAF/iOS Files writing remain to be implemented. Gate: adapter tests and explicit credential/device setup; local capture remains independent.
5. **Native lifecycle behavior** — Incomplete. This build stops on backgrounding. Android foreground camera service/notification and platform-specific continuation are not implemented. iOS suspension/lock limitations are disclosed. Android debug compilation succeeds; iOS build and real-device validation remain outstanding. Never advertise universal locked-screen recording.
6. **Hardening and release evidence** — In progress. Privacy disclosures, diagnostics, setup documentation, a support matrix, and focused unit tests exist. TypeScript, lint, Jest, and Android debug build pass. Recovery testing, database integration tests, and hardware validation remain outstanding.

## Execution notes

- Implement and verify one phase at a time; update this document when gates are met.
- Do not simulate camera or provider success in production paths. Use explicit unavailable/error states where hardware, OAuth configuration, or native setup is missing.
- This Windows environment can run JavaScript/Android checks if the Android SDK is configured, but cannot run Xcode or validate iOS hardware behavior. iOS and device-only claims remain unverified until tested on those targets.
