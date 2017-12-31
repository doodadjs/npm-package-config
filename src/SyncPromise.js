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


const natives = require('./natives.js')


const SYNC_PROMISE_STATE = natives.Symbol();


const SyncPromise = function _SyncPromise(cb) {
	if (this instanceof SyncPromise) {
		const state = this[SYNC_PROMISE_STATE] = {
			value: undefined,
			err: undefined,
			done: false,
		};

		const res = function _res(value) {
			if (!state.done) {
				if ((value !== null) && (typeof value === 'object') && (typeof value.then === 'function')) {
					if (value instanceof SyncPromise) {
						value.then(
								function thenState(newValue) {
									state.value = newValue;
									state.done = true;
								}
							,
								function catchState(newErr) {
									state.err = newErr;
									state.done = true;
								}
						);
					} else {
						throw new natives.Error("The value looks like an asynchronous thenable.");
					};
				} else {
					state.value = value;
					state.done = true;
				};
			};
		};

		const rej = function _rej(err) {
			if (!state.done) {
				if ((err !== null) && (typeof err === 'object') && (typeof err.then === 'function')) {
					if (err instanceof SyncPromise) {
						err.then(
								function thenState(newValue) {
									state.value = newValue;
									state.done = true;
								}
							,
								function catchState(newErr) {
									state.err = newErr;
									state.done = true;
								}
						);
					} else {
						throw new natives.Error("The value looks like an asynchronous thenable.");
					};
				} else {
					state.err = err;
					state.done = true;
				};
			};
		}

		try {
			cb(res, rej);
		} catch(err) {
			rej(err);
		};

		if (!state.done) {
			throw new natives.Error("'SyncPromise' has not been immediatly resolved or rejected.");
		};
	} else {
		throw new natives.Error("Not a 'SyncPromise' object. Did you forget the 'new' operator ?");
	};
};

SyncPromise.prototype.then = function then(/*optional*/resCb, /*optional*/rejCb) {
	const SyncPromise = this.constructor;
	const state = this[SYNC_PROMISE_STATE];
	return new SyncPromise(function thenPromise(newResCb, newRejCb) {
		if (state.done) {
			if (state.err) {
				if (rejCb) {
					newResCb(rejCb(state.err));
				} else {
					newRejCb(state.err);
				};
			} else {
				if (resCb) {
					newResCb(resCb(state.value));
				} else {
					newResCb(state.value);
				};
			};
		};
	});
};

SyncPromise.prototype.catch = function _catch(/*optional*/rejCb) {
	const SyncPromise = this.constructor;
	const state = this[SYNC_PROMISE_STATE];
	return new SyncPromise(function _catchPromise(newResCb, newRejCb) {
		if (state.done) {
			if (state.err) {
				if (rejCb) {
					newResCb(rejCb(state.err));
				} else {
					newRejCb(state.err);
				};
			} else {
				newResCb(state.value);
			};
		};
	});
};

SyncPromise.prototype.explode = function _explode() {
	const state = this[SYNC_PROMISE_STATE];
	if (state.done) {
		if (state.err) {
			throw state.err;
		} else {
			return state.value;
		};
	} else {
		throw new natives.Error("'SyncPromise' has not been resolved or rejected.");
	};
};

SyncPromise.resolve = function _resolve(value) {
	const SyncPromise = this;
	return new SyncPromise(function(res, rej) {
		res(value);
	});
};

SyncPromise.reject = function _reject(err) {
	const SyncPromise = this;
	return new SyncPromise(function(res, rej) {
		rej(err);
	});
};


module.exports = SyncPromise;