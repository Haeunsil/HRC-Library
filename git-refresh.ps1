# 현재 터미널 세션에서 Git을 사용할 수 있게 PATH 새로고침
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
git --version
