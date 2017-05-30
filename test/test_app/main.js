// Reference: https://github.com/npm/npm/wiki/Writing-Tests-For-npm

"use strict";

const cp = require('child_process');
const test = require('tap').test

const npm_package_config = require('../../index.js');

const packageA = require('package_a');

function cleanup() {
	cp.execSync("npm config delete test_app:apple");
	cp.execSync("npm config delete test_app:tomato");
	cp.execSync("npm config delete test_app:banana");

	cp.execSync("npm config delete package_a:keyA");
	cp.execSync("npm config delete package_a:keyB");
};

function setup() {
	cleanup();
};

test('setup', function(t) {
	setup();

	t.end();
})

test('test_app-Sync', function(t) {
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

test('test_app-Cleanup', function(t) {
	cleanup();

	t.end();
});

test('test_app-Async', function(t) {
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

test('test_app-Async-Cleanup', function(t) {
	cleanup();

	t.end();
});

test('packageA-Sync', function(t) {
	let expected, actual;

	expected = {
        package_name: 'package_a',
        package_version: '0.1.0',
        package_description: "Test package",
        package_author: "Claude Petit <doodadjs@gmail.com> (https://github.com/doodadjs/)",
        package_license: 'MIT',
		keyA: '1',
		keyB: 2,
	};
	actual = npm_package_config.list('package_a');
	t.strictSame(actual, expected, "Without override.")

	cp.execSync("npm config set package_a:keyA Hello");
	expected = {
        package_name: 'package_a',
        package_version: '0.1.0',
        package_description: "Test package",
        package_author: "Claude Petit <doodadjs@gmail.com> (https://github.com/doodadjs/)",
        package_license: 'MIT',
		keyA: 'Hello',
		keyB: 2,
	};
	actual = npm_package_config.list('package_a');
	t.strictSame(actual, expected, "'keyA' overriden by 'Hello'.")

	t.done();
});

test('packageA-Cleanup', function(t) {
	cleanup();

	t.end();
});

test('packageA-Async', function(t) {
	npm_package_config.list('package_a', {async: true})
		.then(function(actual) {
			const expected = {
				package_name: 'package_a',
				package_version: '0.1.0',
				package_description: "Test package",
				package_author: "Claude Petit <doodadjs@gmail.com> (https://github.com/doodadjs/)",
				package_license: 'MIT',
				keyA: '1',
				keyB: 2,
			};
			t.strictSame(actual, expected, "Without override.")

			cp.execSync("npm config set package_a:keyA Hello");

			return npm_package_config.list('package_a', {async: true});
		})
		.then(function(actual) {
			const expected = {
				package_name: 'package_a',
				package_version: '0.1.0',
				package_description: "Test package",
				package_author: "Claude Petit <doodadjs@gmail.com> (https://github.com/doodadjs/)",
				package_license: 'MIT',
				keyA: 'Hello',
				keyB: 2,
			};
			t.strictSame(actual, expected, "'keyA' overriden by 'Hello'.")

			t.done();
		});
});

test('packageA-Async-Cleanup', function(t) {
	cleanup();

	t.end();
});