.PHONY: run clean rebuild ingest

run:
	docker-compose up

rebuild:
	docker-compose up --build

clean:
	docker-compose down
	rm -rf backend/__pycache__
	rm -rf data/*.duckdb
	rm -rf custom_runs

ingest:
	docker-compose run backend python /scripts/ingest_excel.py
