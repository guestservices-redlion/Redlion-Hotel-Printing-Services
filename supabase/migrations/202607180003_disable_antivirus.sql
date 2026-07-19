-- Malware scanning was removed to support lightweight serverless/free hosting.
-- PDF signature, MIME type, structure, encryption, page count, and size checks remain.
update public.hotel_settings
set antivirus_required = false, updated_at = now()
where id = 1;
