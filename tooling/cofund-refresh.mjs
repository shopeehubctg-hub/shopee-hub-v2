// Pure planning only. No credentials, network access, or automatic database writes.
import assert from 'node:assert/strict';

export function malaysiaInstant(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value);
  assert(match, `Invalid Malaysia timestamp: ${value}`);
  const [, day, month, year, hour, minute] = match;
  const local = `${year}-${month}-${day}T${hour}:${minute}:00`;
  const date = new Date(`${local}+08:00`);
  assert(Number.isFinite(+date) && date.toISOString() ===
    new Date(Date.UTC(+year, +month - 1, +day, +hour - 8, +minute)).toISOString(), 'Invalid timestamp');
  const roundTrip = new Date(+date + 8 * 3600000).toISOString().slice(0, 19);
  assert.equal(roundTrip, local, 'Invalid calendar date or time');
  return date.toISOString();
}

const sameInstant = (left, right) => Number.isFinite(Date.parse(left)) && Date.parse(left) === Date.parse(right);
const sameBusiness = (left, right) => ['tenant_id', 'store_id', 'voucher_name', 'currency', 'quantity']
  .every(key => left[key] === right[key]) && Number(left.discount_amount) === Number(right.discount_amount)
  && sameInstant(left.campaign_start_at, right.campaign_start_at)
  && sameInstant(left.campaign_end_at, right.campaign_end_at);

