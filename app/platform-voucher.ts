export type PlatformVoucherPreset = {
  early: number | null;
  campaign: number | null;
  late: number | null;
  updatedAt: string;
};

export function platformVoucherFromRow(row: {non_campaign_average:unknown;campaign_average:unknown;late_month_average:unknown;source_updated_at:string}): PlatformVoucherPreset {
  const rate=(value:unknown):number|null=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<100?Number(value):null;
  return {early:rate(row.non_campaign_average),campaign:rate(row.campaign_average),late:rate(row.late_month_average),updatedAt:row.source_updated_at};
}
