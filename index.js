/*
Copyright (c) 2015 Claude Petit


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

const Module = module.constructor,
	_require = function(_module, path) {
		return Module._load(path, _module);
	};
	
function reduceEnvironment(result) {
	const NPM_KEY = (process.env.npm_package_name ? 'npm_package_config_' : 'npm_config_'),
		envKeys = Object.keys(process.env);

	const config = envKeys.reduce(function(result, key) {
		if (key.toLowerCase().startsWith(NPM_KEY)) {
			result.env[key.slice(NPM_KEY.length)] = process.env[key];
		};
		return result;
	}, result);
};

function reducePackageConfig(result, packageConfig, parent, type) {
	const replaceRegEx = /[^A-Za-z0-9_]/g;
	if (typeof packageConfig === 'object') {
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

function parse(packageName, config, fileContent, /*optional*/section) {
	const varPrefix = packageName + ':';
	let currentSection = section;
	return fileContent.split('\n').filter(function(line) {
			return line.startsWith("; globalconfig ") || line.startsWith("; userconfig ") || (line.startsWith(varPrefix));
		}).reduce(function(result, line) {
			if (!section && line.startsWith("; globalconfig ")) {
				currentSection = 'global';
			} else if (!section && line.startsWith("; userconfig ")) {
				currentSection = 'user';
			} else if (currentSection) {
				line = line.trim('\r').slice(varPrefix.length).split('=', 2);
				const key = line[0].trim();
				if (key) {
					let val = line[1].trim();
					if (val.startsWith('"')) {
						//console.log(val);
						val = JSON.parse(val);
					};
					result[currentSection][key] = val;
				};
			};
			return result;
		}, config);
};

function combine(config) {
	return Object.assign({}, config.package, config.global, config.user, config.project, config.env);
};

function beautify(config) {
	return Object.keys(config).reduce(function(result, key) {
		const value = config[key];
		key = key.replace(/__/g, '.').split('_');
		let r = result;
		for (let i = 0; i < key.length - 1; i++) {
			let k = key[i];
			if (!k) {
				continue;
			};
			if (!Object.prototype.hasOwnProperty.call(r, k)) {
				r[k] = {};
			};
			r = r[k];
		};
		key = key[key.length - 1];
		if (!key) {
			key = '_';
		};
		r[key] = value;
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
		
		const _module = ((module.parent && (module.parent.id !== 'repl')) ? module.parent : module);
		let _package = _require(_module, './package.json');
		if (!packageName || (packageName === _package.name)) {
			packageName = _package.name;
			reduceEnvironment(config);
		} else {
			_package = _require(_module, packageName + '/package.json');
		};

		reducePackageConfig(config, _package, 'package_', 'package');
		reducePackageConfig(config, _package.config, '_', 'config');
		
		const path = require('path'),
			cp = require('child_process'),
			fs = require('fs');
			
		const packageFolder = path.dirname(require.resolve(packageName));
			
		if (options.async) {
			function listNpm() {
				return new Promise(function(resolve, reject) {
					cp.exec('npm config list', {encoding: 'utf8', cwd: packageFolder}, function(err, fileContent) {
						if (err) {
							reject(err);
						} else {
							resolve(parse(packageName, config, fileContent));
						};
					});
				});
			};
			function listProject() {
				return new Promise(function(resolve, reject) {
					fs.readFile(packageFolder + '/.npmrc', {encoding: 'utf8'}, function(err, fileContent) {
						if (err) {
							if (err.code !== 'ENOENT') {
								reject(err);
							} else {
								resolve(config);
							};
						} else {
							resolve(parse(packageName, config, fileContent, 'project'));
						};
					});
				});
			};
			
			return listNpm()
				.then(listProject)
				.then(combine)
				.then(function(result) {
					if (options.beautify) {
						return beautify(result);
					} else {
						return result;
					};
				});
		} else {
			//"Error: invalid data"   cp.execFileSync('npm', ['config', 'list'], {encoding: 'utf8', cwd: packageFolder});
			parse(packageName, config, cp.execSync('npm config list', {encoding: 'utf8', cwd: packageFolder}));
			try {
				parse(packageName, config, fs.readFileSync(packageFolder + '/.npmrc', {encoding: 'utf8'}), 'project');
			} catch(ex) {
				if (ex.code !== 'ENOENT') {
					throw ex;
				};
			};
			let result = combine(config);
			if (options.beautify) {
				result = beautify(result);
			};
			return result;
		};
		
	},
};