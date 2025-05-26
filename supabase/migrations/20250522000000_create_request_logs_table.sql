-- Create the request_logs table to store timestamps of requests for rate limiting
CREATE TABLE IF NOT EXISTS public.request_logs (
    identifier TEXT PRIMARY KEY,
    last_request_at TIMESTAMPTZ NOT NULL
);

-- Optional: Add a comment to the table for clarity
COMMENT ON TABLE public.request_logs IS 'Stores the last request timestamp for different identifiers (e.g., IP addresses or device IDs) for rate limiting purposes.'; 