-- 報告・採点し直しは、最長1年で消す（2026-11-17 に決定）。毎日の削除の関数に、その日付を足す
DROP FUNCTION kaeriuchi_purge(text, bigint, bigint);

CREATE FUNCTION kaeriuchi_purge(before_day text, before_ms bigint, now_ms bigint, report_before_day text)
RETURNS TABLE (records integer, guardians integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r integer; rr integer; g integer;
BEGIN
  DELETE FROM records WHERE deleted AND deleted_day <= before_day;
  GET DIAGNOSTICS r = ROW_COUNT;
  -- 作った日から1年たった報告・採点し直し
  DELETE FROM records
    WHERE entity IN ('report', 'regrade') AND payload->>'createdDay' <= report_before_day;
  GET DIAGNOSTICS rr = ROW_COUNT;
  -- アカウントを消して7日たった保護者（セッション・パスキー・記録も一緒に消える）
  DELETE FROM guardians WHERE deleted_at IS NOT NULL AND deleted_at <= before_ms;
  GET DIAGNOSTICS g = ROW_COUNT;
  DELETE FROM login_tokens WHERE expires_at <= now_ms;
  DELETE FROM link_codes WHERE expires_at <= now_ms;
  DELETE FROM challenges WHERE expires_at <= now_ms;
  DELETE FROM sessions WHERE expires_at <= now_ms;
  DELETE FROM rate_hits WHERE at <= now_ms - 86400000;
  RETURN QUERY SELECT r + rr, g;
END
$$;
REVOKE ALL ON FUNCTION kaeriuchi_purge(text, bigint, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kaeriuchi_purge(text, bigint, bigint, text) TO kaeriuchi_app;
