-- Fix missing trigger for user profile creation
-- Drop existing trigger if it exists (in case it's partially installed)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Ensure the trigger function exists and is correct
CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, credits)
  VALUES (NEW.id, NEW.email, 25)  -- Start with 25 free credits
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger to automatically create user profiles on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_user_profile();
