# Security Guidelines for Testing

## ⚠️ IMPORTANT: Never Commit Real Credentials

This directory contains test scripts that require sensitive credentials. **Never commit real values to git.**

## Safe Testing Procedure

### 1. Get Local Supabase Credentials

```bash
npx supabase status
# Copy the anon key from the output
```

### 2. Get User JWT (for API key tests)

1. Open browser console on your local Supabase auth page
2. Run: `console.log(localStorage.getItem('supabase.auth.token'))`
3. Copy the JWT token

### 3. Replace Placeholders in Test Files

- `setup_api_key.js`: Replace all `REPLACE_WITH_YOUR_*` placeholders
- `test_enhance_auth.sh`: Replace all `<your_*>` placeholders

### 4. Test Safely

- Only use local development credentials
- Use test OpenAI API keys or placeholders
- Never commit files with real credentials

## Files That Should Never Contain Real Secrets

- `setup_api_key.js` ✅ (now uses placeholders)
- `test_enhance_auth.sh` ✅ (already uses placeholders)
- Any test file in this directory

## If You Accidentally Commit Secrets

1. Immediately rotate/revoke the exposed credentials
2. Remove them from git history using `git filter-branch` or similar
3. Update `.gitignore` to prevent future accidents

## Git Hooks Recommendation

Consider adding a pre-commit hook to scan for JWT patterns:

- `eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*`
