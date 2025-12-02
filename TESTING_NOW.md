# 🚀 Test the Extension NOW

## Quick Start (2 minutes)

### Terminal 1: Start Webapp
```bash
cd /Users/dashon/Development/Applications/GitFilms/ketchup-webapp
npm run dev
```
✅ Should see: `Ready on http://localhost:3003`

### Terminal 2: Test Auth Page
```bash
# Open in browser:
open http://localhost:3003/vscode/auth?redirect_uri=http://localhost:3003/test
```
✅ Should see: Loading screen with "Connect VS Code to Ketchup"

### Terminal 3: Launch Extension
```bash
cd /Users/dashon/Development/Applications/GitFilms/ketchup-vscode

# Open in VS Code (NOT Cursor for testing)
code .

# Then press F5
# Or: Run → Start Debugging
```
✅ Should see: New "Extension Development Host" window

### In Extension Development Host:
```
1. File → Open Folder → ketchup-webapp
2. Click Ketchup icon in left Activity Bar
3. Run: Ketchup: Connect Workspace
4. Browser opens → GitHub auth → Redirects back
5. Extension shows connected! ✅
```

---

## 🔧 Before You Test

### Add to Supabase (5 seconds)
Dashboard → Auth → URL Configuration → Add:
```
http://localhost:3003/vscode/callback
cursor://ketchup.ketchup-vscode/auth/callback
```

---

## ✅ What Should Work

1. **Auth Flow**
   - Browser opens to `/vscode/auth`
   - Shows loading screen
   - Redirects to GitHub
   - Comes back authenticated

2. **Extension Commands**
   - `Ketchup: Connect Workspace`
   - `Ketchup: Draft Recap`
   - `Ketchup: View Recap`
   - `Ketchup: Refresh Recaps`

3. **Sidebar Views**
   - Recaps list
   - Schedules list
   - Connection status

4. **Draft Recap**
   - Time range selection
   - Commit filtering
   - Generate recap

---

## 🐛 If Something Fails

**Console says: "Ketchup extension is now active"**
→ ✅ Extension loaded successfully!

**404 on /vscode/auth**
→ Webapp not running. Check Terminal 1.

**"redirect_uri mismatch"**
→ Add URIs to Supabase (see above)

**No Ketchup icon in Activity Bar**
→ Make sure you opened a git repository folder

---

## 📸 What Success Looks Like

```
Terminal 1: webapp running on :3003 ✅
Terminal 2: auth page loads ✅
VS Code: Extension Development Host open ✅
Activity Bar: Ketchup icon visible ✅
Command works: Connect Workspace ✅
Browser: Opens to auth page ✅
GitHub: OAuth flow completes ✅
VS Code: Shows "Connected" ✅
```

---

## 🎯 The Big Test

Run this command in Extension Development Host:
```
Cmd+Shift+P → Ketchup: Draft Recap
```

If you see the Draft Recap modal with:
- Time range pills
- Commit list
- Activity snapshot

**🎉 EVERYTHING WORKS!**

---

**Ready? Start Terminal 1 now!** 🚀
