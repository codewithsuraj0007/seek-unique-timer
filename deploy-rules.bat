@echo off
echo Deploying Firestore Rules...
echo.

echo Deploying rules...
firebase deploy --only firestore:rules

echo.
echo Rules deployment complete!
echo.
pause