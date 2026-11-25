-- =====================================================================
-- 0021  New letter kinds: offer letter and employment contract.
-- (Own file: a new enum value can only be used after this commits.)
-- =====================================================================
alter type public.letter_kind add value if not exists 'offer';
alter type public.letter_kind add value if not exists 'contract';
