-- Create user_profiles table to extend auth.users with credits
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    balance INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add comments to user_profiles table
COMMENT ON TABLE public.user_profiles IS 'User profiles with credit balance and additional data';
COMMENT ON COLUMN public.user_profiles.id IS 'References auth.users.id';
COMMENT ON COLUMN public.user_profiles.balance IS 'User credit balance for AI requests';

-- Create usage_events table for tracking credit usage and grants
CREATE TABLE IF NOT EXISTS public.usage_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'signup_credits', 'enhance_request', 'credit_purchase', etc.
    credits_granted INTEGER DEFAULT 0,
    credits_used INTEGER DEFAULT 0,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    model TEXT,
    cost_usd DECIMAL(10,6) DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add comments to usage_events table
COMMENT ON TABLE public.usage_events IS 'Tracks all credit usage, grants, and AI request events';
COMMENT ON COLUMN public.usage_events.user_id IS 'References the user in auth.users';
COMMENT ON COLUMN public.usage_events.event_type IS 'Type of event: signup_credits, enhance_request, credit_purchase, etc.';
COMMENT ON COLUMN public.usage_events.credits_granted IS 'Number of credits granted to user (for credit grants)';
COMMENT ON COLUMN public.usage_events.credits_used IS 'Number of credits used by user (for requests)';
COMMENT ON COLUMN public.usage_events.metadata IS 'Additional event data as JSON';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON public.usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_user_event_type ON public.usage_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON public.usage_events(created_at);

-- Enable Row Level Security
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_profiles
CREATE POLICY "Users can view their own profile" 
ON public.user_profiles
FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
ON public.user_profiles
FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Service role can manage all profiles
CREATE POLICY "Service role can manage profiles" 
ON public.user_profiles
FOR ALL 
USING (auth.role() = 'service_role');

-- RLS policies for usage_events
CREATE POLICY "Users can view their own usage events" 
ON public.usage_events
FOR SELECT 
USING (auth.uid() = user_id);

-- Service role can manage all usage events (for backend operations)
CREATE POLICY "Service role can manage usage events" 
ON public.usage_events
FOR ALL 
USING (auth.role() = 'service_role');

-- Create function to grant signup credits
CREATE OR REPLACE FUNCTION public.grant_signup_credits()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Create user profile with 25 credits
  INSERT INTO public.user_profiles (id, balance)
  VALUES (NEW.id, 25)
  ON CONFLICT (id) DO UPDATE SET balance = 25;
  
  -- Log the credit grant in usage_events
  INSERT INTO public.usage_events (
    user_id,
    event_type,
    credits_granted,
    metadata,
    created_at
  ) VALUES (
    NEW.id,
    'signup_credits',
    25,
    jsonb_build_object(
      'signup_method', 'email',
      'auto_granted', true
    ),
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically grant credits on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.grant_signup_credits();

-- Create function to update updated_at timestamp for user_profiles
CREATE OR REPLACE FUNCTION public.update_user_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at on user_profiles changes
CREATE TRIGGER handle_user_profile_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_user_profile_updated_at();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT ON public.usage_events TO authenticated;
