"use strict";

const npm_package_config = require('../../../index.js');

const test = require('tap').test
const cp = require('child_process');

const config = npm_package_config.list()

function cleanup() {
	cp.execSync("npm config delete test_app:apple");
	cp.execSync("npm config delete test_app:tomato");
	cp.execSync("npm config delete test_app:banana");
};

function setup() {
	cleanup();
};

test('setup', function(t) {
	setup();

	t.end();
})

test('cli-Sync', function(t) {
	let expected, actual;

	expected = {
		package_name: 'test_app',
		package_description: "Test application",
		package_author: "Claude Petit <doodadjs@gmail.com> (https://github.com/doodadjs/)",
		package_license: 'MIT',
		apple: 'red',
		tomato: 'green',
		banana: 'split',
	};
	actual = npm_package_config.list();
	delete actual.package_version; // Will always change
	t.strictSame(actual, expected, "Without override.")

	cp.execSync("npm config set test_app:apple yellow");
	expected = {
		package_name: 'test_app',
		package_description: "Test application",
		package_author: "Claude Petit <doodadjs@gmail.com> (https://github.com/doodadjs/)",
		package_license: 'MIT',
		apple: 'yellow',
		tomato: 'green',
		banana: 'split',
	};
	actual = npm_package_config.list();
	delete actual.package_version; // Will always change
	t.strictSame(actual, expected, "'apple' overriden by 'yellow'.")

	t.done();
});

test('cli-Sync-Cleanup', function(t) {
	cleanup();

	t.end();
});

test('cli-Async', function(t) {
	npm_package_config.list(null, {async: true})
		.then(function(actual) {
			delete actual.package_version; // Will always change
			const expected = {
				package_name: 'test_app',
				package_description: "Test application",
				package_author: "Claude Petit <doodadjs@gmail.com> (https://github.com/doodadjs/)",
				package_license: 'MIT',
				apple: 'red',
				tomato: 'green',
				banana: 'split',
			};
			t.strictSame(actual, expected, "Without override.")

			cp.execSync("npm config set test_app:apple yellow");

			return npm_package_config.list(null, {async: true});
		})
		.then(function(actual) {
			delete actual.package_version; // Will always change
			const expected = {
				package_name: 'test_app',
				package_description: "Test application",
				package_author: "Claude Petit <doodadjs@gmail.com> (https://github.com/doodadjs/)",
				package_license: 'MIT',
				apple: 'yellow',
				tomato: 'green',
				banana: 'split',
			};
			t.strictSame(actual, expected, "'apple' overriden by 'yellow'.")

			t.done();
		});
});

test('cli-Async-Cleanup', function(t) {
	cleanup();

	t.end();
});

