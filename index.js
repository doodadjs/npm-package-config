/*
Copyright (c) 2015-2017 Claude Petit


Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:


The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.


THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

"use strict";


const path = require('path'),
	cp = require('child_process'),
	fs = require('fs');


const natives = {
	hasKey: Object.prototype.hasOwnProperty.call.bind(Object.prototype.hasOwnProperty),
};


function get(obj, key, /*optional*/defaultValue) {
	if ((obj != null) && natives.hasKey(obj, key)) {
		return obj[key];
	} else {
		return defaultValue;
	};
};


const Module = require('module').Module,
	_require = function(_module, path) {
		return Module._load(path, _module);
	};
	

const PACKAGE_JSON_FILE = 'package.json';
const NPM_COMMAND = 'npm -v && npm config list';

const CLI_SECTION_NAME = "; cli configs";
const PROJECT_SECTION_NAME = "; project config "; // npm v5
const USER_SECTION_NAME = "; userconfig ";
const GLOBAL_SECTION_NAME = "; globalconfig ";
const BUILT_IN_SECTION_NAME = "; builtin config ";


let MAIN_MODULE = null,
	MAIN_PATH = null,
	MAIN_PACKAGE = null;


function init() {
	if (!MAIN_MODULE) {
		MAIN_MODULE = module.parent;

		whileParent: while (MAIN_MODULE) {
			if (MAIN_MODULE.filename) {
				MAIN_PATH = path.dirname(MAIN_MODULE.filename) + path.sep;

				try {
					MAIN_PACKAGE = JSON.parse(fs.readFileSync(MAIN_PATH + PACKAGE_JSON_FILE));

					break whileParent;

				} catch(ex) {
					if (ex.code !== 'ENOENT') {
						throw ex;
					};
				};
			};

			const paths = MAIN_MODULE.paths,
				pathsLen = paths.length;

			for (let i = 0; i < pathsLen; i++) {
				const tmp = paths[i].split(/\/|\\/);
				if (tmp.slice(-1)[0] === 'node_modules') {
					 tmp.pop();
				};
				MAIN_PATH = tmp.join(path.sep) + path.sep;

				try {
					MAIN_PACKAGE = JSON.parse(fs.readFileSync(MAIN_PATH + PACKAGE_JSON_FILE));

					break whileParent;

				} catch(ex) {
					if (ex.code !== 'ENOENT') {
						throw ex;
					};
				};
			};

			MAIN_MODULE = MAIN_MODULE.parent;
		};

		if (!MAIN_MODULE || !MAIN_PATH || !MAIN_PACKAGE) {
			MAIN_MODULE = require.main || module;
			if (MAIN_MODULE.filename) {
				MAIN_PATH = path.dirname(MAIN_MODULE.filename) + path.sep;
			} else {
				MAIN_PATH = process.cwd() + path.sep;
			};
			MAIN_PACKAGE = JSON.parse(fs.readFileSync(MAIN_PATH + PACKAGE_JSON_FILE));
		};
	};
};


function getLines(fileContent) {
	return fileContent.split(/\n\r|\r\n|\n|\r/);
};


function reduceEnvironment(state) {
	const NPM_KEY = (process.env.npm_package_name ? 'npm_package_config_' : 'npm_config_'),
		NPM_KEY_LEN = NPM_KEY.length,
		envKeys = Object.keys(process.env);

	envKeys.forEach(function(key) {
		if (key.toLowerCase().startsWith(NPM_KEY)) {
			const id = key.slice(NPM_KEY_LEN);
			if (id) {
				state.config.env[id] = process.env[key];
			};
		};
	});
};


function reducePackageConfig(result, packageConfig, parent, type) {
	const replaceRegEx = /[^A-Za-z0-9_]/g;
	if ((packageConfig !== null) && (typeof packageConfig === 'object')) {
		Object.keys(packageConfig).forEach(function(key) {
			if (
					((type === 'package') && (key !== 'config') && (key !== 'dependencies')) ||
					(type === 'config')
				) {
				const val = packageConfig[key];
				key = key.replace(replaceRegEx, '_');
				if (key) {
					reducePackageConfig(result, val, parent + key + '_', type);
				};
			};
		});
	} else {
		let key = parent.slice(0, -1);
		if (key) {
			result.package[key] = packageConfig;
		};
	};
};


function parse(state, lines, /*optional*/section) {
	let currentSection = section;
	lines.forEach(function(line) {
			line = line.trim();
			if (!section && line.startsWith(CLI_SECTION_NAME)) {
				currentSection = 'cli';
			} else if (!section && (state.npmVersion >= 5) && line.startsWith(PROJECT_SECTION_NAME)) { // npm v5
				currentSection = 'project';
			} else if (!section && line.startsWith(USER_SECTION_NAME)) {
				currentSection = 'user';
			} else if (!section && line.startsWith(GLOBAL_SECTION_NAME)) {
				currentSection = 'global';
			} else if (!section && line.startsWith(BUILT_IN_SECTION_NAME)) {
				currentSection = 'builtin';
			} else if (!line || line.startsWith(';')) {
				// Skip comments
			} else if (currentSection && (currentSection !== 'cli') && (currentSection !== 'builtin')) {
				const posKey = line.indexOf('=');
				let key = line.slice(0, posKey).trim();
				if (key.startsWith("'")) {
					key = key.slice(1, -1);
				};
				const posPrefix = key.lastIndexOf(':');
				const prefix = ((posPrefix >= 0) ? key.slice(0, posPrefix) : '');
				key = ((posPrefix >= 0) ? key.slice(posPrefix + 1) : key);
				if (key) {
					if (!prefix && (currentSection !== 'project')) {
						// Not the package's key/value pair
						return;
					};
					if (state.projectName && (prefix === state.projectName)) {
						// That's a key/value pair of the current application
					} else if (prefix !== state.packageName) { // NOTE: Values can be empty strings
						// Not the package's key/value pair
						return;
					};
					let val = line.slice(posKey + 1).trim();
					try {
						val = JSON.parse(val);
					} catch(ex) {
					};
					state.config[currentSection][key] = val;
				};
			};
		});
};


