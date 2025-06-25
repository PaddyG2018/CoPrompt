-- Create a trigger function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create the user_api_keys table
CREATE TABLE public.user_api_keys (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    encrypted_openai_api_key TEXT,
    iv TEXT, -- Initialization Vector for AES-GCM, stored as base64
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (user_id)
);

-- Add comments to the table and columns for clarity
COMMENT ON TABLE public.user_api_keys IS 'Stores encrypted OpenAI API keys for users.';
COMMENT ON COLUMN public.user_api_keys.user_id IS 'References the user in auth.users.';
COMMENT ON COLUMN public.user_api_keys.encrypted_openai_api_key IS 'The user''s OpenAI API key, encrypted server-side (base64 encoded).';
COMMENT ON COLUMN public.user_api_keys.iv IS 'The Initialization Vector used for encrypting the API key (base64 encoded).';
COMMENT ON COLUMN public.user_api_keys.created_at IS 'Timestamp of when the record was created.';
COMMENT ON COLUMN public.user_api_keys.updated_at IS 'Timestamp of when the record was last updated.';

-- Create a trigger to automatically update updated_at on row modification
CREATE TRIGGER handle_updated_at
    BEFORE UPDATE ON public.user_api_keys
    FOR EACH ROW
    EXECUTE PROCEDURE public.update_updated_at_column();

-- Enable Row Level Security for the table
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- Policies for user_api_keys table

-- Users can select their own API key information
CREATE POLICY "Allow individual user select access"
ON public.user_api_keys
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own API key information
CREATE POLICY "Allow individual user insert access"
ON public.user_api_keys
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own API key information
CREATE POLICY "Allow individual user update access"
ON public.user_api_keys
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own API key information
CREATE POLICY "Allow individual user delete access"
ON public.user_api_keys
FOR DELETE
USING (auth.uid() = user_id);
