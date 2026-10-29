# Account security

Account requires an independent password with owner-approved first setup/reset. Unlocked access lasts until Dashboard session expiry/logout or manual lock. Server endpoints enforce the gate and financial preview state clears on lock. Production has its own security owner and empty credential store; no Staging credentials copied. Existing users must sign in again. First Account password entry remains user-operated.

Validation: Database Structure PASS; Stage actual locked-screen UI PASS; 39 security/session tests and 45 related regressions PASS, TypeScript PASS. Both databases passed rollback-only registration/enrollment/unlock/manual lock/replay/tenant/logout assertions. Corrected once-captured logout clock consistency. No Delete performed.
