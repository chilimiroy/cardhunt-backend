@echo off
REM ============================================================
REM CardHunt weekly Yuyu-tei shop prices  (Roy, 2026-10-10)
REM
REM Registered with Windows Task Scheduler as "CardHunt weekly Yuyu-tei":
REM Sundays at 08:00, as this user (DATABASE_URL is a user env var), the
REM same way as "CardHunt nightly refresh". Weekly, not nightly: a shop's
REM shelf prices move slowly, and each run asks yuyu-tei.jp for its set index
REM and ~108 set pages (>= 1.5 s apart). 08:00 because the nightly starts at
REM 03:00 and stops itself after 4 hours (--hours=4), so the two never overlap.
REM
REM Scheduled only once the yen fix was in (ingest.js 5.12.0): rows convert
REM at fx.js's live ECB rate, recorded on every row, and a run with only the
REM pinned fallback rate writes nothing. Its rows are shop ASKS (marked; they
REM feed no deal, alert or trending list).
REM
REM   schtasks /Query  /TN "CardHunt weekly Yuyu-tei" /V /FO LIST
REM   schtasks /Run    /TN "CardHunt weekly Yuyu-tei"
REM   schtasks /Delete /TN "CardHunt weekly Yuyu-tei" /F
REM ============================================================
cd /d "%~dp0"
REM The write credentials (localdb.js, 2026-10-10): this machine's DATABASE_URL is
REM read-only; the production write URL is CARDHUNT_WRITE_DATABASE_URL and is
REM handed to THIS job's node only (setlocal: nothing outside this file sees it).
REM Unset: DATABASE_URL is used as it is, as before.
setlocal
if defined CARDHUNT_WRITE_DATABASE_URL set "DATABASE_URL=%CARDHUNT_WRITE_DATABASE_URL%"
echo. >> yuyutei-weekly.log
echo ==== %DATE% %TIME% ==== >> yuyutei-weekly.log
REM Default scope: every card whose only price is a Yuyu-tei row (the ~9,000
REM the single 2026-08-28 run wrote), re-asked; a card priced by Yahoo is left.
node ingest.js yuyutei >> yuyutei-weekly.log 2>&1
