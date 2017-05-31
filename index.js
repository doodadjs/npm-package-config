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


const Module = require('module').Module,
	_require = function(_module, path) {
		return Module._load(path, _module);
	};
	

const PACKAGE_JSON_FILE = 'package.json';
const NPM_COMMAND = 'npm -v && npm config list';


function splitNpmCommandResults(result) {
	const pos = result.indexOf('\n');
	const npmVersion = parseInt(result.slice(0, pos).trim('\r').split('.')[0]);
	const configList = result.slice(pos + 1).trim('\r');
	return [npmVersion, configList];
};


function reduceEnvironment(config) {
	const NPM_KEY = (process.env.npm_package_name ? 'npm_package_config_' : 'npm_config_'),
		NPM_KEY_LEN = NPM_KEY.length,
		envKeys = Object.keys(process.env);

	envKeys.forEach(function(key) {
		if (key.toLowerCase().startsWith(NPM_KEY)) {
			config.env[key.slice(NPM_KEY_LEN)] = process.env[key];
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
				reducePackageConfig(result, val, parent + key + '_', type);
			};
		});
	} else {
		result.package[parent.slice(0, -1)] = packageConfig;
	};
};

const CLI_SECTION_NAME = "; cli configs";
const PROJECT_SECTION_NAME = "; project config "; // npm v5
const USER_SECTION_NAME = "; userconfig ";
const GLOBAL_SECTION_NAME = "; globalconfig ";
const BUILT_IN_SECTION_NAME = "; builtin config ";

function parse(npmVersion, projectName, packageName, config, fileContent, /*optional*/section) {
	let currentSection = section;
	const lines = fileContent.split(/\n\r|\r\n|\n|\r/);
	lines.forEach(function(line) {
			line = line.trim();
			if (!section && line.startsWith(CLI_SECTION_NAME)) {
				currentSection = 'cli';
			} else if (!section && (npmVersion >= 5) && line.startsWith(PROJECT_SECTION_NAME)) { // npm v5
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
				if (key) {
					if (key.startsWith("'")) {
						key = key.slice(1, -1);
					};
					const posPrefix = key.lastIndexOf(':');
					const prefix = ((posPrefix >= 0) ? key.slice(0, posPrefix) : '');
					key = ((posPrefix >= 0) ? key.slice(posPrefix + 1) : key);
					if (!prefix && (currentSection !== 'project')) {
						// Not the package's key/value pair
						return;
					};
					if (projectName && (prefix === projectName)) {
						// That's a key/value pair of the current application
					} else if (prefix !== packageName) { // NOTE: Values can be empty strings
						// Not the package's key/value pair
						return;
					};
					let val = line.slice(posKey + 1).trim();
					try {
						val = JSON.parse(val);
					} catch(ex) {
					};
					config[currentSection][key] = val;
				};
			};
		});
};


function combine(npmVersion, config) {
	return Object.assign({}, config.package, config.global, config.user, config.project, config.env);
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
		if ((r !== null) && (typeof r === 'object')) {
			r[key] = value;
		};
		return result;
	}, {});
};



module.exports = {
	list: function list(/*optional*/packageName, /*optional*/options) {
		packageName = packageName || '';
		options = options || {};
		
		const config = {
			package: {}, 
			global: {}, 
			user: {}, 
			project: {}, 
			env: {}, 
		};
		
		let mainModule = module.parent,
			_package = null,
			upDir = '';

		const packageJson = '.' + path.sep + PACKAGE_JSON_FILE;
		const mainPath = path.dirname(mainModule.filename);

		while (mainModule && (mainModule.id !== 'repl')) {
			const pathsLen = mainModule.paths.length + 1;

			for (let i = 0; i < pathsLen; i++) {
				try {
					_package = JSON.parse(fs.readFileSync(mainPath + path.sep + upDir + packageJson));
					break;
				} catch(ex) {
					if (ex.code !== 'ENOENT') {
						throw ex;
					};

					upDir += '..' + path.sep;
				};
			};

			if (_package) {
				break;
			};

			mainModule = mainModule.parent;
		};

		if (!mainModule) {
			mainModule = require.main || module;
		};

		if (!packageName || (_package && (_package.name === packageName))) {
			packageName = '';
			reduceEnvironment(config);
		};

		let projectName = '';
		if (packageName) {
			_package = _require(mainModule, packageName + path.sep + PACKAGE_JSON_FILE);
		} else if (!_package) {
			throw new Error("No '" + PACKAGE_JSON_FILE + "' found.");
		} else {
			projectName = _package.name;
		};

		reducePackageConfig(config, _package, 'package_', 'package');
		reducePackageConfig(config, _package.config, '', 'config');
		
		const packageFolder = mainPath + path.sep + upDir;
		
		if (options.async) {
			function listNpm(config) {
				return new Promise(function(resolve, reject) {
					cp.exec(NPM_COMMAND, {encoding: 'utf-8', cwd: packageFolder}, function(err, stdout) {
						if (err) {
							reject(err);
						} else {
							const retval = splitNpmCommandResults(stdout);
							const npmVersion = retval[0];
							const configList = retval[1];
							parse(npmVersion, projectName, packageName, config, configList);
							resolve([npmVersion, config]);
						};
					});
				});
			};
			function listProject(args) {
				const npmVersion = args[0];
				const config = args[1];
				if (npmVersion < 5) {
					return new Promise(function(resolve, reject) {
						fs.readFile(packageFolder + '.npmrc', {encoding: 'utf-8'}, function(err, fileContent) {
							if (err) {
								if (err.code === 'ENOENT') {
									resolve(args);
								} else {
									reject(err);
								};
							} else {
								parse(npmVersion, projectName, packageName, config, fileContent, 'project');
								resolve([npmVersion, config]);
							};
						});
					});
				} else {
					return Promise.resolve(args);
				};
			};
			
			return listNpm(config)
				.then(listProject)
				.then(function(args) {
					const npmVersion = args[0];
					const config = args[1];
					return combine(npmVersion, config);
				})
				.then(function(result) {
					if (options.beautify) {
						return beautify(result);
					} else {
						return result;
					};
				});
		} else {
			let retval = splitNpmCommandResults(cp.execSync(NPM_COMMAND, {encoding: 'utf-8', cwd: packageFolder}));
			const npmVersion = retval[0];
			const configList = retval[1];
			parse(npmVersion, projectName, packageName, config, configList);
			if (npmVersion < 5) {
				try {
					parse(npmVersion, projectName, packageName, config, fs.readFileSync(packageFolder + '.npmrc', {encoding: 'utf-8'}), 'project');
				} catch(ex) {
					if (ex.code !== 'ENOENT') {
						throw ex;
					};
				};
			};
			let result = combine(npmVersion, config);
			if (options.beautify) {
				result = beautify(result);
			};
			return result;
		};
		
	},
};