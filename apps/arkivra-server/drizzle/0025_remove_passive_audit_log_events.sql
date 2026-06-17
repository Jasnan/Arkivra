DELETE FROM public.audit_events
WHERE event_type IN ('audit_log.viewed', 'audit_log.searched');
