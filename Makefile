.PHONY: build dev clean docker docker-down lint format knip

dev:
	pnpm dev

build:
	pnpm build

clean:
	pnpm exec turbo clean
	rm -rf dist build .turbo .next node_modules **/node_modules **/dist **/.next

docker:
	docker compose up -d

docker-down:
	docker compose down

lint:
	pnpm lint

format:
	pnpm format

knip:
	pnpm knip
