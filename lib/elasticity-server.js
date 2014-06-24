/* global Elasticity : true */
/* global Future     : true */

'use strict';

var ElasticSearch = Npm.require('elasticsearch').Client;
var Promise       = Npm.require('promise');
var Future        = Npm.require('fibers/future');
var Flat          = Npm.require('flat');
var flatten       = Flat.flatten;
var unflatten     = Flat.unflatten;
var indices       = {};

Elasticity = function(config) {
	var self      = this;
	var config    = _.extend(self.default_config, config);
	var client    = new ElasticSearch(_.clone(config));
	var callbacks = {};
	var pending   = {};

	function search(search_type, index_name, search_string, q_options, f_options, type, offset, limit) {
		var index = indices[index_name];

		if(!index) {
			throw new Error('"' + index_name + '" is not a defined index.');
		}

		type = type || index.type || 'default_type';

		var search = self.searches[search_type];

		if(!search) {
			throw new Error('"' + search_type + '" is not a defined search type.');
		}

		var query       = search.query(search_string, q_options);
		var raw_promise = rawSearch(index_name, query, type, offset, limit);

		var promise = new Promise(function(resolve, reject) {
			var callback = function(data) {
				var results = search.formatter(data, index.collection, f_options);
				resolve.call(self, results);
			};

			raw_promise.then(Meteor.bindEnvironment(callback), function(error) {
				reject.call(self, error);
			});
		});

		return promise;
	}

	function rawSearch(index_name, query, type, offset, limit, force) {
		var index = indices[index_name];

		if(!index) {
			throw new Error('"' + index_name + '" is not a defined index.');
		}

		if(!_.isEmpty(pending[index_name]) && !force) {
			if(self.debug) {
				console.log('Elasticity: Postponing search because index ' + index_name + ' is not ready');
			}

			var called = false;

			var ready = new Promise(function(resolve, reject) {
				var callback = function() {
					rawSearch(index_name, query, type, offset, limit, true).then(resolve, reject);
					called = true;
				};

				addCallback(index_name, callback);
			});

			if(self.flush) {
				setTimeout(function() {
					if(!called) {
						if(self.debug) {
							console.log('Elasticity: Flushing callbacks for index ' + index_name);
						}

						doCallbacks(index_name);
					}
				}, self.flush_timeout);
			}

			return ready;
		}

		type = type || index.type;

		if(self.debug) {
			console.log('Elasticity: Performing search: ', query);
		}

		var request = {
			index : index_name,
			type  : type,
			from  : offset || 0,
			size  : limit || 10,
			body  : {
				query : query
			}
		};

		var promise = client.search(request);

		if(self.debug) {
			promise.then(function(data) {
				console.log('Elasticity: Got search results. Data length: ', JSON.stringify(data).length);
			});
		}

		return promise;
	}

	function addIndex(collection, index_name, options, type, filter) {
		options = options || {};
		type    = type || 'default_type';
		filter  = filter || {};

		if(typeof collection === 'string' && Meteor[collection]) {
			collection = Meteor[collection];
		}

		indices[index_name] = {
			type       : type,
			options    : options,
			collection : collection._name,
			ready      : false
		};

		var promise = new Promise(function(resolve, reject) {
			try{
				collection.find(filter).observeChanges({
					added : function(id, doc) {
						addToIndex(index_name, doc, id, options, type);
					},

					changed : function(id, doc) {
						addToIndex(index_name, doc, id, options, type, true);
					},

					removed : function(id) {
						removeFromIndex(index_name, id);
					}
				});

				if(self.debug) {
					console.log('Elasticity: Added index: ', indices[index_name]);
				}

				var callback = function() {
					resolve.call(self, indices[index_name]);
				};

				addCallback(index_name, callback);
			}
			catch(e) {
				reject.call(self, e);
			}
		});

		return promise;
	}

	function removeIndex(index_name) {
		var promise = client.indices.delete(index_name);

		promise.then(function() {
			delete indices[index_name];

			if(self.debug) {
				console.log('Elasticity: Removed index: ', indices[index_name]);
			}
		});

		return promise;
	}

	function addToIndex(index_name, doc, id, options, type, update, callback) {
		var index = indices[index_name];

		if(!pending[index_name]) {
			pending[index_name] = {};
		}

		pending[index_name][id] = true;

		type    = type || index.type;
		options = options || index.options;

		if(typeof options.fields === 'string') {
			options.fields = [options.fields];
		}

		if(options.fields.indexOf('_all') === -1) {
			var tmp_doc = flatten(doc);

			tmp_doc = _.pick(tmp_doc, options.fields);
			doc     = unflatten(tmp_doc);
		}

		if(_.isEmpty(doc)) {
			return false;
		}

		var request = {
			index : index_name,
			type  : type,
			id    : id
		};

		if(update) {
			request.body = {
				doc : doc
			};
		}
		else {
			request.body = doc;
		}

		var promise = client.index(request);

		promise.then(function(data) {
			if(self.debug) {
				console.log('Elasticity: Updated index for document ' + id, data);
			}

			if(pending[index_name][id]) {
				delete pending[index_name][id];
			}

			if(_.isEmpty(pending[index_name])) {
				doCallbacks(index_name);
			}

			if(typeof callback === 'function') {
				callback.call(self, null, data);
			}
		}, function(error) {
			if(typeof callback === 'function') {
				callback.call(self, error, null);
			}
		});

		return promise;
	}

	function removeFromIndex(index_name, id, options, type, callback) {
		var index = indices[index_name];

		if(!pending[index_name]) {
			pending[index_name] = {};
		}

		pending[index_name][id] = true;

		type    = type || index.type;
		options = options || index.options;

		var request = {
			index : index_name,
			type  : type,
			id    : id
		};

		var promise = client.delete(request);

		promise.then(function(data) {
			if(self.debug) {
				console.log('Elasticity: Removed document ' + id + ' from index', data);
			}

			if(pending[index_name][id]) {
				delete pending[index_name][id];
			}

			if(_.isEmpty(pending[index_name])) {
				doCallbacks(index_name);
			}

			if(typeof callback === 'function') {
				callback.call(self, null, data);
			}
		}, function(error) {
			if(typeof callback === 'function') {
				callback.call(self, error, null);
			}
		});

		return promise;
	}

	function addCallback(index_name, callback) {
		if(!callbacks[index_name]) {
			callbacks[index_name] = [];
		}

		callbacks[index_name].push(callback);
	}

	function doCallbacks(index_name) {
		if(self.debug) {
			console.log('Elasticity: The ' + index_name + ' index is ready.');
		}

		if(callbacks[index_name] && callbacks[index_name].length) {
			if(self.debug) {
				console.log('Elasticity: Executing stored callbacks for ' + index_name + ' index.');
			}

			while(callbacks[index_name].length) {
				var callback = callbacks[index_name].shift();

				if(typeof callback === 'function') {
					callback.call(self, indices[index_name]);
				}
			}
		}
	}

	this.search          = search;
	this.rawSearch       = rawSearch;
	this.addIndex        = addIndex;
	this.removeIndex     = removeIndex;
	this.addToIndex      = addToIndex;
	this.removeFromIndex = removeFromIndex;
};

Elasticity.prototype.searches      = {};
Elasticity.prototype.flush_timeout = 200;
Elasticity.prototype.flush         = false;
Elasticity.prototype.debug         = false;

Elasticity.prototype.default_config = {
	host : 'localhost:9200'
};

Meteor.methods({
	'Elasticity::search' : function() {
		var future = new Future();
		var client = new Elasticity();

		client.search.apply(this, arguments)
			.then(function(data) {
				future['return'](data);
			}, function(error) {
				future.throw(error);
			});

		return future.wait();
	}
});
