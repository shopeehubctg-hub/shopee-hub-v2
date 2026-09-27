# BD Dashboard project rules

## Typography

- Noto Sans is the permanent and exclusive UI typeface for every Dashboard version.
- Load it through the root `next/font` configuration so deployed builds self-host it; never rely only on a device-installed font.
- Do not replace Noto Sans, add another UI font, or remove `--font-noto-sans` unless the user explicitly changes this rule.
- New components, controls, and headings must inherit `--font-noto-sans`.

## Advertising data

- Use the FullAd daily records in Supabase for advertising performance. Read ad balances only from the separate `AdBalance` Google Sheets tab, with validated `Date`, `Store Name`, and `Ad Balance (RM)` headers and recent dates. The FullAd `Spend` and `Ad Balance (RM)` columns are not balance sources for the dashboard.
- Keep Shopee Open Platform API integration paused. Do not add Shopee API requests or restore the `/api/shopee/advertising` route until the user explicitly asks to resume that integration.
- Do not show internal source names such as FullAd or API details in the customer Dashboard.
