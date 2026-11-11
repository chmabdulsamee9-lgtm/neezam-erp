-- dev_monitoring_log retention (owner: keep the last month, delete older automatically)
-- Why: the worker's daily cron (cleanupOldDevLogs, 19:00 UTC) failed every day: 7-9 Nov with 403 (missing grant, fixed 10 Nov),
-- then 10 Nov with "57014 canceling statement due to statement timeout" because created_at has no index and ~200k rows were due.
-- ORDER: deploy the worker with DEV_LOG_RETENTION_DAYS = 30 FIRST, then run this. If this runs while the worker still says 7 days,
-- that night's cron deletes everything older than 7 days.
-- Safe: only adds an index. No data is changed by this file.

create index if not exists idx_dev_monitoring_log_created_at on public.dev_monitoring_log (created_at);

-- VERIFY: explain select count(*) from dev_monitoring_log where created_at < now() - interval '30 days';  -- expect "Index Only Scan using idx_dev_monitoring_log_created_at"
-- ROLLBACK: drop index if exists public.idx_dev_monitoring_log_created_at;
