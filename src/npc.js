/*
Copyright (c) 2015-2018 Claude Petit


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


const natives = require('./natives.js');
const utils = require('./utils.js');
const SyncPromise = require('./SyncPromise.js');


const PACKAGE_JSON_FILE = 'package.json';
const NPM_COMMAND = 'npm -v && npm config list';

const CLI_SECTION_NAME = "; cli configs";
const PROJECT_SECTION_NAME = "; project config "; // npm v5
const USER_SECTION_NAME = "; userconfig ";
const GLOBAL_SECTION_NAME = "; globalconfig ";
const BUILT_IN_SECTION_NAME = "; builtin config ";


const reduceEnvironment = function _reduceEnvironment(state) {
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


const reducePackageConfig = function _reducePackageConfig(result, packageConfig, parent, type) {
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
		const key = parent.slice(0, -1);
		if (key) {
			result.package[key] = packageConfig;
		};
	};
};


const parse = function _parse(state, lines, /*optional*/section) {
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
					// Do nothing
				};
				state.config[currentSection][key] = val;
			};
		};
	});
};


const combine = function _combine(state) {
	return Object.assign({}, state.config.package, state.config.global, state.config.user, state.config.project, state.config.env);
};


const beautify = function _beautify(config) {
	return Object.keys(config).reduce(function(result, key) {
		const value = config[key];
		if (key.slice(0, 9) === 'package__') {
			// <PRB> npm uses '_' to illustrate private variables
			key = 'package_$' + key.slice(9);
		};
		const keys = key.replace(/__/g, '.').split('_');
		let r = result;
		for (let i = 0; i < keys.length - 1; i++) {
			let k = keys[i];
			if (!k) {
				continue;
			};
			if ((r == null) || (typeof r !== 'object')) {
				break;
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
		if ((r !== null) && (typeof r === 'object')) {
			let k = keys[keys.length - 1];
			if (k) {
				if (k[0] === '$') {
					// <PRB> npm uses '_' to illustrate private variables
					k = '_' + k.slice(1);
				};
				r[k] = value;
			};
		};
		return result;
	}, {});
};


const prepare = function _prepare(Promise, readFile, /*optional*/packageName, /*optional*/options) {
	const createState = function _createState(mainModule, mainPath, packageJson) {
		return {
			config: {
				package: {},
				global: {},
				user: {},
				project: {},
				env: {},
			},
			mainModule: mainModule,
			mainPath: mainPath,
			package: JSON.parse(packageJson),
			packageName: packageName || '',
			projectName: null,
		};
	};

	const loopModulePaths = function _loopModulePaths(_module, index) {
		if (_module && _module.paths && (index < _module.paths.length)) {
			const tmp = _module.paths[index].split(/\/|\\/);
			if (tmp.slice(-1)[0] === 'node_modules') {
				tmp.pop();
			};

			const mainPath = tmp.join(path.sep) + path.sep;

			return readFile(mainPath + PACKAGE_JSON_FILE, {encoding: 'utf-8'})
				.then(function(json) {
					return createState(_module, mainPath, json);
				})
				.catch(function(err) {
					if (err.code === 'ENOENT') {
						return loopModulePaths(_module, index + 1);
					} else {
						throw err;
					};
				});
		} else {
			return Promise.resolve(null);
		};
	};

	const loopParents = function _loopParents(_module) {
		if (_module && _module.filename) {
			const mainPath = path.dirname(_module.filename) + path.sep;

			return readFile(mainPath + PACKAGE_JSON_FILE, {encoding: 'utf-8'})
				.then(function(json) {
					return createState(_module, mainPath, json);
				})
				.catch(function(err) {
					if (err.code === 'ENOENT') {
						return loopModulePaths(_module, 0)
							.then(function(state) {
								if (state) {
									return state;
								} else {
									return loopParents(_module.parent);
								};
							});
					} else {
						throw err;
					};
				});
		} else {
			return Promise.resolve(null);
		};
	};

	return loopParents(utils.get(options, 'module') || module.parent.parent)
		.then(function(state) {
			if (state) {
				return state;
			} else {
				const mainModule = require.main || module.parent;
				const mainPath = (mainModule.filename ? path.dirname(mainModule.filename) + path.sep : process.cwd() + path.sep);
				return readFile(mainPath + PACKAGE_JSON_FILE, {encoding: 'utf-8'})
					.then(function(json) {
						return createState(mainModule, mainPath, json);
					});
			};
		})
		.then(function(state) {
			if (state.package) {
				state.projectName = state.package.name;
			};

			if (!state.packageName || (state.projectName === state.packageName)) {
				state.packageName = '';
				reduceEnvironment(state);
			};

			if (state.packageName) {
				state.package = utils.require(state.mainModule, state.packageName + path.sep + PACKAGE_JSON_FILE);
				state.projectName = '';
			};

			reducePackageConfig(state.config, state.package, 'package_', 'package');
			reducePackageConfig(state.config, state.package.config, '', 'config');

			return state;
		});
};


const list = function _list(Promise, readFile, exec, /*optional*/packageName, /*optional*/options) {
	return prepare(Promise, readFile, packageName, options)
		.then(function(state) {
			const listNpm = function _listNpm() {
				return exec(NPM_COMMAND, {encoding: 'utf-8', cwd: state.mainPath})
					.then(function(stdout) {
						const lines = utils.getLines(stdout);
						state.npmVersion = parseInt(lines[0].split('.')[0], 10);
						parse(state, lines.slice(1));
					});
			};

			const listProject = function _listProject() {
				if (state.npmVersion < 5) {
					return readFile(state.mainPath + '.npmrc', {encoding: 'utf-8'})
						.then(function(fileContent) {
							parse(state, utils.getLines(fileContent), 'project');
						})
						.catch(function(err) {
							if (err.code !== 'ENOENT') {
								throw err;
							};
						});
				} else {
					return Promise.resolve();
				};
			};

			return listNpm()
				.then(listProject)
				.then(function() {
					let result = combine(state);
					if (utils.get(options, 'beautify', false)) {
						result = beautify(result);
					};
					return result;
				});
		});
};


const npc = {
	listSync: function listSync(/*optional*/packageName, /*optional*/options) {
		const readFileSync = function _readFileSync(fname, options) {
			return new SyncPromise(function(res, rej) {
				try {
					res(fs.readFileSync(fname, options));
				} catch(err) {
					rej(err);
				};
			});
		};

		const execSync = function _execSync(cmd, options) {
			return new SyncPromise(function(res, rej) {
				try {
					res(cp.execSync(cmd, options));
				} catch(err) {
					rej(err);
				};
			});
		};

		return list(SyncPromise, readFileSync, execSync, packageName, options)
			.explode();
	},

	listAsync: function listAsync(/*optional*/packageName, /*optional*/options) {
		const Promise = utils.get(options, 'Promise') || natives.Promise;

		const readFileAsync = function _readFileAsync(fname, options) {
			return new Promise(function(res, rej) {
				try {
					fs.readFile(fname, options, function(err, data) {
						if (err) {
							rej(err);
						} else {
							res(data);
						};
					});
				} catch(err) {
					rej(err);
				};
			});
		};

		const execAsync = function _execAsync(cmd, options) {
			return new Promise(function(res, rej) {
				try {
					cp.exec(cmd, options, function(err, stdout) {
						if (err) {
							rej(err);
						} else {
							res(stdout);
						};
					});
				} catch(err) {
					rej(err);
				};
			});
		};

		return list(Promise, readFileAsync, execAsync, packageName, options);
	},

	list: function list(/*optional*/packageName, /*optional*/options) {
		if (utils.get(options, 'async', false)) {
			return npc.listAsync(packageName, options);
		} else {
			return npc.listSync(packageName, options);
		};
	},
};


module.exports = npc;
