-- Add-in API keys, generated in the web app instead of shared through an
-- environment variable. Run once in the Supabase SQL editor.
-- (schema.sql already contains this for a fresh project.)

BEGIN;

CREATE TABLE IF NOT EXISTS addin_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Names the machine the key was issued for, so the right one can be revoked.
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 60),

  -- Leading fragment of the secret, safe to display after it is hidden.
  key_preview TEXT NOT NULL,

  -- SHA-256 of the full key. The secret itself is shown once, at creation, and
  -- never stored — a dump of this table yields nothing usable.
  key_hash TEXT NOT NULL UNIQUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

-- Every add-in request looks a key up by hash, so this is the hot path.
CREATE INDEX IF NOT EXISTS addin_api_keys_hash_idx
  ON addin_api_keys (key_hash) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS addin_api_keys_user_idx
  ON addin_api_keys (user_id, created_at DESC);

-- RLS on with no policies: the table is reachable only through the service
-- role, i.e. only through /api/addin-keys. Browsers never touch it directly,
-- and the anon key cannot read the hashes.
ALTER TABLE addin_api_keys ENABLE ROW LEVEL SECURITY;

COMMIT;
