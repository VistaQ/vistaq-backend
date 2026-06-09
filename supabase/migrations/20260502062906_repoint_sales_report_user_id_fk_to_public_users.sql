ALTER TABLE sales_report_ytd
  DROP CONSTRAINT sales_report_ytd_user_id_fkey,
  ADD CONSTRAINT sales_report_ytd_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE sales_report_mtd
  DROP CONSTRAINT sales_report_mtd_user_id_fkey,
  ADD CONSTRAINT sales_report_mtd_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
