#Elasticity
A customizable Elasticsearch client ~~with Blaze templates~~

Elasticity is a smart package for [meteor](https://www.meteor.com/) and [meteorite](https://github.com/oortcloud/meteorite/) that wraps around the [elasticsearchclient](https://github.com/phillro/node-elasticsearch-client) package for node.js.

This package draws inspiration the [easy-search](http://atmospherejs.com/package/easy-search) package. My goal was to expose some additional functionality of Elasticsearch, and provide some other useful features while keeping it relatively simple to use.

##Basic Usage

Indexes are only set up on the server. I couldn't think of a reason to create an index on the client, but I can expose that functionality if needed. The search functions return Promises, which are resolved with the result of the search. They can be run on the client or server.

###Server
```javascript
// Supports any of the configuration options for elasticsearchclient
var config = {
  host : '10.0.0.2', // defaults to 'localhost'
  port : 1234        // defaults to 9200
};

// Instantiate a client
var client = new Elasticity(config);

// Create an index
client.addIndex(Meteor.users, 'users', {
	fields : ['profile.name.first', 'profile.name.last']
});

// Run a search
client.search('fuzzy', 'users', 'john')
  .then(function(data) {
    console.log('Here are the IDs of the users!', data);
  }, function(error) {
    console.log('Something went wrong!');
  };
```

###Client
```javascript
// Run a search
Elasticity.search('fuzzy', 'users', 'john')
  .then(function(data) {
    console.log('Here are the IDs of the users!', data);
  }, function(error) {
    console.log('Something went wrong!');
  };
```

##Advanced Usage

###What the heck is 'fuzzy?' (Named Searches)
In the examples above, 'fuzzy' references a named search (the only one included at the moment). Additional searches can be defined on the server as follows:

```javascript
Elasticity.prototype.searches.my_cool_search = {
  query : function(search_string, options) {
    // A query, as defined here: http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-queries.html
    var my_cool_query = {
      match : {
        is_cool : true
      }
    };

    return my_cool_query;
  },
  
  formatter = function(data, collection, options) {
    // Parse the raw JSON string returned from Elasticsearch
    var results = JSON.parse(data);
    
    var docs = [];
    
    for(var i in results.hits.hits) {
      var hit = result.hits.hits[i];
      var id  = hit._id;
      var doc = Meteor[collection].findOne(id);
      
      docs.push(doc);
    }

    // Return all the cool users
    return docs;
  }
}
```

Then, on the server:
```javascript
var client = new Elasticity();

client.search('my_cool_search', 'users', 'john')
  .then(function(users) {
    console.log('These users are cool:', users);
  });
```

Or, on the client:
```javascript
Elasticity.search('my_cool_search', 'users', 'john')
  .then(function(users) {
    console.log('These users are cool:', users);
  });
```

###Default Configuration
When you call a search function on the client, it will instantiate an Elasticity client with the default configuration. To change the default configuration, you can set default_config on the Elasticity prototype (on the server):

```javascript
Elasticity.prototype.default_config = {
  host : '10.0.0.2',
  port : 1234
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

###Todo: Blaze Templates
