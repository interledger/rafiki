SOURCE_FILES:=$(shell find src/ -type f -name '*.ts')

.PHONY: build
build: browser/structured-header.min.js

.PHONY: clean
clean:
	rm -r browser/
	rm -r dist/

.PHONY: test
test: lint test/httpwg-tests/list.json dist/build
	node_modules/.bin/nyc node_modules/.bin/mocha

.PHONY: test-debug
test-debug:
	node_modules/.bin/mocha --inspect-brk

.PHONY: lint
lint:
	node_modules/.bin/eslint --quiet 'src/**/*.ts'

.PHONY: fix
fix:
	node_modules/.bin/eslint --quiet 'src/**/*.ts' --fix

.PHONY: watch
watch:
	node_modules/.bin/tsc --watch

.PHONY: browserbuild
browserbuild: dist/build
	mkdir -p browser
	node_modules/.bin/webpack --mode production

dist/build: $(SOURCE_FILES)
	node_modules/.bin/tsc
	@# A fake file to keep track of the last build time
	touch dist/build

browser/structured-header.min.js: browserbuild

test/httpwg-tests/list.json:
	git clone https://github.com/httpwg/structured-header-tests test/httpwg-tests
