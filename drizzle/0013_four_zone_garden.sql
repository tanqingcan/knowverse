ALTER TABLE planet_layout_items DROP CONSTRAINT IF EXISTS planet_layout_items_kind_ck;
--> statement-breakpoint
ALTER TABLE planet_layout_items ADD CONSTRAINT planet_layout_items_kind_ck CHECK (kind IN ('lamp','bush','tree','pot','stone','fence','chair','flower','flower2','flower3','rock','rose','soil','road','cottage','greenhouse','observatory','seedshed','arch','pond','sign','lotus','grassGroup','wildflowerGroup'));
--> statement-breakpoint
CREATE TABLE garden_knowledge_places (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 concept_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
 place text NOT NULL CHECK (place IN ('seed','rose','aquatic')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, concept_id, place)
);
