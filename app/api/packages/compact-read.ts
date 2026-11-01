import { getTableColumns, sql } from "drizzle-orm";
import type { getDb } from "../../../db";
import { packageVersions, packagePrices, packagePlatformSkus } from "../../../db/schema";

// Explicit camel-case JSON keys preserve Drizzle's normal row shape. Each entity
// is aggregated separately so multiple prices and SKUs never multiply rows.
function jsonRow(table: typeof packageVersions | typeof packagePrices | typeof packagePlatformSkus) {
  return sql`jsonb_build_object(${sql.join(Object.entries(getTableColumns(table)).flatMap(([key,column])=>[sql`${key}::text`,sql`${column}`]),sql`, `)})`;
}

export function compactPackageQuery(ids: string[]) {
  if (!ids.length) throw new Error("Compact package reads require an authorized scope");
  const scope=sql.join(ids.map(id=>sql`(${id}::text)`),sql`, `);
  return sql`with scope(package_id) as (values ${scope}),
    latest as (
      select v.id,v.package_id,v.version,v.calculator_settings
      from scope s cross join lateral (
        select id,package_id,version,calculator_settings from public.package_versions
        where package_id=s.package_id order by version desc limit 1
      ) v
    ), selected_ids as (
      select id from latest
      union
      select v.id from scope s cross join lateral (
        select id from public.package_versions where package_id=s.package_id
        and sheet_sync_status='synced' order by version desc limit 1
      ) v
      union
      select v.id from latest l cross join lateral (
        select id from public.package_versions where package_id=l.package_id
        and version<l.version order by version desc limit 1
      ) v where l.calculator_settings->'_packageEnded'='true'::jsonb
    )
    select
      coalesce((select jsonb_agg(${jsonRow(packageVersions)} order by ${packageVersions.version} desc)
        from ${packageVersions} where ${packageVersions.packageId} in (select package_id from scope)
        and ${packageVersions.id} in (select id from selected_ids)), '[]'::jsonb) as versions,
      coalesce((select jsonb_agg(${jsonRow(packagePrices)} order by ${packagePrices.createdAt} desc)
        from ${packagePrices} where ${packagePrices.packageId} in (select package_id from scope)
        and ${packagePrices.versionId} in (select id from selected_ids)), '[]'::jsonb) as prices,
      coalesce((select jsonb_agg(${jsonRow(packagePlatformSkus)})
        from ${packagePlatformSkus} where ${packagePlatformSkus.packageId} in (select package_id from scope)
        and ${packagePlatformSkus.versionId} in (select id from selected_ids)), '[]'::jsonb) as platforms`;
}

type CompactRows={versions:(typeof packageVersions.$inferSelect)[];prices:(typeof packagePrices.$inferSelect)[];platforms:(typeof packagePlatformSkus.$inferSelect)[]};
export async function readCompactPackageRows(db: Pick<Awaited<ReturnType<typeof getDb>>, "execute">, ids:string[]) {
  // A single statement gives all three collections the same database snapshot,
  // including when another user publishes a version during this request.
  const [result]=await db.execute<CompactRows>(compactPackageQuery(ids));
  if (!result) throw new Error("Compact package read returned no result");
  return [result.versions,result.prices,result.platforms] as const;
}
