@echo off
chcp 65001 > nul
set TASK_NAME=HRC_Library_Server
set EXE_NAME=server.exe

:: 관리자 권한 확인
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] 이 스크립트는 관리자 권한으로 실행해야 합니다.
    echo 우클릭 후 '관리자 권한으로 실행'을 선택해주세요.
    pause
    exit /b
)

:: 절대 경로 계산 (주의: 이 스크립트가 deploy 폴더 안에 있다고 가정될 때 올바르게 동작하도록 수정 필요할 수 있음)
:: 현재는 src에 위치하므로 deploy 경로를 타겟팅하거나, 이 파일이 deploy로 복사된 후 실행되는 것을 가정
set CURRENT_DIR=%~dp0
set APP_PATH=%CURRENT_DIR%%EXE_NAME%

if not exist "%APP_PATH%" (
    echo [ERROR] %EXE_NAME% 파일을 찾을 수 없습니다. 
    echo 이 스크립트는 %EXE_NAME%와 같은 폴더에 있어야 합니다.
    pause
    exit /b
)

echo [INFO] 작업 스케줄러 등록을 시작합니다: %TASK_NAME%
echo [INFO] 실행 파일: %APP_PATH%

:: 작업 생성 (시스템 시작 시 실행, SYSTEM 계정 권한)
schtasks /create /tn "%TASK_NAME%" /tr "'%APP_PATH%'" /sc onstart /ru SYSTEM /f

if %errorLevel% neq 0 (
    echo [ERROR] 작업 등록 실패.
    pause
    exit /b
)

echo.
echo [SUCCESS] %TASK_NAME% 작업이 등록되었습니다.
echo 컴퓨터를 재부팅하면 서버가 자동으로 시작됩니다.
echo 지금 바로 시작하려면 서비스 콘솔이나 작업 스케줄러에서 수동으로 시작하거나, 재부팅하세요.
pause
