var app = require('express')();
var p2 = require('p2');
var http = require('http').Server(app);
var io = require('socket.io')(http);
var player;
var players = [];
var forwarded = require('forwarded-for');
var UUID = require('node-uuid');
var bombs = [];

var world = new p2.World({
    gravity:[0, -15]
});

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){

    player = {
        id : UUID(),
        color : (Math.random()*0xFFFFFF<<0).toString(16),
    };

    players[player.id] = new Player(player.id);
    players[player.id].color = player.color;

    var connectedPlayers = [];
    for(var i in players) {
        connectedPlayers.push({
	    id: players[i].pid,
	    color: players[i].color,
	});
    }

    socket.emit('onconnected',{pid: player.id, list: connectedPlayers});
    socket.broadcast.emit('newconnected', player);


    var ts = new Date().toString().split(' ').splice(1,4).join('/') + (" - ");
    var req = socket.request;
    var ip = forwarded(req, req.headers);
    console.log(ts + player.id + " connected from ip: " + ip.ip);

    socket.on('move', function(input) {
        if(players[input.pid] != null)
	    players[input.pid].processInputs(input);
    });

    socket.on('disconnect', function() {
        console.log(ts + player.id + " disconnected");
        io.emit('dc', player.id);	

        if(players[player.id] != null) {
	    world.removeBody(players[player.id].body);
            delete players[player.id];
	}
    });
});

var body, pid;
var size = 0.23,
    dist = size * 2;
var mvspd = 4;
var jumpforce = 8;
var lastProcessedInput;
var isDead;
var ableToFire;
var ttl;
var timer;
var kills, deaths, color;

var Bomb = function(pos) {
    var circle = new p2.Circle(size/2);
    this.ttl = 3;
   
    var opts = {
        mass: 5,
        position: [pos.x, pos.y],
	velocity: [pos.vel[0] * 3, pos.vel[1] + 3],
    };
   
    this.body = new p2.Body(opts);
    this.body.addShape(circle);
    this.body.fixedRotation = false;
    this.body.damping = 0;
    this.body.gravityScale = 0.6;
    world.addBody(this.body);
};

Bomb.prototype.destroy = function (id) {
    var pos = this.body.position;

    world.removeBody(this.body);

    if(bombs[id] != null)
        delete bombs[id];

    var source = {
        pos : this.body.position,
	id : id,
    };

    explosionRadiusCheck(source);
    io.emit('exploded', id);	
};

var Player = function(id) {
    var rectangle= new p2.Rectangle(size,size);
    this.pid = id; 
    this.isDead = false;
    this.ableToFire = true;
    this.timer = 0;
    this.kills = 0;
    this.deaths = 0;
    this.color = '0x#FFFFFF';
  
    var opts = { 
        mass: 1,
        position: [0,-0.5],
    };  

    this.lastProcessedInput = [];
  
    this.body = new p2.Body(opts);
    this.body.addShape(rectangle);
    this.body.fixedRotation = true;
    this.body.damping = 0.9;
    world.addBody(this.body);
};

Player.prototype.processInputs = function(input) {
    var id = input.pid;
    if(this.isDead && input.respawn)
        this.respawn();

    if(!this.isDead) {
        if(input.up && checkIfCanJump(this.body))
            this.body.velocity[1] = jumpforce;
        
        if(input.fire && bombs[this.pid] == null && this.ableToFire)
	    this.fire();
        else if(bombs[this.pid] != null && !this.ableToFire && input.fire && bombs[this.pid].ttl <= 2.5)
	    bombs[this.pid].destroy(this.pid);

        if(input.right)
	    this.body.velocity[0] = mvspd;
        else if(input.left)
	    this.body.velocity[0] = -mvspd;

        this.lastProcessedInput[id] = input.seqNumber;
    }
};

Player.prototype.fire = function () {
    this.ableToFire = false;

    var pos = {
        x: this.body.position[0],
        y: this.body.position[1],
	vel: this.body.velocity,
    };

    bombs[this.pid] = new Bomb(pos);

    var data = {
        id: this.pid,
        bomb: {x: bombs[this.pid].body.position[0], y: bombs[this.pid].body.position[1]},
    };

    io.emit('fired', data);	
};

Player.prototype.destroy = function (destroyerId) {
    var data = {
    	id : this.pid,
	destroyerId : destroyerId,
    };

    this.isDead = true;
    this.deaths++;
    world.removeBody(players[this.pid].body);
    io.emit('destroyed', data);	
};

Player.prototype.respawn = function () {
    this.body.position[0] = 0;
    this.body.position[1] = -0.5;
    world.addBody(this.body);
    this.isDead = false;
    var data = this.pid;
    io.emit('respawned', data);	
};

