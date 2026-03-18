@echo off
chcp 65001 > nul
set SERVICE_NAME=HRC_Library_Server
set EXE_NAME=server.exe

:: 관리자 권한 확인
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] 이 스크립트는 관리자 권한으로 실행해야 합니다.
    echo 우클릭 후 '관리자 권한으로 실행'을 선택해주세요.
    pause
    exit /b
)

:: NSSM 존재 확인
where nssm >nul 2>&1
if %errorLevel% neq 0 (
    if exist "nssm.exe" (
        echo [INFO] 현재 폴더에서 nssm.exe를 찾았습니다.
    ) else (
        echo [ERROR] nssm.exe를 찾을 수 없습니다.
        echo [GUIDE] https://nssm.cc/download 에서 다운로드 후, nssm.exe를 이 폴더(deploy)에 넣어주세요.
        pause
        exit /b
    )
)

:: 절대 경로 계산
set CURRENT_DIR=%~dp0
set APP_PATH=%CURRENT_DIR%%EXE_NAME%

echo [INFO] 서비스 등록을 시작합니다: %SERVICE_NAME%
echo [INFO] 실행 파일 경로: %APP_PATH%

:: 서비스 설치
nssm install %SERVICE_NAME% "%APP_PATH%"
if %errorLevel% neq 0 (
    echo [ERROR] 서비스 등록 실패.
    pause
    exit /b
)

:: 서비스 설정 (시작 디렉토리, 로그 등)
nssm set %SERVICE_NAME% AppDirectory "%CURRENT_DIR%"
nssm set %SERVICE_NAME% AppStdout "%CURRENT_DIR%service_stdout.log"
nssm set %SERVICE_NAME% AppStderr "%CURRENT_DIR%service_stderr.log"
nssm set %SERVICE_NAME% AppStopMethodSkip 0
nssm set %SERVICE_NAME% AppStopMethodConsole 1500
nssm set %SERVICE_NAME% Startup Automatic

:: 서비스 시작
nssm start %SERVICE_NAME%

echo.
echo [SUCCESS] %SERVICE_NAME% 서비스가 성공적으로 등록되고 시작되었습니다!
echo 이제 서버는 백그라운드에서 계속 실행됩니다.
pause
