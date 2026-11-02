# Invoice STORE NAME matching — 2 November 2026

User authorized rechecking current invoices using explicit STORE NAME in the invoice Description, listing uncertainty, and deploying the same fixed Staging. Include previously queued Registered Name (Platform/Billing) feature. Production is not authorized.

Only extracted short store names are retained in eligible snapshot rows and their presentation copy. Raw descriptions, addresses and other contact details are not retained. Scope remains the four authorized Wisdom Factory Projects. Old snapshots are accepted but require a fresh sync before store evidence can be verified.

Matching uses exact normalized canonical Client/store names and reviewed aliases. No company-only fallback for invoice assignment. Missing, multiple, contradictory-country or unrecognized names remain unassigned. A saved invoice-level mapping can resolve country ambiguity when its target is among the label candidates; a contradictory saved assignment is withheld and kept in history for review.

Existing invoice mapping RPC performs atomic batches with shared source-group versions and request replay. Safe suggestions are saved only after actual source refresh and inspection. No Xero write or destructive database action.

Stage validator20261102033822 applied; validator bounds/legacy/privacy/money rollback suite and same-group invoice-batch rollback suite PASS. Existing source snapshots, names and mappings unchanged before sync.

Feature branch codex/account-invoice-store-matching starts from main3067edb8669a8e887e606c5d5c06e5a1d79f81ca and includes reviewed names prerequisite28e008c8b151622b49ab4aad631894beeff752d1. Preserve latest Package candidate in fixed Staging. Actual UI/UX then final function QC required.
