# OAuth Fix for VS Code Extension

## Problem
The extension was trying to authenticate at `/vscode/auth` which didn't exist in your Next.js app.

## Solution
Created two new routes in your webapp:

### 1. `/app/vscode/auth/page.tsx`
- Initiates GitHub OAuth through Supabase
- Shows loading UI to user
- Redirects to GitHub for authorization

### 2. `/app/vscode/callback/route.ts`
- Handles OAuth callback from GitHub
- Exchanges code for Supabase session
- Redirects back to VS Code/Cursor with access token

## How It Works

```
1. VS Code Extension
   ↓ Opens browser
2. https://app.gitketchup.com/vscode/auth?redirect_uri=cursor://...
   ↓ Initiates OAuth
3. GitHub Authorization
   ↓ User approves
4. /vscode/callback?code=xxx
   ↓ Exchange code
5. Redirect: cursor://ketchup.ketchup-vscode/auth/callback?code=ACCESS_TOKEN
   ↓ Extension receives token
6. Extension stores token & authenticated!
```

## Testing

### 1. Start your Next.js dev server
```bash
cd ketchup-webapp
npm run dev
```

### 2. Test the auth flow in browser
```
http://localhost:3003/vscode/auth?redirect_uri=http://localhost:3003/test
```

You should:
- See the loading screen
- Get redirected to GitHub
- After auth, see error (because redirect_uri is invalid, but that's ok for testing)

### 3. Test from VS Code Extension
1. Open Extension Development Host (F5)
2. Run: `Ketchup: Connect Workspace`
3. Browser opens to `/vscode/auth`
4. Authenticate with GitHub
5. Should redirect back to VS Code
6. Extension stores token

## Important Notes

- The extension currently stores the Supabase `access_token` as the auth token
- All API calls will need to use Supabase auth format
- You may need to adjust your API routes to accept Supabase tokens

## Next Steps

### Option A: Update API to Accept Supabase Tokens
Your API routes should check for Supabase auth:

```typescript
// In your API routes
const supabase = createServerClient(...);
const { data: { user } } = await supabase.auth.getUser();

if (!user) {
  return new Response('Unauthorized', { status: 401 });
}
```

### Option B: Exchange for Custom Token
Modify `/vscode/callback` to create a custom JWT:

```typescript
// Generate custom JWT with your secret
const customToken = jwt.sign(
  { userId: data.user.id, email: data.user.email },
  process.env.JWT_SECRET,
  { expiresIn: '30d' }
);

vsCodeUrl.searchParams.set('code', customToken);
```

## Files Created

1. `ketchup-webapp/app/vscode/auth/page.tsx` - Auth initiation page
2. `ketchup-webapp/app/vscode/callback/route.ts` - OAuth callback handler
3. `ketchup-webapp/lib/supabase/client.ts` - Added `createClient` export

## Testing Checklist

- [ ] Dev server running on port 3003
- [ ] Can access `/vscode/auth` in browser
- [ ] GitHub OAuth is configured in Supabase
- [ ] Callback URL includes `http://localhost:3003/vscode/callback`
- [ ] Extension can open browser
- [ ] Extension receives auth code/token
- [ ] Token is stored in VS Code SecretStorage

## Troubleshooting

**"404 Not Found"**
- Make sure Next.js dev server is running
- Check the URL is correct: `http://localhost:3003/vscode/auth`

**"redirect_uri mismatch"**
- Add callback URL to Supabase Auth settings:
  - Go to Supabase Dashboard → Authentication → URL Configuration
  - Add: `http://localhost:3003/vscode/callback`
  - Add: `cursor://ketchup.ketchup-vscode/auth/callback`

**"Extension doesn't receive token"**
- Check browser console for errors
- Check Extension Host console for errors
- Verify the redirect URI format is correct

## Current Status

✅ Auth pages created
✅ Callback handler implemented
⏳ Needs testing
⏳ May need API route updates to accept Supabase tokens
