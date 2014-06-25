/* global ElasticityTemplates : true */

'use strict';

ElasticityTemplates = {
	fuzzy : {
		query : function(query_string, options) {
			var fuzzy = {
				fields    : ['_all'],
				like_text : query_string,
				fuzziness : 3
			};

			var query = {
				fuzzy_like_this : _.extend(fuzzy, options)
			};

			return query;
		}
	}
};
