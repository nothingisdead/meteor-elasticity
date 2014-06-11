/* global Elasticity : true */
/* global Promise    : true */

'use strict';

Elasticity = {
	search : function() {
		return Elasticity.call('search', arguments);
	},

	call : function(method, args) {
		var promise = new Promise(function(resolve, reject) {
			Meteor.apply('Elasticity::' + method, args, function(error, result) {
				if(error) {
					reject(error);
				}
				else {
					resolve(result);
				}
			});
		});

		return promise;
	}
};
