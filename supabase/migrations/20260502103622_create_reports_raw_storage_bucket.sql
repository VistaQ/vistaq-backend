INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reports-raw',
  'reports-raw',
  false,
  10485760,
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "reports_raw_no_client_access" ON storage.objects
FOR ALL TO anon, authenticated USING (bucket_id <> 'reports-raw') WITH CHECK (bucket_id <> 'reports-raw');
