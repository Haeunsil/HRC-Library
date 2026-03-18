@echo off
echo [INFO] server.exe 빌드 중...
python -m PyInstaller --onefile --name server --clean --distpath . ^
    --hidden-import=uvicorn.loops.auto ^
    --hidden-import=uvicorn.protocols.http.auto ^
    --hidden-import=uvicorn.lifespan.on ^
    --hidden-import=uvicorn.logging ^
    --hidden-import=uvicorn.protocols.websockets.auto ^
    --hidden-import=uvicorn.protocols.http.h11_impl ^
    --hidden-import=uvicorn.protocols.websockets.wsproto_impl ^
    main.py

if %errorlevel% neq 0 (
    echo [ERROR] 빌드 실패.
    pause
    exit /b
)

echo.
echo [INFO] 빌드 성공!
echo [INFO] 실행 파일은 현재 폴더(server)에 있습니다: server.exe
echo.
pause
