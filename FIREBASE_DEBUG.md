# Firebase Debug Instructions

## Current Issue
The comparison graph shows "No company users found" because of Firebase security rules blocking access to admin collections.

## Debug Steps

### 1. Open Browser Console
Press F12 and go to Console tab

### 2. Run Debug Command
```javascript
window.debugFirebaseAccess()
```

This will test access to:
- `users` collection (admin panel users)
- `hourlyReports` collection (trimming data)
- `timeLogsMaster` collection (master logs)
- `attendance` collection (user attendance)

### 3. Check Results
Look for:
- ✅ = Collection accessible
- ❌ = Permission denied

## Expected Firebase Security Rules

Your Firebase security rules should allow authenticated users to read these collections:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read all users
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Allow authenticated users to read hourly reports
    match /hourlyReports/{reportId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Allow authenticated users to read master logs
    match /timeLogsMaster/{logId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Allow authenticated users to read attendance
    match /attendance/{attendanceId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

## Fix Instructions

1. Go to Firebase Console
2. Navigate to Firestore Database
3. Click "Rules" tab
4. Update rules to allow read access for authenticated users
5. Publish the rules
6. Refresh the app and try again

## Manual Test
After updating rules, run:
```javascript
window.refreshComparison()
```