export function planRefresh({ source, stores, existing, sheetId, runId }) {
  assert(/^[A-Za-z0-9_-]+$/.test(runId), 'Invalid run ID');
  assert(source.length > 0 && sheetId, 'Source is required');
  const seen = new Set(), insert = [], archiveProvenance = [], unchanged = [];
  const archiveTab = `Sheet1@db-before-${runId}`;
  for (const row of source) {
    const matches = stores.filter(store => store.name === row.store && store.platform === 'Shopee');
    assert.equal(matches.length, 1, `Unknown or ambiguous MY store: ${row.store}`);
    const store = matches[0];
    const amount = /^RM(\d{1,10})(?:\.(\d{1,2}))?$/.exec(row.amount);
    assert(amount, `Invalid MYR amount at source row ${row.row}`);
    assert(Number.isSafeInteger(row.qty) && row.qty >= 0, 'Invalid quantity');
    assert(Number.isSafeInteger(row.row) && row.row > 1, 'Invalid source row');
    const period = row.period.split(' - ');
    assert.equal(period.length, 2, 'Invalid campaign period');
    const start = malaysiaInstant(period[0]), end = malaysiaInstant(period[1]);
    assert(Date.parse(start) <= Date.parse(end), 'End precedes Start');
    // Campaign label is display metadata only; eligibility always uses source period instants.
    const label = /(?:^|[^0-9])(\d{1,2})(?:st|nd|rd|th)? (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.exec(row.voucher);
    assert(label, `Unrecognized campaign label: ${row.voucher}`);
    const month = String(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(label[2]) + 1).padStart(2, '0');
    const value = {
      tenant_id: store.tenant_id, store_id: store.id, source_store_name: row.store,
      campaign_name: `${+label[1]} ${label[2]} CoFund`,
      campaign_date: `${period[0].slice(6,10)}-${month}-${label[1].padStart(2,'0')}`,
      voucher_name: row.voucher, discount_amount: `${amount[1]}.${(amount[2] || '').padEnd(2,'0')}`,
      currency: 'MYR', quantity: row.qty, campaign_start_at: start, campaign_end_at: end,
      source_sheet_id: sheetId, source_tab: 'Sheet1', source_row: row.row,
    };
    const identity = JSON.stringify([value.store_id, value.voucher_name, start, end]);
    assert(!seen.has(identity), 'Duplicate incoming voucher');
    seen.add(identity);
    const exact = existing.filter(old => sameBusiness(old, value));
    assert(exact.length <= 1, 'Ambiguous duplicate saved vouchers');
    if (exact.length) { unchanged.push({ sourceRow: row.row, id: exact[0].id }); continue; }
    const natural = existing.filter(old => ['tenant_id','store_id','campaign_name','voucher_name'].every(key => old[key] === value[key])
      && Number(old.discount_amount) === Number(value.discount_amount));
    assert.equal(natural.length, 0, `Existing business key differs in period/quantity: ${row.store}`);
    const occupied = existing.filter(old => old.source_sheet_id === sheetId && old.source_tab === 'Sheet1' && old.source_row === row.row);
    assert(occupied.length <= 1, 'Duplicate source provenance');
    if (occupied.length) {
      assert(occupied[0].store_id === store.id && occupied[0].tenant_id === store.tenant_id, 'Source row belongs to another store');
      assert(!existing.some(old => old.source_sheet_id === sheetId && old.source_tab === archiveTab && old.source_row === row.row), 'Archive namespace occupied');
      archiveProvenance.push({ id: occupied[0].id, before: occupied[0], source_tab: archiveTab });
    }
    insert.push(value);
  }
  return { runId, insert, archiveProvenance, unchanged };
}

// The archive namespace denotes a private database-before-import snapshot, NOT a real Sheet tab.
// The updated_at trigger runs for provenance moves; ids, created_at and all business values stay intact.
export function guardedSql({ plan, existing, commit = false }) {
  const payload = { plan, existing };
  const literal = JSON.stringify(payload).replaceAll("'", "''");
  let delimiter = '$cofund$';
  while (literal.includes(delimiter)) delimiter = delimiter.slice(0, -1) + '_$';
  return `BEGIN;
LOCK TABLE public.co_fund_vouchers IN SHARE ROW EXCLUSIVE MODE;
DO ${delimiter}
DECLARE data jsonb := '${literal}'::jsonb; item jsonb; expected public.co_fund_vouchers; actual public.co_fund_vouchers; n integer;
BEGIN
  -- Entire target baseline is checked under a write lock; concurrent/stale plans fail closed.
  IF (SELECT count(*) FROM public.co_fund_vouchers) <> jsonb_array_length(data->'existing') THEN RAISE EXCEPTION 'Stale voucher count; regenerate plan'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(data->'existing') LOOP
    expected := jsonb_populate_record(NULL::public.co_fund_vouchers,item);
    SELECT * INTO actual FROM public.co_fund_vouchers WHERE id=expected.id;
    IF actual.id IS NULL OR to_jsonb(actual) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Stale voucher %; regenerate plan',expected.id; END IF;
  END LOOP;
  FOR item IN SELECT * FROM jsonb_array_elements(data->'plan'->'archiveProvenance') LOOP
    UPDATE public.co_fund_vouchers SET source_tab=item->>'source_tab' WHERE id=(item->>'id')::bigint;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n<>1 THEN RAISE EXCEPTION 'Provenance move count mismatch'; END IF;
  END LOOP;
  FOR item IN SELECT * FROM jsonb_array_elements(data->'plan'->'insert') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id=item->>'store_id' AND s.tenant_id=item->>'tenant_id') THEN RAISE EXCEPTION 'Store tenant mismatch'; END IF;
    expected := jsonb_populate_record(NULL::public.co_fund_vouchers,item);
    INSERT INTO public.co_fund_vouchers (tenant_id,store_id,source_store_name,campaign_name,campaign_date,voucher_name,discount_amount,currency,quantity,campaign_start_at,campaign_end_at,source_sheet_id,source_tab,source_row)
    VALUES (expected.tenant_id,expected.store_id,expected.source_store_name,expected.campaign_name,expected.campaign_date,expected.voucher_name,expected.discount_amount,expected.currency,expected.quantity,expected.campaign_start_at,expected.campaign_end_at,expected.source_sheet_id,expected.source_tab,expected.source_row);
  END LOOP;
END ${delimiter};
${commit ? 'COMMIT' : 'ROLLBACK'};`;
}
