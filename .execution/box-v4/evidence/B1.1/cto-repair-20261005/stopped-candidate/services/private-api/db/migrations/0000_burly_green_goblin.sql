CREATE TYPE "public"."private_evaluation_state" AS ENUM('received', 'public_evaluating', 'private_evaluating', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_failure');--> statement-breakpoint
CREATE TYPE "public"."intent_state" AS ENUM('draft', 'needs_decision', 'ready_for_approval', 'approved');--> statement-breakpoint
CREATE TYPE "public"."payment_obligation_state" AS ENUM('due', 'settlement_recorded');--> statement-breakpoint
CREATE TYPE "public"."private_role" AS ENUM('requester', 'owner', 'operator');--> statement-breakpoint
CREATE TABLE "private_acceptances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"submission_hash" char(64) NOT NULL,
	"package_hash" char(64) NOT NULL,
	"private_base_revision" char(64) NOT NULL,
	"candidate_diff_hash" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_acceptances_event_id_unique" UNIQUE("event_id"),
	CONSTRAINT "private_acceptances_evaluation_id_unique" UNIQUE("evaluation_id")
);
--> statement-breakpoint
CREATE TABLE "private_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" varchar(64) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "private_role" NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "private_accounts_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "private_evaluations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"permit_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"task_version" integer NOT NULL,
	"submission_id" uuid NOT NULL,
	"submission_hash" char(64) NOT NULL,
	"package_hash" char(64) NOT NULL,
	"private_base_revision" char(64) NOT NULL,
	"state" "private_evaluation_state" DEFAULT 'received' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"result" jsonb,
	"superseded" boolean DEFAULT false NOT NULL,
	CONSTRAINT "private_evaluations_permit_id_unique" UNIQUE("permit_id"),
	CONSTRAINT "private_evaluation_exact_binding" UNIQUE("id","submission_hash","package_hash","private_base_revision"),
	CONSTRAINT "private_evaluation_version_positive" CHECK ("private_evaluations"."version" > 0 AND "private_evaluations"."task_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "private_feedback_outbox" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "private_intent_heads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"current_version" integer NOT NULL,
	CONSTRAINT "private_intent_head_positive" CHECK ("private_intent_heads"."current_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "private_intent_revisions" (
	"id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "intent_state" NOT NULL,
	"payload" jsonb NOT NULL,
	"content_hash" char(64) NOT NULL,
	"snapshot_hash" char(64) NOT NULL,
	"requester_id" uuid NOT NULL,
	"approved_by" uuid,
	"approved_hash" char(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_intent_revisions_id_version_pk" PRIMARY KEY("id","version"),
	CONSTRAINT "private_intent_version_positive" CHECK ("private_intent_revisions"."version" > 0),
	CONSTRAINT "private_intent_hash_syntax" CHECK ("private_intent_revisions"."content_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "private_intent_approval_bound" CHECK ("private_intent_revisions"."state" <> 'approved' OR ("private_intent_revisions"."approved_by" IS NOT NULL AND "private_intent_revisions"."approved_hash" = "private_intent_revisions"."content_hash"))
);
--> statement-breakpoint
CREATE TABLE "private_invitations" (
	"token_hash" char(64) PRIMARY KEY NOT NULL,
	"role" "private_role" NOT NULL,
	"issuer_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"redeemed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "private_payment_obligations" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"acceptance_id" uuid,
	"payee_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"currency" char(3) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"state" "payment_obligation_state" DEFAULT 'due' NOT NULL,
	"settlement_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_payment_obligations_acceptance_id_unique" UNIQUE("acceptance_id"),
	CONSTRAINT "private_money_bounded" CHECK ("private_payment_obligations"."amount_minor" >= 0 AND "private_payment_obligations"."amount_minor" <= 9007199254740991),
	CONSTRAINT "private_settlement_reference_required" CHECK ("private_payment_obligations"."state" <> 'settlement_recorded' OR "private_payment_obligations"."settlement_reference" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "private_release_approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"task_version" integer NOT NULL,
	"manifest_hash" char(64) NOT NULL,
	"manifest" jsonb NOT NULL,
	"private_revision" char(64) NOT NULL,
	"owner_id" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_release_approvals_manifest_hash_unique" UNIQUE("manifest_hash"),
	CONSTRAINT "private_release_task_version_unique" UNIQUE("task_id","task_version"),
	CONSTRAINT "private_release_version_positive" CHECK ("private_release_approvals"."task_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "private_sessions" (
	"token_hash" char(64) PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"csrf_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "private_acceptances" ADD CONSTRAINT "private_acceptances_evaluation_id_private_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."private_evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_acceptances" ADD CONSTRAINT "private_acceptances_owner_id_private_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."private_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_intent_revisions" ADD CONSTRAINT "private_intent_revisions_requester_id_private_accounts_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."private_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_intent_revisions" ADD CONSTRAINT "private_intent_revisions_approved_by_private_accounts_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."private_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_invitations" ADD CONSTRAINT "private_invitations_issuer_id_private_accounts_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."private_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_payment_obligations" ADD CONSTRAINT "private_payment_obligations_acceptance_id_private_acceptances_id_fk" FOREIGN KEY ("acceptance_id") REFERENCES "public"."private_acceptances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_release_approvals" ADD CONSTRAINT "private_release_approvals_owner_id_private_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."private_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_sessions" ADD CONSTRAINT "private_sessions_account_id_private_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."private_accounts"("id") ON DELETE no action ON UPDATE no action;