#Elasticity
A customizable Elasticsearch client with Blaze templates

##Updates

###0.0.5
Switched underlying client to the official elasticsearch.js client

Elasticity is a smart package for [meteor](https://www.meteor.com/) and [meteorite](https://github.com/oortcloud/meteorite/) that wraps around the [elasticsearch](https://github.com/elasticsearch/elasticsearch-js) package for node.js.

This package draws inspiration from the [easy-search](http://atmospherejs.com/package/easy-search) package. My goals were to expose some additional functionality of Elasticsearch and provide some more features while keeping it relatively simple to use.

##Basic Usage

Set up an index on the server:

###Server
```javascript
// Supports any of the configuration options for elasticsearch.js
var config = {
  host : '10.0.0.2:1234' // defaults to 'localhost:9200'
};

// Instantiate a client
var client = new Elasticity(config);

// Create an index
client.addIndex(Meteor.users, 'users', {
  fields : ['profile.name.first', 'profile.name.last'],
  
  cursor_options : {
    fields : {
      services : 0
    }
  }
});
```

###Client
```javascript
// Run a search
Elasticity.fuzzy('users', 'john')
  .then(function(result) {
    console.log('Here are the IDs of the users!', result.ids);
  }, function(error) {
    console.log('Something went wrong!', error);
  };
```

###Blaze Components
There are currently two Blaze components: An *elasticity_input* template and an *elasticity_result* helper. They can be used as follows:

```html
<template name="my_template">
  {{> elasticity_input collection=getUserCollection index='users' placeholder='Find a User' class='user-search-input widget' id='user-search'}}
  {{#if elasticity_result id}}
    {{#each elasticity_result id}}
      {{profile.name.first}} {{profile.name.last}}
    {{/each}}
  {{else}}
    No users were found.
  {{/if}}
</template>
```

The *id* arguments on the template and helper are only required if there are multiple inputs/results displayed on the same page. Otherwise, the results will be from the first instance of an *elasticity_input*. The only other arguments that are required are collection, which should be a helper function that returns a collection, and index, which should be the name of an index that was created on the server. You can also set a *template* argument on the input, which will change which search template (explained below) that the template uses.

##Advanced Usage

###Search Templates
In the examples above, 'fuzzy' references a search template (the only one included at the moment). Additional search templates can be defined on the server as follows:

```javascript
ElasticityTemplates.my_cool_search = {
  query : function(search_string, options) {
    // A query, as defined here: http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-queries.html
    var my_cool_query = {
      match : {
        is_cool : true
      }
    };

    return my_cool_query;
  }
}
```

To use the new template on the client:

```javascript
Elasticity.my_cool_search('users', 'john')
  .then(function(result) {
    console.log('These users are cool:', result.getDocs());
  });
```

In the above examples, the result object that gets passed to the callback function looks like this:

```javascript
{
  ids : ['YoJ2Xw9Q6WiXARFTa', 'Jet6Mneg8FJbaQ7Bx', ...],
  
  getCursor : function(collection) {
    // returns a cursor that can be used to iterate over a client-side collection
  },
  
  getDocs : function(collection, sorted, reverse) {
    // returns an object containing the documents returned by the search, optionally sorted by relevance
  }
}
```

The `getCursor` and `getDocs` functions are helpers that will allow you to iterate over the results. By passing *true* for the *sorted* parameter in `getDocs`, you can iterate over the documents in the order they were sorted by elasticsearch. Unfortunately, there is no way to do this for the `getCursor` function, as far as I know.

###Default Configuration
When you call a search function on the client, it will instantiate an Elasticity client with the default configuration. To change the default configuration, you can set default_config on the Elasticity prototype (on the server):

```javascript
Elasticity.prototype.default_config = {
  host : '10.0.0.2:1234'
}
```

There are a couple of other things you can set on the prototype:
```javascript
// Turn debugging on by default
Elasticity.prototype.debug = true;

var client = new Elasticity(); // Debugging is on (default: false)

Elasticity.prototype.flush = true;

var client = new Elasticity(); // Flushing is on (default: false)

Elasticity.prototype.flush_timeout = 500;

var client = new Elasticity(); // Flush timeout is set to 500ms (default: 200ms)
```

You can also set these settings on individual instances afterwards:
```javascript
var client = new Elasticity();

client.flush = true; // Flushing is on
client.debug = true; // Debugging is on

// Do some searches and stuff...

client.flush = true; // Flushing is back off
client.debug = true; // Debugging is back off
```

###Flushing
Flushing is turned off by default. Elasticity attempts to always provide the most current search results by keeping a queue of documents that are pending indexing operations. Any queries that are run while there is a queue will not complete until the queue is empty (meaning the index is up-to-date). If the index gets updated *very* quickly, or there is high latency to the indexing server, this could cause the query to be held in the query queue for a long time.

The solution is to set 'flush' to true, and 'flush_timeout' to the maximum time that you would like a query to be held in the queue for (the default is 200ms). This will force the query queue to be processed after that time, if it hasn't already been. My recommendation is to always turn on flushing *after* your indexes have been created.
