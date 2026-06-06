-- Add merchant_id to affiliate_clicks.
--
-- The corrected Discover flow records clicks through the awin-click Edge Function,
-- which knows the AWIN merchant id used to build the tracking URL. Storing it
-- alongside the existing product_id / retailer / category lets us reconcile
-- click data against AWIN attribution reports. Nullable for legacy rows.

alter table affiliate_clicks
  add column if not exists merchant_id text;

comment on column affiliate_clicks.merchant_id is
  'AWIN merchant id used for the tracked click. NULL for rows written before the awin-click flow.';
