import { assertDeploymentIsolation, deploymentTarget, STAGING_SUPABASE_REF, PRODUCTION_SUPABASE_REF } from "../../deployment-isolation";
import { supabaseRest } from "../../supabase-rest";
import { sql } from "drizzle-orm";
import { getDb } from "../../../db";

export const dynamic = "force-dynamic";

/** Operational readiness only: no accounts, table contents, keys or connection strings. */
export async function GET() {
  const started = performance.now();
  try {
    assertDeploymentIsolation();
    const environment = deploymentTarget();
    await Promise.all([
      supabaseRest<Array<{id: string}>>("tenants?select=id&limit=1"),
      getDb().then(db => db.execute(sql`select 1`)),
    ]);
    return Response.json({status: "ready", environment,
      projectRef: environment === "staging" ? STAGING_SUPABASE_REF : environment === "production" ? PRODUCTION_SUPABASE_REF : null,
      databaseReachable: true,
    }, {headers: {"Cache-Control": "no-store", "Server-Timing": `readiness;dur=${(performance.now() - started).toFixed(1)}`}});
  } catch {
    return Response.json({status: "unavailable", error: "Environment isolation or database readiness is not configured."}, {status: 503, headers: {"Cache-Control": "no-store"}});
  }
}
