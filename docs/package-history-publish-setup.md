# Package History publishing setup

The Dashboard writes published package versions to the `Package History` tab in the Fulfillment Sheet. Drafts never call the Sheet webhook.

1. Deploy `integrations/google-sheets-history.gs` as a Google Apps Script Web App that runs as the Sheet owner. Record its `/exec` URL. The bound script must have access to spreadsheet `1mpB7KVCGzP_9IXYVbhJZsLsndM4ladU3cJre5cfALAA` and the exact tab `Package History`.
2. Set the Apps Script property `HISTORY_SECRET` to a random shared secret. Do not put the secret in the repository.
3. Set Vercel `GOOGLE_SHEETS_HISTORY_WEBHOOK_URL` to the `/exec` URL and `GOOGLE_SHEETS_HISTORY_SECRET` to the same shared secret for the intended environment. Redeploy so server functions receive the variables.
4. Create a test package using **Create Package** and verify the Sheet row with the matching `<package-id>-v1` Change ID. Save another using **Save Draft** and verify that no Sheet row is written. Repeat Create on an existing draft to check retry/idempotency.
5. Verify Super Admin can remove a package from the Dashboard while its database versions and audit trail remain available for recovery. The Package History Sheet remains an append-only history; removal does not erase earlier rows.

If the webhook is absent, **Create Package** fails before database creation and offers Save Draft. If a configured webhook fails after the database write, the package remains a draft with a retry action and must not be presented as published.
