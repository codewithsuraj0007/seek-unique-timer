# Exit Request Approval System - Test Guide

## Quick Test Steps

### User Flow Test:
1. Open the app and log in as a user
2. Click the "🌙 LOGOUT" button (Day End button)
3. If working hours < 9h, you should see "Confirm Exit" modal
4. Click "Yes" 
5. Fill in exit reason in the "Exit Reason" modal
6. Click "Send To Admin"
7. Verify you see: "Exit request sent to admin."
8. Verify your session continues running (timer keeps going)

### Admin Flow Test:
1. Open admin panel (admin.html)
2. Log in as admin (teamseekunique@gmail.com)
3. Check "Pending Approvals" section
4. You should see the exit request with:
   - User name
   - Type: "Exit Request" 
   - Reason text
   - Timestamp
   - Approve/Reject buttons

### Approve Test:
1. Click "Approve" button
2. Verify admin sees: "Exit request approved for [username]. User session will be closed."
3. User should receive notification and app should close

### Reject Test:
1. Click "Reject" button  
2. Verify admin sees: "Exit request rejected for [username]. User session continues."
3. User should receive notification but session continues

### Idempotent Test:
1. Try clicking "Approve" twice on same request
2. Second click should show: "Exit request for [username] is already approved."

## Database Collections Created:
- `exit_requests` - stores pending/approved/rejected exit requests
- `notifications` - stores user notifications for responses

## Key Features Implemented:
✅ User clicks Send To Admin → DB row created with username, reason, created_at and status pending
✅ Admin sees it in Pending Approvals table
✅ Admin clicks Reject → status changes to rejected, user notified, session continues  
✅ Admin clicks Approve → status changes to approved, existing close/save workflow runs, user session ends
✅ Approve action is idempotent (no double-save)
✅ Feature does not alter any other app behavior
✅ Exact UI text matches requirements