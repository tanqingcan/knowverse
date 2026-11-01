CREATE TABLE "planet_layout_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layout_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"x" real NOT NULL,
	"z" real NOT NULL,
	"rot" real DEFAULT 0 NOT NULL,
	"scale" real DEFAULT 1 NOT NULL,
	"width" real,
	"length" real,
	"color" text,
	"stage" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planet_layout_items_kind_ck" CHECK ("planet_layout_items"."kind" in ('lamp','bush','tree','pot','stone','fence','chair','flower','flower2','flower3','rock','rose','soil','road'))
);
--> statement-breakpoint
CREATE TABLE "planet_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planet_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planet_layouts_status_ck" CHECK ("planet_layouts"."status" in ('draft','published')),
	CONSTRAINT "planet_layouts_revision_ck" CHECK ("planet_layouts"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "planet_layout_items" ADD CONSTRAINT "planet_layout_items_layout_id_planet_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."planet_layouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planet_layouts" ADD CONSTRAINT "planet_layouts_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "public"."planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planet_layout_items_layout_idx" ON "planet_layout_items" USING btree ("layout_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "planet_layouts_planet_uq" ON "planet_layouts" USING btree ("planet_id");