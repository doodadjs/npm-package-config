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
		envKeys = Object.keys(process.env);

	envKeys.forEach(function(key) {
		if (key.toLowerCase().startsWith(NPM_KEY)) {
			config.env[key.slice(NPM_KEY.length)] = process.env[key];
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


const GLOBAL_SECTION_NAME = "; globalconfig ";
const USER_SECTION_NAME = "; userconfig ";
const PROJECT_SECTION_NAME = "; project config "; // npm v5

function parse(npmVersion, packageName, config, fileContent, /*optional*/section) {
	const varPrefix = (packageName ? packageName + ':' : '');
	let currentSection = section;
	fileContent.split('\n').filter(function(line) {
			return line.trim('\r').startsWith(GLOBAL_SECTION_NAME) || line.startsWith(USER_SECTION_NAME) || ((npmVersion >= 5) && line.startsWith(PROJECT_SECTION_NAME)) || !varPrefix || line.startsWith(varPrefix);
		}).forEach(function(line) {
			if (!section && line.startsWith(GLOBAL_SECTION_NAME)) {
				currentSection = 'global';
			} else if (!section && line.startsWith(USER_SECTION_NAME)) {
				currentSection = 'user';
			} else if (!section && (npmVersion >= 5) && line.startsWith(PROJECT_SECTION_NAME)) {
				currentSection = 'project';
			} else if (currentSection) {
				if (varPrefix) {
					line = line.slice(varPrefix.length);
				};
				const pos = line.indexOf('=');
				const key = line.slice(0, pos).trim();
				if (key) {
					let val = line.slice(pos + 1).trim();
					if (val.startsWith('"')) {
						val = JSON.parse(val);
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
					if (ex.code !== 'MODULE_NOT_FOUND') {
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

		let isMain = false;
		if (!packageName || (_package && (packageName === _package.name))) {
			reduceEnvironment(config);
			isMain = true;
		};

		if (packageName && !isMain) {
			_package = _require(mainModule, packageName + path.sep + PACKAGE_JSON_FILE);
		} else if (!_package) {
			throw new Error("No '" + PACKAGE_JSON_FILE + "' found.");
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
							parse(npmVersion, packageName || _package.name, config, configList);
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
								parse(npmVersion, packageName, config, fileContent, 'project');
								resolve([npmVersion, config]);
							};
						});
					});
				} else {
					resolve(args);
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
			parse(npmVersion, packageName || _package.name, config, configList);
			if (npmVersion < 5) {
				try {
					parse(npmVersion, packageName, config, fs.readFileSync(packageFolder + '.npmrc', {encoding: 'utf-8'}), 'project');
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