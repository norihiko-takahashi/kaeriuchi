-- U8：ログインと同期の表（nfr-design.md §3）
-- 表の持ち主は移行の役割（管理用）。アプリは kaeriuchi_app の役割で入り、記録の表は行ごとのアクセス制御（RLS）で
-- ログインした保護者の行だけが見える（U8-SEC-4）。
-- 時刻はミリ秒（bigint）。学習の記録の日付は 'YYYY-MM-DD'（時刻は残さない・NFR-P11）。

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kaeriuchi_app') THEN
    CREATE ROLE kaeriuchi_app NOLOGIN;
  END IF;
END
$$;

CREATE TABLE guardians (
  id text PRIMARY KEY,
  -- 小文字にそろえる
  email text NOT NULL UNIQUE,
  created_at bigint NOT NULL,
  -- アカウントの削除の印（7日たったら本当に消す）
  deleted_at bigint
);

CREATE TABLE login_tokens (
  hash text PRIMARY KEY,
  email text NOT NULL,
  expires_at bigint NOT NULL,
  used boolean NOT NULL DEFAULT false
);

CREATE TABLE link_codes (
  hash text PRIMARY KEY,
  guardian_id text NOT NULL REFERENCES guardians (id) ON DELETE CASCADE,
  expires_at bigint NOT NULL
);
CREATE INDEX link_codes_guardian ON link_codes (guardian_id);

CREATE TABLE sessions (
  hash text PRIMARY KEY,
  guardian_id text NOT NULL REFERENCES guardians (id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_name text NOT NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  auth_at bigint NOT NULL,
  last_seen_day text NOT NULL
);
CREATE INDEX sessions_guardian ON sessions (guardian_id);

CREATE TABLE passkeys (
  id text PRIMARY KEY,
  guardian_id text NOT NULL REFERENCES guardians (id) ON DELETE CASCADE,
  public_key text NOT NULL,
  counter bigint NOT NULL,
  transports jsonb,
  created_at bigint NOT NULL
);
CREATE INDEX passkeys_guardian ON passkeys (guardian_id);

CREATE TABLE challenges (
  key text PRIMARY KEY,
  challenge text NOT NULL,
  expires_at bigint NOT NULL
);

-- 回数の制限（U8-SEC-6）
CREATE TABLE rate_hits (
  key text NOT NULL,
  at bigint NOT NULL
);
CREATE INDEX rate_hits_key_at ON rate_hits (key, at);

-- 同期する記録（種類をまとめて1つの表）
CREATE SEQUENCE records_seq;
CREATE TABLE records (
  guardian_id text NOT NULL REFERENCES guardians (id) ON DELETE CASCADE,
  entity text NOT NULL,
  id text NOT NULL,
  version integer NOT NULL,
  updated_at text,
  child_id text,
  payload jsonb NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  deleted_day text,
  deleted_by text,
  seq bigint NOT NULL,
  PRIMARY KEY (guardian_id, entity, id)
);
CREATE INDEX records_guardian_seq ON records (guardian_id, seq);
CREATE INDEX records_guardian_child ON records (guardian_id, child_id);
CREATE INDEX records_deleted_day ON records (deleted_day) WHERE deleted;

-- AI の1日の回数（子どもごと・U8 §6）
CREATE TABLE ai_usage (
  guardian_id text NOT NULL REFERENCES guardians (id) ON DELETE CASCADE,
  child_id text NOT NULL,
  day text NOT NULL,
  route text NOT NULL,
  count integer NOT NULL,
  PRIMARY KEY (guardian_id, child_id, day, route)
);

-- 行ごとのアクセス制御：アプリの役割は、トランザクションで設定した保護者の行だけ（U8-SEC-4）
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
CREATE POLICY records_guardian ON records TO kaeriuchi_app
  USING (guardian_id = current_setting('app.guardian_id', true))
  WITH CHECK (guardian_id = current_setting('app.guardian_id', true));
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_guardian ON ai_usage TO kaeriuchi_app
  USING (guardian_id = current_setting('app.guardian_id', true))
  WITH CHECK (guardian_id = current_setting('app.guardian_id', true));

-- 毎日の削除（U8-PRIV-2）。アプリの役割はほかの家庭の行を見られないので、持ち主の権限で動く関数にする。
-- 消した数だけを返す（中身は残さない）
CREATE FUNCTION kaeriuchi_purge(before_day text, before_ms bigint, now_ms bigint)
RETURNS TABLE (records integer, guardians integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r integer; g integer;
BEGIN
  DELETE FROM records WHERE deleted AND deleted_day <= before_day;
  GET DIAGNOSTICS r = ROW_COUNT;
  -- アカウントを消して7日たった保護者（セッション・パスキー・記録も一緒に消える）
  DELETE FROM guardians WHERE deleted_at IS NOT NULL AND deleted_at <= before_ms;
  GET DIAGNOSTICS g = ROW_COUNT;
  DELETE FROM login_tokens WHERE expires_at <= now_ms;
  DELETE FROM link_codes WHERE expires_at <= now_ms;
  DELETE FROM challenges WHERE expires_at <= now_ms;
  DELETE FROM sessions WHERE expires_at <= now_ms;
  DELETE FROM rate_hits WHERE at <= now_ms - 86400000;
  RETURN QUERY SELECT r, g;
END
$$;
REVOKE ALL ON FUNCTION kaeriuchi_purge(text, bigint, bigint) FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  guardians, login_tokens, link_codes, sessions, passkeys, challenges, rate_hits, records, ai_usage
  TO kaeriuchi_app;
GRANT USAGE ON SEQUENCE records_seq TO kaeriuchi_app;
GRANT EXECUTE ON FUNCTION kaeriuchi_purge(text, bigint, bigint) TO kaeriuchi_app;
