@echo off
echo Setting up PIN-based Authentication System...
echo.

echo Step 1: Installing API dependencies...
cd api
call npm install
if %errorlevel% neq 0 (
    echo Error: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Step 2: Creating environment configuration...
if not exist .env (
    copy .env.example .env
    echo Created .env file from template
    echo Please edit api\.env with your SMTP settings
) else (
    echo .env file already exists
)

echo.
echo Step 3: Testing API server...
echo Starting server in test mode...
timeout /t 2 /nobreak > nul
start /min cmd /c "npm start"
timeout /t 3 /nobreak > nul

echo.
echo Setup complete!
echo.
echo Next steps:
echo 1. Edit api\.env with your SMTP configuration
echo 2. Start the API server: cd api && npm start
echo 3. Open the app and navigate to auth-entry.html
echo.
echo The API server should be running on http://localhost:3001
echo Check http://localhost:3001/health to verify it's working
echo.
pause