function combine(state) {
	return Object.assign({}, state.config.package, state.config.global, state.config.user, state.config.project, state.config.env);
};


function beautify(config) {
	return Object.keys(config).reduce(function(result, key) {
		const value = config[key];
		if (key.slice(0, 9) === 'package__') {
			// <PRB> npm uses '_' to illustrate private variables
			key = 'package_$' + key.slice(9);
		};
		key = key.replace(/__/g, '.').split('_');
		let r = result;
		for (let i = 0; i < key.length - 1; i++) {
			let k = key[i];
			if (!k) {
				continue;
			};
			if (k[0] === '$') {
				// <PRB> npm uses '_' to illustrate private variables
				k = '_' + k.slice(1);
			};
			if (!Object.prototype.hasOwnProperty.call(r, k)) {
				r[k] = {};
			};
			r = r[k];
		};
		key = key[key.length - 1];
		if (key) {
			if (key[0] === '$') {
				// <PRB> npm uses '_' to illustrate private variables
				key = '_' + key.slice(1);
			};
		} else {
			key = '_';
		};
		if ((r !== null) && (typeof r === 'object') && key) {
			r[key] = value;
		};
		return result;
	}, {});
};


function prepare(packageName, options) {
	init();


	const state = {
		config: {
			package: {}, 
			global: {}, 
			user: {}, 
			project: {}, 
			env: {}, 
		},
		package: MAIN_PACKAGE,
		packageName: packageName || '',
		projectName: MAIN_PACKAGE.name,
	};

		
	if (!state.packageName || (MAIN_PACKAGE.name === state.packageName)) {
		state.packageName = '';
		reduceEnvironment(state);
	};


	if (state.packageName) {
		state.package = _require(MAIN_MODULE, state.packageName + path.sep + PACKAGE_JSON_FILE);
		state.projectName = '';
	};


	reducePackageConfig(state.config, state.package, 'package_', 'package');
	reducePackageConfig(state.config, state.package.config, '', 'config');


	return state;
};


const npm_package_config = module.exports = {
	listSync: function listSync(/*optional*/packageName, /*optional*/options) {
		const state = prepare(packageName, options);
		const lines = getLines(cp.execSync(NPM_COMMAND, {encoding: 'utf-8', cwd: MAIN_PATH}));
		state.npmVersion = parseInt(lines[0].split('.')[0]);
		parse(state, lines.slice(1));
		if (state.npmVersion < 5) {
			try {
				parse(state, getLines(fs.readFileSync(MAIN_PATH + '.npmrc', {encoding: 'utf-8'})), 'project');
			} catch(ex) {
				if (ex.code !== 'ENOENT') {
					throw ex;
				};
			};
		};
		let result = combine(state);
		if (get(options, 'beautify', false)) {
			result = beautify(result);
		};
		return result;
	},

	listAsync: function listAsync(/*optional*/packageName, /*optional*/options) {
		const Promise = get(options, 'Promise') || global.Promise;

		return new Promise(function(resovle, reject) {
			try {
				const state = prepare(packageName, options);

				function listNpm() {
					return new Promise(function(resolve, reject) {
						cp.exec(NPM_COMMAND, {encoding: 'utf-8', cwd: MAIN_PATH}, function(err, stdout) {
							if (err) {
								reject(err);
							} else {
								const lines = getLines(stdout);
								state.npmVersion = parseInt(lines[0].split('.')[0]);
								parse(state, lines.slice(1));
								resolve();
							};
						});
					});
				};

				function listProject() {
					if (state.npmVersion < 5) {
						return new Promise(function(resolve, reject) {
							fs.readFile(MAIN_PATH + '.npmrc', {encoding: 'utf-8'}, function(err, fileContent) {
								if (err) {
									if (err.code === 'ENOENT') {
										resolve();
									} else {
										reject(err);
									};
								} else {
									parse(state, getLines(fileContent), 'project');
									resolve();
								};
							});
						});
					};
				};
			
				resovle(
					listNpm()
						.then(listProject)
						.then(function() {
							let result = combine(state);
							if (get(options, 'beautify', false)) {
								result = beautify(result);
							};
							return result;
						})
				);
				

			} catch(ex) {
				reject(ex);
			};
		});
	},

	list: function list(/*optional*/packageName, /*optional*/options) {
		if (get(options, 'async', false)) {
			return npm_package_config.listAsync(packageName, options);
		} else {
			return npm_package_config.listSync(packageName, options);
		};
	},
};