@echo off

set work_dir=%~dp0

cd /d %work_dir%

npm run serve


pause

:end
