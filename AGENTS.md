# BD Dashboard project rules

## Typography

- Noto Sans is the permanent and exclusive UI typeface for every Dashboard version.
- Load it through the root `next/font` configuration so deployed builds self-host it; never rely only on a device-installed font.
- Do not replace Noto Sans, add another UI font, or remove `--font-noto-sans` unless the user explicitly changes this rule.
- New components, controls, and headings must inherit `--font-noto-sans`.

## Dashboard presentation

- Keep visible vertical space between the global store header and each module heading, including on narrow screens.
- User-facing Dashboard pages must not name internal data sources, tables, import jobs, or sync mechanisms. Keep those details in dedicated admin diagnostics and developer documentation.
- Show a verified `Last updated` date and time when available. If the update time is unknown, say so instead of inferring it from a reporting period.
- Never display example metrics as current business data. Use a clear empty state when verified data is unavailable.
