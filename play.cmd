@echo off
rem Starts RuneLite with the Gielinor Companion exporter plugin built in.
rem Same client as the official launcher starts (no developer mode), plus the exporter.
rem Uses the JDK in %USERPROFILE%\.gielinor-companion\jdk if present, otherwise JAVA_HOME.
setlocal
if exist "%USERPROFILE%\.gielinor-companion\jdk\bin\javaw.exe" set "JAVA_HOME=%USERPROFILE%\.gielinor-companion\jdk"
if not exist "%JAVA_HOME%\bin\javaw.exe" (
	echo No Java 17 JDK found. Install one and set JAVA_HOME, or unpack it to %USERPROFILE%\.gielinor-companion\jdk
	pause
	exit /b 1
)
set "PLUGIN_DIR=%~dp0runelite-plugin"
cd /d "%PLUGIN_DIR%"

echo Preparing RuneLite (checking for client updates)...
call "%PLUGIN_DIR%\gradlew.bat" -q --console=plain writeLaunchArgs
if errorlevel 1 (
	echo Online update check failed - trying with the cached client...
	call "%PLUGIN_DIR%\gradlew.bat" -q --console=plain --offline writeLaunchArgs
	if errorlevel 1 (
		echo Could not prepare the client. See the messages above.
		pause
		exit /b 1
	)
)

start "" "%JAVA_HOME%\bin\javaw.exe" "@%PLUGIN_DIR%\build\launch\args.txt"