Player.prototype.fireTimeout = function (delta) {
    if(!this.ableToFire)
        this.timer += delta; 

    if(this.timer >= 3) {
        this.ableToFire = true;
        this.timer = 0;
    }
};
var Platform = function(sizeX, sizeY, posX, posY) {
    var rectangle = new p2.Rectangle(sizeX, sizeY);
    this.body = new p2.Body({
        mass: 0,
        position:[posX,posY],
    }); 

    this.body.addShape(rectangle);
    this.body.type = p2.Body.KINEMATIC;
    world.addBody(this.body);
};


//this.setWorld(world);
world.islandSplit = true;
world.sleepMode = p2.World.ISLAND_SLEEPING;
world.solver.iterations = 20;
world.solver.tolerance = 0.0001;
//world.setGlobalStiffness(1e4);
world.defaultContactMaterial.friction = 1;
world.defaultContactMaterial.restitution = 0.6;

var plane = null;
var plat = null;
var roof = null;
var wall1 = null;
var wall2 = null;

// Create ground
var planeShape = new p2.Plane();
var plane = new p2.Body({
    position:[0,-1],
});

plane.addShape(planeShape);
world.addBody(plane);

plat = new Platform(3, 0.1, -4, -0.5);
plat = new Platform(3, 0.1, 4, -0.5);
plat = new Platform(3, 0.5, -4, 1);
plat = new Platform(3, 0.5, 4, 1);
plat = new Platform(1.5, 0.1, -4, 2);
plat = new Platform(0.5, 1, -4, 2.5);
plat = new Platform(1.5, 0.1, 4, 2);
plat = new Platform(0.5, 1, 4, 2.5);
plat = new Platform(3, 0.5, 0, 0);
plat = new Platform(1, 0.5, 1.5, 0.5);
plat = new Platform(1, 0.5, -7, 0.25);
plat = new Platform(1, 0.5, 7, 0.25);
plat = new Platform(1.5, 0.1, -0.5, 1);
plat = new Platform(0.5, 1, 0, 1.5);
roof = new Platform(16, 1, 0, 5);

wall1 = new Platform(1, 25, -8, -1);
wall2 = new Platform(1, 25, 8, -1);

http.listen(5000, function(){
    console.log('listening on *:5000');
});

var sendStateToClients =  function() {
    var state = [];
    var timeStamp = Date.now();
    for(var i in players) {
        var p = players[i];
        var bomb;
        if(bombs[p.pid] != null)
            bomb = {x: bombs[p.pid].body.position[0], y: bombs[p.pid].body.position[1]};

        state.push({
	    id: p.pid,
	    position: {x: p.body.position[0], y: p.body.position[1], vel: p.body.velocity},
	    bomb: bomb,
	    lastUpdate: timeStamp,
	    lastProcessedInput: p.lastProcessedInput[p.pid],
	    kills: p.kills,
	    deaths: p.deaths,
	});
    }
    io.emit('moved', state);	
};

var timeStep = 1 / 64; 

setInterval(function(){
    world.step(timeStep);
    updateBombs(timeStep);
    updatePlayerBombTimeout(timeStep);
    sendStateToClients();
}, 1000 * timeStep);


var yAxis = p2.vec2.fromValues(0,1);
  
function checkIfCanJump(playerbody){
    var result = false;
    for(var i=0; i<world.narrowphase.contactEquations.length; i++){
        var c = world.narrowphase.contactEquations[i];
        if(c.bodyA === playerbody || c.bodyB === playerbody){
          var d = p2.vec2.dot(c.normalA, yAxis); // Normal dot Y-axis
            if(c.bodyA === playerbody) d *= -1; 
                if(d > 0.1) result = true;
        }   
    }   
    return result;
}

function updatePlayerBombTimeout(delta) {
    for(var i in players)
        players[i].fireTimeout(delta);
}

function updateBombs(delta) {
    for(var i in bombs) {
        if(bombs[i].ttl <= 0) {
	    bombs[i].destroy(i);
	} else
            bombs[i].ttl -= delta;
    }
}

function explosionRadiusCheck(source) {
    var bombX = source.pos[0]; 
    var bombY = source.pos[1];
    var explosionRadius = 1.5;

    for(var i in players) {
        var playerX = players[i].body.position[0];
        var playerY = players[i].body.position[1];
	
	if(playerX > bombX - explosionRadius && playerX < bombX + explosionRadius) {
	    if(playerY > bombY - explosionRadius && playerY < bombY + explosionRadius && !players[i].isDead) {
	       players[i].destroy(source.id);
	       if(players[source.id] != null)
	           players[source.id].kills++;
            }
	}

	if(bombs[i] != null) {
            var otherBombX = bombs[i].body.position[0];
            var otherBombY = bombs[i].body.position[1];

	    if(otherBombX > bombX - explosionRadius && otherBombX < bombX + explosionRadius) {
	        if(otherBombY > bombY - explosionRadius && otherBombY < bombY + explosionRadius) {
	            bombs[i].destroy(i);
                }
	    }
        }
    }
}
