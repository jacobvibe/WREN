-- Purchase price in GBP, nullable — users set this manually.
-- Used for cost-per-wear = price / count(wears).

alter table items add column if not exists price numeric;

comment on column items.price is
  'Purchase price in GBP. Null until set by the user. Divide by wear count for cost-per-wear.';
