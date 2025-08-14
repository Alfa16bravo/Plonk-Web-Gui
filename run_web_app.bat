@echo off
echo ========================================
echo    PLONK Web Application Launcher
echo ========================================
echo.

echo Activation de Conda

call "%USERPROFILE%\anaconda3\Scripts\activate.bat" plonk

echo Lancement de Plonk...
python app.py

pause
