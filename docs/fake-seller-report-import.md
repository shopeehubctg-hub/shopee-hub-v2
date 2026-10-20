# Fake Seller weekly report import

The existing Wednesday/Saturday job should call the uploader **after** saving each brand file to Drive. This repository does not create a second scheduled job. Never print or put `FAKE_SELLER_IMPORT_SECRET` in the batch file.

Set `FAKE_SELLER_IMPORT_URL` to the Dashboard URL ending `/api/fake-seller-reports`, and use the same `FAKE_SELLER_IMPORT_SECRET` configured on that deployment. Run:

```sh
node scripts/upload-fake-seller-report.mjs batch.json
```

Example `batch.json`:

```json
{
  "tenantId": "j-packaging",
  "brand": "Mizino",
  "sourceFileId": "new-google-drive-file-id",
  "uploadedAt": "2026-10-21T04:00:00+08:00",
  "links": ["https://shopee.com.my/product/123/456"]
}
```

`uploadedAt` is the time the new file was added to Drive. The Dashboard converts it to Malaysia's calendar date. Before import, a Super Admin must map the exact brand name to one or more store IDs in `fake_seller_brands`; unknown names receive HTTP 422 and remain private. The uploader exits nonzero on failure so the existing job can retry the same file. A repeated file ID does not create a new batch. Repeated links on the same store/date are counted once; the same link on a later date counts again. Existing files dated before launch are rejected.
