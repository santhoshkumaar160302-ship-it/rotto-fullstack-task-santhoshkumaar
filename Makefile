.PHONY: setup dev

# Installs dependencies, starts local Supabase, applies migrations,
# writes .env with local Supabase settings and loads candidates.json.
setup:
	npm ci
	npx supabase status > /dev/null 2>&1 || npx supabase start
	npx supabase db reset
	node scripts/write-env.mts
	node scripts/seed.mts

# Serves the app on http://localhost:3000
dev:
	node scripts/warm-up.mts &
	npm run dev