@echo off
REM ============================================================
REM CardHunt nightly tiered price refresh  (CLAUDE.md T4)
REM
REM Registered with Windows Task Scheduler as "CardHunt nightly refresh".
REM This box is Windows: there is no cron. The crontab line in older notes
REM never ran anywhere. Manage the schedule with:
REM
REM   schtasks /Query  /TN "CardHunt nightly refresh" /V /FO LIST
REM   schtasks /Run    /TN "CardHunt nightly refresh"
REM   schtasks /Change /TN "CardHunt nightly refresh" /ST 04:00
REM   schtasks /Delete /TN "CardHunt nightly refresh" /F
REM
REM DATABASE_URL is read from the user environment, so the task must run
REM as this user. It is NOT set machine-wide.
REM ============================================================
cd /d "%~dp0"
REM The write credentials (localdb.js, 2026-10-10): this machine's DATABASE_URL is
REM read-only; the production write URL is CARDHUNT_WRITE_DATABASE_URL and is
REM handed to THIS job's node only (setlocal: nothing outside this file sees it).
REM Unset: DATABASE_URL is used as it is, as before. ingest.js refuses to run
REM (exit 5) on a connection that cannot write, so a job never "succeeds" storing nothing.
setlocal
if defined CARDHUNT_WRITE_DATABASE_URL set "DATABASE_URL=%CARDHUNT_WRITE_DATABASE_URL%"
echo. >> refresh.log
echo ==== %DATE% %TIME% ==== >> refresh.log
if defined CARDHUNT_WRITE_DATABASE_URL (echo   database: CARDHUNT_WRITE_DATABASE_URL >> refresh.log) else (echo   database: DATABASE_URL - CARDHUNT_WRITE_DATABASE_URL is not set >> refresh.log)
REM --hours caps the run from INSIDE node. Task Scheduler's
REM ExecutionTimeLimit (PT6H) terminates the task, which kills this
REM cmd.exe -- but node is a grandchild and survives orphaned. That is how
REM the Aug 28 run continued for 33 hours with the 6h limit set and
REM honoured (LastTaskResult 267014 = SCHED_S_TASK_TERMINATED). A job that
REM stops itself does not depend on the scheduler killing the whole tree.
node ingest.js refresh all --max=4000 --hours=4 >> refresh.log 2>&1
