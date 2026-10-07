.PHONY: all verify deps public

all: verify

verify: public
	@python -u scripts/verify_build.py

public: | public/js public/js/modes public/icons
	@echo "public package ready"

public/js:
	 mkdir -p public/js/modes public/icons

deps:
	@python -c "import http.server, json, pathlib, re, sys; print('stdlib ok')"
	@python -c "from PIL import Image; print('PIL ok')"
