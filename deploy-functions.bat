@echo off
echo Deploying Firebase Functions for Trimming Comparison Feature...
echo.

cd functions
echo Installing dependencies...
npm install

echo.
echo Deploying functions...
firebase deploy --only functions:getTrimmingComparison

echo.
echo Deployment complete!
echo.
echo API Endpoint will be available at:
echo https://us-central1-seek-unique-timer.cloudfunctions.net/getTrimmingComparison
echo.
pause