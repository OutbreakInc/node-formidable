if (global.GENTLY) require = GENTLY.hijack(require);

var util = require('util'),
	fs = require('fs'),
    NodeWriteStream = fs.WriteStream,
    EventEmitter = require('events').EventEmitter,
    crypto = require('crypto'),
	path = require('path');

function ensurePath(newPath, callback)
{
	var pathComponents = newPath.split(path.sep);
	pathComponents.pop();	//remove leaf
	var i = pathComponents.length + 1;
	
	(function(exists)
	{
		if(!exists && (i > 0))	i--;
		
		if(exists || (i == 0))
			return((function(err)
			{
				if(err)	return(callback(err));
				if(i >= pathComponents.length)	return(callback());
				
				fs.mkdir(pathComponents.slice(0, ++i).join("/"), arguments.callee);
			})());
		
		fs.exists(pathComponents.slice(0, i).join("/"), arguments.callee);
	})();
}

function WriteStream(path)
{
	EventEmitter.call(this);
	var ths = this;
	this.__ws = null;
	this.__queue = [];
	
	this.__defineGetter__("bytesWritten", function(){return(ths.__ws? ths.__ws.bytesWritten : 0);});
	
	ensurePath(path, function(err)
	{
		if(err)	return(ths.emit("error", err));
		
		ths.__ws = new NodeWriteStream(path);
		
		ths.__ws.on("error", function(e){ths.emit("error", e);});
		ths.__ws.on("open", function(){ths.emit("open");});
		
		for(var i = 0; i < ths.__queue.length; i++)
			ths.__queue[i].m.apply(ths.__ws, ths.__queue[i].a);	//invoke the buffered call
		ths.__queue = undefined;
	});
}
var delegate = function(name)
{
	var m = NodeWriteStream.prototype[name];
	return(function()
	{
		if(!this.__ws)
			this.__queue.push({m: m, a: arguments});	//call later
		else
			m.apply(this.__ws, arguments);	//call now
	});
};
(function(){
	util.inherits(WriteStream, EventEmitter);
	var methods = ["write", "end", "destroy", "destroySoon"];
	for(var i = 0; i < methods.length; i++)
		WriteStream.prototype[methods[i]] = delegate(methods[i]);
})();



function File(properties) {
  EventEmitter.call(this);

  this.size = 0;
  this.path = null;
  this.name = null;
  this.type = null;
  this.hash = null;
  this.lastModifiedDate = null;

  this._writeStream = null;
  
  for (var key in properties) {
    this[key] = properties[key];
  }

  if(typeof this.hash === 'string') {
    this.hash = crypto.createHash(properties.hash);
  }
}
module.exports = File;
util.inherits(File, EventEmitter);

File.prototype.open = function() {
  this._writeStream = new WriteStream(this.path);
};

File.prototype.toJSON = function() {
  return {
    size: this.size,
    path: this.path,
    name: this.name,
    type: this.type,
    mtime: this.lastModifiedDate,
    length: this.length,
    filename: this.filename,
    mime: this.mime
  };
};

File.prototype.write = function(buffer, cb) {
  var self = this;
  this._writeStream.write(buffer, function() {
    if(self.hash) {
      self.hash.update(buffer);
    }
    self.lastModifiedDate = new Date();
    self.size += buffer.length;
    self.emit('progress', self.size);
    cb();
  });
};

File.prototype.end = function(cb) {
  var self = this;
  this._writeStream.end(function() {
    if(self.hash) {
      self.hash = self.hash.digest('hex');
    }
    self.emit('end');
    cb();
  });
};
