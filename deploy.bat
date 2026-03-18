@echo off
chcp 65001 > nul
echo [INFO] 배포 파일 모으기를 시작합니다...

:: 배포 폴더 초기화
if exist deploy (
    echo [INFO] 기존 deploy 폴더를 삭제하고 다시 만듭니다.
    rmdir /s /q deploy
)
mkdir deploy

:: Server 실행 파일 복사
if exist "server\dist\server.exe" (
    echo [INFO] 서버 실행 파일 복사 중...
    copy "server\dist\server.exe" "deploy\server.exe"
) else (
    echo [ERROR] server\dist\server.exe 파일이 없습니다. 먼저 서버를 빌드해주세요.
    pause
    exit /b
)

:: Client 빌드 파일 복사
if exist "client\dist" (
    echo [INFO] 클라이언트 빌드 파일 복사 중...
    :: dist 폴더 자체를 복사하지 않고, 내용물만 deploy 폴더 바로 아래로 복사합니다.
    xcopy "client\dist" "deploy" /E /I /Y /Q
) else (
    echo [WARNING] client\dist 폴더가 없습니다. 프론트엔드 빌드가 포함되지 않았습니다.
)

:: SSL 인증서 복사 (존재할 경우)
if exist "server\cert.pem" (
    echo [INFO] SSL 인증서(cert.pem) 복사 중...
    copy "server\cert.pem" "deploy\cert.pem"
)
if exist "server\key.pem" (
    echo [INFO] SSL 키(key.pem) 복사 중...
    copy "server\key.pem" "deploy\key.pem"
)

:: .env 파일 복사 (존재할 경우)
if exist "server\.env" (
    echo [INFO] .env 파일 복사 중...
    copy "server\.env" "deploy\.env"
)

echo.
echo [INFO] 배포 준비 완료! 'deploy' 폴더를 확인하세요.
echo [INFO] deploy 폴더 안의 server.exe를 실행하거나, 서비스 등록 스크립트를 사용하세요.
pause
