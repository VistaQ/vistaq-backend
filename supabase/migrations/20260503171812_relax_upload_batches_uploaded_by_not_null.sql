-- Relax the NOT NULL constraint on upload_batches.uploaded_by so manual ETL
-- ingests (POST /api/reports/ingest) can record an audit batch row without an
-- attributed uploader. Manual mode is authenticated by INTERNAL_API_KEY rather
-- than a user JWT, so there is no user identity to capture.

ALTER TABLE upload_batches ALTER COLUMN uploaded_by DROP NOT NULL;
