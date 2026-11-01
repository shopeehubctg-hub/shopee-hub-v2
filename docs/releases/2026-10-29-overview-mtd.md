# Overview MTD sales

Super Admin Overview reads the latest company-wide MTD sales from the canonical sales tables. Includes cumulative platform trends, platform MTD share, target progress and projected month-end sales. Historical date controls are removed. Users with Overview access but without Super Admin see masked placeholders and lock icons, with no sales request or embedded values.

Validation: Staging 7f4f3bc, actual Super Admin desktop visual inspection, six API/React tests and TypeScript PASS; Database Structure isolation review PASS. Ordinary-account live visual sign-in and mobile acceptance remain unverified; user authorized Production after this limitation was reported. No ordinary-user privileges are expanded. Production requires only service_role SELECT on the existing three sales relations. No sales data or imported records are rewritten. Account step-up work remains outside this release.
