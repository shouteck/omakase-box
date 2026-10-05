CREATE TYPE "public"."external_reservation_state" AS ENUM('active', 'in_review', 'accepted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."external_submission_state" AS ENUM('received', 'public_evaluating', 'private_evaluating', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_failure');--> statement-breakpoint
CREATE TABLE "external_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" varchar(64) NOT NULL,
	"password_hash" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "external_accounts_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "external_attempt_outbox" (
	"permit_id" uuid PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "external_feedback" (
	"public_id" uuid PRIMARY KEY NOT NULL,
	"submission_id" uuid NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_invitations" (
	"token_hash" char(64) PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"redeemed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "external_task_lineages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evaluated_attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "external_lineage_budget_nonnegative" CHECK ("external_task_lineages"."evaluated_attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "external_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"task_version" integer NOT NULL,
	"package_hash" char(64) NOT NULL,
	"contributor_id" uuid NOT NULL,
	"terms_hash" char(64) NOT NULL,
	"state" "external_reservation_state" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"evaluated_attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "external_reservation_version_positive" CHECK ("external_reservations"."version" > 0 AND "external_reservations"."evaluated_attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "external_sessions" (
	"token_hash" char(64) PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"csrf_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reservation_id" uuid NOT NULL,
	"contributor_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"task_version" integer NOT NULL,
	"package_hash" char(64) NOT NULL,
	"submission_hash" char(64) NOT NULL,
	"patch" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"permit_id" uuid NOT NULL,
	"permit" jsonb NOT NULL,
	"state" "external_submission_state" DEFAULT 'received' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded" boolean DEFAULT false NOT NULL,
	CONSTRAINT "external_submissions_permit_id_unique" UNIQUE("permit_id"),
	CONSTRAINT "external_submission_idempotency" UNIQUE("contributor_id","idempotency_key"),
	CONSTRAINT "external_patch_byte_limit" CHECK (octet_length("external_submissions"."patch") <= 1048576),
	CONSTRAINT "external_submission_version_positive" CHECK ("external_submissions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "external_task_versions" (
	"id" uuid NOT NULL,
	"version" integer NOT NULL,
	"lineage_id" uuid NOT NULL,
	"package_hash" char(64) NOT NULL,
	"contract" jsonb NOT NULL,
	"listing" jsonb NOT NULL,
	"envelope" jsonb NOT NULL,
	"withdrawn" boolean DEFAULT false NOT NULL,
	CONSTRAINT "external_task_versions_id_version_pk" PRIMARY KEY("id","version"),
	CONSTRAINT "external_task_exact_binding" UNIQUE("id","version","package_hash"),
	CONSTRAINT "external_task_version_positive" CHECK ("external_task_versions"."version" > 0),
	CONSTRAINT "external_package_hash_syntax" CHECK ("external_task_versions"."package_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "external_workspace_attempts" (
	"permit_id" uuid PRIMARY KEY NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_attempt_outbox" ADD CONSTRAINT "external_attempt_outbox_permit_id_external_submissions_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."external_submissions"("permit_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_feedback" ADD CONSTRAINT "external_feedback_submission_id_external_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."external_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_reservations" ADD CONSTRAINT "external_reservations_contributor_id_external_accounts_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."external_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_reservations" ADD CONSTRAINT "external_reservations_task_id_task_version_package_hash_external_task_versions_id_version_package_hash_fk" FOREIGN KEY ("task_id","task_version","package_hash") REFERENCES "public"."external_task_versions"("id","version","package_hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sessions" ADD CONSTRAINT "external_sessions_account_id_external_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."external_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_submissions" ADD CONSTRAINT "external_submissions_reservation_id_external_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."external_reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_submissions" ADD CONSTRAINT "external_submissions_contributor_id_external_accounts_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."external_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_submissions" ADD CONSTRAINT "external_submissions_task_id_task_version_package_hash_external_task_versions_id_version_package_hash_fk" FOREIGN KEY ("task_id","task_version","package_hash") REFERENCES "public"."external_task_versions"("id","version","package_hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_task_versions" ADD CONSTRAINT "external_task_versions_lineage_id_external_task_lineages_id_fk" FOREIGN KEY ("lineage_id") REFERENCES "public"."external_task_lineages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_workspace_attempts" ADD CONSTRAINT "external_workspace_attempts_permit_id_external_submissions_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."external_submissions"("permit_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_one_live_reservation" ON "external_reservations" USING btree ("task_id","task_version") WHERE "external_reservations"."state" IN ('active', 'in_review');