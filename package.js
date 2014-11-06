/* global Package : true */
/* global Npm     : true */

Package.describe({
	'name'    : 'elasticity',
	'summary' : 'A customizable Elastic Search client with Blaze Components',
	"version" : "1.0.0",
	"git"     : "https://github.com/nothingisdead/meteor-elasticity.git"
});

Npm.depends({
	'elasticsearch' : '2.4.3'
});

Package.onUse(function(api) {
	api.use('meteor-platform');
	api.use('reactive-var');
	api.use("matb33:collection-hooks@0.7.6");

	api.add_files([
		'lib/server.js'
	], 'server');

	api.add_files([
		'lib/client.js',
		'lib/templates/elasticity.html',
		'lib/templates/elasticity.js'
	], 'client');
});
