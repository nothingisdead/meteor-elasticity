/* global Elasticity : true */
/* global Future     : true */

'use strict';

var ElasticSearchClient = Npm.require('elasticsearchclient');
var Promise             = Npm.require('promise');
var Future              = Npm.require('fibers/future');
var flatten             = Npm.require('flat').flatten;
var indices             = {};

Elasticity = function(config) {
	var self      = this;
	var config    = _.extend(self.default_config, config);
	var client    = new ElasticSearchClient(config);
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

		var query_obj = {
			from  : offset || 0,
			size  : limit || 10,
			query : query
		};

		if(self.debug) {
			console.log('Elasticity: Performing search: ', query);
		}

		var promise = new Promise(function(resolve, reject) {
			client.search(index_name, type, query_obj, function(error, data) {
				if(self.debug) {
					console.log('Elasticity: Got search results. Data length: ', data.length);
				}

				if(error) {
					reject.call(self, error);
				}
				else {
					resolve.call(self, data);
				}
			});
		});

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

	function removeIndex(index_name, options) {
		var promise = new Promise(function(resolve, reject) {
			try{
				var call = client.removeIndex(index_name, options, function() {
					resolve.call(self, index_name);
				});

				call.exec();

				if(self.debug) {
					console.log('Elasticity: Removed index: ', indices[index_name]);
				}

				delete indices[index_name];
			}
			catch(e) {
				reject.call(self, e);
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

		doc     = flatten(doc);
		type    = type || index.type;
		options = options || index.options;

		if(options.fields.indexOf('_all') === -1) {
			doc = _.pick(doc, options.fields);
		}

		var call = null;

		if(!_.isEmpty(doc)) {
			if(update) {
				call = client.update(index_name, type, id, doc, options);
			}
			else {
				call = client.index(index_name, type, doc, id, options);
			}

			call.exec(function(error, data) {
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
					callback.call(self, error, data);
				}
			});
		}

		return self;
	}

	function removeFromIndex(index_name, id, options, type, callback) {
		var index = indices[index_name];

		if(!pending[index_name]) {
			pending[index_name] = {};
		}

		pending[index_name][id] = true;

		type    = type || index.type;
		options = options || index.options;

		var call = client.deleteDocument(index_name, type, id, options);

		call.exec(function(error, data) {
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
				callback.call(self, error, data);
			}
		});

		return self;
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
	host : 'localhost',
	port : 9200
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
