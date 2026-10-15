CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE member_role AS ENUM ('ADMIN','PLANNER','SUPERVISOR','OPERATOR','VIEWER');
CREATE TYPE activity_status AS ENUM ('NOT_STARTED','IN_PROGRESS','PAUSED','COMPLETED','ARCHIVED');
CREATE TYPE dependency_type AS ENUM ('FS','SS','FF','SF');
CREATE TYPE blocker_kind AS ENUM ('INFORMATIONAL','BLOCKING');
CREATE TYPE schedule_run_state AS ENUM ('PENDING','RUNNING','SUCCEEDED','FAILED','UNAVAILABLE');

CREATE TABLE users (
  id uuid PRIMARY KEY, issuer text NOT NULL, subject text NOT NULL, display_name text NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (issuer, subject)
);
CREATE TABLE shutdowns (
  id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, timezone text NOT NULL, version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  input_revision bigint NOT NULL DEFAULT 0 CHECK (input_revision >= 0), event_sequence bigint NOT NULL DEFAULT 0 CHECK (event_sequence >= 0),
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shutdown_members (
  shutdown_id uuid NOT NULL REFERENCES shutdowns(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id), role member_role NOT NULL, active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 0 CHECK(version >= 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(shutdown_id,user_id)
);
CREATE TABLE wbs_nodes (
  id uuid PRIMARY KEY, shutdown_id uuid NOT NULL REFERENCES shutdowns(id) ON DELETE CASCADE, parent_id uuid, code text NOT NULL, name text NOT NULL,
  version integer NOT NULL DEFAULT 0 CHECK(version >= 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shutdown_id,id), UNIQUE(shutdown_id,code), FOREIGN KEY(shutdown_id,parent_id) REFERENCES wbs_nodes(shutdown_id,id) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE TABLE calendars (
  id uuid PRIMARY KEY, shutdown_id uuid NOT NULL REFERENCES shutdowns(id) ON DELETE CASCADE, name text NOT NULL, timezone text NOT NULL, version integer NOT NULL DEFAULT 0 CHECK(version>=0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(shutdown_id,id), UNIQUE(shutdown_id,name)
);
CREATE TABLE calendar_windows (
  id uuid PRIMARY KEY, calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE, weekday smallint NOT NULL CHECK(weekday BETWEEN 0 AND 6), start_minute integer NOT NULL CHECK(start_minute BETWEEN 0 AND 1439), end_minute integer NOT NULL CHECK(end_minute BETWEEN 1 AND 1440), CHECK(start_minute < end_minute), UNIQUE(calendar_id,weekday,start_minute,end_minute)
);
CREATE TABLE calendar_exceptions (
  id uuid PRIMARY KEY, calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE, local_date date NOT NULL, is_working boolean NOT NULL, start_minute integer CHECK(start_minute BETWEEN 0 AND 1439), end_minute integer CHECK(end_minute BETWEEN 1 AND 1440), CHECK((start_minute IS NULL AND end_minute IS NULL) OR start_minute < end_minute), UNIQUE(calendar_id,local_date)
);
CREATE TABLE resources (
  id uuid PRIMARY KEY, shutdown_id uuid NOT NULL REFERENCES shutdowns(id) ON DELETE CASCADE, code text NOT NULL, name text NOT NULL, capacity numeric(12,3) NOT NULL CHECK(capacity > 0), calendar_id uuid, version integer NOT NULL DEFAULT 0 CHECK(version>=0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(shutdown_id,id), UNIQUE(shutdown_id,code), FOREIGN KEY(shutdown_id,calendar_id) REFERENCES calendars(shutdown_id,id)
);
CREATE TABLE resource_memberships (
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(resource_id,user_id)
);
CREATE TABLE activities (
  id uuid PRIMARY KEY, shutdown_id uuid NOT NULL REFERENCES shutdowns(id) ON DELETE CASCADE, wbs_id uuid, code text NOT NULL, name text NOT NULL, is_milestone boolean NOT NULL DEFAULT false, is_summary boolean NOT NULL DEFAULT false,
  planned_duration_minutes integer CHECK(planned_duration_minutes >= 0), remaining_duration_minutes integer CHECK(remaining_duration_minutes >= 0), weight numeric(16,6) NOT NULL DEFAULT 1 CHECK(weight >= 0), progress_bp integer NOT NULL DEFAULT 0 CHECK(progress_bp BETWEEN 0 AND 10000), status activity_status NOT NULL DEFAULT 'NOT_STARTED', version integer NOT NULL DEFAULT 0 CHECK(version>=0), last_observed_at timestamptz, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shutdown_id,id), UNIQUE(shutdown_id,code), FOREIGN KEY(shutdown_id,wbs_id) REFERENCES wbs_nodes(shutdown_id,id), CHECK(NOT(is_milestone AND planned_duration_minutes IS NOT NULL AND planned_duration_minutes <> 0))
);
CREATE TABLE dependencies (
  id uuid PRIMARY KEY, shutdown_id uuid NOT NULL REFERENCES shutdowns(id) ON DELETE CASCADE, predecessor_id uuid NOT NULL, successor_id uuid NOT NULL, type dependency_type NOT NULL, lag_working_minutes integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(shutdown_id,predecessor_id,successor_id,type), CHECK(predecessor_id <> successor_id), FOREIGN KEY(shutdown_id,predecessor_id) REFERENCES activities(shutdown_id,id), FOREIGN KEY(shutdown_id,successor_id) REFERENCES activities(shutdown_id,id)
);
CREATE TABLE allocations (
  id uuid PRIMARY KEY, shutdown_id uuid NOT NULL REFERENCES shutdowns(id) ON DELETE CASCADE, activity_id uuid NOT NULL, resource_id uuid NOT NULL, units numeric(12,3) NOT NULL CHECK(units > 0), version integer NOT NULL DEFAULT 0 CHECK(version>=0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(shutdown_id,id), UNIQUE(activity_id,resource_id), FOREIGN KEY(shutdown_id,activity_id) REFERENCES activities(shutdown_id,id), FOREIGN KEY(shutdown_id,resource_id) REFERENCES resources(shutdown_id,id)
);
CREATE TABLE progress_reports (
  id uuid PRIMARY KEY, shutdown_id uuid NOT NULL REFERENCES shutdowns(id) ON DELETE CASCADE, activity_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), supersedes_id uuid UNIQUE, progress_bp integer NOT NULL CHECK(progress_bp BETWEEN 0 AND 10000), hours_increment numeric(14,3) NOT NULL CHECK(hours_increment >= 0), remaining_duration_minutes integer CHECK(remaining_duration_minutes>=0), note text, justification text, observed_at timestamptz NOT NULL, effective boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(shutdown_id,activity_id) REFERENCES activities(shutdown_id,id), FOREIGN KEY(shutdown_id,supersedes_id) REFERENCES progress_reports(shutdown_id,id)
);
CREATE TABLE activity_intervals (
  id uuid PRIMARY KEY, shutdown_id uuid NOT NULL REFERENCES shutdowns(id) ON DELETE CASCADE, activity_id uuid NOT NULL, started_at timestamptz NOT NULL, ended_at timestamptz, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(shutdown_id,activity_id) REFERENCES activities(shutdown_id,id), CHECK(ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX one_open_interval_per_activity ON activity_intervals(activity_id) WHERE ended_at IS NULL;
CREATE TABLE blockers (
  id uuid PRIMARY KEY, shutdown_id uuid NOT NULL REFERENCES shutdowns(id) ON DELETE CASCADE, activity_id uuid NOT NULL, kind blocker_kind NOT NULL, title text NOT NULL, description text, observed_at timestamptz NOT NULL, resolved_at timestamptz, resolved_by uuid REFERENCES users(id), resolution_justification text, version integer NOT NULL DEFAULT 0 CHECK(version>=0), created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(shutdown_id,activity_id) REFERENCES activities(shutdown_id,id)
);
CREATE TABLE evidence_files (
  id uuid PRIMARY KEY, shutdown_id uuid NOT NULL REFERENCES shutdowns(id) ON DELETE CASCADE, state text NOT NULL CHECK(state IN ('PENDING','READY','REJECTED')), storage_key text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(shutdown_id,id)
);
CREATE TABLE domain_events (
  shutdown_id uuid NOT NULL REFERENCES shutdowns(id) ON DELETE CASCADE, sequence bigint NOT NULL CHECK(sequence > 0), id uuid NOT NULL DEFAULT gen_random_uuid(), type text NOT NULL, payload jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), actor_id uuid REFERENCES users(id), PRIMARY KEY(shutdown_id,sequence), UNIQUE(id)
);
CREATE TABLE outbox (
  event_id uuid PRIMARY KEY REFERENCES domain_events(id) ON DELETE RESTRICT, shutdown_id uuid NOT NULL, payload jsonb NOT NULL, attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid, published_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(shutdown_id,event_id) REFERENCES domain_events(shutdown_id,id)
);
CREATE INDEX outbox_pending_idx ON outbox(available_at) WHERE published_at IS NULL;
CREATE TABLE command_receipts (
  shutdown_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), command_id uuid NOT NULL, request_hash bytea NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(shutdown_id,actor_id,command_id)
);
CREATE TABLE provision_command_receipts (
  actor_id uuid NOT NULL REFERENCES users(id), command_id uuid NOT NULL, request_hash bytea NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,command_id)
);
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shutdown_id uuid NOT NULL REFERENCES shutdowns(id) ON DELETE CASCADE, actor_id uuid REFERENCES users(id), action text NOT NULL, entity_type text NOT NULL, entity_id uuid, before_state jsonb, after_state jsonb, justification text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE schedule_runs (
  id uuid PRIMARY KEY, shutdown_id uuid NOT NULL REFERENCES shutdowns(id) ON DELETE CASCADE, input_revision bigint NOT NULL, state schedule_run_state NOT NULL, result jsonb, error_code text, created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz, UNIQUE(shutdown_id,input_revision)
);
CREATE OR REPLACE FUNCTION immutable_domain_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'domain history is immutable'; END; $$;
CREATE TRIGGER domain_events_immutable BEFORE UPDATE OR DELETE ON domain_events FOR EACH ROW EXECUTE FUNCTION immutable_domain_history();
CREATE TRIGGER progress_reports_immutable BEFORE DELETE ON progress_reports FOR EACH ROW EXECUTE FUNCTION immutable_domain_history();
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION immutable_domain_history();
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
