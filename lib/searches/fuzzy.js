'use strict';

Elasticity.prototype.searches.fuzzy = {
	query : function(search_string, options) {
		var fuzzy = {
			fields    : ['_all'],
			like_text : search_string,
			fuzziness : 10
		};

		var query = {
			fuzzy_like_this : _.extend(fuzzy, options)
		};

		return query;
	},

	formatter : function(result, collection) {
		var hits = [];

		if(result.hits && result.hits.hits) {
			for(var i in result.hits.hits) {
				var id = result.hits.hits[i]._id;
				hits.push(id);
			}
		}

		return hits;
	}
};
