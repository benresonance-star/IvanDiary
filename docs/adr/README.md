# Architecture decision records

This directory records durable architecture and product-boundary decisions for Ivan's Diary. Read the relevant ADR before changing runtime behavior, persistence, native bridges, supported platforms, or product policy.

| ADR | Title | Status |
|---|---|---|
| [0001](./0001-hybrid-react-capacitor-ipad-app.md) | Hybrid React/Capacitor iPad app | Accepted |
| [0002](./0002-pencilkit-data-is-the-editable-drawing-authority.md) | PencilKit data is the editable drawing authority | Accepted |
| [0003](./0003-local-durability-before-cloud-backup.md) | Local durability before cloud backup | Accepted |
| [0004](./0004-cloudkit-icloud-backup-and-recovery.md) | CloudKit/iCloud backup and recovery | Accepted |
| [0005](./0005-user-triggered-transcription-preserves-audio.md) | User-triggered transcription preserves audio | Accepted |
| [0006](./0006-accessibility-and-supported-ipad-baseline.md) | Accessibility and supported iPad baseline | Accepted |
| [0007](./0007-multi-device-conflict-policy.md) | Multi-device conflict policy | Unresolved |

## Status meanings

- **Accepted:** the current implementation direction or governing invariant.
- **Unresolved:** evidence identifies a required decision, but no complete policy has been approved.

ADRs describe current decisions separately from unperformed physical-device acceptance gates. A future decision that changes an ADR should add a new record and mark the old record superseded rather than silently rewriting history.
