# Berlanco inventory seed — Staging only

- User-authorized target: shopee-hub-staging (`ubjfuveoqbvouryldqfu`).
- Canonical store: `shopee-berlanco-beauty-official`; tenant: `j-packaging`.
- User-confirmed mapping count: 31. Trim only trailing/leading whitespace; preserve case and internal spaces.
- User explicitly confirmed `trialeyecream trialbodycream trialnewfoundation` is one complete SKU.
- Preserve `foundation-sponge` and `VGeyecream` exactly as supplied in this request.
- Data owner: existing `public.inventory_skus`. No parallel catalog table was introduced.
- Database Structure owner approved additive nullable store_id, composite FK (tenant_id,store_id) to existing stores(tenant_id,id), and scoped lookup index. Existing RLS, grants and tenant+sku unique index preserved.
- Remote Staging migration: `20261029163217_inventory_skus_store_scope`.
- Import source: `user_supplied:berlanco:2026-10-30`. Deterministic IDs use tenant, store and exact SKU. Conflicting existing mappings abort; matching replays insert nothing.
- Verified: 31 exact name/SKU matches; 0 mismatches; 0 wrong tenant/store associations. Import replay leaves 31 records. A mismatched tenant/store insert was rejected by the composite FK inside a rollback-only subtransaction; 0 test rows persist.
- Security advisor notes the existing RLS-enabled/no-policy state on inventory_skus. No anon/authenticated access was granted; customer-facing API/policies are not connected in this step.
- Production was inspected read-only for schema parity and was not modified.
- Follow-up scope: tenant-wide SKU uniqueness must be reviewed before permitting identical SKU codes in different projects. Customer search/selection, automatic capture on package saves, and append-only SKU edit history require a separate Staging implementation and verification.

## Supplied mappings

| SKU | Product Name |
| --- | --- |
| VGacnelgel | Acne Gel |
| fillernight | Night Cream |
| ampoule | Pink Ampoule |
| fillerday | Day Cream |
| minipeptide | Mini Peptide Mask |
| mininight | Mini Night Cream |
| miniday | Mini Day Cream |
| VGpeptidecombo | Peptide Mask |
| eyecream | Mini Eye Cream (5G) |
| orchid-facecream | Firming Face Cream |
| glow lift pro | Glow Lift Pro (GWP-Not for Sales) |
| VGspray | Pink Toner Spray |
| VGbody | Body Sunblock Cream |
| konjak | Konjak Sponge |
| trialeyecream | Eye Cream Sample Pack (GWP-Not for Sales) |
| Honey | Honey Cleaser |
| SR-foundation | Skin Refining Foundation(GWP-Not for Sales) |
| milkmask | Milk Mask |
| stemcellmask | Stem Cell Mask |
| barrieressence | Barrier Repair Serum |
| foundation-sponge | Cushion Puff(GWP-Not for Sales) |
| birdnest | Bird's Nest Serum |
| royalmask | Royal Age Mask |
| VGtravelset | Travel Set |
| sophorahoney | Honey Cleaser+Konjak |
| antispotamp | Spot Correcting Ampoule |
| trialfillerday | Day Cream Sample Pack(GWP-Not for Sales) |
| trialfillernight | Night Cream Sample Pack(GWP-Not for Sales) |
| newfoundation | Foundation |
| VGeyecream | Big Eye Cream (15G) |
| trialeyecream trialbodycream trialnewfoundation | Trial Pack (GWP) |

## Applied additive schema

```sql
alter table public.inventory_skus add column store_id text;
alter table public.inventory_skus add constraint inventory_skus_tenant_store_fk
  foreign key (tenant_id,store_id) references public.stores(tenant_id,id);
create index inventory_skus_tenant_store_sku_idx
  on public.inventory_skus(tenant_id,store_id,sku);
```


## Staging Create Single Package integration — 30 October 2026

- Berlanco only; deployment target must be Staging. Search requires active membership, Packages permission and project access; tenant and store filters are enforced server-side.
- Search Product Name or Inventory SKU; select to fill the saved name. Quantity remains editable. Add New Product accepts an exact SKU/name pair. Internal spaces remain intact.
- Capture is insert-only and runs with the initial package/draft transaction. Existing names are never overwritten. Package version source identifies actor/time and mapping provenance.
- Same-request retries use the initial immutable fingerprint and a tenant catalog lock. Concurrent retries cannot duplicate a catalog record/package. Other-store, unscoped, inactive, case-variant or conflicting-name records fail closed under the retained tenant-wide SKU uniqueness rule.
- No new migration, RLS grant, policy, API credential or schedule. Existing edit/batch/Production paths do not enable capture.
- Checks: 15 API tests including raced replay and rollback; browser fixture covers search, keyboard selection, Bundle, removal, new product, spaced SKU, search retry, capture payload and mobile dropdown; TypeScript and production build. Browser fixture uses mocked HTTP; hosted authenticated UI acceptance remains for the user.
- Browser check: `node tests/inventory-catalog-ui.cjs` (set PLAYWRIGHT_MODULE to a local Playwright install if needed). API check: `node --test tests/package-markets-api.test.mjs`.
