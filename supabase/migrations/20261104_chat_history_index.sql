-- Chat history is stored as one row per user/assistant turn in the existing table.
-- This index supports per-user chronological history reads.
CREATE INDEX IF NOT EXISTS "Chatbot History_user_date_idx"
    ON public."Chatbot History" (user_id, datestamp, chat_id);
