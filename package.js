/* global Package: true */

'use strict';

Package.describe({
	summary : 'A customizable Elastic Search client with Blaze templates'
});

Npm.depends({
	elasticsearchclient : '0.5.3',
	promise             : '5.0.0',
	flat                : '1.2.1'
});

Package.on_use(function (api) {
	api.use(['underscore'], ['client', 'server']);
	api.use(['templating', 'ui', 'jquery', 'standard-app-packages'], 'client');

	api.add_files([
		'lib/elasticity-client.js',
		'lib/templates/elasticity.html',
		'lib/templates/elasticity.js',
	], 'client');

	api.add_files([
		'lib/elasticity-server.js',
		'lib/searches/fuzzy.js'
	], 'server');

	api.export('Elasticity');
});
