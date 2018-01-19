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

const nodeModule = require('module');
const compareVersions = require('compare-versions');

const natives = require('./natives.js');

module.exports = {
	get: function _get(obj, key, /*optional*/defaultValue) {
		if ((obj != null) && natives.hasKey(obj, key)) {
			return obj[key];
		} else {
			return defaultValue;
		};
	},

	require: (compareVersions(process.versions.node, '8.9.0') >= 0 ? 
		function _require(_module, path) {
			/* eslint import/no-dynamic-require: "off" */
			/* eslint global-require: "off" */
			return require(require.resolve(path, {paths: _module.paths}));
		}
	:
		function _require(_module, path) {
			return nodeModule.Module._load(path, _module);
		}
	),

	getLines: function _getLines(fileContent) {
		return fileContent.split(/\n\r|\r\n|\n|\r/);
	},
};